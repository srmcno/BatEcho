// Synthetic full-spectrum recording generator.
// Produces high-sample-rate (default 256 kHz) signals resembling species-specific
// echolocation pulse trains so the analysis pipeline can be exercised and
// demonstrated without dedicated ultrasonic hardware. Also generates non-bat
// noise (insect/weather) for testing the noise-rejection path.

import { speciesById } from '../data/species.js';

function rand(min, max) { return min + Math.random() * (max - min); }

// One frequency-modulated pulse written into `out` starting at sample `start`.
// The instantaneous frequency follows a "hockey-stick" trajectory: a steep drop
// from f0 that flattens toward f1, where `curve` controls how quickly it
// flattens (higher = longer quasi-constant tail at f1, the characteristic
// frequency). Phase is accumulated numerically for an arbitrary trajectory.
function writePulse(out, sr, start, f0, f1, durSec, amp, harmonics, curve = 2.4) {
  const n = Math.floor(durSec * sr);
  const attack = 0.06, release = 0.16;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;            // 0..1 across pulse
    const f = f1 + (f0 - f1) * Math.pow(1 - t, curve);
    phase += (2 * Math.PI * f) / sr;
    let env;
    if (t < attack) env = t / attack;
    else if (t > 1 - release) env = (1 - t) / release;
    else env = 1;
    env = 0.12 + 0.88 * env;
    let s = Math.sin(phase) * env * amp;
    for (let h = 2; h <= harmonics; h++) {
      s += Math.sin(phase * h) * env * amp * (0.22 / (h - 1));
    }
    const idx = start + i;
    if (idx < out.length) out[idx] += s;
  }
}

function curveForShape(shape) {
  if (shape === 'FM') return 1.7;        // steep, brief flattening
  if (shape === 'FM-QCF') return 2.6;    // hockey-stick into QCF tail
  if (shape === 'QCF') return 3.2;       // mostly flat
  if (shape === 'CF') return 5;          // near constant
  return 2.4;
}

function addNoise(out, level) {
  // pink-ish noise via simple one-pole filtered white noise
  let b = 0;
  for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    b = 0.985 * b + 0.015 * white;
    out[i] += (white * 0.4 + b * 4) * level;
  }
}

/**
 * Synthesize a recording for a given species id.
 * @returns {{ samples: Float32Array, sampleRate: number, speciesId: string, label: string }}
 */
export function synthSpecies(id, opts = {}) {
  const sr = opts.sampleRate || 256000;
  const seconds = opts.seconds || 3.2;
  const sp = speciesById(id);
  const total = Math.floor(sr * seconds);
  const out = new Float32Array(total);

  if (!sp || id === 'NOISE') {
    return synthNoise(opts);
  }

  const fcMid = (sp.fcKhz[0] + sp.fcKhz[1]) / 2 * 1000;
  const fHigh = sp.freqRangeKhz[1] * 1000;
  const baseDur = (sp.durationMs[0] + sp.durationMs[1]) / 2 / 1000;
  const baseInterval = (sp.pulseIntervalMs[0] + sp.pulseIntervalMs[1]) / 2 / 1000;
  const harmonics = sp.harmonics || 1;
  const curve = curveForShape(sp.shape[0]);

  let t = rand(0.05, 0.12);
  while (t < seconds - baseDur - 0.05) {
    const jitterDur = baseDur * rand(0.85, 1.15);
    const startF = fHigh * rand(0.92, 1.02);
    const endF = fcMid * rand(0.97, 1.03);
    const amp = rand(0.45, 0.9);
    writePulse(out, sr, Math.floor(t * sr), startF, endF, jitterDur, amp, harmonics, curve);
    t += baseInterval * rand(0.85, 1.2);
  }

  addNoise(out, opts.noise ?? 0.004);
  normalize(out, 0.9);
  return { samples: out, sampleRate: sr, speciesId: id, label: `${sp.commonName} (synthetic)` };
}

export function synthNoise(opts = {}) {
  const sr = opts.sampleRate || 256000;
  const seconds = opts.seconds || 3.2;
  const total = Math.floor(sr * seconds);
  const out = new Float32Array(total);
  const kind = opts.kind || 'insect';

  if (kind === 'insect') {
    // katydid-like: long narrowband bursts ~15-25 kHz with regular spacing
    const f = rand(15000, 24000);
    let t = 0.1;
    while (t < seconds - 0.1) {
      const dur = rand(0.05, 0.12);
      writePulse(out, sr, Math.floor(t * sr), f, f * rand(0.99, 1.01), dur, 0.6, 2);
      t += dur + rand(0.02, 0.06);
    }
    addNoise(out, 0.01);
  } else {
    // broadband weather/rain noise
    addNoise(out, 0.08);
  }
  normalize(out, 0.85);
  return { samples: out, sampleRate: sr, speciesId: 'NOISE', label: `${kind} noise (synthetic)` };
}

function normalize(out, target) {
  let max = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > max) max = a; }
  if (max > 0) {
    const g = target / max;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
}
