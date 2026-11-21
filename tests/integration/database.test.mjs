import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, DB_MIGRATIONS, STORES, DB_VERSION } from '../../js/database.js';

test('fresh database gets every store and a migration log', async () => {
  const indexedDB = new IDBFactory();
  const db = await openDatabase({ indexedDB, appVersion: 'test' });
  assert.equal(db.version, DB_VERSION);
  for (const store of Object.values(STORES)) assert.ok(db.storeNames.includes(store), `store ${store}`);
  const log = await db.getMeta('migrations');
  assert.equal(log.length, DB_VERSION);
  assert.equal(log[0].appVersion, 'test');
  db.close();
});

test('upgrading to a new schema version keeps every existing project', async () => {
  const indexedDB = new IDBFactory();
  const v1 = await openDatabase({ indexedDB, name: 'upgrade-test' });
  await v1.put(STORES.projects, { id: 'prj_keepme1', name: 'Keep me', updatedAt: '2026-01-01T00:00:00Z' });
  await v1.setPreference('theme', 'light');
  v1.close();

  // Simulate a future release that adds a store and an index.
  const futureMigrations = {
    ...DB_MIGRATIONS,
    2(db, tx) {
      db.createObjectStore('components', { keyPath: 'id' });
      tx.objectStore(STORES.projects).createIndex('name', 'name');
    },
  };
  const v2 = await openDatabase({ indexedDB, name: 'upgrade-test', version: 2, migrations: futureMigrations });
  assert.equal(v2.version, 2);
  assert.ok(v2.storeNames.includes('components'));
  const project = await v2.get(STORES.projects, 'prj_keepme1');
  assert.equal(project.name, 'Keep me');
  assert.equal(await v2.getPreference('theme'), 'light');
  const log = await v2.getMeta('migrations');
  assert.deepEqual(log.map((entry) => entry.version), [1, 2]);
  v2.close();
});

test('a failing migration aborts the upgrade and leaves the old database intact', async () => {
  const indexedDB = new IDBFactory();
  const v1 = await openDatabase({ indexedDB, name: 'abort-test' });
  await v1.put(STORES.projects, { id: 'prj_survivor', name: 'Survivor', updatedAt: '2026-01-01T00:00:00Z' });
  v1.close();
  const broken = {
    ...DB_MIGRATIONS,
    2() {
      throw new Error('boom');
    },
  };
  await assert.rejects(openDatabase({ indexedDB, name: 'abort-test', version: 2, migrations: broken }));
  const again = await openDatabase({ indexedDB, name: 'abort-test' });
  assert.equal(again.version, 1);
  assert.equal((await again.get(STORES.projects, 'prj_survivor')).name, 'Survivor');
  again.close();
});

test('transactions roll back when the work function throws', async () => {
  const indexedDB = new IDBFactory();
  const db = await openDatabase({ indexedDB, name: 'rollback-test' });
  await assert.rejects(
    db.transaction([STORES.projects], 'readwrite', async (tx) => {
      tx.objectStore(STORES.projects).put({ id: 'prj_ghost123', name: 'ghost' });
      throw new Error('stop');
    }),
    /stop/,
  );
  assert.equal(await db.get(STORES.projects, 'prj_ghost123'), undefined);
  db.close();
});

test('migration code is additive only (never deletes stores)', async () => {
  const source = await readFile(new URL('../../js/database.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/\.deleteObjectStore\s*\(|\.deleteIndex\s*\(|\.clear\s*\(|deleteDatabase\s*\(/.test(code),
    'database.js must not delete stores, indexes or data',
  );
});
