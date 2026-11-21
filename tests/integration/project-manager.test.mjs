import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, ConflictError, STORES } from '../../js/database.js';
import { Store } from '../../js/state-manager.js';
import { ProjectManager, SAVE_STATUS } from '../../js/project-manager.js';
import { createNote } from '../../js/project-schema.js';

let counter = 0;
async function setup({ autosaveDelay = 30, indexedDB = new IDBFactory(), name } = {}) {
  counter += 1;
  const db = await openDatabase({ indexedDB, name: name ?? `pm-test-${counter}` });
  const store = new Store();
  const manager = new ProjectManager({ db, store, autosaveDelay, maxAutosaveWait: 200, broadcast: false });
  const teardown = () => {
    manager.dispose();
    db.close();
  };
  return { db, store, manager, teardown, indexedDB };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStatus(manager, status, timeout = 2000) {
  const start = Date.now();
  while (manager.status !== status) {
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${status}; status is ${manager.status}`);
    await sleep(5);
  }
}

test('create, open, edit, autosave and reopen a project', async () => {
  const { manager, store, db, teardown, indexedDB } = await setup();
  const created = await manager.createProject({ name: 'Survey Quad', category: 'multirotor' });
  assert.equal(created.revision, 1);
  await manager.openProject(created.id);
  assert.equal(manager.status, SAVE_STATUS.saved);

  store.set('requirements.endurance.value', 1500);
  assert.equal(manager.status, SAVE_STATUS.dirty);
  await waitForStatus(manager, SAVE_STATUS.saved);
  assert.equal(manager.current.baseRevision, 2);
  assert.equal(store.doc.revision, 2, 'in-memory metadata follows the save');
  assert.equal(store.canUndo, true, 'saving does not clear undo history');

  // A second "session" (new store/manager on the same database) sees the saved data.
  teardown();
  const db2 = await openDatabase({ indexedDB, name: db.name });
  const store2 = new Store();
  const manager2 = new ProjectManager({ db: db2, store: store2, broadcast: false });
  const listed = await manager2.listProjects();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].versionCount, 1);
  await manager2.openProject(created.id);
  assert.equal(store2.get('requirements.endurance.value'), 1500);
  manager2.dispose();
  db2.close();
});

test('edits made while a save is in flight are saved afterwards', async () => {
  const { manager, store, teardown } = await setup({ autosaveDelay: 10 });
  const { id } = await manager.createProject({ name: 'Race' });
  await manager.openProject(id);
  store.set('name', 'Race 1');
  const firstSave = manager.save();
  store.set('description', 'edited during save');
  await firstSave;
  assert.equal(manager.status, SAVE_STATUS.dirty);
  await waitForStatus(manager, SAVE_STATUS.saved);
  const stored = await manager.getStoredProject(id);
  assert.equal(stored.description, 'edited during save');
  assert.equal(stored.name, 'Race 1');
  teardown();
});

test('a stale tab cannot overwrite a newer revision (conflict detection)', async () => {
  const indexedDB = new IDBFactory();
  const tabA = await setup({ indexedDB, name: 'conflict', autosaveDelay: 60000 });
  const { id } = await tabA.manager.createProject({ name: 'Shared' });
  await tabA.manager.openProject(id);

  const tabB = await setup({ indexedDB, name: 'conflict', autosaveDelay: 60000 });
  await tabB.manager.openProject(id);
  tabB.store.set('name', 'Edited in B');
  await tabB.manager.save();

  tabA.store.set('name', 'Edited in A');
  await assert.rejects(tabA.manager.save(), ConflictError);
  assert.equal(tabA.manager.status, SAVE_STATUS.conflict);
  assert.equal((await tabA.manager.getStoredProject(id)).name, 'Edited in B', 'stored data untouched');

  // Resolution 1: keep A's edits as a copy.
  const copy = await tabA.manager.saveAsCopy();
  assert.match(copy.name, /conflicted copy/);
  assert.equal(tabA.manager.currentId, copy.id);
  const names = (await tabA.manager.listProjects()).map((p) => p.name).sort();
  assert.deepEqual(names, ['Edited in A (conflicted copy)', 'Edited in B']);
  tabA.teardown();
  tabB.teardown();
});

test('conflict resolution by reloading or overwriting', async () => {
  const indexedDB = new IDBFactory();
  const a = await setup({ indexedDB, name: 'resolve', autosaveDelay: 60000 });
  const b = await setup({ indexedDB, name: 'resolve', autosaveDelay: 60000 });
  const { id } = await a.manager.createProject({ name: 'P' });
  await a.manager.openProject(id);
  await b.manager.openProject(id);
  b.store.set('name', 'B wins');
  await b.manager.save();
  a.store.set('name', 'A local');
  await assert.rejects(a.manager.save(), ConflictError);
  await a.manager.reloadFromStorage();
  assert.equal(a.store.get('name'), 'B wins');
  assert.equal(a.manager.status, SAVE_STATUS.saved);

  a.store.set('name', 'A again');
  b.store.set('name', 'B again');
  await b.manager.save();
  await assert.rejects(a.manager.save(), ConflictError);
  await a.manager.overwriteStored();
  assert.equal((await a.manager.getStoredProject(id)).name, 'A again');
  a.teardown();
  b.teardown();
});

test('duplicate, trash, restore and permanent delete', async () => {
  const { manager, teardown, db } = await setup();
  const original = await manager.createProject({ name: 'Original' });
  const copy = await manager.duplicateProject(original.id);
  assert.equal(copy.name, 'Original (copy)');
  assert.notEqual(copy.id, original.id);

  await manager.openProject(original.id);
  await manager.trashProject(original.id);
  assert.equal(manager.currentId, null, 'trashing the open project closes it');
  assert.deepEqual((await manager.listProjects()).map((p) => p.name), ['Original (copy)']);
  assert.deepEqual((await manager.listProjects({ onlyDeleted: true })).map((p) => p.name), ['Original']);
  await assert.rejects(manager.openProject(original.id), /Trash/);

  await manager.restoreProject(original.id);
  assert.equal((await manager.listProjects()).length, 2);

  await assert.rejects(manager.deleteProjectPermanently(copy.id), /Trash/);
  await manager.trashProject(copy.id);
  await manager.deleteProjectPermanently(copy.id);
  assert.equal(await manager.getStoredProject(copy.id), undefined);
  const orphanVersions = await db.getAllByIndex(STORES.versions, 'projectId', copy.id);
  assert.equal(orphanVersions.length, 0, 'versions are deleted with the project');
  teardown();
});

test('versions: create, restore (undoable, with safety snapshot) and compare', async () => {
  const { manager, store, teardown } = await setup({ autosaveDelay: 60000 });
  const { id } = await manager.createProject({ name: 'V' });
  await manager.openProject(id);
  store.set('requirements.endurance.value', 600);
  const v2 = await manager.createVersion({ label: 'Baseline' });
  assert.equal(v2.number, 2);
  assert.equal(v2.snapshot.requirements.endurance.value, 600, 'pending edits are saved before snapshotting');

  store.set('requirements.endurance.value', 1200);
  store.set('notes', [createNote({ title: 'Decision', body: 'Bigger battery' })]);
  await manager.save();

  const comparison = await manager.compare(v2.id, 'current');
  const paths = comparison.changes.map((c) => c.path.join('.'));
  assert.ok(paths.includes('requirements.endurance.value'));
  assert.ok(paths.some((p) => p.startsWith('notes')));

  await manager.restoreVersion(v2.id);
  assert.equal(store.get('requirements.endurance.value'), 600);
  assert.equal(store.get('notes').length, 0);
  const versions = await manager.listVersions();
  assert.deepEqual(versions.map((v) => v.reason), ['pre-restore', 'manual', 'created']);
  assert.equal(versions[0].snapshot.requirements.endurance.value, 1200, 'pre-restore snapshot holds the replaced state');

  store.undo();
  assert.equal(store.get('requirements.endurance.value'), 1200, 'restore can be undone');
  teardown();
});

test('export and re-import a project, including versions, without overwriting', async () => {
  const { manager, store, teardown } = await setup({ autosaveDelay: 60000 });
  const { id } = await manager.createProject({ name: 'Exported', requirements: { range: { value: 12000 } } });
  await manager.openProject(id);
  await manager.createVersion({ label: 'Snapshot' });
  const envelope = await manager.exportProject(id);
  assert.equal(envelope.format, 'aerolab-x/project');
  assert.equal(envelope.versions.length, 2);

  const json = JSON.stringify(envelope);
  const first = await manager.importProject(json);
  assert.equal(first.idChanged, true, 'same id exists, so the import becomes a copy');
  assert.equal(first.doc.name, 'Exported (imported)');
  assert.equal(first.doc.requirements.range.value, 12000);
  const importedVersions = await manager.listVersions(first.doc.id);
  assert.equal(importedVersions.length, 3);
  assert.equal(importedVersions[0].reason, 'import');
  assert.equal(store.get('name'), 'Exported', 'open project unaffected');

  await assert.rejects(manager.importProject('{not json'), /not valid JSON/);
  await assert.rejects(manager.importProject({ format: 'aerolab-x/project', formatVersion: 99, project: {} }), /newer/);
  await assert.rejects(manager.importProject({ hello: 'world' }), /not an AEROLAB X project/);
  teardown();
});

test('backup restore merges: adds missing, skips identical, copies differing, never deletes', async () => {
  const source = await setup();
  const a = await source.manager.createProject({ name: 'Alpha' });
  const b = await source.manager.createProject({ name: 'Bravo' });
  await source.db.setPreference('theme', 'light');
  const backup = await source.manager.exportBackup();
  assert.equal(backup.projects.length, 2);
  assert.ok((await source.db.getPreference('lastBackupAt')).length > 0);

  // Target already has Alpha (identical) and a modified Bravo, plus its own project.
  const target = await setup();
  await target.db.put(STORES.projects, backup.projects.find((p) => p.id === a.id));
  await target.db.put(STORES.projects, { ...backup.projects.find((p) => p.id === b.id), name: 'Bravo (edited locally)', revision: 5 });
  const own = await target.manager.createProject({ name: 'Local only' });
  await target.db.setPreference('theme', 'dark');

  const report = await target.manager.restoreBackup(JSON.stringify(backup));
  assert.equal(report.skipped, 1);
  assert.equal(report.copied, 1);
  assert.equal(report.added, 0);
  const names = (await target.manager.listProjects()).map((p) => p.name).sort();
  assert.deepEqual(names, ['Alpha', 'Bravo (edited locally)', 'Bravo (restored copy)', 'Local only']);
  assert.ok(await target.manager.getStoredProject(own.id));
  assert.equal(await target.db.getPreference('theme'), 'dark', 'existing preferences are not overwritten');

  const empty = await setup();
  const report2 = await empty.manager.restoreBackup(backup);
  assert.equal(report2.added, 2);
  assert.equal((await empty.manager.listVersions(a.id)).length, 1);
  await assert.rejects(empty.manager.restoreBackup({ format: 'something-else' }), /not an AEROLAB X backup/);
  source.teardown();
  target.teardown();
  empty.teardown();
});

test('closing a project flushes pending edits', async () => {
  const { manager, store, teardown } = await setup({ autosaveDelay: 60000 });
  const { id } = await manager.createProject({ name: 'Flush me' });
  await manager.openProject(id);
  store.set('description', 'unsaved');
  await manager.closeProject();
  assert.equal((await manager.getStoredProject(id)).description, 'unsaved');
  assert.equal(manager.status, SAVE_STATUS.none);
  teardown();
});

test('invalid documents are never written', async () => {
  const { manager, store, teardown } = await setup({ autosaveDelay: 60000 });
  const { id } = await manager.createProject({ name: 'Guarded' });
  await manager.openProject(id);
  store.set('requirements.endurance.value', -10);
  await assert.rejects(manager.save(), /Not saved/);
  assert.equal(manager.status, SAVE_STATUS.error);
  assert.equal((await manager.getStoredProject(id)).requirements.endurance.value, null);
  store.undo();
  teardown();
});
