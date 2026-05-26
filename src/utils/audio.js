// Audio playback helpers. Ultrasonic bat calls (20–120 kHz) are far above the
// audible range and above what playback hardware reproduces, so we offer
// TIME-EXPANDED playback: the signal is stretched in time, which divides all
// frequencies down into the audible band — exactly how time-expansion bat
// detectors let researchers hear calls.

let _ctx;
export function audioCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Play samples time-expanded by `factor` (default 10x slower → /10 frequency).
 * Returns a controller { stop, duration }.
 */
export function playTimeExpanded(samples, sampleRate, opts = {}) {
  const ctx = audioCtx();
  const factor = opts.factor || 10;
  const outRate = ctx.sampleRate; // typically 48000
  const origDur = samples.length / sampleRate;
  const outDur = origDur * factor;
  const outLen = Math.floor(outDur * outRate);
  const buffer = ctx.createBuffer(1, outLen, outRate);
  const data = buffer.getChannelData(0);

  // resample original samples across the expanded timeline (linear interp)
  for (let i = 0; i < outLen; i++) {
    const srcPos = (i / outLen) * (samples.length - 1);
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = samples[i0] || 0;
    const b = samples[i0 + 1] || 0;
    data[i] = a + (b - a) * frac;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = opts.gain ?? 0.9;
  src.connect(gain).connect(ctx.destination);

  let raf;
  const start = ctx.currentTime;
  if (opts.onProgress) {
    const tick = () => {
      const elapsed = ctx.currentTime - start;
      const origT = (elapsed / factor);
      if (elapsed >= outDur) { opts.onProgress(origDur); return; }
      opts.onProgress(origT);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  src.onended = () => { if (raf) cancelAnimationFrame(raf); opts.onEnd?.(); };
  src.start();

  return {
    duration: origDur,
    stop() { try { src.stop(); } catch {} if (raf) cancelAnimationFrame(raf); },
  };
}
