import { h, clear, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { audioCtx } from '../utils/audio.js';
import { pushWaterfallColumn, computeSpectrogram } from '../dsp/spectrogram.js';
import { synthSpecies } from '../dsp/synth.js';
import { analyzeSamples } from '../dsp/pipeline.js';
import { SPECIES, speciesById } from '../data/species.js';
import { fmtTime, pct } from '../utils/format.js';
import { confidenceTier } from '../dsp/classifier.js';

export function render(container, ctx) {
  const { store } = ctx;
  const settings = store.state.settings;
  const state = { mode: 'sim', running: false, raf: null, stream: null, analyser: null,
    queue: [], events: [], lastTrigger: 0, autoSave: false };

  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  // mode + controls
  const modeSeg = h('div', { class: 'seg' }, [
    segBtn('Simulated detector', 'sim', state, () => switchMode('sim')),
    segBtn('Microphone (sonic)', 'mic', state, () => switchMode('mic')),
  ]);

  const startBtn = h('button', { class: 'btn btn-primary', html: `${icon('play', 16)} Start monitoring`, onclick: toggle });
  const statusChip = h('span', { class: 'chip', text: 'Idle' });
  const peakReadout = h('span', { class: 'mono fw-700', text: '—' });
  const levelMeter = h('div', { class: 'live-meter', style: { flex: 1, maxWidth: '220px' } }, h('i', { id: 'lvl', style: { width: '0%' } }));

  const controls = h('div', { class: 'card', style: { marginBottom: '16px' } }, [
    h('div', { class: 'flex flex-wrap', style: { gap: '14px' } }, [
      modeSeg, startBtn, statusChip,
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('label', { class: 'flex gap-8 t-sm', style: { cursor: 'pointer' } }, [
        h('input', { type: 'checkbox', style: { width: 'auto' }, onchange: (e) => { state.autoSave = e.target.checked; } }),
        'Auto-save detections',
      ]),
    ]),
    h('div', { class: 'flex gap-16', style: { marginTop: '12px' } }, [
      h('span', { class: 't-xs muted', text: 'Peak frequency' }), peakReadout,
      h('span', { class: 't-xs muted', text: 'Level' }), levelMeter,
      h('span', { id: 'rec-indicator' }),
    ]),
  ]);
  root.appendChild(controls);

  // mode note banner
  const note = h('div', { class: 'banner info', id: 'mode-note', style: { marginBottom: '16px' } });
  root.appendChild(note);
  updateNote();

  // waterfall
  const wfCard = h('div', { class: 'card', style: { marginBottom: '16px' } }, [
    h('div', { class: 'card-head' }, [
      h('span', { class: 'c-accent', html: icon('live', 18) }),
      h('h3', { text: 'Real-time spectrogram' }),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('span', { class: 'chip', id: 'band-chip', text: '' }),
    ]),
  ]);
  const wfWrap = h('div', { class: 'spectro-wrap', style: { paddingLeft: '46px' } });
  const wfCanvas = h('canvas', { class: 'spectro-canvas', width: 900, height: 280, style: { height: '280px' } });
  const wfAxis = h('div', { class: 'spectro-axis-y', id: 'wf-axis' });
  wfWrap.appendChild(h('div', { style: { position: 'relative' } }, [wfCanvas]));
  wfWrap.appendChild(wfAxis);
  wfCard.appendChild(wfWrap);
  root.appendChild(wfCard);
  // init waterfall black
  { const c = wfCanvas.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, wfCanvas.width, wfCanvas.height); }

  // detection log
  const logCard = h('div', { class: 'card flush' }, [
    h('div', { style: { padding: '16px 18px 8px' }, class: 'card-head mb-0' }, [
      h('span', { class: 'c-accent', html: icon('zap', 18) }),
      h('h3', { text: 'Detection log' }),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-ghost btn-sm', text: 'Clear', onclick: () => { state.events = []; renderLog(); } }),
    ]),
  ]);
  const logBody = h('div', { id: 'log-body' });
  logCard.appendChild(logBody);
  root.appendChild(logCard);
  renderLog();

  setBandChip();
  updateAxis();

  // -------------------- control logic --------------------
  function switchMode(mode) {
    if (state.running) stop();
    state.mode = mode;
    [...modeSeg.children].forEach((b) => b.classList.toggle('active', b.dataset.val === mode));
    updateNote(); setBandChip(); updateAxis();
  }

  function toggle() { state.running ? stop() : start(); }

  async function start() {
    state.running = true;
    startBtn.innerHTML = `${icon('pause', 16)} Stop monitoring`;
    statusChip.textContent = 'Monitoring'; statusChip.className = 'chip accent';
    document.getElementById('rec-indicator').innerHTML = `<span class="flex gap-8 t-xs"><span class="rec-dot"></span>REC</span>`;
    if (state.mode === 'mic') await startMic(); else startSim();
  }

  function stop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
    startBtn.innerHTML = `${icon('play', 16)} Start monitoring`;
    statusChip.textContent = 'Idle'; statusChip.className = 'chip';
    document.getElementById('rec-indicator').innerHTML = '';
    document.getElementById('lvl').style.width = '0%';
  }

  // ---- microphone (real, sonic band only) ----
  async function startMic() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { toast('Microphone access denied', 'danger'); stop(); return; }
    const ac = audioCtx();
    const src = ac.createMediaStreamSource(state.stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.3;
    src.connect(analyser);
    state.analyser = analyser;
    const bins = analyser.frequencyBinCount;
    const freqData = new Float32Array(bins);
    const nyquist = ac.sampleRate / 2;

    const loop = () => {
      if (!state.running) return;
      analyser.getFloatFrequencyData(freqData); // dB
      pushWaterfallColumn(wfCanvas, freqData, { floorDb: -110, ceilDb: -20, colormap: settings.colormap });
      // peak + level
      let maxDb = -Infinity, maxBin = 0;
      for (let i = 1; i < bins; i++) if (freqData[i] > maxDb) { maxDb = freqData[i]; maxBin = i; }
      const peakHz = (maxBin / bins) * nyquist;
      peakReadout.textContent = `${(peakHz / 1000).toFixed(1)} kHz`;
      const lvl = Math.max(0, Math.min(1, (maxDb + 100) / 80));
      document.getElementById('lvl').style.width = `${lvl * 100}%`;
      // simple acoustic-event trigger
      if (lvl > 0.6 && Date.now() - state.lastTrigger > 700) {
        state.lastTrigger = Date.now();
        logEvent({ kind: 'acoustic', peakKhz: peakHz / 1000, level: lvl });
      }
      state.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // ---- simulated ultrasonic detector stream ----
  function startSim() {
    const sr = 256000;
    let columns = [];        // pending spectrogram columns to stream
    let pendingDetection = null;
    let cooldown = 0;

    const colsForNoise = () => {
      const arr = new Float32Array(256);
      for (let i = 0; i < arr.length; i++) arr[i] = -100 + Math.random() * 12;
      return arr;
    };

    const spawn = () => {
      const regionSpecies = SPECIES.filter((s) => s.id !== 'NOISE' && (s.regions.includes(settings.region) || s.regions.includes('national')));
      const pool = regionSpecies.length ? regionSpecies : SPECIES.filter((s) => s.id !== 'NOISE');
      const sp = pool[Math.floor(Math.random() * pool.length)];
      const rec = synthSpecies(sp.id, { seconds: 1.4, sampleRate: sr });
      const spec = computeSpectrogram(rec.samples, sr, { fftSize: 1024, hop: 256 });
      // map each frame's dB column to a fixed 256-band display vector (0..128kHz)
      const cols = [];
      for (let f = 0; f < spec.frames; f++) {
        const v = new Float32Array(256);
        for (let b = 0; b < 256; b++) {
          const bin = Math.floor((b / 256) * spec.bins);
          v[b] = spec.data[f][bin];
        }
        cols.push(v);
      }
      columns = cols;
      const res = analyzeSamples(rec.samples, sr, { region: settings.region, regionFilter: settings.regionFilter });
      pendingDetection = { res, truth: sp };
    };

    const loop = () => {
      if (!state.running) return;
      if (columns.length) {
        const col = columns.shift();
        pushWaterfallColumn(wfCanvas, col, { floorDb: -90, ceilDb: -10, colormap: settings.colormap });
        let maxDb = -Infinity, maxB = 0;
        for (let i = 0; i < col.length; i++) if (col[i] > maxDb) { maxDb = col[i]; maxB = i; }
        peakReadout.textContent = `${((maxB / 256) * 128).toFixed(1)} kHz`;
        document.getElementById('lvl').style.width = `${Math.max(0, Math.min(1, (maxDb + 90) / 80)) * 100}%`;
        if (!columns.length && pendingDetection) { commitSim(pendingDetection); pendingDetection = null; cooldown = 20 + Math.floor(Math.random() * 60); }
      } else {
        pushWaterfallColumn(wfCanvas, colsForNoise(), { floorDb: -90, ceilDb: -10, colormap: settings.colormap });
        document.getElementById('lvl').style.width = `${5 + Math.random() * 8}%`;
        if (cooldown > 0) cooldown--; else spawn();
      }
      state.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  async function commitSim({ res, truth }) {
    const cl = res.classification;
    if (cl.verdict === 'noise' || !cl.topId) return;
    const top = cl.candidates[0];
    const ev = { kind: 'bat', speciesId: top.id, confidence: top.confidence, peakKhz: res.detection.summary.meanCharKhz, time: Date.now(), truthId: truth.id };
    logEvent(ev);
    if (state.autoSave) {
      const proj = store.activeProject();
      if (proj) {
        const stations = store.stationsFor(proj.id);
        const stn = stations[Math.floor(Math.random() * stations.length)];
        await store.addDetection({
          projectId: proj.id, stationId: stn?.id || null, timestamp: Date.now(),
          lat: stn?.lat || 35.66, lng: stn?.lng || -83.52, speciesId: top.id,
          confidence: top.confidence, validated: false, fileName: 'live-monitor',
          summary: res.detection.summary, env: {}, detector: 'Live Monitor (simulated)', notes: '',
        });
      }
    }
  }

  function logEvent(ev) {
    state.events.unshift({ ...ev, time: ev.time || Date.now() });
    if (state.events.length > 60) state.events.pop();
    renderLog();
  }

  function renderLog() {
    clear(logBody);
    if (!state.events.length) { logBody.appendChild(h('div', { class: 'empty t-sm', text: 'No detections yet. Start monitoring to populate the log.' })); return; }
    const wrap = h('div', { class: 'table-wrap' });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, ['Time', 'Type', 'Identification', 'Confidence', 'Peak Fc'].map((t) => h('th', { text: t })))));
    const tb = h('tbody');
    state.events.forEach((ev) => {
      const sp = ev.speciesId ? speciesById(ev.speciesId) : null;
      const tier = ev.confidence != null ? confidenceTier(ev.confidence) : null;
      tb.appendChild(h('tr', {}, [
        h('td', { class: 'mono nowrap t-sm', text: fmtTime(ev.time) }),
        h('td', {}, h('span', { class: `chip ${ev.kind === 'bat' ? 'accent' : ''}`, text: ev.kind === 'bat' ? 'Bat call' : 'Acoustic' })),
        h('td', {}, sp ? h('div', { class: 'flex gap-8' }, [
          h('span', { class: 'fw-600', text: sp.commonName }),
          sp.protected ? h('span', { class: 'tag-protected', text: 'PROT' }) : null,
        ]) : h('span', { class: 'muted', text: 'Unclassified event' })),
        h('td', {}, tier ? h('div', { class: 'flex gap-8' }, [
          h('div', { class: `conf-bar ${tier.cls}`, style: { width: '60px' } }, h('i', { style: { width: pct(ev.confidence) } })),
          h('span', { class: 'mono t-xs', text: pct(ev.confidence) }),
        ]) : h('span', { class: 'muted', text: '—' })),
        h('td', { class: 'mono t-sm', text: ev.peakKhz ? `${ev.peakKhz.toFixed(1)} kHz` : '—' }),
      ]));
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    logBody.appendChild(wrap);
  }

  function updateNote() {
    const n = document.getElementById('mode-note');
    clear(n);
    if (state.mode === 'mic') {
      n.className = 'banner warn';
      n.appendChild(h('span', { class: 'banner-icon', html: icon('info', 20) }));
      n.appendChild(h('div', {}, [
        h('div', { class: 'fw-600', text: 'Microphone mode captures the sonic band only (≤ ~24 kHz)' }),
        h('div', { class: 't-sm', text: 'Standard device microphones cannot record true ultrasound. This mode visualizes audible acoustic activity and triggers. For real bat identification, connect a full-spectrum/time-expansion detector and analyze its WAV files in the Analyze view.' }),
      ]));
    } else {
      n.className = 'banner info';
      n.appendChild(h('span', { class: 'banner-icon', html: icon('info', 20) }));
      n.appendChild(h('div', {}, [
        h('div', { class: 'fw-600', text: 'Simulated ultrasonic detector stream' }),
        h('div', { class: 't-sm', text: `Emulates a full-spectrum detector deployed in the ${regionName(settings.region)} region, streaming species calls through the live detection & classification engine. Demonstrates the auto-trigger and real-time ID workflow you would see with connected hardware.` }),
      ]));
    }
  }

  function setBandChip() {
    const chip = document.getElementById('band-chip');
    if (chip) chip.textContent = state.mode === 'mic' ? '0 – 24 kHz (sonic)' : '0 – 128 kHz (full spectrum)';
  }
  function updateAxis() {
    const axis = document.getElementById('wf-axis');
    if (!axis) return;
    clear(axis);
    const max = state.mode === 'mic' ? 24 : 128;
    for (let i = 0; i <= 6; i++) {
      const frac = i / 6;
      axis.appendChild(h('span', { class: 'axis-label', style: { top: `${frac * 100}%` }, text: `${(max * (1 - frac)).toFixed(0)}` }));
    }
  }

  return () => stop();
}

function segBtn(label, val, state, onclick) {
  return h('button', { class: val === state.mode ? 'active' : '', dataset: { val }, text: label, onclick });
}
function regionName(r) {
  const map = { northeast: 'Northeast', southeast: 'Southeast', midwest: 'Midwest', southwest: 'Southwest', west: 'West', northwest: 'Pacific Northwest', national: 'national' };
  return map[r] || r;
}
