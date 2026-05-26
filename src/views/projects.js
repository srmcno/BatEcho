import { h, clear, modal, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { REGIONS, SPECIES, speciesById } from '../data/species.js';
import { fmtDate, fmtCoord, relTime } from '../utils/format.js';

export function render(container, ctx) {
  const { store } = ctx;
  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  function build() {
    clear(root);
    root.appendChild(h('div', { class: 'flex', style: { marginBottom: '16px' } }, [
      h('div', {}, [
        h('h2', { style: { margin: 0 }, text: 'Survey projects' }),
        h('div', { class: 't-sm muted', text: 'Organize monitoring efforts, stations and transects' }),
      ]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-primary', html: `${icon('plus', 16)} New project`, onclick: () => projectModal(store) }),
    ]));

    // project cards
    const grid = h('div', { class: 'grid grid-3', style: { marginBottom: '24px' } });
    store.state.projects.forEach((p) => grid.appendChild(projectCard(p, store, build)));
    if (!store.state.projects.length) grid.appendChild(h('div', { class: 'empty', text: 'No projects yet.' }));
    root.appendChild(grid);

    // active project stations
    const proj = store.activeProject();
    if (proj) root.appendChild(stationsSection(proj, store, build));
  }

  build();
  const unsub = store.subscribe((s, evt) => { if (['projects', 'stations', 'activeProject', 'detections'].includes(evt)) build(); });
  return () => unsub();
}

function projectCard(p, store, refresh) {
  const stations = store.stationsFor(p.id);
  const dets = store.detectionsFor(p.id).filter((d) => d.speciesId !== 'NOISE');
  const richness = new Set(dets.map((d) => d.speciesId)).size;
  const active = p.id === store.state.activeProjectId;
  return h('div', { class: `card species-card`, style: { borderColor: active ? 'var(--accent)' : '' }, onclick: () => store.setActiveProject(p.id) }, [
    h('div', { class: 'flex' }, [
      h('span', { class: 'c-accent', html: icon('projects', 18) }),
      active ? h('span', { class: 'chip accent', text: 'Active' }) : null,
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-ghost btn-sm', html: icon('edit', 14), title: 'Edit', onclick: (e) => { e.stopPropagation(); projectModal(store, p); } }),
      h('button', { class: 'btn btn-ghost btn-sm', html: icon('trash', 14), title: 'Delete', onclick: async (e) => { e.stopPropagation(); if (await confirmDialog('Delete project?', `“${p.name}” and its ${stations.length} stations will be removed. Detections remain in the database.`, { danger: true, confirmText: 'Delete' })) { store.deleteProject(p.id); toast('Project deleted'); } } }),
    ]),
    h('h3', { style: { margin: '8px 0 4px', fontSize: '15px' }, text: p.name }),
    h('div', { class: 't-xs muted', text: REGIONS[p.region] || p.region }),
    h('p', { class: 't-sm c-2', style: { margin: '8px 0', minHeight: '38px' }, text: p.description || '' }),
    h('div', { class: 'flex gap-16 t-xs muted' }, [
      h('span', { html: `${icon('station', 13)} ${stations.length} stations` }),
      h('span', { html: `${icon('zap', 13)} ${dets.length} det.` }),
      h('span', { html: `${icon('species', 13)} ${richness} sp.` }),
    ]),
    p.permit ? h('div', { class: 'chip', style: { marginTop: '8px' }, text: `Permit ${p.permit}` }) : null,
  ]);
}

function stationsSection(proj, store, refresh) {
  const stations = store.stationsFor(proj.id);
  const dets = store.detectionsFor(proj.id);
  const card = h('div', { class: 'card flush' });
  card.appendChild(h('div', { style: { padding: '16px 18px' }, class: 'flex' }, [
    h('span', { class: 'c-accent', html: icon('station', 18) }),
    h('div', {}, [
      h('h3', { style: { margin: 0 }, text: 'Monitoring stations' }),
      h('div', { class: 't-xs muted', text: proj.name }),
    ]),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    h('button', { class: 'btn btn-sm', html: `${icon('plus', 14)} Add station`, onclick: () => stationModal(store, proj) }),
  ]));

  if (!stations.length) { card.appendChild(h('div', { class: 'empty', text: 'No stations. Add one to begin deploying detectors.' })); return card; }

  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table');
  table.appendChild(h('thead', {}, h('tr', {}, ['Station', 'Transect', 'Habitat', 'Detector', 'Coordinates', 'Battery', 'Mic', 'Detections', ''].map((t) => h('th', { text: t })))));
  const tb = h('tbody');
  stations.forEach((s) => {
    const count = dets.filter((d) => d.stationId === s.id).length;
    const batColor = s.batteryPct < 25 ? 'var(--danger)' : s.batteryPct < 50 ? 'var(--amber)' : 'var(--ok)';
    tb.appendChild(h('tr', {}, [
      h('td', { class: 'fw-600', text: s.name }),
      h('td', { class: 'muted', text: s.transect || '—' }),
      h('td', { text: s.habitat }),
      h('td', { class: 't-xs', text: s.detector }),
      h('td', { class: 'mono t-xs', text: fmtCoord(s.lat, s.lng) }),
      h('td', { class: 'mono', style: { color: batColor }, text: `${s.batteryPct}%` }),
      h('td', {}, s.micHealth === 'OK' ? h('span', { class: 'chip accent t-xs', text: 'OK' }) : h('span', { class: 'chip warn t-xs', text: 'Degraded' })),
      h('td', { class: 'mono', text: String(count) }),
      h('td', {}, h('div', { class: 'flex gap-6' }, [
        h('button', { class: 'btn btn-ghost btn-sm', html: icon('edit', 13), onclick: () => stationModal(store, proj, s) }),
        h('button', { class: 'btn btn-ghost btn-sm', html: icon('trash', 13), onclick: async () => { if (await confirmDialog('Delete station?', s.name, { danger: true, confirmText: 'Delete' })) store.deleteStation(s.id); } }),
      ])),
    ]));
  });
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}

function projectModal(store, existing = null) {
  const name = h('input', { value: existing?.name || '', placeholder: 'e.g. Ridgeline Wind Farm Pre-construction Survey' });
  const region = h('select', {}, Object.entries(REGIONS).map(([k, v]) => h('option', { value: k, text: v, selected: existing ? existing.region === k : k === store.state.settings.region })));
  const lead = h('input', { value: existing?.lead || '', placeholder: 'Lead biologist / organization' });
  const permit = h('input', { value: existing?.permit || '', placeholder: 'Permit / authorization #' });
  const desc = h('textarea', { value: existing?.description || '', placeholder: 'Survey objectives, methods, regulatory context…' });

  const content = h('div', {}, [
    h('h2', { text: existing ? 'Edit project' : 'New survey project' }),
    h('label', { class: 'field' }, [h('span', { text: 'Project name' }), name]),
    h('div', { class: 'grid grid-2' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Region' }), region]),
      h('label', { class: 'field' }, [h('span', { text: 'Permit #' }), permit]),
    ]),
    h('label', { class: 'field' }, [h('span', { text: 'Lead' }), lead]),
    h('label', { class: 'field' }, [h('span', { text: 'Description' }), desc]),
    h('div', { class: 'modal-foot' }, [
      h('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      h('button', { class: 'btn btn-primary', text: existing ? 'Save' : 'Create', onclick: save }),
    ]),
  ]);
  const m = modal(content);

  async function save() {
    if (!name.value.trim()) { toast('Project name required', 'warn'); return; }
    const data = { name: name.value.trim(), region: region.value, lead: lead.value, permit: permit.value, description: desc.value, targetSpecies: existing?.targetSpecies || [] };
    if (existing) await store.updateProject({ ...existing, ...data });
    else await store.addProject(data);
    toast(existing ? 'Project updated' : 'Project created');
    m.close();
  }
}

function stationModal(store, proj, existing = null) {
  const center = store.stationsFor(proj.id)[0] || { lat: 35.66, lng: -83.52 };
  const name = h('input', { value: existing?.name || `Station ${String.fromCharCode(65 + store.stationsFor(proj.id).length)}` });
  const transect = h('input', { value: existing?.transect || '', placeholder: 'e.g. T1' });
  const habitat = h('select', {}, ['Riparian forest', 'Mixed hardwood', 'Coniferous forest', 'Forest edge', 'Open meadow', 'Wetland', 'Cave entrance', 'Reservoir shoreline', 'Agricultural', 'Urban'].map((hh) => h('option', { text: hh, selected: existing?.habitat === hh })));
  const detector = h('select', {}, ['Wildlife Acoustics SM4BAT-FS', 'Titley Anabat Swift', 'Pettersson D500X', 'AudioMoth (HiSpec)', 'Wildlife Acoustics Echo Meter Touch 2 Pro'].map((d) => h('option', { text: d, selected: existing?.detector === d })));
  const lat = h('input', { type: 'number', step: '0.0001', value: existing?.lat ?? (center.lat + (Math.random() - 0.5) * 0.05).toFixed(4) });
  const lng = h('input', { type: 'number', step: '0.0001', value: existing?.lng ?? (center.lng + (Math.random() - 0.5) * 0.05).toFixed(4) });
  const battery = h('input', { type: 'number', min: '0', max: '100', value: existing?.batteryPct ?? 100 });
  const mic = h('select', {}, ['OK', 'Degraded'].map((mh) => h('option', { text: mh, selected: existing?.micHealth === mh })));
  const status = h('select', {}, ['active', 'inactive', 'retrieved'].map((st) => h('option', { text: st, selected: existing?.status === st })));

  const content = h('div', {}, [
    h('h2', { text: existing ? 'Edit station' : 'Add monitoring station' }),
    h('div', { class: 'grid grid-2' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Name' }), name]),
      h('label', { class: 'field' }, [h('span', { text: 'Transect' }), transect]),
    ]),
    h('div', { class: 'grid grid-2' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Habitat' }), habitat]),
      h('label', { class: 'field' }, [h('span', { text: 'Detector' }), detector]),
    ]),
    h('div', { class: 'grid grid-2' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Latitude' }), lat]),
      h('label', { class: 'field' }, [h('span', { text: 'Longitude' }), lng]),
    ]),
    h('div', { class: 'grid grid-3' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Battery %' }), battery]),
      h('label', { class: 'field' }, [h('span', { text: 'Mic health' }), mic]),
      h('label', { class: 'field' }, [h('span', { text: 'Status' }), status]),
    ]),
    h('div', { class: 'modal-foot' }, [
      h('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      h('button', { class: 'btn btn-primary', text: existing ? 'Save' : 'Add', onclick: save }),
    ]),
  ]);
  const m = modal(content);

  async function save() {
    const data = {
      projectId: proj.id, name: name.value, transect: transect.value, habitat: habitat.value,
      detector: detector.value, lat: parseFloat(lat.value), lng: parseFloat(lng.value),
      batteryPct: parseInt(battery.value), micHealth: mic.value, status: status.value,
      deployStart: existing?.deployStart || Date.now(), deployEnd: existing?.deployEnd || null,
    };
    if (existing) await store.updateStation({ ...existing, ...data });
    else await store.addStation(data);
    toast(existing ? 'Station updated' : 'Station added');
    m.close();
  }
}
