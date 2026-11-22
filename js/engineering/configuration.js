/**
 * Aircraft configuration schema (Build 2).
 *
 * `project.modules.configuration` records the layout chosen for the aircraft and its
 * key geometric parameters, all in SI units:
 *
 *   { layout: 'quad-x', options: { propulsion: 'tractor' }, params: { armLength: 0.225, ... } }
 *
 * Each layout belongs to one project category and one geometry family. The family
 * decides which parameters apply and which geometry model (js/engineering/geometry.js)
 * derives values from them. Every parameter is a user input (provenance "user-input");
 * the defaults are illustrative starting points, not data about any real aircraft.
 */
import { isPlainObject } from '../utils/immutable.js';

const DEG = Math.PI / 180;

/** Parameter definitions. `families` lists the geometry families a parameter belongs to. */
export const CONFIG_PARAMS = Object.freeze([
  // ---- Multirotor -------------------------------------------------------------------------
  { key: 'armLength', label: 'Rotor distance from centre', symbol: 'R', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.01, max: 5, families: ['multirotor'], help: 'Distance from the aircraft centre to each rotor axis (half the motor-to-motor diagonal on a symmetric frame).' },
  { key: 'propDiameter', label: 'Propeller diameter', symbol: 'D', unit: 'm', displayUnits: ['in', 'mm', 'cm', 'm'], min: 0.01, max: 3, families: ['multirotor', 'fixed-wing', 'vtol'], help: 'Tip-to-tip diameter of one propeller (for winged aircraft: the cruise propeller).' },
  { key: 'bodyDiameter', label: 'Central body width', symbol: 'd_b', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 3, families: ['multirotor'], help: 'Width of the central body (hub) seen from above.' },
  { key: 'bodyHeight', label: 'Central body height', symbol: 'h_b', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 2, families: ['multirotor'], help: 'Height of the central body.' },
  { key: 'frameRatio', label: 'H-frame length-to-width ratio', symbol: 'k_H', unit: '1', displayUnits: ['1'], min: 0.4, max: 3, families: ['multirotor'], layouts: ['quad-h'], help: 'Fore–aft rotor spacing divided by left–right rotor spacing. 1 gives a square layout.' },
  { key: 'coaxialSpacing', label: 'Coaxial rotor spacing', symbol: 'Δz', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 1, families: ['multirotor'], coaxialOnly: true, help: 'Vertical distance between the upper and lower rotor on one axis.' },

  // ---- Wing and fuselage (fixed wing and VTOL) ----------------------------------------------
  { key: 'span', label: 'Wing span', symbol: 'b', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'ft', 'in'], min: 0.05, max: 40, families: ['fixed-wing', 'vtol'], help: 'Tip-to-tip span of the wing, measured in plan view.' },
  { key: 'rootChord', label: 'Root chord', symbol: 'c_r', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.01, max: 10, families: ['fixed-wing', 'vtol'], help: 'Wing chord at the aircraft centreline.' },
  { key: 'taperRatio', label: 'Taper ratio', symbol: 'λ', unit: '1', displayUnits: ['1'], min: 0.02, max: 1.5, families: ['fixed-wing', 'vtol'], help: 'Tip chord divided by root chord. 1 is a rectangular wing.' },
  { key: 'sweepLE', label: 'Leading-edge sweep', symbol: 'Λ_LE', unit: 'rad', displayUnits: ['deg', 'rad'], min: -40 * DEG, max: 75 * DEG, families: ['fixed-wing', 'vtol'], help: 'Angle of the leading edge behind the spanwise direction. Positive is swept back.' },
  { key: 'dihedral', label: 'Dihedral', symbol: 'Γ', unit: 'rad', displayUnits: ['deg', 'rad'], min: -20 * DEG, max: 30 * DEG, families: ['fixed-wing', 'vtol'], help: 'Upward angle of each wing panel from the horizontal, seen from the front.' },
  { key: 'fuselageLength', label: 'Fuselage length', symbol: 'L_f', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'ft', 'in'], min: 0.02, max: 30, families: ['fixed-wing', 'vtol'], help: 'Nose-to-tail length of the fuselage or central pod.' },
  { key: 'fuselageDiameter', label: 'Fuselage diameter', symbol: 'd_f', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 5, families: ['fixed-wing', 'vtol'], help: 'Largest diameter (or equivalent width) of the fuselage.' },
  { key: 'wingPosition', label: 'Wing leading edge from nose', symbol: 'x_w', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0, max: 30, families: ['fixed-wing', 'vtol'], help: 'Distance from the fuselage nose to the wing root leading edge.' },
  { key: 'tailArm', label: 'Tail arm', symbol: 'l_t', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0.02, max: 30, families: ['fixed-wing', 'vtol'], tail: true, help: 'Distance from the wing quarter-chord point to the tail quarter-chord point.' },
  { key: 'hTailSpan', label: 'Horizontal tail span', symbol: 'b_h', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0.01, max: 20, families: ['fixed-wing', 'vtol'], tail: true, help: 'Span of the horizontal tail. For a V-tail: tip-to-tip span of the V seen from above.' },
  { key: 'hTailChord', label: 'Horizontal tail chord', symbol: 'c_h', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 5, families: ['fixed-wing', 'vtol'], tail: true, help: 'Mean chord of the horizontal tail (or of each V-tail panel).' },
  { key: 'vTailHeight', label: 'Vertical tail height', symbol: 'h_v', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0.005, max: 10, families: ['fixed-wing', 'vtol'], tail: true, conventionalTailOnly: true, help: 'Height of the vertical fin above the fuselage centreline.' },
  { key: 'vTailChord', label: 'Vertical tail chord', symbol: 'c_v', unit: 'm', displayUnits: ['mm', 'cm', 'm', 'in'], min: 0.005, max: 5, families: ['fixed-wing', 'vtol'], tail: true, conventionalTailOnly: true, help: 'Mean chord of the vertical fin.' },
  { key: 'vTailAngle', label: 'V-tail dihedral', symbol: 'Γ_v', unit: 'rad', displayUnits: ['deg', 'rad'], min: 10 * DEG, max: 60 * DEG, families: ['fixed-wing', 'vtol'], layouts: ['v-tail'], help: 'Angle of each V-tail panel above the horizontal.' },

  // ---- VTOL lift system -----------------------------------------------------------------------
  { key: 'liftPropDiameter', label: 'Lift propeller diameter', symbol: 'D_L', unit: 'm', displayUnits: ['in', 'mm', 'cm', 'm'], min: 0.01, max: 3, families: ['vtol'], help: 'Diameter of each rotor used for vertical flight.' },
  { key: 'liftRotorY', label: 'Lift rotor lateral position', symbol: 'y_L', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0, max: 20, families: ['vtol'], layouts: ['quadplane'], help: 'Distance from the centreline to each lift-rotor boom.' },
  { key: 'liftRotorX', label: 'Lift rotor fore–aft offset', symbol: 'x_L', unit: 'm', displayUnits: ['m', 'cm', 'mm', 'in'], min: 0.01, max: 20, families: ['vtol'], layouts: ['quadplane'], help: 'Distance of the front and the rear lift rotors from the wing quarter-chord point.' },
]);

