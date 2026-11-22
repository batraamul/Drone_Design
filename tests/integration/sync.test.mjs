/**
 * Two "computers" (separate databases) exchanging snapshots exactly as Google Drive sync does:
 * each merges the other's copy with the copy it merged last as the common base.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase } from '../../js/database.js';
import { Store } from '../../js/state-manager.js';
import { ProjectManager } from '../../js/project-manager.js';
import { mergeSnapshots } from '../../js/sync/merge.js';

async function device(name) {
  const db = await openDatabase({ indexedDB: new IDBFactory(), name });
  const store = new Store();
  const pm = new ProjectManager({ db, store, autosaveDelay: 60000, broadcast: false });
  return { db, store, pm, base: null, close: () => { pm.dispose(); db.close(); } };
}

/** `to` pulls `from`'s copy and merges it in. */
async function pull(to, from) {
  const theirs = await from.pm.snapshot();
  const merged = mergeSnapshots(to.base, await to.pm.snapshot(), theirs);
  await to.pm.applySnapshot(merged);
  to.base = theirs;
}

const names = async (d) => (await d.pm.listProjects({ includeDeleted: true })).map((p) => p.name).sort();

test('two computers: create, edit different fields, merge both ways, delete permanently', async () => {
  const office = await device('office');
  const home = await device('home');

  const quad = await office.pm.createProject({ name: 'Survey Quad' });
  await home.pm.createProject({ name: 'Glide Sonde' });
  await pull(home, office);
  await pull(office, home);
  assert.deepEqual(await names(office), ['Glide Sonde', 'Survey Quad']);
  assert.deepEqual(await names(home), ['Glide Sonde', 'Survey Quad']);

  // Office edits the endurance, home edits the description of the same project.
  await office.pm.openProject(quad.id);
  office.store.set('requirements.endurance.value', 1800);
  await office.pm.save();
  await home.pm.openProject(quad.id);
  home.store.set('description', 'Mapping of agricultural plots');
  await home.pm.save();
  await home.pm.closeProject();

  await pull(home, office);
  await pull(office, home);
  for (const d of [office, home]) {
    const doc = await d.pm.getStoredProject(quad.id);
    assert.equal(doc.requirements.endurance.value, 1800);
    assert.equal(doc.description, 'Mapping of agricultural plots');
  }
  assert.equal(office.store.get('description'), 'Mapping of agricultural plots', 'open, saved project reloads with merged changes');

  // Permanent deletion on home must not come back from office.
  await office.pm.closeProject();
  await home.pm.trashProject(quad.id);
  await home.pm.deleteProjectPermanently(quad.id);
  await pull(home, office);
  assert.deepEqual(await names(home), ['Glide Sonde']);
  await pull(office, home);
  assert.deepEqual(await names(office), ['Glide Sonde']);

  office.close();
  home.close();
});

test('a merge waits while the open project has unsaved edits', async () => {
  const a = await device('a2');
  const doc = await a.pm.createProject({ name: 'Busy' });
  await a.pm.openProject(doc.id);
  a.store.set('name', 'Busy (typing)');
  assert.equal(a.pm.busyEditing, true);
  a.close();
});
