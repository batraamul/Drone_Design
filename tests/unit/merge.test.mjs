import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSnapshots, mergeProject, pick, fingerprint } from '../../js/sync/merge.js';
import { createProject, createNote, validateProject } from '../../js/project-schema.js';

const at = (iso) => new Date(iso);
function project(name, when = '2026-01-01T00:00:00Z') {
  const doc = createProject({ name }, { now: at(when) });
  doc.revision = 1;
  return doc;
}
const edit = (doc, patch, when) => ({ ...structuredClone(doc), ...patch, updatedAt: when });

test('pick rules', () => {
  assert.equal(pick(1, 1, 2, true), 2, 'changed remotely only');
  assert.equal(pick(1, 3, 1, false), 3, 'changed locally only');
  assert.equal(pick(1, 3, 4, true), 3, 'conflict → preferred side');
  assert.equal(pick(1, undefined, 1, true), undefined, 'deleted locally, unchanged remotely');
  assert.equal(pick(1, undefined, 5, true), 5, 'edit beats delete');
  assert.equal(pick(undefined, undefined, 7, true), 7, 'added remotely');
});

test('edits to different fields on two devices are both kept', () => {
  const base = project('Quad');
  const local = edit(base, { name: 'Quad Mk2' }, '2026-01-02T00:00:00Z');
  const remote = edit(base, { description: 'Survey aircraft' }, '2026-01-03T00:00:00Z');
  remote.requirements.endurance = { ...remote.requirements.endurance, value: 1800 };
  const merged = mergeProject(base, local, remote);
  assert.equal(merged.name, 'Quad Mk2');
  assert.equal(merged.description, 'Survey aircraft');
  assert.equal(merged.requirements.endurance.value, 1800);
  assert.deepEqual(validateProject(merged), []);
});

test('same field changed on both devices: the later edit wins', () => {
  const base = project('Quad');
  const local = edit(base, { name: 'Local name' }, '2026-01-05T00:00:00Z');
  const remote = edit(base, { name: 'Remote name' }, '2026-01-04T00:00:00Z');
  assert.equal(mergeProject(base, local, remote).name, 'Local name');
  assert.equal(mergeProject(base, remote, local).name, 'Local name');
});

test('notes: additions from both sides kept, deletion respected, edit beats delete', () => {
  const n1 = createNote({ title: 'one' }, at('2026-01-01T00:00:00Z'));
  const n2 = createNote({ title: 'two' }, at('2026-01-01T00:00:00Z'));
  const base = { ...project('P'), notes: [n1, n2] };
  const local = { ...base, notes: [n2, createNote({ title: 'local new' })] }; // deleted n1
  const remote = { ...base, notes: [n1, { ...n2, body: 'edited remotely', updatedAt: '2026-02-01T00:00:00Z' }, createNote({ title: 'remote new' })] };
  const titles = mergeProject(base, local, remote).notes.map((n) => n.title).sort();
  assert.deepEqual(titles, ['local new', 'remote new', 'two']);
  assert.equal(mergeProject(base, local, remote).notes.find((n) => n.title === 'two').body, 'edited remotely');
});

test('snapshots: projects from both devices combine; permanent deletions stay deleted', () => {
  const a = project('Alpha');
  const b = project('Bravo');
  const c = project('Charlie');
  const local = { projects: [a, c], versions: [{ id: 'ver_1', projectId: a.id }], learning: [], gone: {} };
  const remote = { projects: [b, c], versions: [{ id: 'ver_2', projectId: b.id }, { id: 'ver_3', projectId: c.id }], learning: [], gone: {} };
  const merged = mergeSnapshots(null, local, remote);
  assert.deepEqual(merged.projects.map((p) => p.name).sort(), ['Alpha', 'Bravo', 'Charlie']);
  assert.equal(merged.versions.length, 3);
  const afterDelete = mergeSnapshots(merged, { ...merged, projects: merged.projects.filter((p) => p.id !== c.id), gone: { [c.id]: '2026-03-01T00:00:00Z' } }, merged);
  assert.deepEqual(afterDelete.projects.map((p) => p.name).sort(), ['Alpha', 'Bravo']);
  assert.ok(!afterDelete.versions.some((v) => v.projectId === c.id));
});

test('trash state syncs like any other field', () => {
  const base = project('P');
  const trashed = edit(base, { deletedAt: '2026-01-09T00:00:00Z' }, '2026-01-09T00:00:00Z');
  assert.equal(mergeProject(base, base, trashed).deletedAt, '2026-01-09T00:00:00Z');
});

test('learning progress keeps the best of both and the first completion', () => {
  const merged = mergeSnapshots(
    null,
    { learning: [{ id: 'isa', attempts: 2, completedAt: null, lastAttemptAt: '2026-01-02' }] },
    { learning: [{ id: 'isa', attempts: 1, completedAt: '2026-01-01', lastAttemptAt: '2026-01-01' }] },
  );
  assert.equal(merged.learning[0].attempts, 2);
  assert.equal(merged.learning[0].completedAt, '2026-01-01');
});

test('fingerprint ignores device revision counters and order', () => {
  const p = project('P');
  const q = project('Q');
  const f1 = fingerprint({ projects: [p, q] });
  const f2 = fingerprint({ projects: [{ ...q, revision: 9 }, { ...p, revision: 4 }] });
  assert.equal(f1, f2);
  assert.notEqual(f1, fingerprint({ projects: [{ ...p, name: 'P2' }, q] }));
});
