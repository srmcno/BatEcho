import { h, clear, modal, toast } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { decodeWav } from '../dsp/wav.js';
import { analyzeSamples } from '../dsp/pipeline.js';
import { synthSpecies, synthNoise } from '../dsp/synth.js';
import { spectrogramPanel } from '../components/spectrogram.js';
import { waveformPanel } from '../components/waveform.js';
import { playTimeExpanded } from '../utils/audio.js';
import { confidenceTier } from '../dsp/classifier.js';
import { SPECIES, speciesById, conservationLabel } from '../data/species.js';
import { fmtCoord, pct } from '../utils/format.js';

export function render(container, ctx) {
  const { store } = ctx;
  const settings = store.state.settings;
  const items = [];     // analyzed recordings
  let selected = -1;
  let player = null;

  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  // ---- control bar ----
  const fileInput = h('input', { type: 'file', accept: '.wav,audio/wav,audio/x-wav', multiple: true, style: { display: 'none' },
    onchange: (e) => handleFiles([...e.target.files]) });

  const demoSelect = h('select', { style: { maxWidth: '260px' } }, [
    h('option', { value: '', text: 'Generate demo recording…' }),
    ...SPECIES.filter((s) => s.id !== 'NOISE').map((s) => h('option', { value: s.id, text: `${s.commonName} (${s.fcKhz[0]}–${s.fcKhz[1]} kHz)` })),
    h('option', { value: 'NOISE_insect', text: '— Insect noise (test rejection)' }),
    h('option', { value: 'NOISE_weather', text: '— Weather noise (test rejection)' }),
  ]);

  const controls = h('div', { class: 'card', style: { marginBottom: '16px' } }, [
    h('div', { class: 'flex flex-wrap', style: { gap: '12px' } }, [
      h('button', { class: 'btn btn-primary', html: `${icon('upload', 16)} Upload WAV files`, onclick: () => fileInput.click() }),
      fileInput,
      h('div', { class: 'flex gap-8' }, [
        demoSelect,
        h('button', { class: 'btn', text: 'Generate', onclick: () => {
          const v = demoSelect.value;
          if (!v) { toast('Pick a species or noise type first', 'warn'); return; }
          if (v === 'NOISE_insect') addSynth(synthNoise({ kind: 'insect' }));
          else if (v === 'NOISE_weather') addSynth(synthNoise({ kind: 'weather' }));
          else addSynth(synthSpecies(v));
          demoSelect.value = '';
        } }),
      ]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('span', { class: 'chip accent', html: `${icon('globe', 13)} Region: ${regionName(settings.region)}` }),
    ]),
    h('div', { class: 'dropzone', id: 'dropzone', style: { marginTop: '14px' },
      onclick: () => fileInput.click() }, [
      h('div', { html: icon('wave', 30), class: 'c-accent' }),
      h('div', { class: 'fw-600', style: { marginTop: '6px' }, text: 'Drop full-spectrum WAV recordings here' }),
      h('div', { class: 't-xs muted', text: 'Supports high sample-rate (192/256/384 kHz) and GUANO metadata · processed locally, offline' }),
    ]),
  ]);
  root.appendChild(controls);

  setupDropzone(controls.querySelector('#dropzone'), handleFiles);

  // ---- batch list + detail ----
  const layout = h('div', { class: 'grid', style: { gridTemplateColumns: '300px 1fr', alignItems: 'start' } });
  const listCard = h('div', { class: 'card flush', id: 'file-list' });
  const detail = h('div', { id: 'detail' });
  layout.appendChild(listCard);
  layout.appendChild(detail);
  root.appendChild(layout);

  renderList();
  detail.appendChild(emptyDetail());

  // -------------------- handlers --------------------
  async function handleFiles(files) {
    const wavs = files.filter((f) => /\.wav$/i.test(f.name) || /wav/.test(f.type));
    if (!wavs.length) { toast('No WAV files found', 'warn'); return; }
    for (const f of wavs) {
      try {
        const buf = await f.arrayBuffer();
        const decoded = decodeWav(buf);
        addRecording(f.name, decoded.samples, decoded.sampleRate, { guano: decoded.guano, format: decoded.format, bitDepth: decoded.bitDepth, fileSize: f.size });
      } catch (err) {
        toast(`Could not decode ${f.name}: ${err.message}`, 'danger', 5000);
      }
    }
  }

  function addSynth(rec) {
    addRecording(`${rec.label}.wav`, rec.samples, rec.sampleRate, { format: 'synthetic 16-bit', bitDepth: 16, truthId: rec.speciesId });
  }

  function addRecording(name, samples, sampleRate, meta = {}) {
    // cap analysis window for responsiveness on very long files
    const maxSamples = sampleRate * 30;
    const work = samples.length > maxSamples ? samples.subarray(0, maxSamples) : samples;
    const result = analyzeSamples(work, sampleRate, {
      fftSize: settings.fftSize, windowFn: settings.windowFn,
      autoTriggerDb: settings.autoTriggerDb, region: settings.region, regionFilter: settings.regionFilter,
    });
    items.push({ name, samples: work, fullLength: samples.length, sampleRate, meta, result, saved: false });
    selected = items.length - 1;
    renderList();
    renderDetail();
    toast(`Analyzed ${name}`, 'info');
  }

  function renderList() {
    clear(listCard);
    listCard.appendChild(h('div', { style: { padding: '14px 16px' }, class: 'card-head mb-0' }, [
      h('span', { class: 'c-accent', html: icon('analyze', 18) }),
      h('h3', { text: `Queue (${items.length})` }),
    ]));
    if (!items.length) { listCard.appendChild(h('div', { class: 'empty t-sm', text: 'No recordings analyzed yet.' })); return; }
    const list = h('div', {});
    items.forEach((it, i) => {
      const cl = it.result.classification;
      const sp = cl.topId ? speciesById(cl.topId) : null;
      const isNoise = cl.verdict === 'noise';
      list.appendChild(h('div', {
        style: { padding: '11px 16px', borderTop: '1px solid var(--border)', cursor: 'pointer', background: i === selected ? 'var(--surface-2)' : 'transparent' },
        onclick: () => { selected = i; renderList(); renderDetail(); },
      }, [
        h('div', { class: 'flex', style: { gap: '8px' } }, [
          h('span', { class: 'fw-600 t-sm', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }, text: it.name }),
          h('span', { class: 'spacer', style: { flex: 1 } }),
          it.saved ? h('span', { class: 'c-ok', html: icon('check', 14) }) : null,
        ]),
        h('div', { class: 'flex', style: { gap: '6px', marginTop: '4px' } }, [
          isNoise ? h('span', { class: 'chip', text: 'Noise / non-bat' })
            : sp ? h('span', { class: `chip ${sp.protected ? 'danger' : 'accent'}`, text: sp.commonName })
            : h('span', { class: 'chip warn', text: 'Uncertain' }),
          sp ? h('span', { class: 'mono t-xs muted', text: pct(cl.candidates[0]?.confidence || 0) }) : null,
        ]),
      ]));
    });
    listCard.appendChild(list);
  }

  function renderDetail() {
    if (player) { player.stop(); player = null; }
    clear(detail);
    if (selected < 0 || !items[selected]) { detail.appendChild(emptyDetail()); return; }
    detail.appendChild(buildDetail(items[selected], ctx, {
      onSave: () => openSaveModal(items[selected], ctx, () => { items[selected].saved = true; renderList(); }),
      setPlayer: (p) => { player = p; },
      getPlayer: () => player,
    }));
  }

  const unsub = store.subscribe((s, evt) => { if (evt === 'settings') settings.region = store.state.settings.region; });
  return () => { unsub(); if (player) player.stop(); };
}

