import { h } from '../utils/dom.js';

// Min/max peak waveform with an optional moving playhead.
export function waveformPanel(container, samples, opts = {}) {
  const height = opts.height || 90;
  const canvas = h('canvas', { class: 'waveform-canvas', style: { height: height + 'px' } });
  const playhead = h('div', { style: {
    position: 'absolute', top: '0', bottom: '0', width: '2px', background: 'var(--amber)', left: '0', display: 'none',
  } });
  const wrap = h('div', { style: { position: 'relative' } }, [canvas, playhead]);
  container.appendChild(wrap);

  requestAnimationFrame(() => draw(canvas, samples));

  return {
    setPlayhead(t, dur) {
      if (t == null) { playhead.style.display = 'none'; return; }
      playhead.style.display = 'block';
      playhead.style.left = `${Math.max(0, Math.min(1, t / dur)) * 100}%`;
    },
  };
}

function draw(canvas, samples) {
  const w = canvas.clientWidth || 600;
  const hgt = canvas.clientHeight || 90;
  canvas.width = w * devicePixelRatio;
  canvas.height = hgt * devicePixelRatio;
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.clearRect(0, 0, w, hgt);

  const mid = hgt / 2;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2dd4bf';
  ctx.strokeStyle = 'rgba(45,212,191,.18)';
  ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();

  const step = Math.max(1, Math.floor(samples.length / w));
  ctx.fillStyle = accent;
  for (let x = 0; x < w; x++) {
    let min = 1, max = -1;
    const start = x * step;
    for (let i = 0; i < step; i++) {
      const v = samples[start + i] || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = mid - max * mid * 0.95;
    const y2 = mid - min * mid * 0.95;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
}
