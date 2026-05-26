import { h, clear, modal } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { SPECIES, REGIONS, conservationLabel } from '../data/species.js';

const MAX_KHZ = 130;

export function render(container, ctx) {
  const { store } = ctx;
  let query = '';
  let regionFilter = 'all';
  let onlyProtected = false;

  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  const search = h('input', { placeholder: 'Search species, genus…', style: { maxWidth: '280px' }, oninput: (e) => { query = e.target.value.toLowerCase(); build(); } });
  const regionSel = h('select', { style: { maxWidth: '200px' }, onchange: (e) => { regionFilter = e.target.value; build(); } }, [
    h('option', { value: 'all', text: 'All regions' }),
    ...Object.entries(REGIONS).map(([k, v]) => h('option', { value: k, text: v })),
  ]);
  const protChk = h('input', { type: 'checkbox', style: { width: 'auto' }, onchange: (e) => { onlyProtected = e.target.checked; build(); } });

  root.appendChild(h('div', { class: 'flex flex-wrap', style: { gap: '12px', marginBottom: '16px' } }, [
    h('div', {}, [h('h2', { style: { margin: 0 }, text: 'Species acoustic reference' }), h('div', { class: 't-sm muted', text: `${SPECIES.length - 1} North American species` })]),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    search, regionSel,
    h('label', { class: 'flex gap-8 t-sm', style: { cursor: 'pointer' } }, [protChk, 'Protected only']),
  ]));

  const grid = h('div', { class: 'grid grid-3' });
  root.appendChild(grid);

  function build() {
    clear(grid);
    const list = SPECIES.filter((s) => s.id !== 'NOISE')
      .filter((s) => !onlyProtected || s.protected)
      .filter((s) => regionFilter === 'all' || s.regions.includes(regionFilter) || s.regions.includes('national'))
      .filter((s) => !query || `${s.commonName} ${s.scientificName} ${s.genus}`.toLowerCase().includes(query));
    if (!list.length) { grid.appendChild(h('div', { class: 'empty', text: 'No species match the filters.' })); return; }
    list.forEach((s) => grid.appendChild(card(s)));
  }

  function card(s) {
    return h('div', { class: 'card species-card', onclick: () => detail(s) }, [
      h('div', { class: 'flex' }, [
        h('h3', { style: { margin: 0, fontSize: '15px' }, text: s.commonName }),
        h('span', { class: 'spacer', style: { flex: 1 } }),
        s.protected ? h('span', { class: 'tag-protected', text: 'PROTECTED' }) : null,
      ]),
      h('div', { class: 'species-sci', text: s.scientificName }),
      h('div', { style: { margin: '12px 0' } }, [freqTrack(s)]),
      h('div', { class: 'flex gap-16 t-xs muted', style: { marginTop: '6px' } }, [
        h('span', { html: `Fc <b class="c-accent">${s.fcKhz[0]}–${s.fcKhz[1]}</b> kHz` }),
        h('span', { html: `${s.durationMs[0]}–${s.durationMs[1]} ms` }),
        h('span', {}, s.shape.join('/')),
      ]),
      h('div', { class: 'flex gap-6 flex-wrap', style: { marginTop: '10px' } }, [
        s.migratory ? h('span', { class: 'chip purple t-xs', text: 'Migratory' }) : null,
        h('span', { class: `chip t-xs ${s.iucn === 'LC' ? '' : 'warn'}`, text: conservationLabel(s) }),
      ]),
    ]);
  }

  function detail(s) {
    const content = h('div', {}, [
      h('div', { class: 'flex' }, [
        h('div', {}, [
          h('h2', { style: { margin: 0 }, text: s.commonName }),
          h('div', { class: 'species-sci', text: `${s.scientificName} · ${s.genus}` }),
        ]),
        h('span', { class: 'spacer', style: { flex: 1 } }),
        s.protected ? h('span', { class: 'tag-protected', text: 'PROTECTED' }) : null,
      ]),
      h('div', { class: 'banner info', style: { marginTop: '14px' } }, [
        h('span', { class: 'banner-icon', html: icon('species', 20) }),
        h('div', { class: 't-sm', text: s.notes }),
      ]),
      h('div', { class: 'card-head', style: { marginTop: '18px' } }, [h('h3', { style: { fontSize: '13px' }, text: 'Echolocation frequency profile' })]),
      freqTrack(s, true),
      h('div', { class: 'flex', style: { justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-3)', marginTop: '4px' } }, [h('span', { text: '0 kHz' }), h('span', { text: `${MAX_KHZ} kHz` })]),
      h('div', { class: 'param-grid', style: { marginTop: '16px' } }, [
        param('Characteristic freq', `${s.fcKhz[0]}–${s.fcKhz[1]}`, 'kHz'),
        param('Sweep range', `${s.freqRangeKhz[0]}–${s.freqRangeKhz[1]}`, 'kHz'),
        param('Call duration', `${s.durationMs[0]}–${s.durationMs[1]}`, 'ms'),
        param('Pulse interval', `${s.pulseIntervalMs[0]}–${s.pulseIntervalMs[1]}`, 'ms'),
        param('Call shape', s.shape.join(', '), ''),
        param('Harmonics', String(s.harmonics), ''),
      ]),
      h('div', { class: 'card-head', style: { marginTop: '16px' } }, [h('h3', { style: { fontSize: '13px' }, text: 'Distribution & ecology' })]),
      h('dl', { class: 'kv' }, [
        h('dt', { text: 'Regions' }), h('dd', { text: s.regions.map((r) => REGIONS[r]).join(', ') }),
        h('dt', { text: 'Habitat' }), h('dd', { text: s.habitat.join(', ') || '—' }),
        h('dt', { text: 'Migratory' }), h('dd', { text: s.migratory ? 'Yes' : 'No' }),
        h('dt', { text: 'Conservation' }), h('dd', { text: conservationLabel(s) }),
      ]),
    ]);
    modal(content, { large: true });
  }

  build();
}

function freqTrack(s, tall = false) {
  const lo = (s.freqRangeKhz[0] / MAX_KHZ) * 100;
  const hi = (s.freqRangeKhz[1] / MAX_KHZ) * 100;
  const fc = ((s.fcKhz[0] + s.fcKhz[1]) / 2 / MAX_KHZ) * 100;
  return h('div', { class: 'freq-track', style: tall ? { height: '54px' } : {} }, [
    h('i', { style: { left: `${lo}%`, width: `${hi - lo}%` } }),
    h('b', { style: { left: `${fc}%` }, title: 'Characteristic frequency' }),
  ]);
}

function param(lbl, val, unit) {
  return h('div', { class: 'param' }, [
    h('div', { class: 'lbl', text: lbl }),
    h('div', { class: 'val', html: `${val}${unit ? ` <small>${unit}</small>` : ''}` }),
  ]);
}
