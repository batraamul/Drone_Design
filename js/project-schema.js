/**
 * Project document schema, defaults, validation, sanitisation and document migrations.
 *
 * A project is one JSON document. Every engineering value is stored in SI units.
 * The document carries `schemaVersion`; documents written by older versions are
 * migrated forward step by step on load and on import. Migrations never delete
 * user content, and the project manager stores a snapshot of the original
 * document before migrating it.
 */
import { uid } from './utils/id.js';
import { deepClone, isPlainObject } from './utils/immutable.js';
import { APP_VERSION } from './version.js';
import { REQUIREMENT_FIELDS, emptyRequirements, validateRequirementValue } from './engineering/requirements.js';
import { defaultConfiguration, sanitizeConfiguration, validateConfiguration } from './engineering/configuration.js';
import { emptyComponents, sanitizeComponents, validateComponents } from './engineering/components.js';
import { DEFAULT_SETTINGS, sanitizePropulsion, validatePropulsion } from './engineering/propulsion.js';
import { defaultPropulsion } from './engineering/catalogue.js';
import { defaultSounding, sanitizeSounding, validateSounding } from './engineering/sounding.js';
import { defaultAerodynamics, sanitizeAerodynamics, validateAerodynamics } from './engineering/aerodynamics.js';
import { defaultStructures, sanitizeStructures, validateStructures } from './engineering/structures.js';
import { emptyFormulas, sanitizeFormulas, validateFormulas } from './engineering/custom-formulas.js';

/** Starting propulsion data for a configuration: closest illustrative motor/propeller, size-scaled structure estimate. */
export function defaultPropulsionFor(configuration) {
  const params = configuration?.params ?? {};
  const D = params.liftPropDiameter ?? params.propDiameter ?? 0.254;
  const structureMass = D < 0.08 ? 0.02 : D <= 0.27 ? 0.35 : D <= 0.34 ? 0.6 : 1.2;
  return defaultPropulsion(configuration, { ...DEFAULT_SETTINGS, structureMass });
}

/** Schema history: 1 = Build 1 (requirements, notes); 2 = Build 2 (modules.configuration); 3 = Build 3 (modules.components); 4 = Build 4 (modules.propulsion); 5 = balloon glide-sonde mission (modules.sounding); 6 = Build 5 (modules.aerodynamics, modules.structures, modules.formulas). */
export const PROJECT_SCHEMA_VERSION = 6;

export const PROJECT_CATEGORIES = Object.freeze([
  {
    id: 'multirotor',
    label: 'Multirotor',
    icon: 'multirotor',
    summary: 'Quadcopters, hexacopters, octocopters and coaxial multirotors in X, +, H and other layouts.',
  },
  {
    id: 'fixed-wing',
    label: 'Fixed wing',
    icon: 'fixedWing',
    summary: 'Conventional, flying-wing, delta, swept-wing and glider layouts with tractor or pusher propulsion.',
  },
  {
    id: 'vtol',
    label: 'VTOL hybrid',
    icon: 'vtol',
    summary: 'Quadplane, tilt-rotor, tilt-wing, lift-and-cruise and tailsitter configurations.',
  },
  {
    id: 'special',
    label: 'Special platform',
    icon: 'special',
    summary: 'Coaxial rotorcraft, tethered UAVs, hybrid aerial vehicles, solar-assisted and balloon-assisted research platforms.',
  },
  {
    id: 'micro',
    label: 'Micro & bio-inspired',
    icon: 'micro',
    summary: 'Micro-quadcopters, flapping-wing and biomimetic research concepts (educational models only).',
  },
]);

