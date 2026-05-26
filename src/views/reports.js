import { h, clear, modal, toast, confirmDialog } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { SPECIES, speciesById, conservationLabel, REGIONS } from '../data/species.js';
import { fmtDate, fmtCoord, pct, download, toCSV } from '../utils/format.js';
import { confidenceTier } from '../dsp/classifier.js';
import { barChart } from '../utils/charts.js';

export function render(container, ctx) {
  const { store } = ctx;
  const charts = [];
  let filterSpecies = 'all';
  let filterValidated = 'all';
  let minConf = 0;

  const root = h('div', { class: 'view-narrow' });
  container.appendChild(root);

  function build() {
    charts.forEach((c) => c.destroy()); charts.length = 0;
    clear(root);
    const proj = store.activeProject();
    if (!proj) { root.appendChild(h('div', { class: 'empty', text: 'No active project.' })); return; }
    const allDets = store.detectionsFor(proj.id);
    const bats = allDets.filter((d) => d.speciesId !== 'NOISE');

    // header + export
    root.appendChild(h('div', { class: 'flex flex-wrap', style: { gap: '12px', marginBottom: '16px' } }, [
      h('div', {}, [h('h2', { style: { margin: 0 }, text: 'Reports & export' }), h('div', { class: 't-sm muted', text: proj.name })]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-sm', html: `${icon('download', 14)} CSV`, onclick: () => exportCSV(bats) }),
      h('button', { class: 'btn btn-sm', html: `${icon('download', 14)} GeoJSON`, onclick: () => exportGeoJSON(bats, proj) }),
      h('button', { class: 'btn btn-sm', html: `${icon('download', 14)} JSON`, onclick: () => exportJSON(allDets, proj, store) }),
      h('button', { class: 'btn btn-primary btn-sm', html: `${icon('reports', 14)} Generate report`, onclick: () => generateReport(proj, store) }),
    ]));

    // biodiversity metrics
    root.appendChild(metricsRow(bats));

    // seasonal trend chart
    const trendCard = h('div', { class: 'card', style: { marginBottom: '16px' } }, [
      h('div', { class: 'card-head' }, [h('span', { class: 'c-accent', html: icon('trend', 18) }), h('h3', { text: 'Seasonal activity by species' }), h('span', { class: 'spacer', style: { flex: 1 } }), h('span', { class: 'sub', text: 'weekly detection counts' })]),
      h('div', { style: { height: '260px', position: 'relative' } }, [h('canvas', { id: 'trend-chart' })]),
    ]);
    root.appendChild(trendCard);

    // validation queue
    const unvalidated = bats.filter((d) => !d.validated).sort((a, b) => b.timestamp - a.timestamp);
    if (unvalidated.length) root.appendChild(validationQueue(unvalidated, store));

    // detection table with filters
    root.appendChild(detectionTable(bats));

    requestAnimationFrame(() => drawTrend(bats, charts));
  }

  function metricsRow(bats) {
    const richness = new Set(bats.map((d) => d.speciesId)).size;
    const { H, evenness } = shannon(bats);
    const protectedCount = new Set(bats.filter((d) => speciesById(d.speciesId)?.protected).map((d) => d.speciesId)).size;
    const validated = bats.filter((d) => d.validated).length;
    const risk = conservationRisk(bats);
    return h('div', { class: 'grid grid-4', style: { marginBottom: '16px' } }, [
      stat('species', 'Species richness (S)', String(richness), `${protectedCount} protected`),
      stat('trend', "Shannon diversity (H')", H.toFixed(2), `evenness ${evenness.toFixed(2)}`),
      stat('check', 'Validated', `${validated}<small>/${bats.length}</small>`, `${pct(bats.length ? validated / bats.length : 0)} reviewed`),
      stat('alert', 'Conservation risk', risk.label, risk.detail),
    ]);
  }

  function detectionTable(bats) {
    const card = h('div', { class: 'card flush' });
    card.appendChild(h('div', { style: { padding: '16px 18px' }, class: 'flex flex-wrap', }, [
      h('span', { class: 'c-accent', html: icon('database', 18) }),
      h('h3', { style: { margin: 0 }, text: `Detection records (${bats.length})` }),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      filterSelect(bats),
    ]));
    const rows = bats.filter((d) =>
      (filterSpecies === 'all' || d.speciesId === filterSpecies) &&
      (filterValidated === 'all' || (filterValidated === 'yes' ? d.validated : !d.validated)) &&
      d.confidence >= minConf
    ).sort((a, b) => b.timestamp - a.timestamp);

    const wrap = h('div', { class: 'table-wrap', style: { maxHeight: '520px', overflowY: 'auto' } });
    const table = h('table');
    table.appendChild(h('thead', {}, h('tr', {}, ['Date/Time', 'Species', 'Conf.', 'Fc', 'Dur', 'Shape', 'Location', 'Status', ''].map((t) => h('th', { text: t })))));
    const tb = h('tbody');
    rows.forEach((d) => {
      const sp = speciesById(d.speciesId);
      const tier = confidenceTier(d.confidence);
      tb.appendChild(h('tr', {}, [
        h('td', { class: 'nowrap t-sm', text: fmtDate(d.timestamp, true) }),
        h('td', {}, [h('div', { class: 'flex gap-6' }, [h('span', { class: 'fw-600', text: sp?.commonName || d.speciesId }), sp?.protected ? h('span', { class: 'tag-protected', text: 'P' }) : null])]),
        h('td', {}, h('div', { class: 'flex gap-6' }, [h('div', { class: `conf-bar ${tier.cls}`, style: { width: '46px' } }, h('i', { style: { width: pct(d.confidence) } })), h('span', { class: 'mono t-xs', text: pct(d.confidence) })])),
        h('td', { class: 'mono t-sm', text: d.summary?.meanCharKhz ? `${d.summary.meanCharKhz}` : '—' }),
        h('td', { class: 'mono t-sm', text: d.summary?.meanDurMs ?? '—' }),
        h('td', { class: 't-xs', text: d.summary?.dominantShape || '—' }),
        h('td', { class: 'mono t-xs nowrap', text: fmtCoord(d.lat, d.lng) }),
        h('td', {}, d.validated ? h('span', { class: 'chip accent t-xs', text: '✓ Validated' }) : h('span', { class: 'chip warn t-xs', text: 'Unreviewed' })),
        h('td', {}, h('button', { class: 'btn btn-ghost btn-sm', html: icon('edit', 13), onclick: () => reviewModal(d, store) })),
      ]));
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    card.appendChild(wrap);
    if (!rows.length) card.appendChild(h('div', { class: 'empty', text: 'No records match filters.' }));
    return card;
  }

  function filterSelect(bats) {
    const ids = [...new Set(bats.map((d) => d.speciesId))];
    const sp = h('select', { style: { maxWidth: '180px' }, onchange: (e) => { filterSpecies = e.target.value; build(); } }, [
      h('option', { value: 'all', text: 'All species', selected: filterSpecies === 'all' }),
      ...ids.map((id) => h('option', { value: id, text: speciesById(id)?.commonName || id, selected: filterSpecies === id })),
    ]);
    const val = h('select', { style: { maxWidth: '150px' }, onchange: (e) => { filterValidated = e.target.value; build(); } }, [
      h('option', { value: 'all', text: 'All statuses', selected: filterValidated === 'all' }),
      h('option', { value: 'yes', text: 'Validated', selected: filterValidated === 'yes' }),
      h('option', { value: 'no', text: 'Unreviewed', selected: filterValidated === 'no' }),
    ]);
    return h('div', { class: 'flex gap-8' }, [sp, val]);
  }

  build();
  const unsub = store.subscribe((s, evt) => { if (['detections', 'activeProject'].includes(evt)) build(); });
  return () => { unsub(); charts.forEach((c) => c.destroy()); };
}

// ---------- validation ----------
function validationQueue(unvalidated, store) {
  const card = h('div', { class: 'card', style: { marginBottom: '16px' } });
  card.appendChild(h('div', { class: 'card-head' }, [
    h('span', { class: 'c-amber', html: icon('check', 18) }),
    h('h3', { text: 'Validation queue' }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    h('span', { class: 'chip warn', text: `${unvalidated.length} to review` }),
  ]));
  unvalidated.slice(0, 6).forEach((d) => {
    const sp = speciesById(d.speciesId);
    card.appendChild(h('div', { class: 'flex flex-wrap', style: { gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' } }, [
      h('div', { style: { minWidth: '200px' } }, [
        h('div', { class: 'flex gap-6' }, [h('span', { class: 'fw-600', text: sp?.commonName }), sp?.protected ? h('span', { class: 'tag-protected', text: 'PROTECTED' }) : null]),
        h('div', { class: 't-xs muted mono', text: `${fmtDate(d.timestamp, true)} · ${pct(d.confidence)} · Fc ${d.summary?.meanCharKhz || '—'} kHz` }),
      ]),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', { class: 'btn btn-sm', html: `${icon('check', 13)} Confirm`, onclick: () => { store.updateDetection({ ...d, validated: true }); toast('Validated'); } }),
      h('button', { class: 'btn btn-sm', text: 'Reassign', onclick: () => reviewModal(d, store) }),
      h('button', { class: 'btn btn-danger btn-sm', html: `${icon('x', 13)} False+`, onclick: async () => { if (await confirmDialog('Mark as false positive?', 'This detection will be deleted.', { danger: true, confirmText: 'Delete' })) { store.deleteDetection(d.id); toast('Removed false positive'); } } }),
    ]));
  });
  return card;
}

function reviewModal(d, store) {
  const sp = speciesById(d.speciesId);
  const sel = h('select', {}, SPECIES.map((s) => h('option', { value: s.id, text: `${s.commonName} (${s.id})`, selected: s.id === d.speciesId })));
  const notes = h('textarea', { value: d.notes || '', placeholder: 'Validation notes…' });
  const cands = d.candidates?.length ? h('div', { class: 't-xs muted', style: { marginBottom: '10px' }, html: 'Engine candidates: ' + d.candidates.map((c) => `${speciesById(c.id)?.commonName} ${pct(c.confidence)}`).join(' · ') }) : null;
  const content = h('div', {}, [
    h('h2', { text: 'Review detection' }),
    h('div', { class: 't-sm muted', text: `${fmtDate(d.timestamp, true)} · ${d.fileName || ''}` }),
    cands,
    h('label', { class: 'field', style: { marginTop: '12px' } }, [h('span', { text: 'Confirmed species' }), sel]),
    h('label', { class: 'field' }, [h('span', { text: 'Notes' }), notes]),
    h('div', { class: 'modal-foot' }, [
      h('button', { class: 'btn', text: 'Cancel', onclick: () => m.close() }),
      h('button', { class: 'btn btn-primary', html: `${icon('check', 14)} Confirm & validate`, onclick: () => {
        store.updateDetection({ ...d, speciesId: sel.value, notes: notes.value, validated: true });
        toast('Detection validated'); m.close();
      } }),
    ]),
  ]);
  const m = modal(content);
}

// ---------- metrics ----------
function shannon(bats) {
  const counts = {};
  bats.forEach((d) => { counts[d.speciesId] = (counts[d.speciesId] || 0) + 1; });
  const total = bats.length;
  const S = Object.keys(counts).length;
  let H = 0;
  Object.values(counts).forEach((c) => { const p = c / total; if (p > 0) H -= p * Math.log(p); });
  const evenness = S > 1 ? H / Math.log(S) : 0;
  return { H: total ? H : 0, evenness: total ? evenness : 0, S };
}

function conservationRisk(bats) {
  const prot = new Set(bats.filter((d) => speciesById(d.speciesId)?.protected).map((d) => d.speciesId));
  const endangered = [...prot].filter((id) => /Endangered/i.test(speciesById(id)?.usFederal || '')).length;
  if (endangered >= 2) return { label: 'High', detail: `${endangered} federally endangered` };
  if (endangered === 1) return { label: 'Elevated', detail: '1 endangered species' };
  if (prot.size) return { label: 'Moderate', detail: `${prot.size} at-risk species` };
  return { label: 'Low', detail: 'no listed species' };
}

function drawTrend(bats, charts) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  // weekly buckets
  const weekOf = (ts) => { const d = new Date(ts); const onejan = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7)}`; };
  const topSpecies = topN(bats, 5);
  const weeks = [...new Set(bats.map((d) => weekOf(d.timestamp)))].sort();
  const datasets = topSpecies.map((id) => ({
    label: speciesById(id)?.commonName || id,
    data: weeks.map((w) => bats.filter((d) => d.speciesId === id && weekOf(d.timestamp) === w).length),
    stack: 'a',
  }));
  charts.push(barChart(canvas, { labels: weeks, datasets }, { scales: { x: { stacked: true, ticks: { color: '#9fb0d0', font: { size: 9 } }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { color: '#9fb0d0' }, grid: { color: '#1e2c4a' } } } }));
}

function topN(bats, n) {
  const counts = {};
  bats.forEach((d) => { counts[d.speciesId] = (counts[d.speciesId] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

// ---------- exports ----------
function exportCSV(bats) {
  const cols = [
    { label: 'timestamp', get: (d) => new Date(d.timestamp).toISOString() },
    { label: 'species_code', key: 'speciesId' },
    { label: 'common_name', get: (d) => speciesById(d.speciesId)?.commonName || '' },
    { label: 'scientific_name', get: (d) => speciesById(d.speciesId)?.scientificName || '' },
    { label: 'confidence', key: 'confidence' },
    { label: 'validated', get: (d) => (d.validated ? 'yes' : 'no') },
    { label: 'latitude', key: 'lat' }, { label: 'longitude', key: 'lng' },
    { label: 'char_freq_khz', get: (d) => d.summary?.meanCharKhz ?? '' },
    { label: 'duration_ms', get: (d) => d.summary?.meanDurMs ?? '' },
    { label: 'call_shape', get: (d) => d.summary?.dominantShape ?? '' },
    { label: 'detector', key: 'detector' }, { label: 'file', key: 'fileName' },
    { label: 'temp_c', get: (d) => d.env?.tempC ?? '' },
    { label: 'humidity_pct', get: (d) => d.env?.humidity ?? '' },
    { label: 'weather', get: (d) => d.env?.weather ?? '' },
    { label: 'notes', key: 'notes' },
  ];
  download(`batecho_detections_${Date.now()}.csv`, toCSV(bats, cols), 'text/csv');
  toast('Exported CSV');
}

function exportGeoJSON(bats, proj) {
  const fc = {
    type: 'FeatureCollection',
    properties: { project: proj.name, generated: new Date().toISOString() },
    features: bats.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
      properties: {
        species: speciesById(d.speciesId)?.scientificName, common: speciesById(d.speciesId)?.commonName,
        confidence: d.confidence, validated: d.validated, protected: !!speciesById(d.speciesId)?.protected,
        timestamp: new Date(d.timestamp).toISOString(), charFreqKhz: d.summary?.meanCharKhz,
      },
    })),
  };
  download(`batecho_${proj.name.replace(/\W+/g, '_')}.geojson`, JSON.stringify(fc, null, 2), 'application/geo+json');
  toast('Exported GeoJSON');
}

function exportJSON(allDets, proj, store) {
  const payload = { project: proj, stations: store.stationsFor(proj.id), detections: allDets, exported: new Date().toISOString(), format: 'BatEcho v1' };
  download(`batecho_${proj.name.replace(/\W+/g, '_')}_full.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Exported full JSON');
}

// ---------- printable report ----------
function generateReport(proj, store) {
  const bats = store.detectionsFor(proj.id).filter((d) => d.speciesId !== 'NOISE');
  const stations = store.stationsFor(proj.id);
  const { H, evenness, S } = shannon(bats);
  const risk = conservationRisk(bats);
  const counts = {};
  bats.forEach((d) => { counts[d.speciesId] = (counts[d.speciesId] || 0) + 1; });
  const nights = new Set(bats.map((d) => new Date(d.timestamp).toISOString().slice(0, 10))).size;
  const protectedSpecies = Object.keys(counts).filter((id) => speciesById(id)?.protected);

  const speciesRows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const sp = speciesById(id);
    return `<tr><td><b>${sp.commonName}</b><br><i style="color:#555">${sp.scientificName}</i></td><td>${n}</td>
      <td>${((n / bats.length) * 100).toFixed(1)}%</td><td>${conservationLabel(sp)}</td>
      <td>${sp.protected ? '<b style="color:#c0392b">YES</b>' : 'No'}</td></tr>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>BatEcho Survey Report — ${proj.name}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a2230;max-width:880px;margin:32px auto;padding:0 24px;line-height:1.5}
    h1{font-size:24px;margin-bottom:2px;color:#0d6b60} h2{font-size:16px;border-bottom:2px solid #2dd4bf;padding-bottom:4px;margin-top:28px;color:#0f1b30}
    .sub{color:#666;margin-top:0} table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
    th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #ddd} th{background:#f0fdfa;color:#0d6b60}
    .metrics{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0} .metric{background:#f6f8fb;border:1px solid #e2e8f0;border-radius:10px;padding:12px 16px;min-width:130px}
    .metric .v{font-size:24px;font-weight:800;color:#0d6b60} .metric .l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px}
    .alert{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;color:#991b1b;margin:12px 0}
    .foot{margin-top:36px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:10px}
    @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="float:right;padding:8px 16px;background:#0d9488;color:#fff;border:none;border-radius:8px;cursor:pointer">Print / Save PDF</button>
  <h1>Acoustic Bat Survey Report</h1>
  <p class="sub">${proj.name}</p>
  <table style="width:auto;font-size:13px"><tr><td style="border:none;color:#666">Region</td><td style="border:none"><b>${REGIONS[proj.region] || proj.region}</b></td></tr>
  <tr><td style="border:none;color:#666">Lead</td><td style="border:none">${proj.lead || '—'}</td></tr>
  <tr><td style="border:none;color:#666">Permit</td><td style="border:none">${proj.permit || '—'}</td></tr>
  <tr><td style="border:none;color:#666">Report date</td><td style="border:none">${new Date().toLocaleString()}</td></tr></table>

  <h2>Survey effort & summary</h2>
  <div class="metrics">
    <div class="metric"><div class="v">${bats.length}</div><div class="l">Bat detections</div></div>
    <div class="metric"><div class="v">${S}</div><div class="l">Species richness</div></div>
    <div class="metric"><div class="v">${H.toFixed(2)}</div><div class="l">Shannon H'</div></div>
    <div class="metric"><div class="v">${evenness.toFixed(2)}</div><div class="l">Evenness</div></div>
    <div class="metric"><div class="v">${stations.length}</div><div class="l">Stations</div></div>
    <div class="metric"><div class="v">${nights}</div><div class="l">Survey nights</div></div>
  </div>
  ${protectedSpecies.length ? `<div class="alert"><b>⚠ ${protectedSpecies.length} protected / at-risk species detected:</b> ${protectedSpecies.map((id) => `${speciesById(id).commonName} (${conservationLabel(speciesById(id))})`).join('; ')}.
    Detections of federally listed species may trigger consultation under the Endangered Species Act. Confirm via expert validation and coordinate with the relevant wildlife agency before ground-disturbing activity. Conservation risk rating: <b>${risk.label}</b>.</div>` : `<p>No federally listed or at-risk species were detected during this survey. Conservation risk rating: <b>${risk.label}</b>.</p>`}

  <h2>Species composition</h2>
  <table><thead><tr><th>Species</th><th>Detections</th><th>Relative %</th><th>Status</th><th>Protected</th></tr></thead><tbody>${speciesRows}</tbody></table>

  <h2>Monitoring stations</h2>
  <table><thead><tr><th>Station</th><th>Habitat</th><th>Detector</th><th>Coordinates</th><th>Detections</th></tr></thead><tbody>
  ${stations.map((s) => `<tr><td>${s.name}</td><td>${s.habitat}</td><td>${s.detector}</td><td>${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</td><td>${bats.filter((d) => d.stationId === s.id).length}</td></tr>`).join('')}
  </tbody></table>

  <h2>Methods & limitations</h2>
  <p style="font-size:13px;color:#333">Echolocation recordings were analyzed using BatEcho's spectrogram-based parameter extraction and feature classifier (characteristic frequency, duration, bandwidth, slope, call shape and pulse interval) with regional range filtering for the ${REGIONS[proj.region] || proj.region} region. Automated identifications carry inherent uncertainty; acoustically similar species (notably within <i>Myotis</i> and migratory tree bats) may be confused. ${bats.filter((d) => d.validated).length} of ${bats.length} detections (${pct(bats.length ? bats.filter((d) => d.validated).length / bats.length : 0)}) were manually validated. Results should be interpreted alongside capture data and expert review for regulatory determinations.</p>

  <div class="foot">Generated by BatEcho Acoustic Monitoring Platform · ${new Date().toISOString()} · This document was produced locally and contains no externally transmitted data.</div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Pop-up blocked — allow pop-ups to view the report', 'warn'); return; }
  w.document.write(html);
  w.document.close();
  toast('Report generated');
}

function stat(ic, label, value, sub) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'stat-label' }, [h('span', { html: icon(ic, 15) }), label]),
    h('div', { class: 'stat-value', html: value }),
    h('div', { class: 'stat-sub', text: sub }),
  ]);
}
