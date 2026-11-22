/**
 * Avionics and electrical components (Build 3).
 *
 * `project.modules.components = { items: Component[], connections: Connection[] }`
 *
 *   Component  { id: 'cmp_…', type, name, catalogueId: string|null, quantity,
 *                provenance: 'illustrative'|'datasheet'|'user-input'|'measured',
 *                source: string, specs: { <field>: number|string|boolean|null }, interfaces: { uart, i2c, … } }
 *   Connection { id: 'con_…', kind: 'power'|'uart'|'i2c'|'spi'|'can'|'pwm'|'usb'|'ethernet', from: cmp id, to: cmp id }
 *
 * Every number is SI (V, A, W, C, kg, Hz). Power connections run from the supplying
 * component to the consumer; signal connections from the controller (flight controller
 * or companion computer) to the device. AEROLAB X never invents manufacturer data: the
 * built-in catalogue (catalogue.js) is labelled "illustrative", and datasheet or measured
 * values must carry a source reference.
 */
import { isPlainObject } from '../utils/immutable.js';
import { uid } from '../utils/id.js';

export const INTERFACE_KINDS = Object.freeze([
  { id: 'uart', label: 'UART (serial)', pointToPoint: true, logic: true },
  { id: 'i2c', label: 'I²C bus', pointToPoint: false, logic: true },
  { id: 'spi', label: 'SPI', pointToPoint: true, logic: true },
  { id: 'can', label: 'CAN bus', pointToPoint: false, logic: false },
  { id: 'pwm', label: 'Motor/servo signal (PWM, DShot)', pointToPoint: true, logic: true },
  { id: 'usb', label: 'USB', pointToPoint: true, logic: false },
  { id: 'ethernet', label: 'Ethernet', pointToPoint: true, logic: false },
]);
export const CONNECTION_KINDS = Object.freeze([{ id: 'power', label: 'Power supply' }, ...INTERFACE_KINDS.map(({ id, label }) => ({ id, label }))]);
const INTERFACE_MAP = new Map(INTERFACE_KINDS.map((k) => [k.id, k]));
export const interfaceKind = (id) => INTERFACE_MAP.get(id);

export const PROVENANCE_OPTIONS = Object.freeze(['illustrative', 'datasheet', 'user-input', 'measured']);

export const CHEMISTRIES = Object.freeze({
  lipo: { label: 'LiPo', nominal: 3.7, min: 3.3, max: 4.2 },
  lihv: { label: 'LiPo HV', nominal: 3.8, min: 3.3, max: 4.35 },
  liion: { label: 'Li-ion', nominal: 3.6, min: 2.8, max: 4.2 },
});

/** Specification fields. `kind`: number (SI unit), enum, boolean. */
export const SPEC_FIELDS = Object.freeze({
  mass: { label: 'Mass', unit: 'kg', displayUnits: ['g', 'kg', 'oz'], min: 0, max: 200 },
  supplyVoltageMin: { label: 'Supply voltage, minimum', unit: 'V', displayUnits: ['V'], min: 0, max: 200 },
  supplyVoltageMax: { label: 'Supply voltage, maximum', unit: 'V', displayUnits: ['V'], min: 0, max: 200 },
  supplyCurrent: { label: 'Maximum current draw', unit: 'A', displayUnits: ['mA', 'A'], min: 0, max: 500, help: 'Worst-case current from its supply. Use the datasheet maximum, not the typical value.' },
  logicLevel: { label: 'Signal logic level', unit: 'V', kind: 'enum', options: [1.8, 3.3, 5], help: 'Voltage of its digital I/O (UART, I²C, SPI, PWM).' },
  tolerant5V: { label: 'Inputs tolerate 5 V', kind: 'boolean', help: 'True when its signal inputs accept 5 V logic without a level shifter.' },
  outputVoltage: { label: 'Output voltage', unit: 'V', displayUnits: ['V'], min: 0.5, max: 100, optional: true, help: 'Voltage of the rail it supplies to other components.' },
  maxOutputCurrent: { label: 'Rated output current', unit: 'A', displayUnits: ['A', 'mA'], min: 0, max: 500, optional: true, help: 'Continuous current the output rail is rated for.' },
  efficiency: { label: 'Conversion efficiency', unit: '1', displayUnits: ['%', '1'], min: 0.3, max: 1, help: 'Output power / input power at the expected load.' },
  chemistry: { label: 'Chemistry', kind: 'enum', options: Object.keys(CHEMISTRIES) },
  cells: { label: 'Cells in series', unit: '1', displayUnits: ['1'], min: 1, max: 24, integer: true },
  capacity: { label: 'Capacity', unit: 'C', displayUnits: ['mAh', 'Ah'], min: 0, max: 1e7 },
  maxContinuousCurrent: { label: 'Rated continuous current', unit: 'A', displayUnits: ['A'], min: 0, max: 2000 },
  loadCurrent: { label: 'Expected operating current (estimate)', unit: 'A', displayUnits: ['A'], min: 0, max: 2000, optional: true, help: 'Your estimate of the current each ESC draws in typical flight. Propulsion models arrive in Build 4.' },
  frequency: { label: 'Radio frequency', unit: 'Hz', displayUnits: ['MHz', 'GHz'], min: 1e6, max: 1e11, optional: true, help: 'Permitted bands and power limits depend on the country of operation.' },
  txPower: { label: 'Transmit power', unit: 'W', displayUnits: ['mW', 'W'], min: 0, max: 100, optional: true },
});