export const CIVILIAN_APPLICATIONS = Object.freeze([
  { id: 'aerial-mapping', label: 'Aerial mapping & surveying' },
  { id: 'inspection', label: 'Infrastructure inspection' },
  { id: 'environmental', label: 'Environmental monitoring' },
  { id: 'atmospheric', label: 'Atmospheric & meteorological research' },
  { id: 'agriculture', label: 'Agricultural monitoring' },
  { id: 'search-rescue', label: 'Search-and-rescue research' },
  { id: 'communication-relay', label: 'Communication relay' },
  { id: 'scientific', label: 'Scientific research platform' },
  { id: 'education', label: 'Education & training' },
  { id: 'defence-logistics', label: 'Defence: logistics & resupply (non-weapon)' },
  { id: 'defence-isr', label: 'Defence: surveillance & reconnaissance (non-weapon)' },
  { id: 'defence-met', label: 'Defence: meteorological support & sounding' },
  { id: 'defence-hah', label: 'Defence: high-altitude & cold-region operations' },
  { id: 'disaster-relief', label: 'Disaster relief & humanitarian support' },
  { id: 'other', label: 'Other application' },
]);
/** Applications include non-weapon defence roles; the name is kept for compatibility. */
export const APPLICATIONS = CIVILIAN_APPLICATIONS;

/**
 * Design maturity, declared by the user. There is intentionally no "flight-ready"
 * stage: AEROLAB X never labels an unvalidated design as ready to fly.
 */
export const DESIGN_STAGES = Object.freeze([
  { id: 'concept', label: 'Concept' },
  { id: 'preliminary', label: 'Preliminary design' },
  { id: 'detailed', label: 'Detailed design' },
  { id: 'prototype', label: 'Prototype build' },
  { id: 'testing', label: 'Test & evaluation' },
]);

export const LIMITS = Object.freeze({
  nameLength: 120,
  descriptionLength: 5000,
  tagCount: 20,
  tagLength: 40,
  noteCount: 500,
  noteTitleLength: 200,
  noteBodyLength: 50000,
});

export class ProjectFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

const byId = (list) => new Map(list.map((item) => [item.id, item]));
const CATEGORY_MAP = byId(PROJECT_CATEGORIES);
const APPLICATION_MAP = byId(CIVILIAN_APPLICATIONS);
const STAGE_MAP = byId(DESIGN_STAGES);

export const categoryInfo = (id) => CATEGORY_MAP.get(id);
export const applicationInfo = (id) => APPLICATION_MAP.get(id);
export const stageInfo = (id) => STAGE_MAP.get(id);

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // Remove control characters other than tab/newline, normalise line endings, trim length.
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function createNote({ title = 'Untitled note', body = '' } = {}, now = new Date()) {
  const iso = now.toISOString();
  return {
    id: uid('note'),
    title: cleanText(title, LIMITS.noteTitleLength) || 'Untitled note',
    body: cleanText(body, LIMITS.noteBodyLength),
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Create a new, valid project document (revision 0 = not yet saved). */
export function createProject(init = {}, { now = new Date(), id } = {}) {
  const iso = now.toISOString();
  const requirements = emptyRequirements();
  for (const field of REQUIREMENT_FIELDS) {
    const value = init.requirements?.[field.key]?.value ?? init.requirements?.[field.key];
    if (typeof value === 'number' && validateRequirementValue(field.key, value) === null) {
      requirements[field.key] = { ...requirements[field.key], value };
    }
  }
  const name = cleanText(init.name, LIMITS.nameLength).trim();
  const category = CATEGORY_MAP.has(init.category) ? init.category : 'multirotor';
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: id ?? uid('prj'),
    revision: 0,
    name: name || 'Untitled design',
    description: cleanText(init.description, LIMITS.descriptionLength),
    category,
    application: APPLICATION_MAP.has(init.application) ? init.application : 'aerial-mapping',
    stage: STAGE_MAP.has(init.stage) ? init.stage : 'concept',
    tags: Array.isArray(init.tags) ? normaliseTags(init.tags) : [],
    requirements,
    notes: [],
    modules: (() => {
      const configuration = defaultConfiguration(category);
      return { configuration, components: emptyComponents(), propulsion: defaultPropulsionFor(configuration), sounding: { ...defaultSounding(), enabled: false }, aerodynamics: defaultAerodynamics(configuration), structures: defaultStructures(), formulas: emptyFormulas() };
    })(),
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
    appVersion: APP_VERSION,
  };
}

export function normaliseTags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const clean = cleanText(String(tag ?? ''), LIMITS.tagLength).trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
    if (result.length >= LIMITS.tagCount) break;
  }
  return result;
}

