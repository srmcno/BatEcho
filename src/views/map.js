import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { h, clear } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { SPECIES, speciesById } from '../data/species.js';
import { PALETTE } from '../utils/charts.js';
import { fmtDate, pct } from '../utils/format.js';

const speciesColor = {};
SPECIES.forEach((s, i) => { speciesColor[s.id] = s.id === 'NOISE' ? '#64748b' : PALETTE[i % PALETTE.length]; });

export function render(container, ctx) {
  const { store } = ctx;
  let map, heatLayer, destroyed = false;
  const layers = { stations: null, detections: null, heat: null, water: null, roost: null, corridor: null, habitat: null };
  const visible = { heat: true, detections: false, stations: true, water: false, roost: false, corridor: false, habitat: false };
  let speciesFilter = 'all';
  let timeFilter = null; // ms cutoff for playback

  const proj = store.activeProject();
  const allDets = store.detectionsFor(proj?.id).filter((d) => d.speciesId !== 'NOISE');
  const stations = store.stationsFor(proj?.id);

  // ---------- layout ----------
  const controls = buildControls();
  const mapEl = h('div', { id: 'map' });
  const shell = h('div', { class: 'map-shell' }, [controls, mapEl]);
  container.appendChild(shell);

  // init Leaflet (async to load heat plugin with global L)
  (async () => {
    window.L = L;
    try { await import('leaflet.heat'); } catch {}
    if (destroyed) return;
    initMap(mapEl);
  })();

  function initMap(el) {
    const center = stations.length
      ? [avg(stations.map((s) => s.lat)), avg(stations.map((s) => s.lng))]
      : [35.66, -83.52];
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap, © CARTO', maxZoom: 19, subdomains: 'abcd',
    }).addTo(map);

    drawAll();
    setTimeout(() => map && map.invalidateSize(), 100);
  }

  // ---------- drawing ----------
  function filteredDets() {
    return allDets.filter((d) => (speciesFilter === 'all' || d.speciesId === speciesFilter) && (!timeFilter || d.timestamp <= timeFilter));
  }

  function drawAll() {
    if (!map) return;
    Object.values(layers).forEach((l) => { if (l) map.removeLayer(l); });

    const dets = filteredDets();

    // heatmap
    if (window.L && L.heatLayer) {
      const points = dets.map((d) => [d.lat, d.lng, 0.4 + d.confidence * 0.6]);
      layers.heat = L.heatLayer(points, { radius: 26, blur: 20, maxZoom: 14, gradient: { 0.2: '#1e3a8a', 0.4: '#2dd4bf', 0.7: '#fbbf24', 1: '#f87171' } });
      if (visible.heat) layers.heat.addTo(map);
    }

    // detection points (species colored)
    layers.detections = L.layerGroup(dets.map((d) => {
      const sp = speciesById(d.speciesId);
      return L.circleMarker([d.lat, d.lng], {
        radius: 4 + d.confidence * 4, color: speciesColor[d.speciesId], weight: 1,
        fillColor: speciesColor[d.speciesId], fillOpacity: 0.7,
      }).bindPopup(popupHtml(sp, d));
    }));
    if (visible.detections) layers.detections.addTo(map);

    // stations
    layers.stations = L.layerGroup(stations.map((s) => {
      const m = L.marker([s.lat, s.lng], { icon: stationIcon(s) }).bindPopup(stationPopup(s, dets));
      return m;
    }));
    if (visible.stations) layers.stations.addTo(map);

    // simulated overlays
    layers.water = waterOverlay(stations);
    if (visible.water) layers.water.addTo(map);
    layers.roost = roostOverlay(dets);
    if (visible.roost) layers.roost.addTo(map);
    layers.corridor = corridorOverlay(stations);
    if (visible.corridor) layers.corridor.addTo(map);
    layers.habitat = habitatOverlay(stations);
    if (visible.habitat) layers.habitat.addTo(map);

    updateStats(dets);
  }

  function toggleLayer(key, on) {
    visible[key] = on;
    const layer = layers[key];
    if (!layer || !map) return;
    if (on) layer.addTo(map); else map.removeLayer(layer);
  }

  // ---------- controls UI ----------
  function buildControls() {
    const speciesOptions = ['all', ...new Set(allDets.map((d) => d.speciesId))];
    const sel = h('select', { onchange: (e) => { speciesFilter = e.target.value; drawAll(); } },
      speciesOptions.map((id) => h('option', { value: id, text: id === 'all' ? 'All species' : speciesById(id)?.commonName || id })));

    const layerDefs = [
      ['heat', 'Activity heatmap', 'zap'], ['detections', 'Detection points', 'pin'],
      ['stations', 'Monitoring stations', 'station'], ['water', 'Water sources', 'droplet'],
      ['roost', 'Roost proximity', 'target'], ['corridor', 'Migratory corridor', 'trend'],
      ['habitat', 'Habitat classification', 'leaf'],
    ];
    const layerToggles = layerDefs.map(([key, label, ic]) => {
      const cb = h('input', { type: 'checkbox', checked: visible[key], style: { width: 'auto' }, onchange: (e) => toggleLayer(key, e.target.checked) });
      return h('label', { class: 'flex gap-8 t-sm', style: { cursor: 'pointer', padding: '5px 0' } }, [
        cb, h('span', { class: 'c-2', html: icon(ic, 15) }), label,
      ]);
    });

    // time playback
    const dates = allDets.map((d) => d.timestamp);
    const minT = Math.min(...dates), maxT = Math.max(...dates);
    const slider = h('input', { type: 'range', min: String(minT), max: String(maxT), value: String(maxT), step: String((maxT - minT) / 100 || 1),
      oninput: (e) => { timeFilter = Number(e.target.value); sliderLabel.textContent = fmtDate(timeFilter, true); drawAll(); } });
    const sliderLabel = h('div', { class: 't-xs muted center mono', text: 'All nights' });
    let playing = null;
    const playBtn = h('button', { class: 'btn btn-sm btn-block', html: `${icon('play', 14)} Play activity timeline`, onclick: () => {
      if (playing) { clearInterval(playing); playing = null; playBtn.innerHTML = `${icon('play', 14)} Play activity timeline`; return; }
      let t = minT; timeFilter = t;
      playBtn.innerHTML = `${icon('pause', 14)} Pause`;
      playing = setInterval(() => {
        t += (maxT - minT) / 60;
        if (t >= maxT) { t = maxT; clearInterval(playing); playing = null; playBtn.innerHTML = `${icon('play', 14)} Play activity timeline`; }
        slider.value = String(t); timeFilter = t; sliderLabel.textContent = fmtDate(t, true); drawAll();
      }, 180);
    } });

    return h('div', { class: 'card scroll-y', style: { maxHeight: '100%' } }, [
      h('div', { class: 'card-head' }, [h('span', { class: 'c-accent', html: icon('layers', 18) }), h('h3', { text: 'Map layers' })]),
      h('div', { id: 'map-stats', class: 'grid grid-2', style: { gap: '8px', marginBottom: '14px' } }),
      h('label', { class: 'field' }, [h('span', { text: 'Species filter' }), sel]),
      h('div', { class: 't-xs muted fw-600', style: { textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }, text: 'Overlays' }),
      ...layerToggles,
      h('div', { style: { borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' } }, [
        h('div', { class: 'card-head mb-0' }, [h('span', { class: 'c-accent', html: icon('clock', 16) }), h('h3', { style: { fontSize: '13px' }, text: 'Time playback' })]),
        slider, sliderLabel,
        h('div', { style: { marginTop: '8px' } }, playBtn),
      ]),
      legend(),
    ]);
  }

  function updateStats(dets) {
    const el = document.getElementById('map-stats');
    if (!el) return;
    clear(el);
    const richness = new Set(dets.map((d) => d.speciesId)).size;
    el.appendChild(miniStat(dets.length, 'detections'));
    el.appendChild(miniStat(richness, 'species'));
  }

  const unsub = store.subscribe((s, evt) => { if (evt === 'activeProject') ctx.navigate('map'); });
  return () => { destroyed = true; unsub(); if (map) { map.remove(); map = null; } };
}

