// Call-pulse detection and acoustic parameter extraction from a spectrogram.
// Measures the parameters field biologists use to identify bats: peak/characteristic
// frequency, min/max frequency, bandwidth, duration, slope, harmonics, pulse interval.

const KHZ = 1000;

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.round(p * (s.length - 1))));
  return s[idx];
}

/**
 * Detect echolocation pulses and extract parameters.
 * @param spec spectrogram object from computeSpectrogram
 * @param opts { minFreqKhz, maxFreqKhz, threshDb (relative to peak), minDurMs, gapMs }
 */
export function detectCalls(spec, opts = {}) {
  const minFreqHz = (opts.minFreqKhz ?? 8) * KHZ;
  const maxFreqHz = (opts.maxFreqKhz ?? Math.min(150, spec.sampleRate / 2000)) * KHZ;
  const binLo = Math.max(1, Math.floor(minFreqHz / spec.freqPerBin));
  const binHi = Math.min(spec.bins - 1, Math.ceil(maxFreqHz / spec.freqPerBin));

  const frames = spec.frames;
  const energy = new Float32Array(frames);
  const peakBin = new Int32Array(frames);
  const peakDb = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const col = spec.data[f];
    let e = 0;
    let maxv = -Infinity;
    let maxb = binLo;
    for (let b = binLo; b <= binHi; b++) {
      const lin = Math.pow(10, col[b] / 20);
      e += lin * lin;
      if (col[b] > maxv) { maxv = col[b]; maxb = b; }
    }
    energy[f] = 10 * Math.log10(e + 1e-12);
    peakBin[f] = maxb;
    peakDb[f] = maxv;
  }

  // Estimate noise floor from the lower quartile of frame energy.
  const sortedE = [...energy].sort((a, b) => a - b);
  const noiseFloor = sortedE[Math.floor(sortedE.length * 0.4)] ?? -120;
  const peakEnergy = sortedE[sortedE.length - 1] ?? 0;
  const trigger = Math.max(noiseFloor + (opts.triggerDb ?? 12), noiseFloor + (peakEnergy - noiseFloor) * 0.25);

  const timePerFrame = spec.timePerFrame;
  const minDurFrames = Math.max(1, Math.floor((opts.minDurMs ?? 1.2) / 1000 / timePerFrame));
  const gapFrames = Math.max(1, Math.floor((opts.gapMs ?? 2) / 1000 / timePerFrame));

  // Find contiguous segments above trigger, bridging short gaps.
  const segments = [];
  let inSeg = false;
  let segStart = 0;
  let gap = 0;
  for (let f = 0; f < frames; f++) {
    const active = energy[f] > trigger;
    if (active) {
      if (!inSeg) { inSeg = true; segStart = f; }
      gap = 0;
    } else if (inSeg) {
      gap++;
      if (gap > gapFrames) {
        segments.push([segStart, f - gap]);
        inSeg = false;
      }
    }
  }
  if (inSeg) segments.push([segStart, frames - 1]);

  const calls = [];
  for (const [s, e] of segments) {
    if (e - s + 1 < minDurFrames) continue;
    const call = measureCall(spec, s, e, peakBin, peakDb, binLo, binHi);
    if (call) calls.push(call);
  }

  // Pulse intervals between successive call centers.
  for (let i = 1; i < calls.length; i++) {
    calls[i].pulseIntervalMs = (calls[i].startTime - calls[i - 1].startTime) * 1000;
  }

  return {
    calls,
    summary: summarize(calls, spec),
    noiseFloorDb: noiseFloor,
    triggerDb: trigger,
    energy,
  };
}

