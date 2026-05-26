import './style.css';
import { store } from './state/store.js';
import { h, $, clear } from './utils/dom.js';
import { icon } from './utils/icons.js';
import { speciesById } from './data/species.js';

import * as dashboard from './views/dashboard.js';
import * as live from './views/live.js';
import * as analyze from './views/analyze.js';
import * as mapView from './views/map.js';
import * as projects from './views/projects.js';
import * as speciesView from './views/species.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const ROUTES = {
  dashboard: { title: 'Field Dashboard', sub: 'Survey overview & activity', icon: 'dashboard', mod: dashboard, group: 'Monitor' },
  live: { title: 'Live Monitor', sub: 'Real-time acoustic detection', icon: 'live', mod: live, group: 'Monitor' },
  analyze: { title: 'Analyze Recordings', sub: 'Batch & single-file identification', icon: 'analyze', mod: analyze, group: 'Monitor' },
  map: { title: 'GIS & Activity Maps', sub: 'Spatial distribution & heatmaps', icon: 'map', mod: mapView, group: 'Spatial' },
  projects: { title: 'Projects & Stations', sub: 'Surveys, transects & deployments', icon: 'projects', mod: projects, group: 'Data' },
  species: { title: 'Species Reference', sub: 'Acoustic library & conservation', icon: 'species', mod: speciesView, group: 'Data' },
  reports: { title: 'Reports & Export', sub: 'Compliance & scientific outputs', icon: 'reports', mod: reports, group: 'Data' },
  settings: { title: 'Settings & Integrations', sub: 'Engine, region & data sources', icon: 'settings', mod: settings, group: 'System' },
};

let currentCleanup = null;
let viewContainer;

function route() {
  return (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
}

function navigate(name) {
  if (location.hash === `#/${name}`) renderView();
  else location.hash = `#/${name}`;
}

function renderView() {
  const name = route();
  const def = ROUTES[name] || ROUTES.dashboard;

  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch {} }
  currentCleanup = null;

  // topbar
  $('#topbar-title').textContent = def.title;
  $('#topbar-sub').textContent = def.sub;

  // active nav
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === name);
  });

  clear(viewContainer);
  const ctx = { store, navigate, speciesById };
  const result = def.mod.render(viewContainer, ctx);
  currentCleanup = typeof result === 'function' ? result : null;
  viewContainer.scrollTop = 0;
  closeMobileNav();
}

function alertCount() {
  // protected/endangered species detected
  const ids = new Set(store.state.detections.filter((d) => {
    const sp = speciesById(d.speciesId);
    return sp && sp.protected && d.confidence >= 0.4;
  }).map((d) => d.speciesId));
  return ids.size;
}

function buildNav() {
  const groups = {};
  for (const [key, def] of Object.entries(ROUTES)) {
    (groups[def.group] ||= []).push([key, def]);
  }
  const nav = h('nav', { class: 'nav' });
  const alerts = alertCount();
  for (const [group, items] of Object.entries(groups)) {
    nav.appendChild(h('div', { class: 'nav-group-label', text: group }));
    for (const [key, def] of items) {
      const item = h('div', {
        class: 'nav-item', dataset: { route: key }, role: 'button', tabindex: '0',
        onclick: () => navigate(key),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(key); } },
      }, [
        h('span', { class: 'nav-icon', html: icon(def.icon, 20) }),
        h('span', { class: 'lbl', text: def.title }),
      ]);
      if (key === 'dashboard' && alerts > 0) {
        item.appendChild(h('span', { class: 'nav-badge alert', text: String(alerts) }));
      }
      nav.appendChild(item);
    }
  }
  return nav;
}

