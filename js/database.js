/**
 * IndexedDB persistence layer (local-first storage).
 *
 * Schema changes are applied by numbered, additive migrations inside the
 * `versionchange` transaction. Migrations must never delete an object store or
 * record that holds user data; a structural test enforces that migration code
 * does not call deleteObjectStore. Application updates therefore cannot remove
 * user projects.
 */
export const DB_NAME = 'aerolab-x';
export const DB_VERSION = 1;

export const STORES = Object.freeze({
  projects: 'projects',
  versions: 'versions',
  preferences: 'preferences',
  meta: 'meta',
  learning: 'learningProgress',
});

/**
 * DB_MIGRATIONS[n] upgrades the database from version n − 1 to n.
 * Signature: (db, transaction, context) => void. Only additive operations are allowed.
 */
export const DB_MIGRATIONS = Object.freeze({
  1(db) {
    const projects = db.createObjectStore(STORES.projects, { keyPath: 'id' });
    projects.createIndex('updatedAt', 'updatedAt');
    const versions = db.createObjectStore(STORES.versions, { keyPath: 'id' });
    versions.createIndex('projectId', 'projectId');
    db.createObjectStore(STORES.preferences, { keyPath: 'key' });
    db.createObjectStore(STORES.meta, { keyPath: 'key' });
    db.createObjectStore(STORES.learning, { keyPath: 'id' });
  },
});

export class DatabaseError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message, { cause });
    this.name = 'DatabaseError';
    this.code = code ?? 'database';
  }
}

export class ConflictError extends Error {
  constructor(message, { stored } = {}) {
    super(message);
    this.name = 'ConflictError';
    this.stored = stored;
  }
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function nowIso() {
  return new Date().toISOString();
}

export class Database {
  #db;
  #onVersionChange;

  constructor(db, { onVersionChange } = {}) {
    this.#db = db;
    this.#onVersionChange = onVersionChange;
    this.#db.onversionchange = () => {
      // Another tab is upgrading the schema: close so the upgrade can proceed, then tell the UI.
      this.#db.close();
      this.#onVersionChange?.();
    };
  }

  get name() {
    return this.#db.name;
  }

  get version() {
    return this.#db.version;
  }

  get storeNames() {
    return [...this.#db.objectStoreNames];
  }

  close() {
    this.#db.close();
  }

  /**
   * Run `work(tx)` inside one transaction. Resolves with work's return value once the
   * transaction has committed; rejects (and rolls back) if anything fails.
   */
  transaction(storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.#db.transaction(storeNames, mode);
      } catch (error) {
        reject(new DatabaseError(`Could not start a ${mode} transaction`, { cause: error }));
        return;
      }
      let result;
      let workError = null;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(workError ?? tx.error ?? new DatabaseError('Transaction failed'));
      tx.onabort = () => reject(workError ?? tx.error ?? new DatabaseError('Transaction aborted'));
      Promise.resolve()
        .then(() => work(tx))
        .then((value) => {
          result = value;
        })
        .catch((error) => {
          workError = error;
          try {
            tx.abort();
          } catch {
            reject(error);
          }
        });
    });
  }

  get(store, key) {
    return this.transaction([store], 'readonly', (tx) => promisify(tx.objectStore(store).get(key)));
  }

  getAll(store) {
    return this.transaction([store], 'readonly', (tx) => promisify(tx.objectStore(store).getAll()));
  }

  getAllByIndex(store, index, query) {
    return this.transaction([store], 'readonly', (tx) => promisify(tx.objectStore(store).index(index).getAll(query)));
  }

  count(store) {
    return this.transaction([store], 'readonly', (tx) => promisify(tx.objectStore(store).count()));
  }

  put(store, value) {
    return this.transaction([store], 'readwrite', (tx) => promisify(tx.objectStore(store).put(value)));
  }

  delete(store, key) {
    return this.transaction([store], 'readwrite', (tx) => promisify(tx.objectStore(store).delete(key)));
  }

  // ---- Preferences (key/value) ------------------------------------------------
  async getPreference(key, fallback = undefined) {
    const record = await this.get(STORES.preferences, key);
    return record === undefined ? fallback : record.value;
  }

  setPreference(key, value) {
    return this.put(STORES.preferences, { key, value, updatedAt: nowIso() });
  }

  async getAllPreferences() {
    const records = await this.getAll(STORES.preferences);
    return Object.fromEntries(records.map((record) => [record.key, record.value]));
  }

  async getMeta(key) {
    return (await this.get(STORES.meta, key))?.value;
  }
}

/**
 * Open (and if necessary upgrade) the database.
 * @param {{name?: string, version?: number, migrations?: object, indexedDB?: IDBFactory,
 *          onBlocked?: () => void, onVersionChange?: () => void, appVersion?: string}} [options]
 */
export function openDatabase({
  name = DB_NAME,
  version = DB_VERSION,
  migrations = DB_MIGRATIONS,
  indexedDB = globalThis.indexedDB,
  onBlocked,
  onVersionChange,
  appVersion = 'unknown',
} = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new DatabaseError('IndexedDB is not available in this browser or context', { code: 'unavailable' }));
      return;
    }
    let request;
    try {
      request = indexedDB.open(name, version);
    } catch (error) {
      reject(new DatabaseError('Could not open the local database', { cause: error, code: 'open' }));
      return;
    }
    const applied = [];
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      const from = event.oldVersion;
      const to = event.newVersion ?? version;
      try {
        for (let v = from + 1; v <= to; v += 1) {
          const step = migrations[v];
          if (typeof step !== 'function') throw new DatabaseError(`Missing database migration to version ${v}`);
          step(db, tx, { oldVersion: from, newVersion: to });
          applied.push(v);
        }
        const meta = tx.objectStore(STORES.meta);
        const logRequest = meta.get('migrations');
        logRequest.onsuccess = () => {
          const log = logRequest.result?.value ?? [];
          for (const v of applied) log.push({ version: v, appliedAt: nowIso(), appVersion });
          meta.put({ key: 'migrations', value: log });
          meta.put({ key: 'schemaVersion', value: to });
          if (from === 0) meta.put({ key: 'createdAt', value: nowIso() });
        };
      } catch (error) {
        tx.abort();
        reject(error instanceof DatabaseError ? error : new DatabaseError('Database upgrade failed', { cause: error }));
      }
    };
    request.onblocked = () => onBlocked?.();
    request.onerror = () => reject(new DatabaseError('Could not open the local database', { cause: request.error, code: 'open' }));
    request.onsuccess = () => {
      const db = new Database(request.result, { onVersionChange });
      db.appliedMigrations = applied;
      resolve(db);
    };
  });
}

/** Ask the browser to keep this origin's storage unless the user clears it. */
export async function requestPersistentStorage() {
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist) return { supported: false, persisted: false };
  const already = await storage.persisted();
  if (already) return { supported: true, persisted: true };
  const persisted = await storage.persist();
  return { supported: true, persisted };
}

export async function storageStatus() {
  const storage = globalThis.navigator?.storage;
  const status = { supported: Boolean(storage), persisted: null, usage: null, quota: null };
  if (!storage) return status;
  try {
    if (storage.persisted) status.persisted = await storage.persisted();
    if (storage.estimate) {
      const estimate = await storage.estimate();
      status.usage = estimate.usage ?? null;
      status.quota = estimate.quota ?? null;
    }
  } catch {
    // Some browsers throw in private modes; report what we have.
  }
  return status;
}
