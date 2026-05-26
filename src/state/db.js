// Minimal Promise-based IndexedDB wrapper for offline-first persistence.
// Stores survey projects, monitoring stations and detection records so the
// platform works fully offline and syncs from local cache.

const DB_NAME = 'batecho';
const DB_VERSION = 1;
const STORES = ['projects', 'stations', 'detections'];

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
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
    return tx(store, 'readonly', (os) => reqValue(os.getAll()));
  },
  async get(store, id) {
    return tx(store, 'readonly', (os) => reqValue(os.get(id)));
  },
  async put(store, value) {
    await tx(store, 'readwrite', (os) => { os.put(value); });
    return value;
  },
  async putMany(store, values) {
    await tx(store, 'readwrite', (os) => { values.forEach((v) => os.put(v)); });
    return values;
  },
  async delete(store, id) {
    await tx(store, 'readwrite', (os) => { os.delete(id); });
  },
  async clear(store) {
    await tx(store, 'readwrite', (os) => { os.clear(); });
  },
  async count(store) {
    return tx(store, 'readonly', (os) => reqValue(os.count()));
  },
};

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