/**
 * Validate a project document against the current schema.
 * @returns {{path: string, message: string}[]} empty when valid
 */
export function validateProject(doc) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  if (!isPlainObject(doc)) return [{ path: '', message: 'Project must be a JSON object' }];

  if (doc.schemaVersion !== PROJECT_SCHEMA_VERSION) error('schemaVersion', `Expected schema version ${PROJECT_SCHEMA_VERSION}`);
  if (typeof doc.id !== 'string' || !/^prj_[A-Za-z0-9]{6,64}$/.test(doc.id)) error('id', 'Invalid project id');
  if (!Number.isInteger(doc.revision) || doc.revision < 0) error('revision', 'Revision must be a non-negative integer');
  if (typeof doc.name !== 'string' || doc.name.trim() === '') error('name', 'Name is required');
  else if (doc.name.length > LIMITS.nameLength) error('name', `Name is longer than ${LIMITS.nameLength} characters`);
  if (typeof doc.description !== 'string' || doc.description.length > LIMITS.descriptionLength) {
    error('description', 'Description must be text');
  }
  if (!CATEGORY_MAP.has(doc.category)) error('category', 'Unknown aircraft category');
  if (!APPLICATION_MAP.has(doc.application)) error('application', 'Unknown application');
  if (!STAGE_MAP.has(doc.stage)) error('stage', 'Unknown design stage');
  if (!Array.isArray(doc.tags) || doc.tags.some((tag) => typeof tag !== 'string')) error('tags', 'Tags must be text');

  if (!isPlainObject(doc.requirements)) {
    error('requirements', 'Requirements must be an object');
  } else {
    for (const field of REQUIREMENT_FIELDS) {
      const entry = doc.requirements[field.key];
      const path = `requirements.${field.key}`;
      if (!isPlainObject(entry)) {
        error(path, 'Missing requirement entry');
        continue;
      }
      if (entry.unit !== field.unit) error(`${path}.unit`, `Unit must be ${field.unit}`);
      if (entry.provenance !== 'requirement') error(`${path}.provenance`, 'Provenance must be "requirement"');
      const message = validateRequirementValue(field.key, entry.value);
      if (message) error(`${path}.value`, message);
    }
  }

  if (!Array.isArray(doc.notes)) {
    error('notes', 'Notes must be a list');
  } else {
    doc.notes.forEach((note, index) => {
      if (!isPlainObject(note) || typeof note.id !== 'string' || typeof note.title !== 'string' || typeof note.body !== 'string') {
        error(`notes.${index}`, 'Invalid note');
      }
    });
  }
  if (!isPlainObject(doc.modules)) {
    error('modules', 'Modules must be an object');
  } else {
    for (const item of validateConfiguration(doc.modules.configuration)) {
      error(item.path ? `modules.configuration.${item.path}` : 'modules.configuration', item.message);
    }
    for (const item of validateComponents(doc.modules.components)) {
      error(item.path ? `modules.components.${item.path}` : 'modules.components', item.message);
    }
    for (const item of validatePropulsion(doc.modules.propulsion)) {
      error(item.path ? `modules.propulsion.${item.path}` : 'modules.propulsion', item.message);
    }
    for (const item of validateSounding(doc.modules.sounding)) {
      error(item.path ? `modules.sounding.${item.path}` : 'modules.sounding', item.message);
    }
    for (const message of validateAerodynamics(doc.modules.aerodynamics)) error('modules.aerodynamics', message);
    for (const message of validateStructures(doc.modules.structures)) error('modules.structures', message);
    for (const message of validateFormulas(doc.modules.formulas)) error('modules.formulas', message);
  }
  if (!isIsoDate(doc.createdAt)) error('createdAt', 'Invalid creation date');
  if (!isIsoDate(doc.updatedAt)) error('updatedAt', 'Invalid modification date');
  if (doc.deletedAt !== null && !isIsoDate(doc.deletedAt)) error('deletedAt', 'Invalid deletion date');
  return errors;
}