// ---------------------------------------------------------------------------
function buildDetail(item, ctx, hooks) {
  const { result, name, samples, sampleRate, meta } = item;
  const { classification: cl, detection, spec } = result;
  const wrap = h('div', { class: 'grid', style: { gap: '16px' } });

  // header
  wrap.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'flex flex-wrap', style: { gap: '10px' } }, [
      h('div', {}, [
        h('h2', { style: { margin: 0, fontSize: '17px' }, text: name }),
        h('div', { class: 't-xs muted mono', style: { marginTop: '4px' },
          text: `${(sampleRate / 1000).toFixed(0)} kHz · ${meta.format || 'PCM'} · ${(item.fullLength / sampleRate).toFixed(2)} s · ${detection.summary.callCount} pulses detected` }),
      ]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-primary btn-sm', html: `${icon('check', 14)} Save to project`, onclick: hooks.onSave }),
    ]),
  ]));

  // identification result
  wrap.appendChild(identificationCard(cl, item));

  // playback + waveform + spectrogram
  const vizCard = h('div', { class: 'card' });
  vizCard.appendChild(h('div', { class: 'card-head' }, [
    h('span', { class: 'c-accent', html: icon('wave', 18) }),
    h('h3', { text: 'Waveform & spectrogram' }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    h('span', { class: 'chip', text: `FFT ${result.fftSize} · ${settingsWindowLabel()}` }),
  ]));

  const wf = waveformPanel(vizCard, samples, { height: 70 });
  const specHost = h('div', { style: { marginTop: '10px' } });
  vizCard.appendChild(specHost);
  const sg = spectrogramPanel(specHost, spec, {
    colormap: ctx.store.state.settings.colormap, height: 300,
    maxFreqHz: Math.min(sampleRate / 2, 140000), calls: detection.calls,
  });

  // playback controls (time-expanded)
  const playBtn = h('button', { class: 'btn btn-sm', html: `${icon('play', 14)} Play ×10 (time-expanded)` });
  const teInfo = h('span', { class: 't-xs muted', text: 'Ultrasound slowed 10× into the audible range' });
  playBtn.onclick = () => {
    const existing = hooks.getPlayer();
    if (existing) { existing.stop(); hooks.setPlayer(null); playBtn.innerHTML = `${icon('play', 14)} Play ×10 (time-expanded)`; sg.setPlayhead(null); wf.setPlayhead(null); return; }
    const p = playTimeExpanded(samples, sampleRate, {
      factor: 10,
      onProgress: (t) => { sg.setPlayhead(t); wf.setPlayhead(t, samples.length / sampleRate); },
      onEnd: () => { playBtn.innerHTML = `${icon('play', 14)} Play ×10 (time-expanded)`; sg.setPlayhead(null); wf.setPlayhead(null); hooks.setPlayer(null); },
    });
    hooks.setPlayer(p);
    playBtn.innerHTML = `${icon('pause', 14)} Stop`;
  };
  vizCard.appendChild(h('div', { class: 'flex gap-16', style: { marginTop: '10px' } }, [playBtn, teInfo]));
  wrap.appendChild(vizCard);

  // call parameters
  wrap.appendChild(parametersCard(detection));

  // GUANO metadata
  if (meta.guano && Object.keys(meta.guano).length) {
    wrap.appendChild(guanoCard(meta.guano));
  }

  return wrap;
}

