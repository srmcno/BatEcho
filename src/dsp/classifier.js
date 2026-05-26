// Feature-based bat species classifier.
// Scores extracted call parameters against the reference database using fuzzy
// range membership, applies optional regional filtering, rejects non-bat noise,
// and returns ranked candidates with confidence — including "possible species"
// when calls are ambiguous (acoustic overlap is common among Myotis & tree bats).

import { SPECIES, speciesById } from '../data/species.js';

// Fuzzy membership: 1 inside [lo,hi], Gaussian falloff outside with width = tol.
function membership(x, lo, hi, tol) {
  if (x >= lo && x <= hi) return 1;
  const d = x < lo ? lo - x : x - hi;
  return Math.exp(-(d * d) / (2 * tol * tol));
}

const WEIGHTS = {
  charFreq: 0.42,
  duration: 0.18,
  bandwidth: 0.14,
  shape: 0.14,
  pulseInterval: 0.12,
};

function scoreSpecies(sp, s) {
  if (sp.id === 'NOISE') return 0;
  const fcTol = Math.max(3, (sp.fcKhz[1] - sp.fcKhz[0]) * 0.6);
  const fc = membership(s.meanCharKhz, sp.fcKhz[0], sp.fcKhz[1], fcTol);

  const durTol = Math.max(2, (sp.durationMs[1] - sp.durationMs[0]) * 0.8);
  const dur = membership(s.meanDurMs, sp.durationMs[0], sp.durationMs[1], durTol);

  // expected bandwidth derived from sweep extent
  const bwExpLo = (sp.freqRangeKhz[1] - sp.freqRangeKhz[0]) * 0.25;
  const bwExpHi = (sp.freqRangeKhz[1] - sp.freqRangeKhz[0]) * 1.0;
  const bw = membership(s.meanBandwidthKhz, bwExpLo, bwExpHi, Math.max(6, bwExpHi * 0.6));

  const shape = sp.shape.includes(s.dominantShape) ? 1
    : sp.shape.some((x) => x.includes(s.dominantShape) || s.dominantShape.includes(x)) ? 0.6
    : 0.3;

  let pi = 0.6;
  if (s.meanPulseIntervalMs > 0) {
    const piTol = Math.max(40, (sp.pulseIntervalMs[1] - sp.pulseIntervalMs[0]) * 1.0);
    pi = membership(s.meanPulseIntervalMs, sp.pulseIntervalMs[0], sp.pulseIntervalMs[1], piTol);
  }

  return (
    fc * WEIGHTS.charFreq +
    dur * WEIGHTS.duration +
    bw * WEIGHTS.bandwidth +
    shape * WEIGHTS.shape +
    pi * WEIGHTS.pulseInterval
  );
}

function looksLikeNoise(s) {
  if (!s.callCount) return true;
  // Sustained narrowband tones with very long duration & regular short spacing → insect/electronic.
  if (s.meanDurMs > 40 && s.meanBandwidthKhz < 6) return true;
  // Characteristic frequency outside any plausible bat band.
  if (s.meanCharKhz < 6 || s.meanCharKhz > 70) return true;
  return false;
}

/**
 * @param summary  summary object from detectCalls
 * @param opts { region, regionFilter (bool), minConfidence }
 */
export function classify(summary, opts = {}) {
  const region = opts.region || null;
  const regionFilter = opts.regionFilter !== false;

  if (looksLikeNoise(summary)) {
    return {
      topId: 'NOISE',
      noiseLikely: true,
      candidates: [],
      verdict: 'noise',
      note: !summary.callCount
        ? 'No echolocation pulses detected above the noise floor.'
        : 'Signal characteristics are inconsistent with bat echolocation (likely insect, weather or anthropogenic noise).',
    };
  }

  let scored = SPECIES
    .filter((sp) => sp.id !== 'NOISE')
    .map((sp) => {
      const raw = scoreSpecies(sp, summary);
      const inRegion = !region || sp.regions.includes(region) || sp.regions.includes('national');
      const regionPenalty = regionFilter && !inRegion ? 0.45 : 1;
      return { id: sp.id, species: sp, raw, score: raw * regionPenalty, inRegion };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.3) {
    return {
      topId: null, noiseLikely: false, verdict: 'uncertain',
      candidates: scored.slice(0, 4).map((c) => decorate(c, scored)),
      note: 'Calls detected but could not be confidently matched. Manual review recommended.',
    };
  }

  // Relative probabilities via softmax-like normalization over the leaders.
  const lead = scored.slice(0, 6);
  const expSum = lead.reduce((a, c) => a + Math.exp(c.score * 6), 0);
  lead.forEach((c) => { c.probability = Math.exp(c.score * 6) / expSum; });

  const candidates = lead.map((c) => decorate(c, scored));

  let verdict = 'possible';
  if (best.score >= 0.78 && (candidates[1] ? best.score - scored[1].score > 0.12 : true)) verdict = 'confident';
  else if (best.score >= 0.58) verdict = 'probable';

  return {
    topId: best.id,
    noiseLikely: false,
    verdict,
    candidates,
    note: verdict === 'possible'
      ? 'Multiple species overlap acoustically — treat lower-ranked matches as plausible alternatives.'
      : null,
  };
}

function decorate(c, allScored) {
  return {
    id: c.id,
    species: c.species,
    score: round(c.score, 3),
    confidence: round(c.score, 3),
    probability: c.probability != null ? round(c.probability, 3) : null,
    inRegion: c.inRegion,
    protected: c.species.protected,
  };
}

export function confidenceTier(score) {
  if (score >= 0.78) return { label: 'High', cls: 'conf-high' };
  if (score >= 0.58) return { label: 'Moderate', cls: 'conf-med' };
  if (score >= 0.4) return { label: 'Low', cls: 'conf-low' };
  return { label: 'Very low', cls: 'conf-vlow' };
}

function round(v, d = 2) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

export { speciesById };