// ---------- helpers ----------
function miniStat(v, l) {
  return h('div', { style: { background: 'var(--bg-2)', borderRadius: '10px', padding: '8px 10px' } }, [
    h('div', { class: 'fw-700', style: { fontSize: '20px' }, text: String(v) }),
    h('div', { class: 't-xs muted', text: l }),
  ]);
}

function stationIcon(s) {
  const color = s.batteryPct < 25 ? '#f87171' : s.status === 'active' ? '#2dd4bf' : '#64748b';
  return L.divIcon({
    className: '', iconSize: [22, 22], iconAnchor: [11, 11],
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #0a0f1c;box-shadow:0 0 8px ${color};display:grid;place-items:center;color:#04161a;font-size:10px;font-weight:800">${s.name.replace('Station ', '')}</div>`,
  });
}

function popupHtml(sp, d) {
  return `<div style="min-width:180px"><b>${sp?.commonName || d.speciesId}</b>${sp?.protected ? ' <span style="color:#f87171">●protected</span>' : ''}<br>
    <i style="color:#9fb0d0">${sp?.scientificName || ''}</i><br>
    <span style="font-family:monospace">Conf ${pct(d.confidence)} · Fc ${d.summary?.meanCharKhz || '—'} kHz</span><br>
    <span style="color:#9fb0d0;font-size:11px">${fmtDate(d.timestamp, true)}</span></div>`;
}