const PARAM_MAP = new Map(CONFIG_PARAMS.map((p) => [p.key, p]));
export const configParam = (key) => PARAM_MAP.get(key);

/**
 * Layouts. family: geometry model used. rotor: rotor arrangement for multirotor
 * families (pattern, count of rotor axes, coaxial). tail: 'conventional' | 'v' | 'none'.
 * modelled: false means the layout is recorded but no geometry model exists in this build.
 */
export const LAYOUTS = Object.freeze([
  { id: 'quad-x', category: 'multirotor', family: 'multirotor', label: 'Quadcopter X', rotor: { pattern: 'x', axes: 4 }, summary: 'Four rotors on diagonal arms; the most common small multirotor.' },
  { id: 'quad-plus', category: 'multirotor', family: 'multirotor', label: 'Quadcopter +', rotor: { pattern: 'plus', axes: 4 }, summary: 'Four rotors with one arm pointing forward.' },
  { id: 'quad-h', category: 'multirotor', family: 'multirotor', label: 'Quadcopter H', rotor: { pattern: 'h', axes: 4 }, summary: 'Four rotors at the corners of a rectangle; room for a long central body.' },
  { id: 'tri-y', category: 'multirotor', family: 'multirotor', label: 'Tricopter Y', rotor: { pattern: 'y', axes: 3 }, summary: 'Three rotors; yaw needs a tilting rear motor (not modelled here).' },
  { id: 'hexa-x', category: 'multirotor', family: 'multirotor', label: 'Hexacopter X', rotor: { pattern: 'x', axes: 6 }, summary: 'Six rotors; can tolerate the loss of one motor with a suitable controller.' },
  { id: 'hexa-plus', category: 'multirotor', family: 'multirotor', label: 'Hexacopter +', rotor: { pattern: 'plus', axes: 6 }, summary: 'Six rotors with one arm pointing forward.' },
  { id: 'octo-x', category: 'multirotor', family: 'multirotor', label: 'Octocopter X', rotor: { pattern: 'x', axes: 8 }, summary: 'Eight rotors for heavy payloads and redundancy.' },
  { id: 'octo-plus', category: 'multirotor', family: 'multirotor', label: 'Octocopter +', rotor: { pattern: 'plus', axes: 8 }, summary: 'Eight rotors with one arm pointing forward.' },
  { id: 'y6', category: 'multirotor', family: 'multirotor', label: 'Coaxial Y6', rotor: { pattern: 'y', axes: 3, coaxial: true }, summary: 'Three arms, two counter-rotating rotors on each.' },
  { id: 'x8', category: 'multirotor', family: 'multirotor', label: 'Coaxial X8', rotor: { pattern: 'x', axes: 4, coaxial: true }, summary: 'Four arms, two counter-rotating rotors on each; compact and redundant.' },

  { id: 'conventional', category: 'fixed-wing', family: 'fixed-wing', label: 'Conventional', tail: 'conventional', propulsion: true, summary: 'Wing, fuselage and a rear horizontal and vertical tail.' },
  { id: 'v-tail', category: 'fixed-wing', family: 'fixed-wing', label: 'V-tail', tail: 'v', propulsion: true, summary: 'Two inclined tail panels replace the horizontal and vertical tail.' },
  { id: 'flying-wing', category: 'fixed-wing', family: 'fixed-wing', label: 'Flying wing', tail: 'none', propulsion: true, summary: 'Tailless swept wing; pitch stability comes from sweep and reflex.' },
  { id: 'delta', category: 'fixed-wing', family: 'fixed-wing', label: 'Delta wing', tail: 'none', propulsion: true, summary: 'Highly swept triangular wing with low taper.' },
  { id: 'glider', category: 'fixed-wing', family: 'fixed-wing', label: 'Glider', tail: 'conventional', propulsion: false, summary: 'High-aspect-ratio unpowered wing with a conventional tail.' },

  { id: 'quadplane', category: 'vtol', family: 'vtol', label: 'Quadplane (lift + cruise)', tail: 'conventional', propulsion: true, lift: 'quadplane', summary: 'A fixed-wing aircraft with four separate lift rotors on two booms.' },
  { id: 'tiltrotor-tri', category: 'vtol', family: 'vtol', label: 'Tilt-rotor (tri)', tail: 'conventional', propulsion: false, lift: 'tiltrotor', summary: 'Two tilting rotors on the wing plus one rear lift rotor.' },
  { id: 'tailsitter', category: 'vtol', family: 'vtol', label: 'Tailsitter', tail: 'none', propulsion: false, lift: 'tailsitter', summary: 'A flying wing that takes off standing on its tail, pulled by four rotors.' },

  { id: 'coaxial-single', category: 'special', family: 'multirotor', label: 'Coaxial single-axis', rotor: { pattern: 'single', axes: 1, coaxial: true }, summary: 'Two counter-rotating rotors on one central axis.' },
  { id: 'tethered-quad', category: 'special', family: 'multirotor', label: 'Tethered multirotor', rotor: { pattern: 'x', axes: 4 }, tethered: true, summary: 'Quadcopter powered and held through a ground tether (tether not modelled in this build).' },
  { id: 'solar-glider', category: 'special', family: 'fixed-wing', label: 'Solar-assisted glider', tail: 'conventional', propulsion: true, summary: 'High-aspect-ratio powered glider for solar-assisted endurance research.' },
  { id: 'balloon-assisted', category: 'special', family: 'none', label: 'Balloon-assisted platform', summary: 'Lighter-than-air lifted research platform. Geometry is not modelled in this build.' },

  { id: 'micro-quad', category: 'micro', family: 'multirotor', label: 'Micro quadcopter', rotor: { pattern: 'x', axes: 4 }, summary: 'Palm-sized quadcopter with ducted or open micro propellers.' },
  { id: 'flapping-wing', category: 'micro', family: 'none', label: 'Flapping-wing concept', summary: 'Bio-inspired flapping-wing concept for education. Geometry is modelled in the Micro Drone Laboratory (later build).' },
]);