const CONSUMER = ['supplyVoltageMin', 'supplyVoltageMax', 'supplyCurrent', 'logicLevel', 'tolerant5V', 'mass'];

/** Component types: their specification fields, interfaces they may have, and defaults. */
export const COMPONENT_TYPES = Object.freeze([
  { id: 'battery', label: 'Battery', group: 'power', fields: ['chemistry', 'cells', 'capacity', 'maxContinuousCurrent', 'mass'], interfaces: [], supplies: true, quantity: false },
  { id: 'regulator', label: 'Power module / regulator (BEC)', group: 'power', fields: ['supplyVoltageMin', 'supplyVoltageMax', 'outputVoltage', 'maxOutputCurrent', 'efficiency', 'supplyCurrent', 'mass'], interfaces: ['i2c'], supplies: true, quantity: false },
  { id: 'flight-controller', label: 'Flight controller', group: 'control', fields: [...CONSUMER, 'outputVoltage', 'maxOutputCurrent'], interfaces: ['uart', 'i2c', 'spi', 'can', 'pwm', 'usb', 'ethernet'], supplies: 'optional', quantity: false },
  { id: 'companion', label: 'Companion computer', group: 'control', fields: CONSUMER, interfaces: ['uart', 'i2c', 'spi', 'usb', 'ethernet', 'can'], quantity: false },
  { id: 'esc', label: 'Electronic speed controller (ESC)', group: 'propulsion', fields: ['supplyVoltageMin', 'supplyVoltageMax', 'maxContinuousCurrent', 'loadCurrent', 'logicLevel', 'tolerant5V', 'mass'], interfaces: ['pwm', 'uart', 'can'], quantity: true },
  { id: 'receiver', label: 'RC receiver', group: 'link', fields: CONSUMER, interfaces: ['uart', 'pwm'], quantity: false },
  { id: 'telemetry', label: 'Telemetry radio', group: 'link', fields: [...CONSUMER, 'frequency', 'txPower'], interfaces: ['uart', 'usb', 'ethernet'], quantity: false },
  { id: 'gnss', label: 'GNSS receiver (with compass)', group: 'sensor', fields: CONSUMER, interfaces: ['uart', 'i2c', 'can'], quantity: true },
  { id: 'sensor', label: 'Sensor (airspeed, rangefinder, …)', group: 'sensor', fields: CONSUMER, interfaces: ['uart', 'i2c', 'spi', 'can'], quantity: true },
  { id: 'payload', label: 'Payload', group: 'payload', fields: CONSUMER, interfaces: ['uart', 'i2c', 'usb', 'ethernet', 'pwm', 'can'], quantity: true },
]);
const TYPE_MAP = new Map(COMPONENT_TYPES.map((t) => [t.id, t]));
export const componentType = (id) => TYPE_MAP.get(id);

export const LIMITS = Object.freeze({ items: 200, connections: 600, name: 120, source: 500, quantity: 64, ports: 64 });

export const emptyComponents = () => ({ items: [], connections: [] });

const DEFAULT_SPECS = { supplyVoltageMin: 4.5, supplyVoltageMax: 5.5, supplyCurrent: 0.1, logicLevel: 3.3, tolerant5V: false, mass: 0.01, outputVoltage: null, maxOutputCurrent: null, efficiency: 0.9, chemistry: 'lipo', cells: 4, capacity: 5000 * 3.6, maxContinuousCurrent: 30, loadCurrent: null, frequency: null, txPower: null };

