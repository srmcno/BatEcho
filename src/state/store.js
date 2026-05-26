import { db, uid } from './db.js';
import { SPECIES, speciesById } from '../data/species.js';

const SETTINGS_KEY = 'batecho.settings';

const DEFAULT_SETTINGS = {
  theme: 'night',           // night | dark | light
  colormap: 'inferno',
  region: 'southeast',
  regionFilter: true,
  fftSize: 1024,
  windowFn: 'hann',
  autoTriggerDb: 12,
  units: 'kHz',
  integrations: {
    noaa: { enabled: true, token: '' },
    usgs: { enabled: true },
    nabat: { enabled: false, project: '' },
    inaturalist: { enabled: false },
  },
  onboarded: false,
};

const listeners = new Set();

export const store = {
  state: {
    settings: { ...DEFAULT_SETTINGS },
    projects: [],
    stations: [],
    detections: [],
    activeProjectId: null,
    online: navigator.onLine,
  },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(evt) { listeners.forEach((fn) => fn(this.state, evt)); },

  async init() {
    this.loadSettings();
    const [projects, stations, detections] = await Promise.all([
      db.getAll('projects'), db.getAll('stations'), db.getAll('detections'),
    ]);
    this.state.projects = projects;
    this.state.stations = stations;
    this.state.detections = detections;
    if (!projects.length) {
      await seedDemoData();
      this.state.projects = await db.getAll('projects');
      this.state.stations = await db.getAll('stations');
      this.state.detections = await db.getAll('detections');
    }
    this.state.activeProjectId = this.state.projects[0]?.id || null;

    window.addEventListener('online', () => { this.state.online = true; this.emit('connectivity'); });
    window.addEventListener('offline', () => { this.state.online = false; this.emit('connectivity'); });
  },

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    applyTheme(this.state.settings.theme);
  },
  saveSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings)); } catch { /* storage may be unavailable on file:// */ }
    applyTheme(this.state.settings.theme);
    this.emit('settings');
  },

  // ---- projects ----
  async addProject(p) {
    const proj = { id: uid('proj'), created: Date.now(), ...p };
    await db.put('projects', proj);
    this.state.projects.push(proj);
    if (!this.state.activeProjectId) this.state.activeProjectId = proj.id;
    this.emit('projects');
    return proj;
  },
  async updateProject(p) {
    await db.put('projects', p);
    const i = this.state.projects.findIndex((x) => x.id === p.id);
    if (i >= 0) this.state.projects[i] = p;
    this.emit('projects');
  },
  async deleteProject(id) {
    await db.delete('projects', id);
    this.state.projects = this.state.projects.filter((p) => p.id !== id);
    const stations = this.state.stations.filter((s) => s.projectId === id);
    for (const s of stations) await db.delete('stations', s.id);
    this.state.stations = this.state.stations.filter((s) => s.projectId !== id);
    if (this.state.activeProjectId === id) this.state.activeProjectId = this.state.projects[0]?.id || null;
    this.emit('projects');
  },
  setActiveProject(id) { this.state.activeProjectId = id; this.emit('activeProject'); },
  activeProject() { return this.state.projects.find((p) => p.id === this.state.activeProjectId) || null; },

  // ---- stations ----
  async addStation(s) {
    const station = { id: uid('stn'), ...s };
    await db.put('stations', station);
    this.state.stations.push(station);
    this.emit('stations');
    return station;
  },
  async updateStation(s) {
    await db.put('stations', s);
    const i = this.state.stations.findIndex((x) => x.id === s.id);
    if (i >= 0) this.state.stations[i] = s;
    this.emit('stations');
  },
  async deleteStation(id) {
    await db.delete('stations', id);
    this.state.stations = this.state.stations.filter((s) => s.id !== id);
    this.emit('stations');
  },
  stationsFor(projectId) { return this.state.stations.filter((s) => s.projectId === projectId); },

  // ---- detections ----
  async addDetection(d) {
    const det = { id: uid('det'), created: Date.now(), validated: false, ...d };
    await db.put('detections', det);
    this.state.detections.push(det);
    this.emit('detections');
    return det;
  },
  async updateDetection(d) {
    await db.put('detections', d);
    const i = this.state.detections.findIndex((x) => x.id === d.id);
    if (i >= 0) this.state.detections[i] = d;
    this.emit('detections');
  },
  async deleteDetection(id) {
    await db.delete('detections', id);
    this.state.detections = this.state.detections.filter((d) => d.id !== id);
    this.emit('detections');
  },
  detectionsFor(projectId) {
    return this.state.detections
      .filter((d) => !projectId || d.projectId === projectId)
      .sort((a, b) => b.timestamp - a.timestamp);
  },
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ---------------------------------------------------------------------------
// Demo data seeding — a believable multi-night survey so the dashboard, map and
// reports are populated on first launch. Clearly synthetic but realistic.
// ---------------------------------------------------------------------------
async function seedDemoData() {
  const projId = uid('proj');
  const project = {
    id: projId, created: Date.now() - 1000 * 60 * 60 * 24 * 60,
    name: 'Hollow Creek Preserve — Summer 2026 Survey',
    description: 'Acoustic bat survey for habitat assessment ahead of a proposed trail expansion. Mist-net coordination with state wildlife agency.',
    region: 'southeast', lead: 'Field Biology Team',
    targetSpecies: ['MYSE', 'PESU', 'MYSO'],
    permit: 'TWRA-2026-04471',
  };

  const center = { lat: 35.658, lng: -83.527 };
  const habitats = ['Riparian forest', 'Mixed hardwood', 'Forest edge', 'Open meadow', 'Cave entrance', 'Reservoir shoreline'];
  const detectors = ['Wildlife Acoustics SM4BAT-FS', 'Titley Anabat Swift', 'Pettersson D500X', 'AudioMoth (HiSpec)'];
  const stations = [];
  for (let i = 0; i < 6; i++) {
    stations.push({
      id: uid('stn'), projectId: projId,
      name: `Station ${String.fromCharCode(65 + i)}`,
      lat: center.lat + (Math.random() - 0.5) * 0.08,
      lng: center.lng + (Math.random() - 0.5) * 0.1,
      habitat: habitats[i],
      detector: detectors[i % detectors.length],
      deployStart: Date.now() - 1000 * 60 * 60 * 24 * 45,
      deployEnd: Date.now() + 1000 * 60 * 60 * 24 * 15,
      batteryPct: Math.round(40 + Math.random() * 60),
      micHealth: Math.random() > 0.15 ? 'OK' : 'Degraded',
      status: 'active',
    });
  }

  // Species weighting for the southeast region
  const pool = [
    ['EPFU', 16], ['LABO', 14], ['PESU', 11], ['MYLU', 7], ['MYSE', 5], ['MYSO', 4],
    ['NYHU', 10], ['LACI', 6], ['LANO', 5], ['TABR', 6], ['MYGR', 3], ['LASE', 5], ['NOISE', 8],
  ];
  const weighted = [];
  pool.forEach(([id, w]) => { for (let i = 0; i < w; i++) weighted.push(id); });

  const detections = [];
  const now = Date.now();
  const nights = 30;
  for (let n = 0; n < nights; n++) {
    const nightStart = now - 1000 * 60 * 60 * 24 * (nights - n);
    const perNight = 8 + Math.floor(Math.random() * 22);
    for (let k = 0; k < perNight; k++) {
      const station = stations[Math.floor(Math.random() * stations.length)];
      const speciesId = weighted[Math.floor(Math.random() * weighted.length)];
      const sp = speciesById(speciesId);
      // bats active after dusk: 20:00–04:00
      const hourOffset = 20 + Math.random() * 8;
      const ts = nightStart + hourOffset * 3600 * 1000;
      const baseConf = speciesId === 'NOISE' ? 0 : 0.45 + Math.random() * 0.5;
      const fc = sp && speciesId !== 'NOISE' ? (sp.fcKhz[0] + sp.fcKhz[1]) / 2 + (Math.random() - 0.5) * 4 : 0;
      detections.push({
        id: uid('det'), projectId: projId, stationId: station.id, created: ts,
        timestamp: ts, lat: station.lat + (Math.random() - 0.5) * 0.004,
        lng: station.lng + (Math.random() - 0.5) * 0.004,
        speciesId,
        confidence: Math.round(baseConf * 1000) / 1000,
        validated: Math.random() > 0.7,
        fileName: `HCP_${station.name.replace(' ', '')}_${new Date(ts).toISOString().slice(0, 10)}_${k}.wav`,
        summary: speciesId === 'NOISE' ? { callCount: 0 } : {
          callCount: 3 + Math.floor(Math.random() * 20),
          meanCharKhz: Math.round(fc * 10) / 10,
          meanDurMs: Math.round((sp.durationMs[0] + sp.durationMs[1]) / 2 * 10) / 10,
          meanPulseIntervalMs: Math.round((sp.pulseIntervalMs[0] + sp.pulseIntervalMs[1]) / 2),
          dominantShape: sp.shape[0],
        },
        env: {
          tempC: Math.round((14 + Math.random() * 14) * 10) / 10,
          humidity: Math.round(50 + Math.random() * 45),
          weather: ['Clear', 'Partly cloudy', 'Overcast', 'Light wind'][Math.floor(Math.random() * 4)],
          windKph: Math.round(Math.random() * 18),
        },
        detector: station.detector,
        notes: '',
      });
    }
  }

  await db.put('projects', project);
  await db.putMany('stations', stations);
  await db.putMany('detections', detections);
}