const LAYOUT_MAP = new Map(LAYOUTS.map((l) => [l.id, l]));
export const layoutInfo = (id) => LAYOUT_MAP.get(id);
export const layoutsFor = (category) => LAYOUTS.filter((l) => l.category === category);

export const PROPULSION_OPTIONS = Object.freeze([
  { id: 'tractor', label: 'Tractor (propeller at the nose)' },
  { id: 'pusher', label: 'Pusher (propeller at the tail)' },
]);

/** Parameters that apply to a layout, in display order. */
export function paramsFor(layoutId) {
  const layout = layoutInfo(layoutId);
  if (!layout || layout.family === 'none') return [];
  return CONFIG_PARAMS.filter((p) => {
    if (!p.families.includes(layout.family)) return false;
    if (p.layouts && !p.layouts.includes(layout.id)) return false;
    if (p.coaxialOnly && !layout.rotor?.coaxial) return false;
    if (layout.family === 'multirotor' && layout.rotor?.pattern === 'single' && p.key === 'armLength') return false;
    if (p.tail && layout.tail === 'none') return false;
    if (p.conventionalTailOnly && layout.tail !== 'conventional') return false;
    if (p.key === 'propDiameter' && layout.family !== 'multirotor' && !layout.propulsion) return false;
    return true;
  });
}