/** Create a component (custom, or from a catalogue entry). */
export function createComponent({ type, name, catalogueEntry = null, provenance, source = '', specs = {}, interfaces = {}, quantity = 1 } = {}) {
  const t = componentType(catalogueEntry?.type ?? type);
  if (!t) throw new Error(`Unknown component type "${catalogueEntry?.type ?? type}"`);
  const baseSpecs = { ...(catalogueEntry?.specs ?? {}), ...specs };
  const outSpecs = {};
  for (const key of t.fields) outSpecs[key] = baseSpecs[key] !== undefined ? baseSpecs[key] : DEFAULT_SPECS[key] ?? null;
  const outInterfaces = {};
  for (const kind of t.interfaces) outInterfaces[kind] = Number.isInteger((catalogueEntry?.interfaces ?? interfaces)[kind]) ? (catalogueEntry?.interfaces ?? interfaces)[kind] : 0;
  return {
    id: uid('cmp'),
    type: t.id,
    name: String(name ?? catalogueEntry?.name ?? t.label).slice(0, LIMITS.name),
    catalogueId: catalogueEntry?.catalogueId ?? null,
    quantity: t.quantity ? Math.max(1, Math.min(LIMITS.quantity, Math.round(quantity) || 1)) : 1,
    provenance: provenance ?? (catalogueEntry ? 'illustrative' : 'user-input'),
    source: String(source ?? '').slice(0, LIMITS.source),
    specs: outSpecs,
    interfaces: outInterfaces,
  };
}

export function createConnection({ kind, from, to }) {
  return { id: uid('con'), kind, from, to };
}

/** Can this component supply power to others? */
export function canSupply(item) {
  const t = componentType(item?.type);
  if (!t) return false;
  if (t.supplies === true) return true;
  return t.supplies === 'optional' && typeof item.specs?.outputVoltage === 'number' && item.specs.outputVoltage > 0;
}

/** @returns {string|null} error message */
export function validateSpecValue(key, value) {
  const f = SPEC_FIELDS[key];
  if (!f) return 'Unknown field';
  if (value === null || value === undefined) return f.optional ? null : 'A value is required';
  if (f.kind === 'enum') return f.options.includes(value) ? null : 'Choose one of the options';
  if (f.kind === 'boolean') return typeof value === 'boolean' ? null : 'Must be yes or no';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number';
  if (f.integer && !Number.isInteger(value)) return 'Enter a whole number';
  if (value < f.min || value > f.max) return `Must be between ${f.min} and ${f.max} ${f.unit === '1' ? '' : f.unit}`.trim();
  return null;
}

const ID_RE = (prefix) => new RegExp(`^${prefix}_[A-Za-z0-9]{6,64}$`);

/** Validate stored component data. @returns {{path, message}[]} */
export function validateComponents(data) {
  const errors = [];
  if (!isPlainObject(data)) return [{ path: '', message: 'Components must be an object' }];
  if (!Array.isArray(data.items)) errors.push({ path: 'items', message: 'Items must be a list' });
  if (!Array.isArray(data.connections)) errors.push({ path: 'connections', message: 'Connections must be a list' });
  if (errors.length) return errors;
  if (data.items.length > LIMITS.items) errors.push({ path: 'items', message: `At most ${LIMITS.items} components` });
  if (data.connections.length > LIMITS.connections) errors.push({ path: 'connections', message: `At most ${LIMITS.connections} connections` });
  const ids = new Set();
  data.items.forEach((item, i) => {
    const path = `items.${i}`;
    const t = componentType(item?.type);
    if (!isPlainObject(item) || !t) return errors.push({ path, message: 'Unknown component type' });
    if (!ID_RE('cmp').test(item.id) || ids.has(item.id)) errors.push({ path: `${path}.id`, message: 'Invalid or duplicate id' });
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > LIMITS.name) errors.push({ path: `${path}.name`, message: 'Name is required' });
    if (!PROVENANCE_OPTIONS.includes(item.provenance)) errors.push({ path: `${path}.provenance`, message: 'Unknown provenance' });
    if (typeof item.source !== 'string' || item.source.length > LIMITS.source) errors.push({ path: `${path}.source`, message: 'Source must be text' });
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > LIMITS.quantity || (!t.quantity && item.quantity !== 1)) errors.push({ path: `${path}.quantity`, message: 'Invalid quantity' });
    if (!isPlainObject(item.specs)) errors.push({ path: `${path}.specs`, message: 'Specifications must be an object' });
    else for (const key of t.fields) {
      const message = validateSpecValue(key, item.specs[key]);
      if (message) errors.push({ path: `${path}.specs.${key}`, message: `${SPEC_FIELDS[key].label}: ${message}` });
    }
    if (isPlainObject(item.specs) && typeof item.specs.supplyVoltageMin === 'number' && item.specs.supplyVoltageMin > item.specs.supplyVoltageMax) {
      errors.push({ path: `${path}.specs.supplyVoltageMin`, message: 'Minimum supply voltage is above the maximum' });
    }
    if (!isPlainObject(item.interfaces)) errors.push({ path: `${path}.interfaces`, message: 'Interfaces must be an object' });
    else for (const [kind, count] of Object.entries(item.interfaces)) {
      if (!t.interfaces.includes(kind) || !Number.isInteger(count) || count < 0 || count > LIMITS.ports) errors.push({ path: `${path}.interfaces.${kind}`, message: 'Invalid interface count' });
    }
  });
  const conIds = new Set();
  data.connections.forEach((c, i) => {
    const path = `connections.${i}`;
    if (!isPlainObject(c) || !ID_RE('con').test(c.id) || conIds.has(c.id)) return errors.push({ path, message: 'Invalid connection' });
    conIds.add(c.id);
    if (!CONNECTION_KINDS.some((k) => k.id === c.kind)) errors.push({ path: `${path}.kind`, message: 'Unknown connection kind' });
    if (!ids.has(c.from) || !ids.has(c.to) || c.from === c.to) errors.push({ path, message: 'Connection must join two different existing components' });
  });
  return errors;
}

