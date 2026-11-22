import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  validateProject,
  sanitizeProject,
  migrateProject,
  ProjectFormatError,
  PROJECT_SCHEMA_VERSION,
  DESIGN_STAGES,
} from '../../js/project-schema.js';

test('new projects are valid and use SI requirement entries', () => {
  const doc = createProject({ name: '  Survey quad  ', category: 'multirotor', requirements: { endurance: { value: 1800 } } });
  assert.deepEqual(validateProject(doc), []);
  assert.equal(doc.name, 'Survey quad');
  assert.equal(doc.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(doc.requirements.endurance.value, 1800);
  assert.equal(doc.requirements.endurance.unit, 's');
  assert.equal(doc.requirements.range.value, null);
  assert.equal(doc.revision, 0);
});

test('unknown categories fall back and invalid requirement values are not accepted', () => {
  const doc = createProject({ category: 'weapon-platform', requirements: { maxTakeoffMass: { value: -5 } } });
  assert.equal(doc.category, 'multirotor');
  assert.equal(doc.requirements.maxTakeoffMass.value, null);
  assert.equal(doc.name, 'Untitled design');
});

test('there is no flight-ready design stage', () => {
  assert.ok(!DESIGN_STAGES.some((stage) => /ready|certified|approved/i.test(stage.id + stage.label)));
});

test('validation reports precise paths', () => {
  const doc = createProject({ name: 'X' });
  const broken = { ...doc, name: '', requirements: { ...doc.requirements, endurance: { value: 10, unit: 'min', provenance: 'requirement' } } };
  const paths = validateProject(broken).map((e) => e.path);
  assert.ok(paths.includes('name'));
  assert.ok(paths.includes('requirements.endurance.unit'));
});

test('sanitisation repairs imported data and reports what changed', () => {
  const { doc, warnings } = sanitizeProject({
    schemaVersion: 1,
    id: 'prj_abcdef123',
    name: 'Imported\u0000 craft',
    category: 'spaceship',
    requirements: { endurance: { value: 600, unit: 's' }, range: { value: 5, unit: 'km' }, cruiseSpeed: 'fast' },
    notes: [{ id: 'note_aaaaaa', title: 'n', body: 'b' }, 'garbage'],
    modules: { future: { x: 1 } },
    extraneous: '<img src=x onerror=alert(1)>',
  });
  assert.deepEqual(validateProject(doc), []);
  assert.equal(doc.name, 'Imported craft');
  assert.equal(doc.requirements.endurance.value, 600);
  assert.equal(doc.requirements.range.value, null);
  assert.equal(doc.notes.length, 1);
  assert.deepEqual(doc.modules.future, { x: 1 }, 'unknown module data is kept');
  assert.equal(doc.modules.configuration.layout, 'quad-x', 'missing configuration gets the default for the category');
  assert.ok(!('extraneous' in doc));
  assert.ok(warnings.some((w) => w.includes('spaceship')));
  assert.ok(warnings.some((w) => w.includes('km')));
});

test('document migrations run step by step and refuse newer schemas', () => {
  const migrations = {
    1: (doc) => ({ ...doc, renamed: doc.name }),
    2: (doc) => ({ ...doc, notes: [...doc.notes, { id: 'note_migrated', title: 'm', body: '' }] }),
  };
  const v1 = { ...createProject({ name: 'Old' }), schemaVersion: 1 };
  const result = migrateProject(v1, { migrations, targetVersion: 3 });
  assert.equal(result.doc.schemaVersion, 3);
  assert.equal(result.doc.renamed, 'Old');
  assert.equal(result.doc.notes.length, 1);
  assert.deepEqual(result.steps, ['1→2', '2→3']);
  assert.equal(v1.schemaVersion, 1, 'input is not mutated');
  assert.throws(() => migrateProject({ ...v1, schemaVersion: 99 }), ProjectFormatError);
  assert.throws(() => migrateProject({ name: 'no version' }), ProjectFormatError);
  assert.throws(() => migrateProject(v1, { migrations: {}, targetVersion: 2 }), /No migration/);
  assert.equal(migrateProject(createProject({ name: 'Current' })).migrated, false);
});

test('schema 1 → 2 adds the aircraft configuration and keeps all user content', () => {
  const v2 = createProject({ name: 'Mapper', category: 'fixed-wing', requirements: { endurance: 3600 } });
  v2.notes.push({ id: 'note_keepme1', title: 'Keep', body: 'me', createdAt: v2.createdAt, updatedAt: v2.createdAt });
  const { configuration, ...modulesWithoutConfig } = v2.modules;
  const v1 = { ...v2, schemaVersion: 1, modules: { ...modulesWithoutConfig, legacy: { a: 1 } } };
  const result = migrateProject(v1);
  assert.equal(result.migrated, true);
  assert.deepEqual(result.steps, ['1→2', '2→3']);
  assert.equal(result.doc.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(result.doc.modules.configuration.layout, 'conventional');
  assert.deepEqual(result.doc.modules.legacy, { a: 1 });
  assert.equal(result.doc.notes[0].title, 'Keep');
  assert.equal(result.doc.requirements.endurance.value, 3600);
  assert.deepEqual(validateProject(result.doc), []);
  assert.ok(configuration, 'new projects carry a configuration');
});

test('validation reports a broken configuration', () => {
  const doc = createProject({ name: 'X' });
  const broken = { ...doc, modules: { configuration: { layout: 'quad-x', options: {}, params: { ...doc.modules.configuration.params, armLength: -1 } } } };
  assert.ok(validateProject(broken).some((e) => e.path === 'modules.configuration.params.armLength'));
  const unknown = { ...doc, modules: { configuration: { layout: 'warp-drive', options: {}, params: {} } } };
  assert.ok(validateProject(unknown).some((e) => e.path === 'modules.configuration.layout'));
});

test('schema 2 → 3 adds an empty component list and keeps the configuration', () => {
  const current = createProject({ name: 'Quad', category: 'multirotor' });
  const { components, ...rest } = current.modules;
  const v2 = { ...current, schemaVersion: 2, modules: { ...rest, configuration: { ...rest.configuration, params: { ...rest.configuration.params, armLength: 0.3 } } } };
  const result = migrateProject(v2);
  assert.deepEqual(result.steps, ['2→3']);
  assert.deepEqual(result.doc.modules.components, { items: [], connections: [] });
  assert.equal(result.doc.modules.configuration.params.armLength, 0.3);
  assert.deepEqual(validateProject(result.doc), []);
  assert.ok(components, 'new projects carry a component list');
});