// Illustrative defaults (round numbers for a small class of each layout).
const MULTI = { armLength: 0.225, propDiameter: 0.254, bodyDiameter: 0.12, bodyHeight: 0.06, frameRatio: 1.4, coaxialSpacing: 0.06 };
const WING = {
  span: 2.0, rootChord: 0.3, taperRatio: 0.6, sweepLE: 3 * DEG, dihedral: 3 * DEG,
  fuselageLength: 1.3, fuselageDiameter: 0.12, wingPosition: 0.35, tailArm: 0.8,
  hTailSpan: 0.6, hTailChord: 0.16, vTailHeight: 0.25, vTailChord: 0.18, vTailAngle: 35 * DEG, propDiameter: 0.3302,
};
const LAYOUT_DEFAULTS = {
  'quad-h': { armLength: 0.25, bodyDiameter: 0.1 },
  'hexa-x': { armLength: 0.35, propDiameter: 0.3048 },
  'hexa-plus': { armLength: 0.35, propDiameter: 0.3048 },
  'octo-x': { armLength: 0.45, propDiameter: 0.3048, bodyDiameter: 0.18 },
  'octo-plus': { armLength: 0.45, propDiameter: 0.3048, bodyDiameter: 0.18 },
  y6: { armLength: 0.3, propDiameter: 0.3048 },
  x8: { armLength: 0.3, propDiameter: 0.3048 },
  'coaxial-single': { propDiameter: 0.6, bodyDiameter: 0.12, bodyHeight: 0.25, coaxialSpacing: 0.12 },
  'micro-quad': { armLength: 0.05, propDiameter: 0.0508, bodyDiameter: 0.035, bodyHeight: 0.025 },
  'flying-wing': { span: 1.6, rootChord: 0.4, taperRatio: 0.4, sweepLE: 28 * DEG, dihedral: 0, fuselageLength: 0.5, fuselageDiameter: 0.1, wingPosition: 0.05 },
  delta: { span: 1.2, rootChord: 0.9, taperRatio: 0.05, sweepLE: 55 * DEG, dihedral: 0, fuselageLength: 1.0, fuselageDiameter: 0.1, wingPosition: 0.1 },
  glider: { span: 3.5, rootChord: 0.24, taperRatio: 0.5, sweepLE: 1 * DEG, dihedral: 4 * DEG, fuselageLength: 1.5, fuselageDiameter: 0.08, wingPosition: 0.4, tailArm: 1.0, hTailSpan: 0.55, hTailChord: 0.12 },
  'solar-glider': { span: 4.0, rootChord: 0.28, taperRatio: 0.6, sweepLE: 0, dihedral: 4 * DEG, fuselageLength: 1.8, fuselageDiameter: 0.1, wingPosition: 0.45, tailArm: 1.2, hTailSpan: 0.7, hTailChord: 0.14, vTailHeight: 0.3, vTailChord: 0.2 },
  quadplane: { liftPropDiameter: 0.381, liftRotorY: 0.45, liftRotorX: 0.45 },
  'tiltrotor-tri': { span: 1.8, liftPropDiameter: 0.3556 },
  tailsitter: { span: 1.2, rootChord: 0.35, taperRatio: 0.5, sweepLE: 25 * DEG, dihedral: 0, fuselageLength: 0.4, fuselageDiameter: 0.1, wingPosition: 0.02, liftPropDiameter: 0.254 },
};

