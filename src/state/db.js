// Promise-based storage layer for offline-first persistence.
// Prefers IndexedDB, but transparently falls back to an in-memory store when
// IndexedDB is unavailable or blocked — notably on `file://` pages (Firefox and
// some Chrome configurations refuse IndexedDB there), where the single-file
// build is typically opened. The fallback keeps the app fully functional for
// the session; data simply isn't persisted across reloads.

const DB_NAME = 'batecho';
const DB_VERSION = 1;
const STORES = ['projects', 'stations', 'detections'];
const OPEN_TIMEOUT_MS = 2000;

let _backendPromise = null;
let _useMemory = false;
const _mem = Object.fromEntries(STORES.map((s) => [s, new Map()]));

export let storageMode = 'indexeddb'; // 'indexeddb' | 'memory'

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('IndexedDB open timed out')); } }, OPEN_TIMEOUT_MS);
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          if (name === 'stations') store.createIndex('projectId', 'projectId', { unique: false });
          if (name === 'detections') {
            store.createIndex('projectId', 'projectId', { unique: false });
            store.createIndex('speciesId', 'speciesId', { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(req.result); } };
    req.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(req.error || new Error('IndexedDB open error')); } };
    req.onblocked = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('IndexedDB blocked')); } };
  });
}

// Resolves to an IDBDatabase, or null when running in memory-fallback mode.
function backend() {
  if (_backendPromise) return _backendPromise;
  _backendPromise = openIndexedDb()
    .then((idb) => idb)
    .catch((err) => {
      _useMemory = true;
      storageMode = 'memory';
      console.warn('[BatEcho] IndexedDB unavailable — using in-memory storage (data will not persist). Reason:', err?.message || err);
      return null;
    });
  return _backendPromise;
}

function idbTx(idb, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const os = t.objectStore(store);
    const result = fn(os);
    t.oncomplete = () => resolve(result?.__value !== undefined ? result.__value : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqValue(request) {
  const box = {};
  request.onsuccess = () => { box.__value = request.result; };
  return box;
}

export const db = {
  async getAll(store) {
    const idb = await backend();
    if (!idb) return [..._mem[store].values()];
    return idbTx(idb, store, 'readonly', (os) => reqValue(os.getAll()));
  },
  async get(store, id) {
    const idb = await backend();
    if (!idb) return _mem[store].get(id) ?? undefined;
    return idbTx(idb, store, 'readonly', (os) => reqValue(os.get(id)));
  },
  async put(store, value) {
    const idb = await backend();
    if (!idb) { _mem[store].set(value.id, value); return value; }
    await idbTx(idb, store, 'readwrite', (os) => { os.put(value); });
    return value;
  },
  async putMany(store, values) {
    const idb = await backend();
    if (!idb) { values.forEach((v) => _mem[store].set(v.id, v)); return values; }
    await idbTx(idb, store, 'readwrite', (os) => { values.forEach((v) => os.put(v)); });
    return values;
  },
  async delete(store, id) {
    const idb = await backend();
    if (!idb) { _mem[store].delete(id); return; }
    await idbTx(idb, store, 'readwrite', (os) => { os.delete(id); });
  },
  async clear(store) {
    const idb = await backend();
    if (!idb) { _mem[store].clear(); return; }
    await idbTx(idb, store, 'readwrite', (os) => { os.clear(); });
  },
  async count(store) {
    const idb = await backend();
    if (!idb) return _mem[store].size;
    return idbTx(idb, store, 'readonly', (os) => reqValue(os.count()));
  },
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