/**
 * Coerce an arbitrary (migrated) document into a valid current-schema document.
 * Used on import. Values that cannot be kept are reported in `warnings` rather than silently dropped.
 */
export function sanitizeProject(input, { now = new Date() } = {}) {
  const warnings = [];
  const source = isPlainObject(input) ? input : {};
  const base = createProject(
    {
      name: source.name,
      description: source.description,
      category: source.category,
      application: source.application,
      stage: source.stage,
      tags: Array.isArray(source.tags) ? source.tags : [],
    },
    { now, id: typeof source.id === 'string' && /^prj_[A-Za-z0-9]{6,64}$/.test(source.id) ? source.id : undefined },
  );
  if (typeof source.name !== 'string' || !source.name.trim()) warnings.push('Missing project name; set to "Untitled design".');
  if (source.category !== undefined && source.category !== base.category) warnings.push(`Unknown category "${source.category}"; set to ${base.category}.`);
  if (source.application !== undefined && source.application !== base.application) {
    warnings.push(`Unknown application "${source.application}"; set to ${base.application}.`);
  }

  if (isPlainObject(source.requirements)) {
    for (const field of REQUIREMENT_FIELDS) {
      const entry = source.requirements[field.key];
      if (entry === undefined || entry === null) continue;
      const value = isPlainObject(entry) ? entry.value : entry;
      if (value === null || value === undefined) continue;
      if (isPlainObject(entry) && entry.unit !== undefined && entry.unit !== field.unit) {
        warnings.push(`Requirement "${field.label}" used unit "${entry.unit}" instead of SI "${field.unit}"; value discarded.`);
        continue;
      }
      if (validateRequirementValue(field.key, value) !== null) {
        warnings.push(`Requirement "${field.label}" had an invalid value; it was cleared.`);
        continue;
      }
      base.requirements[field.key] = { ...base.requirements[field.key], value };
    }
  }

  if (Array.isArray(source.notes)) {
    const seen = new Set();
    for (const note of source.notes.slice(0, LIMITS.noteCount)) {
      if (!isPlainObject(note)) continue;
      const id = typeof note.id === 'string' && /^note_[A-Za-z0-9]{6,64}$/.test(note.id) && !seen.has(note.id) ? note.id : uid('note');
      seen.add(id);
      base.notes.push({
        id,
        title: cleanText(note.title, LIMITS.noteTitleLength) || 'Untitled note',
        body: cleanText(note.body, LIMITS.noteBodyLength),
        createdAt: isIsoDate(note.createdAt) ? note.createdAt : base.createdAt,
        updatedAt: isIsoDate(note.updatedAt) ? note.updatedAt : base.createdAt,
      });
    }
  }

  base.modules = isPlainObject(source.modules) ? deepClone(source.modules) : {};
  const config = sanitizeConfiguration(base.modules.configuration, base.category);
  base.modules.configuration = config.configuration;
  warnings.push(...config.warnings);
  const components = sanitizeComponents(base.modules.components);
  base.modules.components = components.components;
  warnings.push(...components.warnings);
  const propulsion = sanitizePropulsion(base.modules.propulsion, defaultPropulsionFor(base.modules.configuration));
  base.modules.propulsion = propulsion.propulsion;
  warnings.push(...propulsion.warnings);
  const sounding = sanitizeSounding(base.modules.sounding);
  base.modules.sounding = { ...sounding.sounding, enabled: base.modules.sounding?.enabled === true };
  warnings.push(...sounding.warnings);
  base.modules.aerodynamics = sanitizeAerodynamics(base.modules.aerodynamics, base.modules.configuration);
  base.modules.structures = sanitizeStructures(base.modules.structures);
  const formulas = sanitizeFormulas(base.modules.formulas);
  base.modules.formulas = formulas.formulas;
  warnings.push(...formulas.warnings);
  if (isIsoDate(source.createdAt)) base.createdAt = source.createdAt;
  if (isIsoDate(source.updatedAt)) base.updatedAt = source.updatedAt;
  base.deletedAt = null;
  if (Number.isInteger(source.revision) && source.revision >= 0) base.revision = source.revision;
  return { doc: base, warnings };
}