export function defaultLayout(category) {
  return layoutsFor(category)[0]?.id ?? 'quad-x';
}

/** A complete, valid configuration for a layout, using illustrative defaults. */
export function defaultConfiguration(layoutOrCategory = 'quad-x') {
  const layoutId = layoutInfo(layoutOrCategory) ? layoutOrCategory : defaultLayout(layoutOrCategory);
  const layout = layoutInfo(layoutId);
  const base = { ...(layout.family === 'multirotor' ? MULTI : WING), ...(layout.family === 'vtol' ? { liftPropDiameter: 0.381, liftRotorY: 0.45, liftRotorX: 0.45 } : {}), ...(LAYOUT_DEFAULTS[layoutId] ?? {}) };
  const params = {};
  for (const p of paramsFor(layoutId)) params[p.key] = base[p.key];
  return { layout: layoutId, options: layout.propulsion ? { propulsion: layoutId === 'flying-wing' ? 'pusher' : 'tractor' } : {}, params };
}

/**
 * Change layout and keep every parameter value that still applies (same geometry family).
 * Parameters new to the layout, or a change of family, take the layout's example values.
 */
export function switchLayout(configuration, layoutId) {
  const next = defaultConfiguration(layoutId);
  // Values carry over only within the same geometry family (a plane's propeller is not a multirotor's).
  if (layoutInfo(configuration?.layout)?.family !== layoutInfo(layoutId).family) return next;
  const old = isPlainObject(configuration?.params) ? configuration.params : {};
  const from = layoutInfo(configuration.layout);
  const to = layoutInfo(layoutId);
  // A different rotor arrangement needs its own arm length and propeller size (or the discs may overlap).
  const rearranged = to.family === 'multirotor' && (from.rotor?.axes !== to.rotor?.axes || Boolean(from.rotor?.coaxial) !== Boolean(to.rotor?.coaxial));
  for (const key of Object.keys(next.params)) {
    if (rearranged && (key === 'armLength' || key === 'propDiameter')) continue;
    if (validateParamValue(key, old[key]) === null) next.params[key] = old[key];
  }
  if (next.options.propulsion && PROPULSION_OPTIONS.some((o) => o.id === configuration?.options?.propulsion)) next.options.propulsion = configuration.options.propulsion;
  return next;
}