function identificationCard(cl, item) {
  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'card-head' }, [
    h('span', { class: 'c-accent', html: icon('brain', 18) }),
    h('h3', { text: 'Species identification' }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    verdictChip(cl.verdict),
  ]));

  if (cl.verdict === 'noise') {
    card.appendChild(h('div', { class: 'banner info' }, [
      h('span', { class: 'banner-icon', html: icon('filter', 20) }),
      h('div', {}, [h('div', { class: 'fw-600', text: 'Filtered as non-bat / noise' }), h('div', { class: 't-sm muted', text: cl.note })]),
    ]));
    return card;
  }
  if (!cl.candidates.length) {
    card.appendChild(h('div', { class: 'empty', text: cl.note || 'No confident match.' }));
    return card;
  }

  // top candidate highlighted
  const top = cl.candidates[0];
  const topSp = top.species;
  const tier = confidenceTier(top.confidence);
  card.appendChild(h('div', { style: { padding: '12px', background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', marginBottom: '14px' } }, [
    h('div', { class: 'flex flex-wrap', style: { gap: '10px' } }, [
      h('div', {}, [
        h('div', { class: 'flex gap-8' }, [
          h('span', { class: 'fw-700 t-lg', text: topSp.commonName }),
          topSp.protected ? h('span', { class: 'tag-protected', text: 'PROTECTED' }) : null,
          item.meta.truthId ? h('span', { class: `chip ${item.meta.truthId === top.id ? 'accent' : 'warn'}`, text: item.meta.truthId === top.id ? '✓ matches synthetic truth' : `truth: ${speciesById(item.meta.truthId)?.commonName}` }) : null,
        ]),
        h('div', { class: 'species-sci', text: topSp.scientificName }),
        h('div', { class: 't-xs muted', style: { marginTop: '4px' }, text: conservationLabel(topSp) }),
      ]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('div', { class: 'center' }, [
        h('div', { class: 'mono fw-700', style: { fontSize: '26px', color: tier.cls === 'conf-high' ? 'var(--ok)' : tier.cls === 'conf-med' ? 'var(--amber)' : 'var(--danger)' }, text: pct(top.confidence) }),
        h('div', { class: 't-xs muted', text: `${tier.label} confidence` }),
      ]),
    ]),
    topSp.protected ? h('div', { class: 'banner alert', style: { marginTop: '10px', padding: '8px 12px' } }, [
      h('span', { class: 'banner-icon', html: icon('alert', 16) }),
      h('div', { class: 't-xs', text: 'Listed / at-risk species — may require regulatory notification. Confirm with manual validation before formal reporting.' }),
    ]) : null,
  ]));

  if (cl.note) card.appendChild(h('div', { class: 't-xs muted', style: { marginBottom: '10px' }, text: cl.note }));

  // candidate ranking
  card.appendChild(h('div', { class: 't-xs muted fw-600', style: { marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.5px' }, text: 'Possible species (ranked)' }));
  cl.candidates.slice(0, 5).forEach((c) => {
    const t = confidenceTier(c.confidence);
    card.appendChild(h('div', { class: 'flex', style: { gap: '10px', padding: '7px 0' } }, [
      h('span', { class: 't-sm fw-600', style: { width: '170px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, text: c.species.commonName }),
      h('div', { class: `conf-bar ${t.cls}`, style: { flex: 1 } }, h('i', { style: { width: pct(c.confidence) } })),
      h('span', { class: 'mono t-xs', style: { width: '42px', textAlign: 'right' }, text: pct(c.confidence) }),
      c.inRegion ? null : h('span', { class: 'chip warn t-xs', text: 'out of region' }),
    ]));
  });
  return card;
}

function parametersCard(detection) {
  const s = detection.summary;
  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'card-head' }, [
    h('span', { class: 'c-accent', html: icon('analyze', 18) }),
    h('h3', { text: 'Call parameters' }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    h('span', { class: 'chip', text: `${s.callCount} pulses` }),
  ]));
  if (!s.callCount) { card.appendChild(h('div', { class: 'empty t-sm', text: 'No measurable pulses.' })); return card; }

  const params = [
    ['Char. freq (Fc)', s.meanCharKhz, 'kHz'], ['Peak freq', s.meanPeakKhz, 'kHz'],
    ['Fc range', `${s.minCharKhz}–${s.maxCharKhz}`, 'kHz'], ['Duration', s.meanDurMs, 'ms'],
    ['Bandwidth', s.meanBandwidthKhz, 'kHz'], ['Slope', s.meanSlope, 'kHz/ms'],
    ['Pulse interval', s.meanPulseIntervalMs, 'ms'], ['Call shape', s.dominantShape, ''],
  ];
  card.appendChild(h('div', { class: 'param-grid' }, params.map(([lbl, val, unit]) => h('div', { class: 'param' }, [
    h('div', { class: 'lbl', text: lbl }),
    h('div', { class: 'val', html: `${val}${unit ? ` <small>${unit}</small>` : ''}` }),
  ]))));

  // per-call table (collapsible)
  const toggle = h('button', { class: 'btn btn-ghost btn-sm', style: { marginTop: '12px' }, text: `Show ${detection.calls.length} individual pulses ▾` });
  const tableWrap = h('div', { class: 'table-wrap hidden', style: { marginTop: '8px' } });
  const table = h('table');
  table.appendChild(h('thead', {}, h('tr', {}, ['#', 'Start (s)', 'Dur (ms)', 'Fc', 'Peak', 'Min', 'Max', 'BW', 'Slope', 'Shape', 'PI (ms)'].map((t) => h('th', { text: t })))));
  const tb = h('tbody');
  detection.calls.forEach((c, i) => {
    tb.appendChild(h('tr', {}, [
      h('td', { class: 'muted', text: String(i + 1) }),
      h('td', { class: 'mono', text: c.startTime.toFixed(3) }),
      h('td', { class: 'mono', text: c.durationMs }),
      h('td', { class: 'mono c-accent', text: c.charFreqKhz }),
      h('td', { class: 'mono', text: c.peakFreqKhz }),
      h('td', { class: 'mono', text: c.minFreqKhz }),
      h('td', { class: 'mono', text: c.maxFreqKhz }),
      h('td', { class: 'mono', text: c.bandwidthKhz }),
      h('td', { class: 'mono', text: c.slopeKhzPerMs }),
      h('td', {}, h('span', { class: 'chip t-xs', text: c.shape })),
      h('td', { class: 'mono', text: c.pulseIntervalMs != null ? c.pulseIntervalMs.toFixed(0) : '—' }),
    ]));
  });
  table.appendChild(tb);
  tableWrap.appendChild(table);
  toggle.onclick = () => { tableWrap.classList.toggle('hidden'); toggle.textContent = tableWrap.classList.contains('hidden') ? `Show ${detection.calls.length} individual pulses ▾` : `Hide pulses ▴`; };
  card.appendChild(toggle);
  card.appendChild(tableWrap);
  return card;
}

function guanoCard(guano) {
  const card = h('div', { class: 'card' }, [
    h('div', { class: 'card-head' }, [h('span', { class: 'c-accent', html: icon('database', 18) }), h('h3', { text: 'GUANO metadata' })]),
  ]);
  const dl = h('dl', { class: 'kv' });
  Object.entries(guano).forEach(([k, v]) => { dl.appendChild(h('dt', { text: k })); dl.appendChild(h('dd', { text: v })); });
  card.appendChild(dl);
  return card;
}

// ---------------------------------------------------------------------------
function openSaveModal(item, ctx, onSaved) {
  const { store } = ctx;
  const proj = store.activeProject();
  if (!proj) { toast('Create a project first', 'warn'); return; }
  const stations = store.stationsFor(proj.id);
  const cl = item.result.classification;
  const defaultSpecies = cl.topId || (cl.candidates[0]?.id) || 'NOISE';

  const speciesSel = h('select', {}, SPECIES.map((s) => h('option', { value: s.id, text: `${s.commonName} (${s.id})`, selected: s.id === defaultSpecies })));
  const stationSel = h('select', {}, [
    h('option', { value: '', text: stations.length ? 'Select station…' : 'No stations — uses project center' }),
    ...stations.map((s) => h('option', { value: s.id, text: `${s.name} · ${s.habitat}` })),
  ]);
  const validatedChk = h('input', { type: 'checkbox' });
  const notes = h('textarea', { placeholder: 'Field notes, behaviour, validation rationale…' });
  const temp = h('input', { type: 'number', value: '18', step: '0.1' });
  const humidity = h('input', { type: 'number', value: '70' });
  const weather = h('select', {}, ['Clear', 'Partly cloudy', 'Overcast', 'Light wind', 'Light rain'].map((w) => h('option', { text: w })));

  const content = h('div', {}, [
    h('h2', { text: 'Save detection to project' }),
    h('p', { class: 'c-2 t-sm', text: proj.name }),
    h('label', { class: 'field' }, [h('span', { text: 'Identified species (override if needed)' }), speciesSel]),
    h('label', { class: 'field' }, [h('span', { text: 'Monitoring station' }), stationSel]),
    h('div', { class: 'grid grid-3' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Temp °C' }), temp]),
      h('label', { class: 'field' }, [h('span', { text: 'Humidity %' }), humidity]),
      h('label', { class: 'field' }, [h('span', { text: 'Weather' }), weather]),
    ]),
    h('label', { class: 'field' }, [h('span', { text: 'Notes' }), notes]),
    h('label', { class: 'flex gap-8', style: { cursor: 'pointer' } }, [validatedChk, h('span', { class: 't-sm', text: 'Mark as manually validated (expert confirmed)' })]),
    h('div', { class: 'modal-foot' }, [
      h('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      h('button', { class: 'btn btn-primary', text: 'Save detection', onclick: save }),
    ]),
  ]);
  const m = modal(content);

  async function save() {
    const station = stations.find((s) => s.id === stationSel.value);
    const lat = station ? station.lat : item.meta.lat || projCenterLat(proj, stations);
    const lng = station ? station.lng : item.meta.lng || projCenterLng(proj, stations);
    const speciesId = speciesSel.value;
    const conf = cl.candidates.find((c) => c.id === speciesId)?.confidence ?? (speciesId === defaultSpecies ? (cl.candidates[0]?.confidence || 0) : 0.5);
    await store.addDetection({
      projectId: proj.id, stationId: station?.id || null,
      timestamp: Date.now(), lat, lng, speciesId,
      confidence: Math.round(conf * 1000) / 1000,
      validated: validatedChk.checked,
      fileName: item.name,
      summary: item.result.detection.summary,
      env: { tempC: parseFloat(temp.value), humidity: parseInt(humidity.value), weather: weather.value, windKph: 0 },
      detector: item.meta.guano?.Make || 'Manual upload',
      candidates: cl.candidates.slice(0, 3).map((c) => ({ id: c.id, confidence: c.confidence })),
      notes: notes.value,
    });
    toast('Detection saved', 'info');
    m.close();
    onSaved();
  }
}

// ---------------------------------------------------------------------------
function emptyDetail() {
  return h('div', { class: 'card empty' }, [
    h('div', { html: icon('analyze', 52) }),
    h('h3', { text: 'No recording selected' }),
    h('p', { class: 't-sm', text: 'Upload a full-spectrum WAV recording or generate a demo to run echolocation analysis and species identification.' }),
  ]);
}

function verdictChip(v) {
  const map = {
    confident: ['accent', 'Confident ID'], probable: ['accent', 'Probable ID'],
    possible: ['warn', 'Ambiguous'], uncertain: ['warn', 'Uncertain'], noise: ['danger', 'Noise filtered'],
  };
  const [cls, label] = map[v] || ['', v];
  return h('span', { class: `chip ${cls}`, text: label });
}

function setupDropzone(zone, onFiles) {
  ['dragenter', 'dragover'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((e) => zone.addEventListener(e, (ev) => { ev.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (ev) => { onFiles([...ev.dataTransfer.files]); });
}

function regionName(r) {
  const map = { northeast: 'Northeast', southeast: 'Southeast', midwest: 'Midwest', southwest: 'Southwest', west: 'West', northwest: 'Pacific NW', national: 'All regions' };
  return map[r] || r;
}
function settingsWindowLabel() { return 'Hann window'; }
function projCenterLat(proj, stations) { return stations[0]?.lat || 35.66; }
function projCenterLng(proj, stations) { return stations[0]?.lng || -83.52; }
