/**
 * Project manager: the only module that reads or writes project data in IndexedDB.
 *
 * Responsibilities
 *  - create, open, save, duplicate, trash/restore and permanently delete projects
 *  - autosave (debounced, with a maximum wait) and manual save
 *  - optimistic concurrency: every save checks the stored revision, so two tabs
 *    editing the same project cannot silently overwrite each other
 *  - version snapshots, restore and comparison
 *  - import/export of single projects and full backups (merge-only restore)
 *
 * Data-safety rules
 *  - nothing is overwritten without a revision check
 *  - risky operations (restore, schema migration, import) first store a snapshot
 *  - backup restore never deletes or overwrites existing projects
 */
import { Emitter } from './utils/events.js';
import { uid } from './utils/id.js';
import { deepClone, isPlainObject } from './utils/immutable.js';
import { diff } from './utils/diff.js';
import { projectContent, same } from './sync/merge.js';
import { STORES, ConflictError } from './database.js';
import {
  PROJECT_SCHEMA_VERSION,
  ProjectFormatError,
  createProject,
  migrateProject,
  sanitizeProject,
  validateProject,
} from './project-schema.js';
import { APP_VERSION, BACKUP_FILE_FORMAT, FILE_FORMAT_VERSION, PROJECT_FILE_FORMAT } from './version.js';

export const SAVE_STATUS = Object.freeze({
  none: 'no-project',
  saved: 'saved',
  dirty: 'dirty',
  saving: 'saving',
  error: 'error',
  conflict: 'conflict',
});

/** Document fields that describe persistence rather than design content. */
const META_KEYS = new Set(['id', 'schemaVersion', 'revision', 'createdAt', 'updatedAt', 'deletedAt', 'appVersion']);

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function summarizeProject(doc, versionCount = 0) {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description,
    category: doc.category,
    application: doc.application,
    stage: doc.stage,
    tags: doc.tags,
    revision: doc.revision,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt,
    schemaVersion: doc.schemaVersion,
    versionCount,
  };
}

function parseJson(data) {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    throw new ProjectFormatError('The file is not valid JSON');
  }
}

export class ProjectManager extends Emitter {
  #db;
  #store;
  #log;
  #now;
  #autosaveDelay;
  #maxWait;
  #autosaveEnabled = true;
  #timer = null;
  #retryTimer = null;
  #firstDirtyAt = null;
  #saving = null;
  #editCounter = 0;
  #current = null;
  #status = SAVE_STATUS.none;
  #lastError = null;
  #channel = null;
  #unsubscribe;

  constructor({ db, store, log = silentLogger, now = () => new Date(), autosaveDelay = 1200, maxAutosaveWait = 10000, broadcast = true }) {
    super();
    this.#db = db;
    this.#store = store;
    this.#log = log;
    this.#now = now;
    this.#autosaveDelay = autosaveDelay;
    this.#maxWait = maxAutosaveWait;
    this.#unsubscribe = store.on('change', (event) => this.#onStoreChange(event));
    if (broadcast && typeof BroadcastChannel === 'function') {
      this.#channel = new BroadcastChannel('aerolab-x-projects');
      this.#channel.onmessage = (event) => this.#onBroadcast(event.data);
    }
  }

