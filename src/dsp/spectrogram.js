import { magnitudeSpectrum, getWindow, nextPow2 } from './fft.js';

// Perceptual colormaps (control points sampled, linearly interpolated).
const COLORMAPS = {
  inferno: [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
    [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
  ],
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88],
    [181, 222, 43], [253, 231, 37],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
    [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191],
  ],
  grayscale: [[0, 0, 0], [255, 255, 255]],
  'night-red': [[0, 0, 0], [60, 0, 0], [140, 10, 10], [220, 40, 30], [255, 140, 90]],
};

function makeLUT(name) {
  const ctrl = COLORMAPS[name] || COLORMAPS.inferno;
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (ctrl.length - 1);
    const lo = Math.floor(t);
    const hi = Math.min(ctrl.length - 1, lo + 1);
    const f = t - lo;
    lut[i * 3] = ctrl[lo][0] + (ctrl[hi][0] - ctrl[lo][0]) * f;
    lut[i * 3 + 1] = ctrl[lo][1] + (ctrl[hi][1] - ctrl[lo][1]) * f;
    lut[i * 3 + 2] = ctrl[lo][2] + (ctrl[hi][2] - ctrl[lo][2]) * f;
  }
  return lut;
}

const _lutCache = {};
function getLUT(name) {
  if (!_lutCache[name]) _lutCache[name] = makeLUT(name);
  return _lutCache[name];
}

export const COLORMAP_NAMES = Object.keys(COLORMAPS);

/**
 * Compute a Short-Time Fourier Transform.
 * @returns {{
 *   data: Float32Array[],   // array of frames, each Float32Array of dB values (length bins)
 *   bins: number, frames: number, fftSize: number, hop: number,
 *   sampleRate: number, freqPerBin: number, timePerFrame: number,
 *   minDb: number, maxDb: number
 * }}
 */
export function computeSpectrogram(samples, sampleRate, opts = {}) {
  const fftSize = opts.fftSize || 1024;
  const hop = opts.hop || Math.floor(fftSize / 4);
  const windowName = opts.window || 'hann';
  const win = getWindow(windowName, fftSize);
  const bins = fftSize / 2;
  const frameCount = Math.max(0, Math.floor((samples.length - fftSize) / hop) + 1);

  const data = [];
  let minDb = Infinity;
  let maxDb = -Infinity;
  const frame = new Float32Array(fftSize);

  for (let fi = 0; fi < frameCount; fi++) {
    const start = fi * hop;
    for (let i = 0; i < fftSize; i++) frame[i] = (samples[start + i] || 0) * win[i];
    const mag = magnitudeSpectrum(frame);
    const db = new Float32Array(bins);
    for (let b = 0; b < bins; b++) {
      const d = 20 * Math.log10(mag[b] + 1e-9);
      db[b] = d;
      if (d < minDb) minDb = d;
      if (d > maxDb) maxDb = d;
    }
    data.push(db);
  }

  if (!isFinite(minDb)) { minDb = -120; maxDb = 0; }

  return {
    data,
    bins,
    frames: frameCount,
    fftSize,
    hop,
    sampleRate,
    freqPerBin: sampleRate / fftSize,
    timePerFrame: hop / sampleRate,
    minDb,
    maxDb,
  };
}

/**
 * Render a spectrogram to a canvas. Frequency increases upward.
 * floorDb/ceilDb set the dynamic range mapped to the colormap.
 */
export function renderSpectrogram(canvas, spec, opts = {}) {
  const colormap = opts.colormap || 'inferno';
  const lut = getLUT(colormap);
  const floorDb = opts.floorDb ?? (spec.maxDb - (opts.dynamicRange || 70));
  const ceilDb = opts.ceilDb ?? spec.maxDb;
  const range = Math.max(1e-6, ceilDb - floorDb);

  // limit the displayed frequency band
  const maxFreq = opts.maxFreq || spec.sampleRate / 2;
  const minFreq = opts.minFreq || 0;
  const binLo = Math.max(0, Math.floor(minFreq / spec.freqPerBin));
  const binHi = Math.min(spec.bins, Math.ceil(maxFreq / spec.freqPerBin));
  const usableBins = Math.max(1, binHi - binLo);

  const w = spec.frames || 1;
  const h = usableBins;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const px = img.data;

  for (let x = 0; x < w; x++) {
    const col = spec.data[x];
    for (let y = 0; y < h; y++) {
      const bin = binLo + (h - 1 - y); // flip so high freq on top
      const dbv = col ? col[bin] : floorDb;
      let t = (dbv - floorDb) / range;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const li = (t * 255) | 0;
      const o = (y * w + x) * 4;
      px[o] = lut[li * 3];
      px[o + 1] = lut[li * 3 + 1];
      px[o + 2] = lut[li * 3 + 2];
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { binLo, binHi, usableBins, floorDb, ceilDb };
}

// Render a single live FFT column into a scrolling waterfall canvas.
export function pushWaterfallColumn(canvas, magsDb, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const lut = getLUT(opts.colormap || 'inferno');
  const floorDb = opts.floorDb ?? -90;
  const ceilDb = opts.ceilDb ?? -20;
  const range = Math.max(1e-6, ceilDb - floorDb);

  // scroll left by 1px
  const prev = ctx.getImageData(1, 0, w - 1, h);
  ctx.putImageData(prev, 0, 0);

  const col = ctx.createImageData(1, h);
  const n = magsDb.length;
  for (let y = 0; y < h; y++) {
    const bin = Math.floor(((h - 1 - y) / h) * n);
    let t = (magsDb[bin] - floorDb) / range;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const li = (t * 255) | 0;
    col.data[y * 4] = lut[li * 3];
    col.data[y * 4 + 1] = lut[li * 3 + 1];
    col.data[y * 4 + 2] = lut[li * 3 + 2];
    col.data[y * 4 + 3] = 255;
  }
  ctx.putImageData(col, w - 1, 0);
}
