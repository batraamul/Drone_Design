import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../js/state-manager.js';

function makeStore(options = {}) {
  let now = 0;
  const store = new Store({ coalesceMs: 500, clock: () => now, ...options });
  store.load({ name: 'A', requirements: { mass: { value: 1 } }, notes: [] });
  return { store, tick: (ms) => (now += ms) };
}

test('documents are frozen and edits create new roots', () => {
  const { store } = makeStore();
  const before = store.doc;
  assert.ok(Object.isFrozen(before));
  assert.throws(() => {
    'use strict';
    before.name = 'mutated';
  }, TypeError);
  store.set('name', 'B');
  assert.notEqual(store.doc, before);
  assert.equal(store.doc.requirements, before.requirements, 'unchanged branches are shared');
});

test('undo and redo restore previous documents', () => {
  const { store, tick } = makeStore();
  store.set('name', 'B');
  tick(1000);
  store.set('requirements.mass.value', 2);
  assert.equal(store.get('requirements.mass.value'), 2);
  assert.ok(store.undo());
  assert.equal(store.get('requirements.mass.value'), 1);
  assert.equal(store.get('name'), 'B');
  assert.ok(store.undo());
  assert.equal(store.get('name'), 'A');
  assert.equal(store.undo(), false);
  assert.ok(store.redo());
  assert.equal(store.get('name'), 'B');
  store.set('name', 'C');
  assert.equal(store.canRedo, false, 'a new edit clears the redo stack');
});

test('rapid edits to the same field coalesce into one undo step', () => {
  const { store, tick } = makeStore();
  store.set('name', 'A1');
  tick(100);
  store.set('name', 'A12');
  tick(100);
  store.set('name', 'A123');
  assert.equal(store.historySize.undo, 1);
  tick(1000);
  store.set('name', 'later');
  assert.equal(store.historySize.undo, 2);
  store.undo();
  assert.equal(store.get('name'), 'A123');
  store.undo();
  assert.equal(store.get('name'), 'A');
});

test('transactions are a single undo step; non-recorded updates skip history', () => {
  const { store } = makeStore();
  store.transact('two fields', (set) => {
    set('name', 'X');
    set('requirements.mass.value', 9);
  });
  assert.equal(store.historySize.undo, 1);
  store.set('revision', 4, { record: false });
  assert.equal(store.historySize.undo, 1);
  store.undo();
  assert.equal(store.get('name'), 'A');
  assert.equal(store.get('requirements.mass.value'), 1);
});

test('setting an identical value is a no-op', () => {
  const { store } = makeStore();
  let changes = 0;
  store.on('change', () => (changes += 1));
  assert.equal(store.set('name', 'A'), false);
  assert.equal(changes, 0);
  assert.equal(store.canUndo, false);
});

test('history limit drops the oldest entries', () => {
  const { store, tick } = makeStore({ historyLimit: 3 });
  for (let i = 0; i < 6; i += 1) {
    tick(1000);
    store.set('name', `n${i}`);
  }
  assert.equal(store.historySize.undo, 3);
});

test('derived nodes recompute only when dependencies change and chain through other nodes', () => {
  const { store } = makeStore();
  let massEvaluations = 0;
  store.define('mass', {
    deps: ['requirements.mass.value'],
    compute: (mass) => {
      massEvaluations += 1;
      return mass * 2;
    },
  });
  store.define('massLabel', { deps: [{ node: 'mass' }, 'name'], compute: (m, name) => `${name}:${m}` });
  assert.equal(store.derive('massLabel'), 'A:2');
  assert.equal(massEvaluations, 1);
  store.set('notes', [{ id: 'n1' }]); // unrelated change
  assert.equal(store.derive('mass'), 2);
  assert.equal(massEvaluations, 1, 'no recomputation for unrelated edits');
  store.set('requirements.mass.value', 5);
  assert.equal(store.derive('massLabel'), 'A:10');
  assert.equal(massEvaluations, 2);
  store.undo();
  assert.equal(store.derive('massLabel'), 'A:2');
});

test('circular derived dependencies are detected', () => {
  const { store } = makeStore();
  store.define('a', { deps: [{ node: 'b' }], compute: (b) => b });
  store.define('b', { deps: [{ node: 'a' }], compute: (a) => a });
  assert.throws(() => store.derive('a'), /Circular/);
});

test('editing without a document throws', () => {
  const store = new Store();
  assert.throws(() => store.set('name', 'x'), /No project/);
});