function stationPopup(s, dets) {
  const count = dets.filter((d) => d.stationId === s.id).length;
  return `<div style="min-width:190px"><b>${s.name}</b><br>${s.habitat}<br>
    <span style="font-family:monospace;font-size:11px">${s.detector}</span><br>
    Battery ${s.batteryPct}% · Mic ${s.micHealth}<br>
    <b>${count}</b> detections recorded</div>`;
}

function waterOverlay(stations) {
  if (!stations.length) return L.layerGroup();
  const c = [avg(stations.map((s) => s.lat)) - 0.01, avg(stations.map((s) => s.lng)) + 0.02];
  return L.layerGroup([
    L.polyline([[c[0] - 0.03, c[1] - 0.05], [c[0], c[1]], [c[0] + 0.02, c[1] + 0.04]], { color: '#38bdf8', weight: 6, opacity: 0.5 }).bindTooltip('Hollow Creek'),
    L.circle([c[0] + 0.02, c[1] + 0.04], { radius: 700, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.25, weight: 1 }).bindTooltip('Reservoir'),
  ]);
}

function roostOverlay(dets) {
  // cluster protected/Myotis detections into a "roost proximity" zone
  const roostDets = dets.filter((d) => { const s = speciesById(d.speciesId); return s?.genus === 'Myotis' || s?.protected; });
  if (!roostDets.length) return L.layerGroup();
  const lat = avg(roostDets.map((d) => d.lat)), lng = avg(roostDets.map((d) => d.lng));
  return L.layerGroup([
    L.circle([lat, lng], { radius: 1500, color: '#f87171', fillColor: '#f87171', fillOpacity: 0.08, weight: 1, dashArray: '6 6' }).bindTooltip('Inferred roost proximity (1.5 km)'),
    L.circle([lat, lng], { radius: 400, color: '#f87171', fillColor: '#f87171', fillOpacity: 0.2, weight: 1 }).bindTooltip('High-probability roost zone'),
  ]);
}

function corridorOverlay(stations) {
  if (stations.length < 2) return L.layerGroup();
  const lat = avg(stations.map((s) => s.lat)), lng = avg(stations.map((s) => s.lng));
  return L.layerGroup([
    L.polyline([[lat - 0.06, lng - 0.07], [lat - 0.01, lng - 0.01], [lat + 0.05, lng + 0.06]], { color: '#a78bfa', weight: 14, opacity: 0.25 }).bindTooltip('Inferred migratory corridor'),
  ]);
}

function habitatOverlay(stations) {
  const colors = { 'Riparian forest': '#22d3ee', 'Mixed hardwood': '#34d399', 'Forest edge': '#a3e635', 'Open meadow': '#fbbf24', 'Cave entrance': '#a78bfa', 'Reservoir shoreline': '#38bdf8' };
  return L.layerGroup(stations.map((s) => L.circle([s.lat, s.lng], {
    radius: 600, color: colors[s.habitat] || '#34d399', fillColor: colors[s.habitat] || '#34d399', fillOpacity: 0.12, weight: 1,
  }).bindTooltip(s.habitat)));
}

function legend() {
  const items = [
    ['#2dd4bf', 'Active station'], ['#f87171', 'Protected sp. / roost'], ['#38bdf8', 'Water'],
    ['#a78bfa', 'Corridor'], ['#fbbf24', 'High activity'],
  ];
  return h('div', { class: 'map-legend', style: { borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' } }, [
    h('div', { class: 't-xs muted fw-600', style: { textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }, text: 'Legend' }),
    ...items.map(([c, l]) => h('div', { class: 'legend-row' }, [h('span', { class: 'legend-swatch', style: { background: c } }), h('span', { class: 't-xs', text: l })])),
    h('div', { class: 't-xs muted', style: { marginTop: '8px' }, text: 'Water, roost, corridor & habitat overlays are modeled from detection patterns for demonstration.' }),
  ]);
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
