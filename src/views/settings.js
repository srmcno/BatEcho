import { h, clear, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { COLORMAP_NAMES } from '../dsp/spectrogram.js';
import { REGIONS } from '../data/species.js';
import { db } from '../state/db.js';

export function render(container, ctx) {
  const { store } = ctx;
  const s = store.state.settings;
  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  root.appendChild(h('div', { class: 'grid grid-2', style: { alignItems: 'start' } }, [
    h('div', { class: 'grid', style: { gap: '16px' } }, [appearance(), engine(), regionCard()]),
    h('div', { class: 'grid', style: { gap: '16px' } }, [integrations(), dataMgmt(), about()]),
  ]));

  function appearance() {
    const card = section('sun', 'Appearance', 'Optimized for nighttime field use');
    const themes = [['night', 'Night (deep blue)', 'moon'], ['dark', 'Dark neutral', 'moon'], ['light', 'Daylight planning', 'sun']];
    card.appendChild(field('Theme', h('div', { class: 'seg' }, themes.map(([v, label]) =>
      h('button', { class: s.theme === v ? 'active' : '', text: label, onclick: (e) => { store.saveSettings({ theme: v }); [...e.target.parentNode.children].forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); } })))));
    const cmap = h('select', { onchange: (e) => store.saveSettings({ colormap: e.target.value }) },
      COLORMAP_NAMES.map((c) => h('option', { value: c, text: c, selected: s.colormap === c })));
    card.appendChild(field('Spectrogram colormap', cmap));
    card.appendChild(h('div', { class: 't-xs muted', html: `${icon('info', 13)} The <b>night-red</b> colormap preserves dark adaptation during field surveys.` }));
    return card;
  }

  function engine() {
    const card = section('brain', 'Analysis engine', 'Signal processing parameters');
    const fft = h('select', { onchange: (e) => store.saveSettings({ fftSize: parseInt(e.target.value) }) },
      [256, 512, 1024, 2048, 4096].map((n) => h('option', { value: n, text: `${n} samples`, selected: s.fftSize === n })));
    card.appendChild(field('FFT window size', fft, 'Larger = finer frequency resolution; smaller = finer timing.'));
    const win = h('select', { onchange: (e) => store.saveSettings({ windowFn: e.target.value }) },
      [['hann', 'Hann'], ['hamming', 'Hamming'], ['blackman-harris', 'Blackman-Harris']].map(([v, l]) => h('option', { value: v, text: l, selected: s.windowFn === v })));
    card.appendChild(field('Window function', win));
    const trig = h('input', { type: 'range', min: '6', max: '24', value: String(s.autoTriggerDb), oninput: (e) => { trigLabel.textContent = `${e.target.value} dB`; store.saveSettings({ autoTriggerDb: parseInt(e.target.value) }); } });
    const trigLabel = h('span', { class: 'mono c-accent', text: `${s.autoTriggerDb} dB` });
    card.appendChild(field(h('span', {}, ['Auto-trigger sensitivity ', trigLabel]), trig, 'Energy above the noise floor required to register a call pulse.'));
    return card;
  }

  function regionCard() {
    const card = section('globe', 'Region & filtering', 'Constrain identification to plausible species');
    const reg = h('select', { onchange: (e) => store.saveSettings({ region: e.target.value }) },
      Object.entries(REGIONS).map(([k, v]) => h('option', { value: k, text: v, selected: s.region === k })));
    card.appendChild(field('Default survey region', reg));
    const chk = h('input', { type: 'checkbox', style: { width: 'auto' }, checked: s.regionFilter, onchange: (e) => store.saveSettings({ regionFilter: e.target.checked }) });
    card.appendChild(h('label', { class: 'flex gap-8', style: { cursor: 'pointer' } }, [chk, h('span', { class: 't-sm', text: 'Down-weight species outside the selected region' })]));
    card.appendChild(h('div', { class: 't-xs muted', style: { marginTop: '8px' }, html: `${icon('info', 13)} Out-of-region species remain visible but are penalized, reflecting known range maps.` }));
    return card;
  }

  function integrations() {
    const card = section('database', 'Data integrations', 'External scientific & environmental sources');
    const defs = [
      ['noaa', 'NOAA Weather', 'Auto-tag detections with temperature, humidity & conditions', true],
      ['usgs', 'USGS Geographic', 'Elevation, hydrography & land-cover overlays', true],
      ['nabat', 'NABat', 'North American Bat Monitoring Program compatibility & submission', false],
      ['inaturalist', 'iNaturalist', 'Citizen-science occurrence cross-referencing', false],
    ];
    defs.forEach(([key, name, desc]) => {
      const cfg = s.integrations[key] || {};
      const chk = h('input', { type: 'checkbox', style: { width: 'auto' }, checked: cfg.enabled, onchange: (e) => {
        const integrations = { ...s.integrations, [key]: { ...cfg, enabled: e.target.checked } };
        store.saveSettings({ integrations }); toast(`${name} ${e.target.checked ? 'enabled' : 'disabled'}`);
      } });
      card.appendChild(h('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } }, [
        h('div', { class: 'flex gap-8' }, [
          chk,
          h('div', {}, [h('div', { class: 'fw-600 t-sm', text: name }), h('div', { class: 't-xs muted', text: desc })]),
          h('span', { class: 'spacer', style: { flex: 1 } }),
          h('span', { class: `chip t-xs ${cfg.enabled ? 'accent' : ''}`, text: cfg.enabled ? 'On' : 'Off' }),
        ]),
      ]));
    });
    card.appendChild(h('div', { class: 'banner info', style: { marginTop: '12px' } }, [
      h('span', { class: 'banner-icon', html: icon('info', 18) }),
      h('div', { class: 't-xs', text: 'Integrations are configured here and exercised when connectivity and API credentials are available. In this build, environmental metadata is modeled locally so the workflow functions fully offline.' }),
    ]));
    return card;
  }

  function dataMgmt() {
    const card = section('database', 'Data management', 'Local offline storage');
    const dets = store.state.detections.length, projs = store.state.projects.length, stns = store.state.stations.length;
    card.appendChild(h('dl', { class: 'kv' }, [
      h('dt', { text: 'Projects' }), h('dd', { text: String(projs) }),
      h('dt', { text: 'Stations' }), h('dd', { text: String(stns) }),
      h('dt', { text: 'Detections' }), h('dd', { text: String(dets) }),
      h('dt', { text: 'Storage' }), h('dd', { id: 'storage-est', text: '…' }),
    ]));
    estimateStorage();
    card.appendChild(h('div', { class: 'flex gap-8', style: { marginTop: '14px' } }, [
      h('button', { class: 'btn btn-sm', text: 'Reset to demo data', onclick: async () => {
        if (await confirmDialog('Reset all data?', 'All projects, stations and detections will be replaced with the demo survey.', { danger: true, confirmText: 'Reset' })) {
          await db.clear('projects'); await db.clear('stations'); await db.clear('detections');
          location.reload();
        }
      } }),
      h('button', { class: 'btn btn-danger btn-sm', html: `${icon('trash', 13)} Clear all`, onclick: async () => {
        if (await confirmDialog('Delete everything?', 'This permanently clears local data.', { danger: true, confirmText: 'Delete all' })) {
          await db.clear('projects'); await db.clear('stations'); await db.clear('detections');
          store.state.projects = []; store.state.stations = []; store.state.detections = []; store.state.activeProjectId = null;
          toast('All data cleared'); store.emit('projects');
        }
      } }),
    ]));
    return card;
  }

  async function estimateStorage() {
    const el = document.getElementById('storage-est');
    if (!el) return;
    try {
      if (navigator.storage?.estimate) {
        const { usage } = await navigator.storage.estimate();
        el.textContent = usage ? `${(usage / 1048576).toFixed(1)} MB` : 'n/a';
      } else el.textContent = 'n/a';
    } catch { el.textContent = 'n/a'; }
  }

  function about() {
    return h('div', { class: 'card' }, [
      h('div', { class: 'flex gap-8', style: { marginBottom: '8px' } }, [
        h('span', { class: 'brand-mark c-accent', html: `<svg viewBox="0 0 64 64" width="28" height="28" fill="currentColor"><path d="M32 18c-3-7-9-10-15-9 3 2 4 5 4 8-4-2-9-1-12 2 5 0 8 3 10 6 3 4 8 7 13 7s10-3 13-7c2-3 5-6 10-6-3-3-8-4-12-2 0-3 1-6 4-8-6-1-12 2-15 9z"/></svg>` }),
        h('div', {}, [h('div', { class: 'fw-700', text: 'BatEcho' }), h('div', { class: 't-xs muted', text: 'v1.0 · Acoustic Monitoring Platform' })]),
      ]),
      h('p', { class: 't-sm c-2', text: 'An offline-first progressive web app for ultrasonic bat call analysis and species identification. All signal processing, classification and storage run locally in your browser — no recordings leave the device.' }),
      h('div', { class: 'flex gap-6 flex-wrap', style: { marginTop: '8px' } }, [
        chipTag('Offline-first PWA'), chipTag('Local DSP engine'), chipTag('WAV / GUANO'), chipTag('Full-spectrum'),
      ]),
    ]);
  }

  function chipTag(t) { return h('span', { class: 'chip t-xs', text: t }); }
}

function section(ic, title, sub) {
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-head' }, [h('span', { class: 'c-accent', html: icon(ic, 18) }), h('div', {}, [h('h3', { style: { margin: 0 }, text: title }), sub ? h('div', { class: 't-xs muted', text: sub }) : null])]),
  ]);
}

function field(label, control, hint) {
  return h('label', { class: 'field' }, [
    h('span', {}, typeof label === 'string' ? [label] : [label]),
    control,
    hint ? h('div', { class: 't-xs muted', style: { marginTop: '5px' }, text: hint }) : null,
  ]);
}
