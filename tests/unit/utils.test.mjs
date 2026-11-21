import test from 'node:test';
import assert from 'node:assert/strict';
import { diff, formatPath } from '../../js/utils/diff.js';
import { setIn, getIn, deleteIn, deepEqual } from '../../js/utils/immutable.js';
import { parseHash, buildHash } from '../../js/router.js';
import { uid, uuid } from '../../js/utils/id.js';
import { formatNumber, slugify, formatBytes, formatRelative } from '../../js/utils/format.js';

test('setIn / getIn / deleteIn are immutable', () => {
  const a = { x: { y: 1 }, list: [1, 2] };
  const b = setIn(a, 'x.y', 2);
  assert.equal(a.x.y, 1);
  assert.equal(b.x.y, 2);
  assert.equal(b.list, a.list);
  assert.equal(setIn(a, 'x.y', 1), a, 'same value returns the same object');
  const c = setIn(a, ['list', 1], 3);
  assert.deepEqual(c.list, [1, 3]);
  assert.equal(getIn(c, 'list.1'), 3);
  assert.equal(getIn(c, 'missing.deep'), undefined);
  const d = deleteIn(a, 'x.y');
  assert.deepEqual(d.x, {});
  assert.equal(a.x.y, 1);
  assert.ok(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }));
  assert.ok(!deepEqual({ a: 1 }, { a: 1, b: undefined }));
});

test('diff reports changes, ignores persistence metadata and matches id arrays by id', () => {
  const before = {
    name: 'A',
    revision: 1,
    requirements: { endurance: { value: 600 } },
    notes: [
      { id: 'n1', title: 'first' },
      { id: 'n2', title: 'second' },
    ],
  };
  const after = {
    name: 'B',
    revision: 7,
    requirements: { endurance: { value: 900 } },
    notes: [
      { id: 'n2', title: 'second' },
      { id: 'n3', title: 'third' },
    ],
  };
  const changes = diff(before, after);
  const summary = changes.map((c) => `${c.type}:${formatPath(c.path)}`).sort();
  assert.deepEqual(summary, [
    'added:notes[n3]',
    'changed:name',
    'changed:requirements.endurance.value',
    'removed:notes[n1]',
  ]);
  assert.deepEqual(diff(before, before), []);
});

test('hash parsing is robust to odd input', () => {
  assert.deepEqual(parseHash(''), { module: 'dashboard', segments: [], params: {}, path: 'dashboard' });
  assert.deepEqual(parseHash('#/projects/prj_abc/versions?tab=compare'), {
    module: 'projects',
    segments: ['prj_abc', 'versions'],
    params: { tab: 'compare' },
    path: 'projects/prj_abc/versions',
  });
  assert.equal(parseHash('#/%E0%A4%A').module, 'dashboard', 'malformed escapes are dropped');
  assert.equal(parseHash('#/<script>').module, 'dashboard', 'unsafe segments are dropped');
  assert.equal(buildHash('projects', ['prj_1'], { tab: 'notes', empty: '' }), '#/projects/prj_1?tab=notes');
});

test('identifiers are unique and well formed', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uid('prj')));
  assert.equal(ids.size, 1000);
  assert.match(uid('prj'), /^prj_[0-9a-f]{32}$/);
  assert.match(uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('formatting helpers', () => {
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(1.23456, { digits: 3 }), '1.23');
  assert.equal(formatNumber(1234.5, { digits: 3 }), '1,235');
  assert.match(formatNumber(0.00001234), /e-5$/);
  assert.equal(slugify('Survey Quad Mk-1 (v2)'), 'survey-quad-mk-1-v2');
  assert.equal(slugify('   '), 'project');
  assert.equal(formatBytes(1500), '1.5 kB');
  const now = Date.parse('2026-01-01T12:00:00Z');
  assert.equal(formatRelative('2026-01-01T11:58:00Z', now), '2 min ago');
});
