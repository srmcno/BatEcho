import { h, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { lineChart, doughnutChart, PALETTE } from '../utils/charts.js';
import { speciesById, conservationLabel } from '../data/species.js';
import { fmtDate, fmtTime, relTime, pct } from '../utils/format.js';
import { confidenceTier } from '../dsp/classifier.js';

export function render(container, ctx) {
  const { store, navigate } = ctx;
  const charts = [];

  function build() {
    clear(container);
    const proj = store.activeProject();
    const dets = store.detectionsFor(proj?.id).filter((d) => d.speciesId !== 'NOISE');
    const stations = store.stationsFor(proj?.id);

    const root = h('div', { class: 'view-narrow' });

    if (!proj) {
      root.appendChild(emptyState(navigate));
      container.appendChild(root);
      return;
    }

    // ---- alerts: protected species ----
    const protectedDets = dets.filter((d) => { const s = speciesById(d.speciesId); return s?.protected && d.confidence >= 0.4; });
    const protectedSpecies = [...new Set(protectedDets.map((d) => d.speciesId))];
    if (protectedSpecies.length) {
      root.appendChild(h('div', { class: 'banner alert', style: { marginBottom: '16px' } }, [
        h('span', { class: 'banner-icon', html: icon('alert', 22) }),
        h('div', {}, [
          h('div', { class: 'fw-700', text: `${protectedSpecies.length} protected / at-risk species detected` }),
          h('div', { class: 't-sm', style: { marginTop: '4px' }, html:
            protectedSpecies.map((id) => { const s = speciesById(id); return `<b>${s.commonName}</b> <span class="muted">(${conservationLabel(s)})</span>`; }).join(' · ')
          }),
          h('div', { class: 't-xs muted mt-8', text: 'Detections of listed species may trigger regulatory consultation requirements. Validate before reporting.' }),
        ]),
      ]));
    }

    // ---- stat cards ----
    const richness = new Set(dets.map((d) => d.speciesId)).size;
    const nights = new Set(dets.map((d) => new Date(d.timestamp).toISOString().slice(0, 10))).size;
    const activeStations = stations.filter((s) => s.status === 'active').length;
    const lowBattery = stations.filter((s) => s.batteryPct < 30).length;
    const validated = dets.filter((d) => d.validated).length;

    root.appendChild(h('div', { class: 'grid grid-4', style: { marginBottom: '16px' } }, [
      statCard('database', 'Total detections', dets.length.toLocaleString(), `${validated} validated · ${nights} nights`),
      statCard('species', 'Species richness', String(richness), `${protectedSpecies.length} protected`),
      statCard('station', 'Active stations', `${activeStations}<small>/${stations.length}</small>`, lowBattery ? `${lowBattery} low battery` : 'All healthy'),
      statCard('zap', 'Mean confidence', dets.length ? pct(dets.reduce((a, d) => a + d.confidence, 0) / dets.length) : '—', 'identification certainty'),
    ]));

    // ---- charts row ----
    const chartsRow = h('div', { class: 'grid', style: { gridTemplateColumns: '1.6fr 1fr', marginBottom: '16px' } });

    const actCard = h('div', { class: 'card' }, [
      cardHead('trend', 'Nightly activity', 'detections per night across the survey'),
      h('div', { style: { height: '240px', position: 'relative' } }, [h('canvas', { id: 'chart-activity' })]),
    ]);
    const compCard = h('div', { class: 'card' }, [
      cardHead('species', 'Species composition', `${richness} species`),
      h('div', { style: { height: '240px', position: 'relative' } }, [h('canvas', { id: 'chart-comp' })]),
    ]);
    chartsRow.appendChild(actCard);
    chartsRow.appendChild(compCard);
    root.appendChild(chartsRow);

    // ---- recent detections + station health ----
    const lowerRow = h('div', { class: 'grid', style: { gridTemplateColumns: '1.6fr 1fr' } });
    lowerRow.appendChild(recentTable(dets, ctx));
    lowerRow.appendChild(stationHealth(stations));
    root.appendChild(lowerRow);

    container.appendChild(root);

    // render charts after mount
    requestAnimationFrame(() => { drawCharts(dets, charts); });
  }

  build();
  const unsub = store.subscribe((s, evt) => {
    if (['detections', 'activeProject', 'stations', 'settings'].includes(evt)) {
      charts.forEach((c) => c.destroy());
      charts.length = 0;
      build();
    }
  });

  return () => { unsub(); charts.forEach((c) => c.destroy()); };
}

function drawCharts(dets, charts) {
  // nightly activity
  const byNight = {};
  dets.forEach((d) => { const k = new Date(d.timestamp).toISOString().slice(0, 10); byNight[k] = (byNight[k] || 0) + 1; });
  const nights = Object.keys(byNight).sort();
  const actCanvas = document.getElementById('chart-activity');
  if (actCanvas) {
    charts.push(lineChart(actCanvas, {
      labels: nights.map((n) => fmtDate(new Date(n).getTime())),
      datasets: [{ label: 'Detections', data: nights.map((n) => byNight[n]), fill: true }],
    }));
  }

  // composition
  const bySpecies = {};
  dets.forEach((d) => { bySpecies[d.speciesId] = (bySpecies[d.speciesId] || 0) + 1; });
  const entries = Object.entries(bySpecies).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const compCanvas = document.getElementById('chart-comp');
  if (compCanvas) {
    charts.push(doughnutChart(compCanvas, {
      labels: entries.map(([id]) => speciesById(id)?.commonName || id),
      data: entries.map(([, n]) => n),
    }, { plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }));
  }
}

function statCard(ic, label, value, sub) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'stat-label' }, [h('span', { html: icon(ic, 15) }), label]),
    h('div', { class: 'stat-value', html: value }),
    h('div', { class: 'stat-sub', text: sub }),
  ]);
}