/** @returns {string|null} error message, or null when valid */
export function validateParamValue(key, value) {
  const p = configParam(key);
  if (!p) return 'Unknown parameter';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number';
  if (value < p.min || value > p.max) return `Must be between ${formatLimit(p.min, p.unit)} and ${formatLimit(p.max, p.unit)}`;
  return null;
}

function formatLimit(value, unit) {
  if (unit === 'rad') return `${Math.round(value / DEG)}°`;
  if (unit === 'm' && value < 1) return `${+(value * 1000).toPrecision(3)} mm`;
  return `${+value.toPrecision(4)}${unit === '1' ? '' : ` ${unit}`}`;
}

/** Cross-parameter consistency rules that make a geometry impossible to draw. */
export function validateConsistency(configuration) {
  const errors = [];
  const p = configuration?.params ?? {};
  const layout = layoutInfo(configuration?.layout);
  if (!layout) return errors;
  if ((layout.family === 'fixed-wing' || layout.family === 'vtol') && p.wingPosition !== undefined && p.fuselageLength !== undefined && p.wingPosition >= p.fuselageLength) {
    errors.push({ path: 'params.wingPosition', message: 'The wing leading edge must lie within the fuselage length' });
  }
  return errors;
}

/** Validate a stored configuration. @returns {{path, message}[]} */
export function validateConfiguration(configuration) {
  const errors = [];
  if (!isPlainObject(configuration)) return [{ path: '', message: 'Configuration must be an object' }];
  const layout = layoutInfo(configuration.layout);
  if (!layout) errors.push({ path: 'layout', message: `Unknown layout "${configuration.layout}"` });
  if (!isPlainObject(configuration.options)) errors.push({ path: 'options', message: 'Options must be an object' });
  else if (configuration.options.propulsion !== undefined && !PROPULSION_OPTIONS.some((o) => o.id === configuration.options.propulsion)) {
    errors.push({ path: 'options.propulsion', message: 'Unknown propulsion arrangement' });
  }
  if (!isPlainObject(configuration.params)) return [...errors, { path: 'params', message: 'Parameters must be an object' }];
  if (layout) {
    for (const p of paramsFor(layout.id)) {
      const message = validateParamValue(p.key, configuration.params[p.key]);
      if (message) errors.push({ path: `params.${p.key}`, message: `${p.label}: ${message}` });
    }
    errors.push(...validateConsistency(configuration));
  }
  return errors;
}

/**
 * Repair an imported or merged configuration: keep every valid value, replace
 * the rest with defaults, and report what changed.
 */
export function sanitizeConfiguration(input, category) {
  const warnings = [];
  const source = isPlainObject(input) ? input : null;
  if (!source) return { configuration: defaultConfiguration(category), warnings: input === undefined ? [] : ['Invalid configuration; replaced with the default layout.'] };
  const layoutId = layoutInfo(source.layout) ? source.layout : defaultLayout(category);
  if (layoutId !== source.layout) warnings.push(`Unknown layout "${source.layout}"; set to ${layoutInfo(layoutId).label}.`);
  const result = defaultConfiguration(layoutId);
  const params = isPlainObject(source.params) ? source.params : {};
  for (const key of Object.keys(result.params)) {
    if (params[key] === undefined) continue;
    if (validateParamValue(key, params[key]) === null) result.params[key] = params[key];
    else warnings.push(`Configuration value "${configParam(key).label}" was invalid; reset to the default.`);
  }
  const propulsion = source.options?.propulsion;
  if (result.options.propulsion && PROPULSION_OPTIONS.some((o) => o.id === propulsion)) result.options.propulsion = propulsion;
  if (validateConsistency(result).length) {
    result.params.wingPosition = defaultConfiguration(layoutId).params.wingPosition;
    warnings.push('Wing position was outside the fuselage; reset to the default.');
  }
  return { configuration: result, warnings };
}