/** Repair imported/merged component data; keeps what is valid and reports the rest. */
export function sanitizeComponents(input) {
  const warnings = [];
  if (input === undefined) return { components: emptyComponents(), warnings };
  if (!isPlainObject(input)) return { components: emptyComponents(), warnings: ['Invalid component data was discarded.'] };
  const items = [];
  const seen = new Set();
  for (const raw of (Array.isArray(input.items) ? input.items : []).slice(0, LIMITS.items)) {
    const t = componentType(raw?.type);
    if (!isPlainObject(raw) || !t) {
      warnings.push('A component of unknown type was discarded.');
      continue;
    }
    const item = createComponent({ type: t.id, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : t.label, provenance: PROVENANCE_OPTIONS.includes(raw.provenance) ? raw.provenance : 'user-input', source: typeof raw.source === 'string' ? raw.source : '', quantity: raw.quantity });
    if (typeof raw.id === 'string' && ID_RE('cmp').test(raw.id) && !seen.has(raw.id)) item.id = raw.id;
    seen.add(item.id);
    item.catalogueId = typeof raw.catalogueId === 'string' ? raw.catalogueId.slice(0, 80) : null;
    for (const key of t.fields) {
      const value = raw.specs?.[key];
      if (value === undefined) continue;
      if (validateSpecValue(key, value) === null) item.specs[key] = value;
      else warnings.push(`${item.name}: ${SPEC_FIELDS[key].label} was invalid and reset.`);
    }
    if (typeof item.specs.supplyVoltageMin === 'number' && item.specs.supplyVoltageMin > item.specs.supplyVoltageMax) {
      [item.specs.supplyVoltageMin, item.specs.supplyVoltageMax] = [item.specs.supplyVoltageMax, item.specs.supplyVoltageMin];
      warnings.push(`${item.name}: supply voltage limits were swapped.`);
    }
    for (const kind of t.interfaces) {
      const count = raw.interfaces?.[kind];
      if (Number.isInteger(count) && count >= 0 && count <= LIMITS.ports) item.interfaces[kind] = count;
    }
    items.push(item);
  }
  const connections = [];
  const conSeen = new Set();
  for (const raw of (Array.isArray(input.connections) ? input.connections : []).slice(0, LIMITS.connections)) {
    if (!isPlainObject(raw) || !CONNECTION_KINDS.some((k) => k.id === raw.kind) || !seen.has(raw.from) || !seen.has(raw.to) || raw.from === raw.to) {
      warnings.push('A connection to a missing component was discarded.');
      continue;
    }
    const id = typeof raw.id === 'string' && ID_RE('con').test(raw.id) && !conSeen.has(raw.id) ? raw.id : uid('con');
    conSeen.add(id);
    connections.push({ id, kind: raw.kind, from: raw.from, to: raw.to });
  }
  return { components: { items, connections }, warnings };
}
