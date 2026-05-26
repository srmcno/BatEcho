import { renderSpectrogram } from '../dsp/spectrogram.js';
import { h } from '../utils/dom.js';

// Render a spectrogram into `container` with a kHz frequency axis and optional
// detected-call overlays. Returns helpers for a moving playhead.
export function spectrogramPanel(container, spec, opts = {}) {
  const colormap = opts.colormap || 'inferno';
  const maxFreq = opts.maxFreqHz || spec.sampleRate / 2;

  const canvas = h('canvas', { class: 'spectro-canvas', style: { height: (opts.height || 280) + 'px' } });
  const overlay = h('canvas', { style: { position: 'absolute', inset: '0', width: '100%', height: (opts.height || 280) + 'px', pointerEvents: 'none' } });
  const axis = h('div', { class: 'spectro-axis-y' });
  const playhead = h('div', { style: {
    position: 'absolute', top: '0', bottom: '0', width: '2px', background: 'rgba(255,255,255,.85)',
    left: '0', display: 'none', boxShadow: '0 0 6px rgba(255,255,255,.6)', pointerEvents: 'none',
  } });

  const wrap = h('div', { class: 'spectro-wrap', style: { paddingLeft: '46px' } }, [
    h('div', { style: { position: 'relative' } }, [canvas, overlay, playhead]),
    axis,
  ]);
  container.appendChild(wrap);

  renderSpectrogram(canvas, spec, { colormap, maxFreq, dynamicRange: opts.dynamicRange || 72 });

  // frequency axis labels (kHz)
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const fk = (maxFreq * (1 - frac)) / 1000;
    axis.appendChild(h('span', { class: 'axis-label', style: { top: `${frac * 100}%` }, text: `${fk.toFixed(0)}` }));
  }
  axis.appendChild(h('span', { class: 'axis-label', style: { top: '50%', left: '24px', transform: 'rotate(-90deg)', color: 'rgba(255,255,255,.55)' }, text: 'kHz' }));

  // draw detected call markers on overlay (after layout so we know pixel size)
  requestAnimationFrame(() => {
    if (opts.calls && opts.calls.length) drawCallMarkers(overlay, spec, opts.calls, maxFreq);
  });

  const totalDur = (spec.frames * spec.hop) / spec.sampleRate;

  return {
    canvas, wrap,
    setPlayhead(t) {
      if (t == null || totalDur <= 0) { playhead.style.display = 'none'; return; }
      const frac = Math.max(0, Math.min(1, t / totalDur));
      playhead.style.display = 'block';
      playhead.style.left = `calc(${frac * 100}% )`;
    },
    duration: totalDur,
  };
}

function drawCallMarkers(overlay, spec, calls, maxFreq) {
  const w = overlay.clientWidth;
  const hgt = overlay.clientHeight;
  overlay.width = w; overlay.height = hgt;
  const ctx = overlay.getContext('2d');
  const totalDur = (spec.frames * spec.hop) / spec.sampleRate;
  ctx.clearRect(0, 0, w, hgt);
  ctx.strokeStyle = 'rgba(94,234,212,.85)';
  ctx.lineWidth = 1.2;
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(94,234,212,.95)';
  for (const c of calls) {
    const x1 = (c.startTime / totalDur) * w;
    const x2 = (c.endTime / totalDur) * w;
    const yPeak = hgt - (c.peakFreqKhz * 1000 / maxFreq) * hgt;
    ctx.strokeRect(x1 - 1, Math.max(0, yPeak - 14), Math.max(3, x2 - x1 + 2), 28);
  }
}