  dispose() {
    clearTimeout(this.#timer);
    clearTimeout(this.#retryTimer);
    this.#unsubscribe?.();
    this.#channel?.close();
    this.#channel = null;
  }

  // ---- State ---------------------------------------------------------------------

  get status() {
    return this.#status;
  }

  get lastError() {
    return this.#lastError;
  }

  get current() {
    return this.#current ? { ...this.#current } : null;
  }

  get currentId() {
    return this.#current?.id ?? null;
  }

  get isDirty() {
    return this.#status === SAVE_STATUS.dirty || this.#status === SAVE_STATUS.error || this.#status === SAVE_STATUS.conflict;
  }

  get autosave() {
    return { enabled: this.#autosaveEnabled, delay: this.#autosaveDelay };
  }

  setAutosave({ enabled = this.#autosaveEnabled, delay = this.#autosaveDelay } = {}) {
    this.#autosaveEnabled = Boolean(enabled);
    this.#autosaveDelay = Math.min(60000, Math.max(250, Number(delay) || 1200));
    if (!this.#autosaveEnabled) clearTimeout(this.#timer);
    else if (this.#status === SAVE_STATUS.dirty) this.#scheduleAutosave();
  }

  #setStatus(status, detail = {}) {
    this.#status = status;
    this.emit('status', { status, ...detail, current: this.current });
  }

  #onStoreChange({ record }) {
    if (!record || !this.#current) return;
    this.#editCounter += 1;
    if (this.#status !== SAVE_STATUS.saving && this.#status !== SAVE_STATUS.conflict) this.#setStatus(SAVE_STATUS.dirty);
    if (this.#firstDirtyAt === null) this.#firstDirtyAt = Date.now();
    this.#scheduleAutosave();
  }

  #scheduleAutosave() {
    if (!this.#autosaveEnabled || this.#status === SAVE_STATUS.conflict) return;
    clearTimeout(this.#timer);
    const waited = this.#firstDirtyAt === null ? 0 : Date.now() - this.#firstDirtyAt;
    const delay = Math.max(0, Math.min(this.#autosaveDelay, this.#maxWait - waited));
    this.#timer = setTimeout(() => {
      this.save({ reason: 'autosave' }).catch(() => {
        /* status already reflects the failure */
      });
    }, delay);
  }

  #broadcast(message) {
    try {
      this.#channel?.postMessage(message);
    } catch {
      // A closed channel must never block saving.
    }
  }

  async #onBroadcast(message) {
    if (!isPlainObject(message)) return;
    if (message.type === 'projects-changed') this.emit('projects-changed', { remote: true });
    if (!this.#current || message.id !== this.#current.id) return;
    if (message.type === 'saved' && message.revision > this.#current.baseRevision) {
      if (this.#status === SAVE_STATUS.saved) {
        await this.reloadFromStorage();
        this.emit('remote-update', { id: message.id, reloaded: true });
      } else {
        this.emit('remote-update', { id: message.id, reloaded: false });
      }
    }
    if (message.type === 'trashed' || message.type === 'deleted') {
      this.emit('remote-removed', { id: message.id });
    }
  }

  // ---- Listing -------------------------------------------------------------------

  async listProjects({ includeDeleted = false, onlyDeleted = false } = {}) {
    return this.#db.transaction([STORES.projects, STORES.versions], 'readonly', async (tx) => {
      const projects = await promisify(tx.objectStore(STORES.projects).getAll());
      const index = tx.objectStore(STORES.versions).index('projectId');
      const filtered = projects.filter((doc) => {
        if (onlyDeleted) return Boolean(doc.deletedAt);
        return includeDeleted || !doc.deletedAt;
      });
      const counts = await Promise.all(filtered.map((doc) => promisify(index.count(doc.id))));
      return filtered
        .map((doc, i) => summarizeProject(doc, counts[i]))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
  }

  getStoredProject(id) {
    return this.#db.get(STORES.projects, id);
  }

  // ---- Create / open / close -------------------------------------------------------

  async createProject(init = {}) {
    const now = this.#now();
    const doc = createProject(init, { now });
    doc.revision = 1;
    const errors = validateProject(doc);
    if (errors.length) throw new ProjectFormatError(`Invalid new project: ${errors[0].path} ${errors[0].message}`);
    await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
      await promisify(tx.objectStore(STORES.projects).add(doc));
      await promisify(tx.objectStore(STORES.versions).add(this.#versionRecord(doc, 1, { label: 'Project created', reason: 'created' })));
    });
    this.#log.info('project', `Created project "${doc.name}"`, { id: doc.id });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return doc;
  }

  async openProject(id) {
    if (this.#current?.id === id) return this.#store.doc;
    if (this.#current) await this.closeProject();
    let doc = await this.#db.get(STORES.projects, id);
    if (!doc) throw new NotFoundError('Project not found. It may have been deleted in another tab.');
    if (doc.deletedAt) throw new NotFoundError('This project is in the Trash. Restore it before opening.');

    if (doc.schemaVersion < PROJECT_SCHEMA_VERSION) {
      doc = await this.#migrateStored(doc);
    } else if (doc.schemaVersion > PROJECT_SCHEMA_VERSION) {
      throw new ProjectFormatError(
        `This project was saved by a newer version of AEROLAB X (schema ${doc.schemaVersion}). Update the application to open it.`,
      );
    }
    const errors = validateProject(doc);
    if (errors.length) {
      const { doc: repaired, warnings } = sanitizeProject(doc, { now: this.#now() });
      repaired.revision = doc.revision;
      this.#log.warn('project', `Project "${doc.name}" had ${errors.length} schema problem(s); repaired in memory`, { errors, warnings });
      doc = repaired;
    }
    this.#store.load(doc);
    this.#current = { id: doc.id, baseRevision: doc.revision, lastSavedAt: doc.updatedAt };
    this.#editCounter = 0;
    this.#firstDirtyAt = null;
    this.#lastError = null;
    this.#setStatus(SAVE_STATUS.saved);
    await this.#db.setPreference('lastProjectId', doc.id).catch(() => {});
    this.#log.info('project', `Opened project "${doc.name}"`, { id: doc.id, revision: doc.revision });
    this.emit('opened', { id: doc.id });
    return this.#store.doc;
  }

  async #migrateStored(original) {
    const { doc: migrated, steps } = migrateProject(original);
    const record = { ...migrated, revision: original.revision + 1, updatedAt: this.#now().toISOString(), appVersion: APP_VERSION };
    await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
      const versions = tx.objectStore(STORES.versions);
      const number = (await this.#maxVersionNumber(versions, original.id)) + 1;
      await promisify(
        versions.add(
          this.#versionRecord(original, number, {
            label: `Before upgrade from schema ${original.schemaVersion}`,
            reason: 'pre-migration',
          }),
        ),
      );
      await promisify(tx.objectStore(STORES.projects).put(record));
    });
    this.#log.info('migration', `Upgraded project "${original.name}" (${steps.join(', ')}); original kept as a version`, { id: original.id });
    return record;
  }

  /**
   * Close the open project, saving pending edits first. With `discard: true` unsaved
   * edits are dropped (used only after the user has confirmed, e.g. when storage fails).
   */
  async closeProject({ discard = false } = {}) {
    if (!this.#current) return;
    if (!discard) await this.flush();
    clearTimeout(this.#timer);
    clearTimeout(this.#retryTimer);
    const name = this.#store.doc?.name;
    this.#current = null;
    this.#store.unload();
    this.#setStatus(SAVE_STATUS.none);
    this.#log.info('project', `Closed project "${name}"`);
    this.emit('closed', {});
  }

  // ---- Saving ----------------------------------------------------------------------

  /**
   * Persist the open project. Resolves true when saved, false when there was nothing to do.
   * Rejects with ConflictError if another tab saved a newer revision first.
   */
  async save({ reason = 'manual', force = false } = {}) {
    if (!this.#current) return false;
    if (this.#saving) {
      await this.#saving.catch(() => {});
      if (!this.isDirty && !force) return true;
    }
    if (this.#status === SAVE_STATUS.saved && !force) return true;
    if (this.#status === SAVE_STATUS.conflict && !force) throw new ConflictError('Resolve the save conflict first');
    clearTimeout(this.#timer);
    clearTimeout(this.#retryTimer);
    const task = this.#performSave(reason);
    this.#saving = task;
    try {
      return await task;
    } finally {
      this.#saving = null;
    }
  }

  async #performSave(reason) {
    const current = this.#current;
    const editsAtStart = this.#editCounter;
    const doc = this.#store.doc;
    const now = this.#now().toISOString();
    const record = { ...doc, id: current.id, revision: current.baseRevision + 1, updatedAt: now, appVersion: APP_VERSION, deletedAt: null };
    const errors = validateProject(record);
    if (errors.length) {
      const error = new ProjectFormatError(`Not saved: ${errors[0].path} — ${errors[0].message}`);
      this.#lastError = error;
      this.#setStatus(SAVE_STATUS.error, { error });
      this.#log.error('storage', error.message, { errors });
      throw error;
    }
    this.#setStatus(SAVE_STATUS.saving);
    try {
      await this.#db.transaction([STORES.projects], 'readwrite', async (tx) => {
        const projects = tx.objectStore(STORES.projects);
        const stored = await promisify(projects.get(current.id));
        if (!stored) throw new ConflictError('The project no longer exists in storage (deleted in another tab?)');
        if (stored.deletedAt) throw new ConflictError('The project was moved to the Trash in another tab', { stored });
        if (stored.revision !== current.baseRevision) {
          throw new ConflictError(`Stored revision ${stored.revision} is newer than this tab's revision ${current.baseRevision}`, { stored });
        }
        await promisify(projects.put(record));
      });
    } catch (error) {
      this.#lastError = error;
      if (error instanceof ConflictError) {
        this.#setStatus(SAVE_STATUS.conflict, { error });
        this.#log.warn('storage', `Save conflict: ${error.message}`, { id: current.id });
        this.emit('conflict', { error });
      } else {
        this.#setStatus(SAVE_STATUS.error, { error });
        this.#log.error('storage', `Save failed: ${error.message ?? error}`, { id: current.id });
        if (this.#autosaveEnabled) this.#retryTimer = setTimeout(() => this.save({ reason: 'retry' }).catch(() => {}), 5000);
      }
      throw error;
    }

    if (this.#current !== current) return true; // project switched while saving
    current.baseRevision = record.revision;
    current.lastSavedAt = now;
    this.#lastError = null;
    // Keep the in-memory document's persistence metadata in step (not an undoable edit).
    this.#store.transact('Saved', (set) => {
      set('revision', record.revision);
      set('updatedAt', now);
      set('appVersion', APP_VERSION);
    }, { record: false });
    if (this.#editCounter !== editsAtStart) {
      this.#setStatus(SAVE_STATUS.dirty);
      this.#scheduleAutosave();
    } else {
      this.#firstDirtyAt = null;
      this.#setStatus(SAVE_STATUS.saved, { reason });
    }
    this.#log.debug('storage', `Saved "${record.name}" revision ${record.revision} (${reason})`);
    this.#broadcast({ type: 'saved', id: record.id, revision: record.revision });
    this.emit('saved', { id: record.id, revision: record.revision, reason });
    return true;
  }

  /** Save now if there are unsaved edits (used before navigation, export or closing). */
  async flush() {
    if (this.#saving) await this.#saving.catch(() => {});
    if (this.#status === SAVE_STATUS.dirty || this.#status === SAVE_STATUS.error) {
      await this.save({ reason: 'flush' });
    }
  }

  /** Conflict resolution: discard local edits and load the stored revision. */
  async reloadFromStorage() {
    if (!this.#current) return;
    const id = this.#current.id;
    clearTimeout(this.#timer);
    const stored = await this.#db.get(STORES.projects, id);
    if (!stored || stored.deletedAt) {
      this.#current = null;
      this.#store.unload();
      this.#setStatus(SAVE_STATUS.none);
      this.emit('closed', {});
      return;
    }
    this.#store.load(stored);
    this.#current = { id, baseRevision: stored.revision, lastSavedAt: stored.updatedAt };
    this.#editCounter = 0;
    this.#firstDirtyAt = null;
    this.#setStatus(SAVE_STATUS.saved);
    this.emit('opened', { id, reloaded: true });
  }

  /** Conflict resolution: keep local edits by overwriting the stored revision. */
  async overwriteStored() {
    if (!this.#current) return false;
    const stored = await this.#db.get(STORES.projects, this.#current.id);
    if (stored && !stored.deletedAt) this.#current.baseRevision = stored.revision;
    this.#setStatus(SAVE_STATUS.dirty);
    if (!stored || stored.deletedAt) {
      // Re-create the project record if it disappeared.
      const doc = { ...this.#store.doc, revision: 1, deletedAt: null };
      await this.#db.put(STORES.projects, doc);
      this.#current.baseRevision = 1;
    }
    return this.save({ reason: 'overwrite', force: true });
  }

  /** Conflict resolution: save local edits as a new project and open it. */
  async saveAsCopy() {
    if (!this.#current) return null;
    const source = this.#store.doc;
    const copy = await this.#insertCopy(source, `${source.name} (conflicted copy)`, 'Saved from a conflicted session');
    this.#current = null;
    this.#store.unload();
    await this.openProject(copy.id);
    return copy;
  }

  // ---- Duplicate / trash / delete --------------------------------------------------

  async #insertCopy(source, name, label, versions = []) {
    const now = this.#now().toISOString();
    const copy = {
      ...deepClone(source),
      id: uid('prj'),
      name: name.slice(0, 120),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      appVersion: APP_VERSION,
    };
    await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
      await promisify(tx.objectStore(STORES.projects).add(copy));
      const store = tx.objectStore(STORES.versions);
      let number = 0;
      for (const version of versions) {
        number = Math.max(number, version.number);
        await promisify(store.add({ ...version, id: uid('ver'), projectId: copy.id }));
      }
      await promisify(store.add(this.#versionRecord(copy, number + 1, { label, reason: 'duplicate' })));
    });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return copy;
  }

  async duplicateProject(id, { name } = {}) {
    if (this.#current?.id === id) await this.flush();
    const source = this.#current?.id === id ? this.#store.doc : await this.#db.get(STORES.projects, id);
    if (!source) throw new NotFoundError('Project not found');
    const copy = await this.#insertCopy(source, name ?? `${source.name} (copy)`, `Duplicated from "${source.name}"`);
    this.#log.info('project', `Duplicated "${source.name}" as "${copy.name}"`, { id: copy.id });
    return copy;
  }

  async #updateStored(id, mutate) {
    let result;
    await this.#db.transaction([STORES.projects], 'readwrite', async (tx) => {
      const projects = tx.objectStore(STORES.projects);
      const stored = await promisify(projects.get(id));
      if (!stored) throw new NotFoundError('Project not found');
      result = { ...mutate(stored), revision: stored.revision + 1, updatedAt: this.#now().toISOString() };
      await promisify(projects.put(result));
    });
    return result;
  }

  async trashProject(id) {
    if (this.#current?.id === id) await this.closeProject();
    const doc = await this.#updateStored(id, (stored) => ({ ...stored, deletedAt: this.#now().toISOString() }));
    this.#log.info('project', `Moved "${doc.name}" to the Trash`, { id });
    this.#broadcast({ type: 'trashed', id });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return doc;
  }

  async restoreProject(id) {
    const doc = await this.#updateStored(id, (stored) => ({ ...stored, deletedAt: null }));
    this.#log.info('project', `Restored "${doc.name}" from the Trash`, { id });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return doc;
  }

  /** Permanently delete a project that is already in the Trash, including its versions. */
  async deleteProjectPermanently(id) {
    let name = '';
    await this.#db.transaction([STORES.projects, STORES.versions, STORES.meta], 'readwrite', async (tx) => {
      const projects = tx.objectStore(STORES.projects);
      const stored = await promisify(projects.get(id));
      if (!stored) throw new NotFoundError('Project not found');
      if (!stored.deletedAt) throw new Error('Move the project to the Trash before deleting it permanently');
      name = stored.name;
      const versions = tx.objectStore(STORES.versions);
      const keys = await promisify(versions.index('projectId').getAllKeys(id));
      for (const key of keys) await promisify(versions.delete(key));
      await promisify(projects.delete(id));
      // Deletion marker: other devices merging through Google Drive must not bring the project back.
      const meta = tx.objectStore(STORES.meta);
      const gone = (await promisify(meta.get('gone')))?.value ?? {};
      gone[id] = this.#now().toISOString();
      await promisify(meta.put({ key: 'gone', value: gone }));
    });
    this.#log.info('project', `Permanently deleted "${name}"`, { id });
    this.#broadcast({ type: 'deleted', id });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
  }

  // ---- Versions --------------------------------------------------------------------

  #versionRecord(doc, number, { label, note = '', reason }) {
    return {
      id: uid('ver'),
      projectId: doc.id,
      number,
      label: String(label ?? `Version ${number}`).slice(0, 200),
      note: String(note ?? '').slice(0, 2000),
      reason,
      createdAt: this.#now().toISOString(),
      appVersion: APP_VERSION,
      schemaVersion: doc.schemaVersion,
      revision: doc.revision,
      snapshot: deepClone(doc),
    };
  }

  async #maxVersionNumber(versionStore, projectId) {
    const records = await promisify(versionStore.index('projectId').getAll(projectId));
    return records.reduce((max, record) => Math.max(max, record.number), 0);
  }

  /** Snapshot the open project (saved first) as a named version. */
  async createVersion({ label, note = '', reason = 'manual' } = {}) {
    if (!this.#current) throw new Error('Open a project first');
    await this.flush();
    const id = this.#current.id;
    let record;
    await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
      const stored = await promisify(tx.objectStore(STORES.projects).get(id));
      if (!stored) throw new NotFoundError('Project not found');
      const versions = tx.objectStore(STORES.versions);
      const number = (await this.#maxVersionNumber(versions, id)) + 1;
      record = this.#versionRecord(stored, number, { label: label || `Version ${number}`, note, reason });
      await promisify(versions.add(record));
    });
    this.#log.info('project', `Saved version ${record.number}: ${record.label}`, { id });
    this.emit('versions-changed', { id });
    return record;
  }

  async listVersions(projectId = this.#current?.id) {
    if (!projectId) return [];
    const records = await this.#db.getAllByIndex(STORES.versions, 'projectId', projectId);
    return records.sort((a, b) => b.number - a.number);
  }

  getVersion(versionId) {
    return this.#db.get(STORES.versions, versionId);
  }

  /** Replace the open project's design content with a version's content. Undoable; a safety snapshot is stored first. */
  async restoreVersion(versionId) {
    if (!this.#current) throw new Error('Open the project first');
    const version = await this.getVersion(versionId);
    if (!version || version.projectId !== this.#current.id) throw new NotFoundError('Version not found for this project');
    await this.createVersion({ label: `Before restoring version ${version.number}`, reason: 'pre-restore' });
    let snapshot = version.snapshot;
    if (snapshot.schemaVersion < PROJECT_SCHEMA_VERSION) snapshot = migrateProject(snapshot).doc;
    const { doc: clean } = sanitizeProject(snapshot, { now: this.#now() });
    this.#store.transact(`Restore version ${version.number}`, (set) => {
      for (const [key, value] of Object.entries(clean)) {
        if (!META_KEYS.has(key)) set(key, value);
      }
    });
    await this.save({ reason: 'restore' });
    this.#log.info('project', `Restored version ${version.number} (${version.label})`, { id: this.#current.id });
    this.emit('versions-changed', { id: this.#current.id });
    return version;
  }

  /** Compare two versions (ids) or a version with the open document ('current'). */
  async compare(fromId, toId) {
    const resolve = async (id) => {
      if (id === 'current') {
        if (!this.#current) throw new Error('No project is open');
        return { label: 'Current design', doc: this.#store.doc };
      }
      const version = await this.getVersion(id);
      if (!version) throw new NotFoundError('Version not found');
      return { label: `v${version.number} — ${version.label}`, doc: version.snapshot };
    };
    const [from, to] = await Promise.all([resolve(fromId), resolve(toId)]);
    return { from: from.label, to: to.label, changes: diff(from.doc, to.doc) };
  }

  // ---- Import / export -------------------------------------------------------------

  async exportProject(id, { includeVersions = true } = {}) {
    if (this.#current?.id === id) await this.flush();
    const doc = await this.#db.get(STORES.projects, id);
    if (!doc) throw new NotFoundError('Project not found');
    const envelope = {
      format: PROJECT_FILE_FORMAT,
      formatVersion: FILE_FORMAT_VERSION,
      exportedAt: this.#now().toISOString(),
      appVersion: APP_VERSION,
      project: doc,
    };
    if (includeVersions) envelope.versions = await this.listVersions(id);
    return envelope;
  }

  /**
   * Import a project file (envelope or bare project document). Never overwrites:
   * if a project with the same id exists, the import gets a new id and name suffix.
   * @returns {{doc: object, warnings: string[], idChanged: boolean, versions: number}}
   */
  async importProject(data) {
    const parsed = parseJson(data);
    if (!isPlainObject(parsed)) throw new ProjectFormatError('The file does not contain a project');
    if (parsed.format === BACKUP_FILE_FORMAT) throw new ProjectFormatError('This is a full backup. Use “Restore backup” in Settings instead.');
    let project;
    let versions = [];
    if (parsed.format === PROJECT_FILE_FORMAT) {
      if (!Number.isInteger(parsed.formatVersion) || parsed.formatVersion > FILE_FORMAT_VERSION) {
        throw new ProjectFormatError('This project file was written by a newer AEROLAB X. Update the application first.');
      }
      project = parsed.project;
      versions = Array.isArray(parsed.versions) ? parsed.versions : [];
    } else if ('schemaVersion' in parsed && 'requirements' in parsed) {
      project = parsed;
    } else {
      throw new ProjectFormatError('The file is not an AEROLAB X project');
    }
    const { doc: migrated } = migrateProject(project);
    const { doc, warnings } = sanitizeProject(migrated, { now: this.#now() });
    const existing = await this.#db.get(STORES.projects, doc.id);
    const idChanged = Boolean(existing);
    if (idChanged) {
      doc.id = uid('prj');
      doc.name = `${doc.name} (imported)`.slice(0, 120);
    }
    doc.revision = 1;
    doc.updatedAt = this.#now().toISOString();
    doc.appVersion = APP_VERSION;
    const validVersions = versions.filter((v) => isPlainObject(v) && isPlainObject(v.snapshot) && Number.isInteger(v.number));
    if (validVersions.length !== versions.length) warnings.push(`${versions.length - validVersions.length} invalid version record(s) skipped.`);
    await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
      await promisify(tx.objectStore(STORES.projects).add(doc));
      const store = tx.objectStore(STORES.versions);
      let max = 0;
      for (const version of validVersions) {
        max = Math.max(max, version.number);
        await promisify(
          store.add({
            id: uid('ver'),
            projectId: doc.id,
            number: version.number,
            label: String(version.label ?? `Version ${version.number}`).slice(0, 200),
            note: String(version.note ?? '').slice(0, 2000),
            reason: String(version.reason ?? 'manual'),
            createdAt: typeof version.createdAt === 'string' ? version.createdAt : doc.updatedAt,
            appVersion: String(version.appVersion ?? 'unknown'),
            schemaVersion: version.snapshot.schemaVersion,
            revision: version.revision ?? null,
            snapshot: { ...version.snapshot, id: doc.id },
          }),
        );
      }
      await promisify(store.add(this.#versionRecord(doc, max + 1, { label: 'Imported from file', reason: 'import' })));
    });
    this.#log.info('import', `Imported project "${doc.name}"${idChanged ? ' as a copy' : ''}`, { id: doc.id, warnings });
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return { doc, warnings, idChanged, versions: validVersions.length };
  }

  // ---- Multi-device sync (Google Drive) ------------------------------------------------

  /** Everything that is synchronised between devices. Pending edits are saved first. */
  async snapshot() {
    await this.flush();
    const [projects, versions, learning, gone] = await Promise.all([
      this.#db.getAll(STORES.projects),
      this.#db.getAll(STORES.versions),
      this.#db.getAll(STORES.learning),
      this.#db.getMeta('gone'),
    ]);
    return { projects, versions, learning, gone: gone ?? {} };
  }

  /** True when the open project has edits that are not saved yet (a merge must wait). */
  get busyEditing() {
    return this.isDirty || this.#status === SAVE_STATUS.saving;
  }

  /**
   * Store a merged snapshot from another device. Only projects whose content changed are
   * written (with this device's next revision number); deletion markers remove projects
   * deleted elsewhere. Returns the number of projects added, changed or removed.
   */
  async applySnapshot(snapshot) {
    let changed = 0;
    const touched = [];
    await this.#db.transaction([STORES.projects, STORES.versions, STORES.learning, STORES.meta], 'readwrite', async (tx) => {
      const projects = tx.objectStore(STORES.projects);
      const versions = tx.objectStore(STORES.versions);
      const learning = tx.objectStore(STORES.learning);
      for (const incoming of snapshot.projects ?? []) {
        const stored = await promisify(projects.get(incoming.id));
        if (stored && same(projectContent(stored), projectContent(incoming))) continue;
        let doc = incoming;
        if (validateProject({ ...doc, revision: 1 }).length) {
          doc = sanitizeProject(incoming, { now: this.#now() }).doc;
          doc.deletedAt = incoming.deletedAt ?? null;
        }
        await promisify(projects.put({ ...doc, revision: (stored?.revision ?? 0) + 1 }));
        changed += 1;
        touched.push(doc.id);
      }
      for (const id of Object.keys(snapshot.gone ?? {})) {
        if (await promisify(projects.get(id))) {
          for (const key of await promisify(versions.index('projectId').getAllKeys(id))) await promisify(versions.delete(key));
          await promisify(projects.delete(id));
          changed += 1;
          touched.push(id);
        }
      }
      for (const version of snapshot.versions ?? []) {
        if (!(await promisify(versions.get(version.id)))) await promisify(versions.put(version));
      }
      for (const entry of snapshot.learning ?? []) {
        const stored = await promisify(learning.get(entry.id));
        if (!same(stored, entry)) await promisify(learning.put(entry));
      }
      await promisify(tx.objectStore(STORES.meta).put({ key: 'gone', value: snapshot.gone ?? {} }));
    });
    if (changed) {
      this.#broadcast({ type: 'projects-changed' });
      this.emit('projects-changed', { remote: true });
      if (this.#current && touched.includes(this.#current.id) && !this.busyEditing) await this.reloadFromStorage();
    }
    return changed;
  }

  async exportBackup() {
    await this.flush();
    const [projects, versions, preferences, learning] = await Promise.all([
      this.#db.getAll(STORES.projects),
      this.#db.getAll(STORES.versions),
      this.#db.getAll(STORES.preferences),
      this.#db.getAll(STORES.learning),
    ]);
    const exportedAt = this.#now().toISOString();
    await this.#db.setPreference('lastBackupAt', exportedAt);
    this.#log.info('backup', `Exported full backup (${projects.length} projects, ${versions.length} versions)`);
    return {
      format: BACKUP_FILE_FORMAT,
      formatVersion: FILE_FORMAT_VERSION,
      exportedAt,
      appVersion: APP_VERSION,
      databaseVersion: this.#db.version,
      projects,
      versions,
      preferences: preferences.filter((record) => record.key !== 'lastBackupAt'),
      learning,
    };
  }

  /**
   * Merge a backup into local storage. Existing projects are never overwritten or deleted:
   * identical projects are skipped, differing ones are added as copies.
   */
  async restoreBackup(data) {
    const backup = parseJson(data);
    if (!isPlainObject(backup) || backup.format !== BACKUP_FILE_FORMAT) {
      throw new ProjectFormatError('The file is not an AEROLAB X backup');
    }
    if (!Number.isInteger(backup.formatVersion) || backup.formatVersion > FILE_FORMAT_VERSION) {
      throw new ProjectFormatError('This backup was written by a newer AEROLAB X. Update the application first.');
    }
    const report = { added: 0, copied: 0, skipped: 0, failed: 0, preferences: 0, learning: 0, warnings: [] };
    const versionsByProject = new Map();
    for (const version of Array.isArray(backup.versions) ? backup.versions : []) {
      if (!isPlainObject(version) || !isPlainObject(version.snapshot)) continue;
      if (!versionsByProject.has(version.projectId)) versionsByProject.set(version.projectId, []);
      versionsByProject.get(version.projectId).push(version);
    }
    for (const raw of Array.isArray(backup.projects) ? backup.projects : []) {
      try {
        const { doc: migrated } = migrateProject(raw);
        const { doc, warnings } = sanitizeProject(migrated, { now: this.#now() });
        doc.deletedAt = typeof raw.deletedAt === 'string' && !Number.isNaN(Date.parse(raw.deletedAt)) ? raw.deletedAt : null;
        report.warnings.push(...warnings.map((w) => `${doc.name}: ${w}`));
        const existing = await this.#db.get(STORES.projects, doc.id);
        const versions = versionsByProject.get(raw.id) ?? [];
        if (existing && existing.revision === raw.revision && existing.updatedAt === raw.updatedAt) {
          report.skipped += 1;
          continue;
        }
        if (existing) {
          await this.#insertCopy(doc, `${doc.name} (restored copy)`, 'Restored from backup', versions);
          report.copied += 1;
          continue;
        }
        await this.#db.transaction([STORES.projects, STORES.versions], 'readwrite', async (tx) => {
          await promisify(tx.objectStore(STORES.projects).add(doc));
          const store = tx.objectStore(STORES.versions);
          for (const version of versions) {
            await promisify(store.add({ ...version, id: uid('ver'), projectId: doc.id }));
          }
        });
        report.added += 1;
      } catch (error) {
        report.failed += 1;
        report.warnings.push(`A project could not be restored: ${error.message}`);
      }
    }
    for (const preference of Array.isArray(backup.preferences) ? backup.preferences : []) {
      if (!isPlainObject(preference) || typeof preference.key !== 'string') continue;
      const existing = await this.#db.get(STORES.preferences, preference.key);
      if (existing === undefined) {
        await this.#db.put(STORES.preferences, preference);
        report.preferences += 1;
      }
    }
    for (const entry of Array.isArray(backup.learning) ? backup.learning : []) {
      if (!isPlainObject(entry) || typeof entry.id !== 'string') continue;
      const existing = await this.#db.get(STORES.learning, entry.id);
      if (existing === undefined) {
        await this.#db.put(STORES.learning, entry);
        report.learning += 1;
      }
    }
    this.#log.info('backup', `Restored backup: ${report.added} added, ${report.copied} copied, ${report.skipped} unchanged`, report);
    this.#broadcast({ type: 'projects-changed' });
    this.emit('projects-changed', { remote: false });
    return report;
  }
}