/**
 * Document migrations. MIGRATIONS[n] upgrades a document from schema n to n + 1.
 * Each step receives a deep copy and must preserve all user content.
 */
export const MIGRATIONS = Object.freeze({
  /** 1 → 2: add the aircraft configuration (default layout for the project category). Nothing is removed. */
  1: (doc) => {
    const modules = isPlainObject(doc.modules) ? doc.modules : {};
    const category = CATEGORY_MAP.has(doc.category) ? doc.category : 'multirotor';
    const { configuration } = sanitizeConfiguration(modules.configuration, category);
    return { ...doc, modules: { ...modules, configuration } };
  },
  /** 2 → 3: add the (empty) component list and connections. Existing module data is kept. */
  2: (doc) => {
    const modules = isPlainObject(doc.modules) ? doc.modules : {};
    const { components } = sanitizeComponents(modules.components);
    return { ...doc, modules: { ...modules, components } };
  },
  /** 3 → 4: add propulsion (illustrative motor/propeller matched to the configured propeller size). */
  3: (doc) => {
    const modules = isPlainObject(doc.modules) ? doc.modules : {};
    const { propulsion } = sanitizePropulsion(modules.propulsion, defaultPropulsionFor(modules.configuration));
    return { ...doc, modules: { ...modules, propulsion } };
  },
  /** 4 → 5: add the (disabled) balloon glide-sonde mission. */
  4: (doc) => {
    const modules = isPlainObject(doc.modules) ? doc.modules : {};
    const { sounding } = sanitizeSounding(modules.sounding);
    return { ...doc, modules: { ...modules, sounding: { ...sounding, enabled: modules.sounding?.enabled === true } } };
  },
  /** 5 → 6: add aerodynamics (aerofoil preset for the layout), structures and an empty formula list. */
  5: (doc) => {
    const modules = isPlainObject(doc.modules) ? doc.modules : {};
    return {
      ...doc,
      modules: {
        ...modules,
        aerodynamics: sanitizeAerodynamics(modules.aerodynamics, modules.configuration),
        structures: sanitizeStructures(modules.structures),
        formulas: sanitizeFormulas(modules.formulas).formulas,
      },
    };
  },
});

export function migrateProject(doc, { migrations = MIGRATIONS, targetVersion = PROJECT_SCHEMA_VERSION } = {}) {
  if (!isPlainObject(doc)) throw new ProjectFormatError('Project must be a JSON object');
  const fromVersion = doc.schemaVersion;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new ProjectFormatError('The file has no valid schemaVersion, so it is not an AEROLAB X project');
  }
  if (fromVersion > targetVersion) {
    throw new ProjectFormatError(
      `This project uses schema version ${fromVersion}, written by a newer AEROLAB X. ` +
        `This version reads up to schema ${targetVersion}. Update the application, then import again.`,
    );
  }
  let current = doc;
  let version = fromVersion;
  const steps = [];
  while (version < targetVersion) {
    const step = migrations[version];
    if (typeof step !== 'function') throw new ProjectFormatError(`No migration from schema ${version} to ${version + 1}`);
    current = step(deepClone(current));
    version += 1;
    current = { ...current, schemaVersion: version };
    steps.push(`${version - 1}→${version}`);
  }
  return { doc: current, fromVersion, toVersion: version, steps, migrated: steps.length > 0 };
}
