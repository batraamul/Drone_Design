/**
 * Unit system. AEROLAB X stores every engineering quantity in SI units.
 * Conversions to display units are explicit and happen only at the UI boundary.
 *
 * Each unit is defined by a factor to the SI unit of its dimension
 * (value_SI = value × factor), except temperature, which is affine.
 * Exact definitions are used where they exist (e.g. 1 kn = 1852/3600 m/s,
 * 1 lb = 0.45359237 kg, 1 ft = 0.3048 m, 1 Wh = 3600 J).
 */

export const DIMENSIONS = Object.freeze({
  mass: { si: 'kg', label: 'Mass', units: { kg: 1, g: 1e-3, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125 } },
  length: {
    si: 'm',
    label: 'Length',
    units: { m: 1, mm: 1e-3, cm: 1e-2, km: 1e3, ft: 0.3048, in: 0.0254, mi: 1609.344, nmi: 1852 },
  },
  area: { si: 'm²', label: 'Area', units: { 'm²': 1, 'cm²': 1e-4, 'mm²': 1e-6, 'ft²': 0.09290304 } },
  volume: { si: 'm³', label: 'Volume', units: { 'm³': 1, L: 1e-3, mL: 1e-6, 'cm³': 1e-6 } },
  time: { si: 's', label: 'Time', units: { s: 1, ms: 1e-3, min: 60, h: 3600 } },
  speed: {
    si: 'm/s',
    label: 'Speed',
    units: { 'm/s': 1, 'km/h': 1 / 3.6, kn: 1852 / 3600, mph: 0.44704, 'ft/s': 0.3048, 'ft/min': 0.00508 },
  },
  acceleration: { si: 'm/s²', label: 'Acceleration', units: { 'm/s²': 1, g0: 9.80665 } },
  force: { si: 'N', label: 'Force', units: { N: 1, kN: 1e3, kgf: 9.80665, gf: 9.80665e-3, lbf: 4.4482216152605 } },
  torque: { si: 'N·m', label: 'Torque', units: { 'N·m': 1, 'N·mm': 1e-3, 'kgf·cm': 0.0980665 } },
  pressure: {
    si: 'Pa',
    label: 'Pressure',
    units: { Pa: 1, hPa: 100, kPa: 1e3, MPa: 1e6, GPa: 1e9, bar: 1e5, mbar: 100, atm: 101325, psi: 6894.757293168, inHg: 3386.389 },
  },
  density: { si: 'kg/m³', label: 'Density', units: { 'kg/m³': 1, 'g/cm³': 1000 } },
  energy: { si: 'J', label: 'Energy', units: { J: 1, kJ: 1e3, MJ: 1e6, mWh: 3.6, Wh: 3600, kWh: 3.6e6 } },
  power: { si: 'W', label: 'Power', units: { W: 1, mW: 1e-3, kW: 1e3, hp: 745.6998715822702 } },
  charge: { si: 'C', label: 'Electric charge', units: { C: 1, mAh: 3.6, Ah: 3600 } },
  voltage: { si: 'V', label: 'Voltage', units: { V: 1, mV: 1e-3, kV: 1e3 } },
  current: { si: 'A', label: 'Current', units: { A: 1, mA: 1e-3 } },
  resistance: { si: 'Ω', label: 'Resistance', units: { 'Ω': 1, 'mΩ': 1e-3, 'kΩ': 1e3 } },
  frequency: { si: 'Hz', label: 'Frequency', units: { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 } },
  angle: { si: 'rad', label: 'Angle', units: { rad: 1, deg: Math.PI / 180 } },
  angularVelocity: { si: 'rad/s', label: 'Angular velocity', units: { 'rad/s': 1, 'deg/s': Math.PI / 180, rpm: (2 * Math.PI) / 60 } },
  temperature: { si: 'K', label: 'Temperature', units: { K: null, '°C': null, '°F': null } },
  dynamicViscosity: { si: 'Pa·s', label: 'Dynamic viscosity', units: { 'Pa·s': 1, 'mPa·s': 1e-3 } },
  kinematicViscosity: { si: 'm²/s', label: 'Kinematic viscosity', units: { 'm²/s': 1, 'mm²/s': 1e-6 } },
  motorConstant: { si: 'rpm/V', label: 'Motor velocity constant', units: { 'rpm/V': 1 } },
  temperatureDifference: { si: 'ΔK', label: 'Temperature difference', units: { 'ΔK': 1, 'Δ°C': 1 } },
  dimensionless: { si: '1', label: 'Dimensionless', units: { 1: 1, '%': 0.01 } },
});

const UNIT_INDEX = new Map();
for (const [dimension, definition] of Object.entries(DIMENSIONS)) {
  for (const unit of Object.keys(definition.units)) {
    if (UNIT_INDEX.has(unit)) throw new Error(`Duplicate unit symbol "${unit}"`);
    UNIT_INDEX.set(unit, dimension);
  }
}

export class UnitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnitError';
  }
}

export function isKnownUnit(unit) {
  return UNIT_INDEX.has(unit);
}

export function dimensionOf(unit) {
  const dimension = UNIT_INDEX.get(unit);
  if (!dimension) throw new UnitError(`Unknown unit "${unit}"`);
  return dimension;
}

export function siUnitOf(dimension) {
  const definition = DIMENSIONS[dimension];
  if (!definition) throw new UnitError(`Unknown dimension "${dimension}"`);
  return definition.si;
}

export function unitsFor(dimension) {
  const definition = DIMENSIONS[dimension];
  if (!definition) throw new UnitError(`Unknown dimension "${dimension}"`);
  return Object.keys(definition.units);
}

function assertFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnitError(`Expected a finite number, received ${String(value)}`);
  }
}

/** Convert a value expressed in `unit` into the SI unit of its dimension. */
export function toSI(value, unit) {
  assertFiniteNumber(value);
  const dimension = dimensionOf(unit);
  if (dimension === 'temperature') {
    if (unit === 'K') return value;
    if (unit === '°C') return value + 273.15;
    return ((value - 32) * 5) / 9 + 273.15;
  }
  return value * DIMENSIONS[dimension].units[unit];
}

/** Convert an SI value into `unit`. */
export function fromSI(value, unit) {
  assertFiniteNumber(value);
  const dimension = dimensionOf(unit);
  if (dimension === 'temperature') {
    if (unit === 'K') return value;
    if (unit === '°C') return value - 273.15;
    return ((value - 273.15) * 9) / 5 + 32;
  }
  return value / DIMENSIONS[dimension].units[unit];
}

/** Convert between two units of the same dimension. */
export function convert(value, fromUnit, toUnit) {
  const fromDimension = dimensionOf(fromUnit);
  const toDimension = dimensionOf(toUnit);
  if (fromDimension !== toDimension) {
    throw new UnitError(`Cannot convert ${fromUnit} (${fromDimension}) to ${toUnit} (${toDimension})`);
  }
  if (fromUnit === toUnit) {
    assertFiniteNumber(value);
    return value;
  }
  return fromSI(toSI(value, fromUnit), toUnit);
}
