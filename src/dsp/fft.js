// Radix-2 iterative Cooley-Tukey FFT (in-place), plus windowing helpers.
// Pure JS, no dependencies. Operates on Float32Array real/imag pairs.

const _twiddleCache = new Map();

function getTwiddles(n) {
  if (_twiddleCache.has(n)) return _twiddleCache.get(n);
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const a = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  const t = { cos, sin };
  _twiddleCache.set(n, t);
  return t;
}

export function isPowerOfTwo(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place FFT. re/im are Float32Array of equal length n (power of two).
export function fft(re, im) {
  const n = re.length;
  if (!isPowerOfTwo(n)) throw new Error('FFT length must be a power of two');
  // bit reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  const { cos, sin } = getTwiddles(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, idx = 0; k < half; k++, idx += step) {
        const wr = cos[idx];
        const wi = sin[idx];
        const a = i + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

// Magnitude spectrum (single sided) from a real signal frame already windowed.
// Returns Float32Array length n/2 of linear magnitudes.
export function magnitudeSpectrum(frame) {
  const n = frame.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  re.set(frame);
  fft(re, im);
  const half = n >> 1;
  const out = new Float32Array(half);
  const norm = 2 / n;
  for (let i = 0; i < half; i++) {
    out[i] = Math.hypot(re[i], im[i]) * norm;
  }
  return out;
}

// Window functions
export function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

export function hammingWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

export function blackmanHarrisWindow(n) {
  const w = new Float32Array(n);
  const a0 = 0.35875, a1 = 0.48829, a2 = 0.14128, a3 = 0.01168;
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / (n - 1);
    w[i] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x);
  }
  return w;
}

export function getWindow(name, n) {
  switch (name) {
    case 'hamming': return hammingWindow(n);
    case 'blackman-harris': return blackmanHarrisWindow(n);
    case 'hann':
    default: return hannWindow(n);
  }
}
