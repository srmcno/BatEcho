// High-level analysis pipeline: raw samples -> spectrogram -> call parameters
// -> species classification. Used by both single-file and batch analysis.

import { computeSpectrogram } from './spectrogram.js';
import { detectCalls } from './features.js';
import { classify } from './classifier.js';

export function analyzeSamples(samples, sampleRate, opts = {}) {
  const fftSize = chooseFftSize(sampleRate, opts.fftSize);
  const spec = computeSpectrogram(samples, sampleRate, {
    fftSize,
    hop: Math.floor(fftSize / 4),
    window: opts.windowFn || 'hann',
  });

  const detection = detectCalls(spec, {
    maxFreqKhz: Math.min(150, sampleRate / 2000),
    triggerDb: opts.autoTriggerDb ?? 12,
  });

  const classification = classify(detection.summary, {
    region: opts.region,
    regionFilter: opts.regionFilter,
  });

  return { spec, detection, classification, fftSize, sampleRate };
}

// For high sample rates a larger FFT keeps frequency resolution reasonable while
// time resolution stays adequate for short bat pulses.
function chooseFftSize(sampleRate, requested) {
  if (requested) return requested;
  if (sampleRate >= 384000) return 2048;
  if (sampleRate >= 192000) return 1024;
  if (sampleRate >= 96000) return 1024;
  return 512;
}