function buildSidebar() {
  return h('aside', { class: 'sidebar', id: 'sidebar' }, [
    h('div', { class: 'brand' }, [
      h('span', { class: 'brand-mark', html: `<svg viewBox="0 0 64 64" width="34" height="34" fill="currentColor"><path d="M32 18c-3-7-9-10-15-9 3 2 4 5 4 8-4-2-9-1-12 2 5 0 8 3 10 6 3 4 8 7 13 7s10-3 13-7c2-3 5-6 10-6-3-3-8-4-12-2 0-3 1-6 4-8-6-1-12 2-15 9z"/></svg>` }),
      h('div', {}, [
        h('div', { class: 'brand-name', text: 'BatEcho' }),
        h('div', { class: 'brand-sub', text: 'Acoustic Intelligence' }),
      ]),
    ]),
    buildNav(),
    h('div', { class: 'sidebar-foot' }, [connPill()]),
  ]);
}

function connPill() {
  const online = store.state.online;
  return h('div', { class: 'conn-pill', id: 'conn-pill' }, [
    h('span', { class: `dot ${online ? 'on' : 'off'}` }),
    h('span', { text: online ? 'Online · synced' : 'Offline · local cache' }),
    h('span', { class: 'spacer', style: { flex: 1 } }),
    h('span', { class: 'mono t-xs muted', text: 'v1.0' }),
  ]);
}

function buildMobileNav() {
  const keys = ['dashboard', 'live', 'analyze', 'map', 'reports'];
  return h('nav', { class: 'mobile-nav' }, keys.map((k) => h('div', {
    class: 'nav-item', dataset: { route: k }, onclick: () => navigate(k),
  }, [
    h('span', { class: 'nav-icon', html: icon(ROUTES[k].icon, 20) }),
    h('span', { class: 'lbl', text: ROUTES[k].title.split(' ')[0] }),
  ])));
}

function buildProjectSelect() {
  const sel = h('select', { class: 'project-select', title: 'Active survey project',
    onchange: (e) => { store.setActiveProject(e.target.value); },
  });
  refreshProjectSelect(sel);
  return sel;
}

function refreshProjectSelect(sel) {
  clear(sel);
  for (const p of store.state.projects) {
    sel.appendChild(h('option', { value: p.id, text: p.name, selected: p.id === store.state.activeProjectId }));
  }
  if (!store.state.projects.length) sel.appendChild(h('option', { text: 'No projects' }));
}

function openMobileNav() { $('#sidebar')?.classList.add('open'); }
function closeMobileNav() {
  $('#sidebar')?.classList.remove('open');
  $('#scrim')?.remove();
}

function buildShell() {
  const app = $('#app');
  clear(app);
  app.removeAttribute('aria-busy');

  const projectSelect = buildProjectSelect();

  const topbar = h('header', { class: 'topbar' }, [
    h('button', { class: 'hamburger', html: icon('menu', 22), onclick: () => {
      openMobileNav();
      const scrim = h('div', { class: 'scrim', id: 'scrim', onclick: closeMobileNav });
      document.body.appendChild(scrim);
    } }),
    h('div', {}, [
      h('h1', { id: 'topbar-title', text: 'Field Dashboard' }),
      h('div', { class: 'sub', id: 'topbar-sub', text: '' }),
    ]),
    h('div', { class: 'topbar-spacer' }),
    projectSelect,
  ]);

  viewContainer = h('main', { class: 'view', id: 'view' });

  const shell = h('div', { class: 'shell' }, [
    buildSidebar(),
    h('div', { class: 'main' }, [topbar, viewContainer]),
  ]);

  app.appendChild(shell);
  app.appendChild(buildMobileNav());

  // keep sidebar/topbar reactive
  store.subscribe((state, evt) => {
    if (evt === 'projects' || evt === 'activeProject') {
      refreshProjectSelect(projectSelect);
    }
    if (evt === 'connectivity') {
      const pill = $('#conn-pill');
      if (pill) pill.replaceWith(connPill());
    }
    if (evt === 'detections' || evt === 'projects') {
      // refresh alert badge
      const nav = $('#sidebar .nav');
      if (nav) nav.replaceWith(buildNav());
      document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
        el.classList.toggle('active', el.dataset.route === route());
      });
    }
  });
}

async function boot() {
  await store.init();
  buildShell();
  window.addEventListener('hashchange', renderView);
  if (!location.hash) location.hash = '#/dashboard';
  renderView();
  registerSW();
}

function registerSW() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

boot();