function measureCall(spec, sFrame, eFrame, peakBin, peakDb, binLo, binHi) {
  const fpb = spec.freqPerBin;
  // Use only frames whose peak is within -18 dB of the call's max — the call body.
  let bodyMaxDb = -Infinity;
  for (let f = sFrame; f <= eFrame; f++) if (peakDb[f] > bodyMaxDb) bodyMaxDb = peakDb[f];
  const cutoff = bodyMaxDb - 18;

  const track = []; // {f, freqHz, db}
  for (let f = sFrame; f <= eFrame; f++) {
    if (peakDb[f] < cutoff) continue;
    // parabolic interpolation around peak bin for sub-bin frequency
    const b = peakBin[f];
    const col = spec.data[f];
    let freqHz = b * fpb;
    if (b > binLo && b < binHi) {
      const a = col[b - 1], c = col[b + 1], bb = col[b];
      const denom = a - 2 * bb + c;
      if (Math.abs(denom) > 1e-6) {
        const delta = (0.5 * (a - c)) / denom;
        freqHz = (b + delta) * fpb;
      }
    }
    track.push({ f, freqHz, db: peakDb[f] });
  }
  if (track.length < 2) return null;

  const freqs = track.map((t) => t.freqHz);
  const maxFreq = Math.max(...freqs);
  const minFreq = Math.min(...freqs);
  // Peak (loudest) frequency
  let loud = track[0];
  for (const t of track) if (t.db > loud.db) loud = t;
  const peakFreq = loud.freqHz;

  const startFreq = track[0].freqHz;
  const endFreq = track[track.length - 1].freqHz;

  // Characteristic frequency: the low, flat portion of the call body. For
  // downward FM sweeps this is the frequency near the end of the sweep; the
  // 15th-percentile of the body frequencies is a robust estimator that matches
  // the QCF tail for FM-QCF calls and the sweep terminus for steep FM calls.
  const charFreq = percentile(freqs, 0.15);

  const startTime = sFrame * spec.hop / spec.sampleRate;
  const endTime = (eFrame + 1) * spec.hop / spec.sampleRate;
  const durationMs = (endTime - startTime) * 1000;
  const bandwidthKhz = (maxFreq - minFreq) / KHZ;
  const slopeKhzPerMs = durationMs > 0 ? (startFreq - endFreq) / KHZ / durationMs : 0;

  // Harmonic content: compare energy at peak vs ~2x peak in the loudest frame.
  const harmonics = estimateHarmonics(spec, loud.f, peakFreq, binHi);

  const shape = classifyShape(bandwidthKhz, slopeKhzPerMs, durationMs);

  return {
    startFrame: sFrame, endFrame: eFrame,
    startTime, endTime, durationMs: round(durationMs, 2),
    peakFreqKhz: round(peakFreq / KHZ, 2),
    charFreqKhz: round(charFreq / KHZ, 2),
    minFreqKhz: round(minFreq / KHZ, 2),
    maxFreqKhz: round(maxFreq / KHZ, 2),
    startFreqKhz: round(startFreq / KHZ, 2),
    endFreqKhz: round(endFreq / KHZ, 2),
    bandwidthKhz: round(bandwidthKhz, 2),
    slopeKhzPerMs: round(slopeKhzPerMs, 2),
    harmonics,
    shape,
    snrDb: round(bodyMaxDb - (spec.minDb), 1),
    pulseIntervalMs: null,
  };
}

function estimateHarmonics(spec, frame, peakFreqHz, binHi) {
  const col = spec.data[frame];
  const fpb = spec.freqPerBin;
  const fundBin = Math.round(peakFreqHz / fpb);
  if (fundBin < 2) return 1;
  const fundDb = col[fundBin];
  let count = 1;
  for (let h = 2; h <= 4; h++) {
    const hb = fundBin * h;
    if (hb >= binHi) break;
    let local = -Infinity;
    for (let d = -2; d <= 2; d++) if (col[hb + d] > local) local = col[hb + d];
    if (local > fundDb - 20) count++;
  }
  return count;
}

function classifyShape(bw, slope, dur) {
  const absSlope = Math.abs(slope);
  if (bw < 5 && absSlope < 1) return 'CF';        // constant frequency
  if (bw < 12 && absSlope < 3) return 'QCF';      // quasi-constant freq
  if (absSlope > 8 || bw > 40) return 'FM';       // steep frequency-modulated
  return 'FM-QCF';                                 // FM sweep into QCF tail
}

function summarize(calls, spec) {
  if (!calls.length) {
    return { callCount: 0, meanPeakKhz: 0, meanCharKhz: 0, meanDurMs: 0, meanPulseIntervalMs: 0, dominantShape: '—' };
  }
  const mean = (sel) => calls.reduce((a, c) => a + sel(c), 0) / calls.length;
  const intervals = calls.map((c) => c.pulseIntervalMs).filter((x) => x != null && x < 1000);
  const shapes = {};
  calls.forEach((c) => { shapes[c.shape] = (shapes[c.shape] || 0) + 1; });
  const dominantShape = Object.entries(shapes).sort((a, b) => b[1] - a[1])[0][0];
  return {
    callCount: calls.length,
    meanPeakKhz: round(mean((c) => c.peakFreqKhz), 1),
    meanCharKhz: round(mean((c) => c.charFreqKhz), 1),
    minCharKhz: round(Math.min(...calls.map((c) => c.charFreqKhz)), 1),
    maxCharKhz: round(Math.max(...calls.map((c) => c.charFreqKhz)), 1),
    meanDurMs: round(mean((c) => c.durationMs), 2),
    meanBandwidthKhz: round(mean((c) => c.bandwidthKhz), 1),
    meanSlope: round(mean((c) => c.slopeKhzPerMs), 2),
    meanPulseIntervalMs: intervals.length ? round(median(intervals), 1) : 0,
    dominantShape,
    recordingDuration: round((spec.frames * spec.hop) / spec.sampleRate, 2),
  };
}

function round(v, d = 2) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}