function cardHead(ic, title, sub) {
  return h('div', { class: 'card-head' }, [
    h('span', { class: 'c-accent', html: icon(ic, 18) }),
    h('h2', { text: title }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    sub ? h('span', { class: 'sub', text: sub }) : null,
  ]);
}

function recentTable(dets, ctx) {
  const recent = [...dets].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
  const card = h('div', { class: 'card flush' }, [
    h('div', { style: { padding: '16px 18px 4px' } }, [cardHead('clock', 'Recent detections', 'latest identified calls')]),
  ]);
  const wrap = h('div', { class: 'table-wrap' });
  const table = h('table');
  table.appendChild(h('thead', {}, h('tr', {}, [
    h('th', { text: 'Species' }), h('th', { text: 'Confidence' }), h('th', { text: 'Fc' }), h('th', { text: 'When' }),
  ])));
  const tbody = h('tbody');
  recent.forEach((d) => {
    const sp = speciesById(d.speciesId);
    const tier = confidenceTier(d.confidence);
    tbody.appendChild(h('tr', {}, [
      h('td', {}, [
        h('div', { class: 'flex gap-8' }, [
          h('span', { class: 'fw-600', text: sp?.commonName || d.speciesId }),
          sp?.protected ? h('span', { class: 'tag-protected', text: 'PROTECTED' }) : null,
        ]),
        h('div', { class: 'species-sci t-xs', text: sp?.scientificName || '' }),
      ]),
      h('td', {}, [
        h('div', { class: 'flex gap-8' }, [
          h('div', { class: `conf-bar ${tier.cls}` }, h('i', { style: { width: pct(d.confidence) } })),
          h('span', { class: 'mono t-xs', text: pct(d.confidence) }),
        ]),
      ]),
      h('td', { class: 'mono nowrap', text: d.summary?.meanCharKhz ? `${d.summary.meanCharKhz} kHz` : '—' }),
      h('td', { class: 'nowrap muted t-sm', text: relTime(d.timestamp) }),
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);
  if (!recent.length) card.appendChild(h('div', { class: 'empty', text: 'No detections yet.' }));
  return card;
}

function stationHealth(stations) {
  const card = h('div', { class: 'card' }, [cardHead('station', 'Station health', `${stations.length} deployed`)]);
  if (!stations.length) { card.appendChild(h('div', { class: 'empty', text: 'No stations.' })); return card; }
  stations.forEach((s) => {
    const batColor = s.batteryPct < 25 ? 'var(--danger)' : s.batteryPct < 50 ? 'var(--amber)' : 'var(--ok)';
    card.appendChild(h('div', { style: { padding: '10px 0', borderBottom: '1px solid var(--border)' } }, [
      h('div', { class: 'flex' }, [
        h('span', { class: 'fw-600 t-sm', text: s.name }),
        h('span', { class: 'spacer', style: { flex: 1 } }),
        h('span', { class: 'mono t-xs', style: { color: batColor }, html: `${icon('battery', 13)} ${s.batteryPct}%` }),
      ]),
      h('div', { class: 'flex', style: { marginTop: '6px', gap: '8px' } }, [
        h('div', { class: 'live-meter', style: { flex: 1 } }, h('i', { style: { width: `${s.batteryPct}%`, background: batColor } })),
      ]),
      h('div', { class: 't-xs muted', style: { marginTop: '5px' }, text: `${s.habitat} · ${s.micHealth === 'OK' ? 'Mic OK' : '⚠ Mic degraded'}` }),
    ]));
  });
  return card;
}

function emptyState(navigate) {
  return h('div', { class: 'empty' }, [
    h('div', { html: icon('projects', 56) }),
    h('h2', { text: 'No survey projects yet' }),
    h('p', { text: 'Create a project to begin organizing monitoring stations and detections.' }),
    h('button', { class: 'btn btn-primary', style: { marginTop: '12px' }, text: 'Go to Projects', onclick: () => navigate('projects') }),
  ]);
}
