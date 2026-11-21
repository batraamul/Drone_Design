/**
 * Design requirements (targets) and requirement-consistency checks.
 *
 * Requirements are user-set targets stored in SI units. The checks below use
 * only exact kinematics or standard models, so every warning can show the
 * equation and the inputs that triggered it. They check whether the targets are
 * mutually consistent. They say nothing about whether a particular design can
 * meet them: that needs the propulsion, energy and aerodynamic models of later builds.
 */
import { isa, MIN_ALTITUDE, MAX_ALTITUDE } from './atmosphere.js';

export const REQUIREMENT_FIELDS = Object.freeze([
  {
    key: 'maxTakeoffMass',
    label: 'Maximum take-off mass (MTOW)',
    symbol: 'm_TO',
    dimension: 'mass',
    unit: 'kg',
    displayUnits: ['kg', 'g', 'lb'],
    positive: true,
    help: 'Upper limit of all-up mass at take-off, including payload, energy storage and structure.',
  },
  {
    key: 'payloadMass',
    label: 'Payload mass',
    symbol: 'm_pl',
    dimension: 'mass',
    unit: 'kg',
    displayUnits: ['kg', 'g', 'lb'],
    positive: false,
    help: 'Mass of the civilian mission payload the design must carry (camera, sensors, instruments).',
  },
  {
    key: 'endurance',
    label: 'Endurance',
    symbol: 't_E',
    dimension: 'time',
    unit: 's',
    displayUnits: ['min', 's', 'h'],
    positive: true,
    help: 'Required flight time from take-off to landing, excluding energy reserve.',
  },
  {
    key: 'range',
    label: 'Range (total flight distance)',
    symbol: 'R',
    dimension: 'length',
    unit: 'm',
    displayUnits: ['km', 'm', 'nmi', 'mi'],
    positive: true,
    help: 'Total distance the aircraft must fly in one sortie (for an out-and-back mission, both legs).',
  },
  {
    key: 'cruiseSpeed',
    label: 'Cruise airspeed',
    symbol: 'V_c',
    dimension: 'speed',
    unit: 'm/s',
    displayUnits: ['m/s', 'km/h', 'kn'],
    positive: true,
    help: 'Intended steady cruise true airspeed.',
  },
  {
    key: 'operatingAltitude',
    label: 'Operating altitude (AMSL)',
    symbol: 'h',
    dimension: 'length',
    unit: 'm',
    displayUnits: ['m', 'ft', 'km'],
    positive: false,
    allowNegative: true,
    min: MIN_ALTITUDE,
    max: MAX_ALTITUDE,
    help: 'Typical altitude above mean sea level where the aircraft operates. Used for standard-atmosphere air properties.',
  },
  {
    key: 'maxWindSpeed',
    label: 'Maximum operating wind speed',
    symbol: 'V_w',
    dimension: 'speed',
    unit: 'm/s',
    displayUnits: ['m/s', 'km/h', 'kn'],
    positive: false,
    help: 'Highest steady wind speed in which the mission must still be possible.',
  },
]);

export const REQUIREMENT_KEYS = Object.freeze(REQUIREMENT_FIELDS.map((field) => field.key));

export function requirementField(key) {
  return REQUIREMENT_FIELDS.find((field) => field.key === key);
}

/** Empty requirement set with every target unset. */
export function emptyRequirements() {
  const requirements = {};
  for (const field of REQUIREMENT_FIELDS) {
    requirements[field.key] = { value: null, unit: field.unit, provenance: 'requirement' };
  }
  return requirements;
}

/**
 * Validate a single SI value for a requirement field.
 * @returns {string|null} error message or null when valid (null/undefined value = "not set" is valid)
 */
export function validateRequirementValue(key, value) {
  const field = requirementField(key);
  if (!field) return `Unknown requirement "${key}"`;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a finite number';
  if (field.positive && value <= 0) return 'Must be greater than zero';
  if (!field.positive && !field.allowNegative && value < 0) return 'Must not be negative';
  if (field.min !== undefined && value < field.min) return `Must be at least ${field.min} ${field.unit}`;
  if (field.max !== undefined && value > field.max) return `Must be at most ${Math.round(field.max)} ${field.unit}`;
  return null;
}

function valueOf(requirements, key) {
  const value = requirements?.[key]?.value;
  return typeof value === 'number' && Number.isFinite(value) && validateRequirementValue(key, value) === null
    ? value
    : null;
}

function input(key, value) {
  const field = requirementField(key);
  return { key, symbol: field.symbol, label: field.label, value, unit: field.unit };
}

const STILL_AIR = 'Still air; straight and level flight at constant cruise airspeed.';
const NO_RESERVE = 'Take-off, climb, descent, loiter and energy reserve are not included.';

/**
 * Evaluate requirement consistency.
 * @param {object} requirements project.requirements (SI values)
 * @returns {{checks: object[], derived: object[], completeness: {set: number, total: number}}}
 */
export function evaluateRequirements(requirements) {
  const checks = [];
  const derived = [];

  const mto = valueOf(requirements, 'maxTakeoffMass');
  const payload = valueOf(requirements, 'payloadMass');
  const endurance = valueOf(requirements, 'endurance');
  const range = valueOf(requirements, 'range');
  const speed = valueOf(requirements, 'cruiseSpeed');
  const altitude = valueOf(requirements, 'operatingAltitude');
  const wind = valueOf(requirements, 'maxWindSpeed');

  // --- Mass budget consistency -------------------------------------------------
  if (mto !== null && payload !== null) {
    const fraction = payload / mto;
    derived.push({
      id: 'payloadFraction',
      label: 'Payload mass fraction',
      symbol: 'f_pl',
      value: fraction,
      unit: '1',
      equation: 'f_pl = m_pl / m_TO',
      inputs: [input('payloadMass', payload), input('maxTakeoffMass', mto)],
      provenance: 'analytical',
      note: 'Share of the take-off mass reserved for payload. The rest must cover structure, propulsion, energy storage and avionics.',
    });
    if (payload >= mto) {
      checks.push({
        id: 'REQ-MASS-001',
        severity: 'error',
        title: 'Payload uses the whole take-off mass limit',
        message:
          'The payload target is not less than the maximum take-off mass, which leaves no mass for structure, ' +
          'propulsion, energy storage or avionics. Raise the take-off mass limit or reduce the payload.',
        equation: 'Required: m_pl < m_TO',
        inputs: [input('payloadMass', payload), input('maxTakeoffMass', mto)],
        result: { symbol: 'f_pl', label: 'Payload fraction', value: fraction, unit: '1' },
        assumptions: ['All masses are targets; no component data is used yet.'],
        provenance: 'analytical',
      });
    }
  }

  // --- Range / speed / endurance consistency ----------------------------------------
  let stillAirTime = null;
  if (range !== null && speed !== null) {
    stillAirTime = range / speed;
    derived.push({
      id: 'minimumFlightTime',
      label: 'Minimum flight time for the range (still air)',
      symbol: 't_R',
      value: stillAirTime,
      unit: 's',
      equation: 't_R = R / V_c',
      inputs: [input('range', range), input('cruiseSpeed', speed)],
      provenance: 'analytical',
      assumptions: [STILL_AIR, NO_RESERVE],
    });
    if (endurance !== null && endurance < stillAirTime) {
      checks.push({
        id: 'REQ-PERF-001',
        severity: 'warning',
        title: 'Endurance target is shorter than the time needed to fly the range',
        message:
          'At the cruise airspeed target, covering the range takes longer than the endurance target allows, ' +
          'even in still air. Increase the endurance target, increase the cruise speed, or reduce the range.',
        equation: 'Required: t_E ≥ t_R = R / V_c',
        inputs: [input('range', range), input('cruiseSpeed', speed), input('endurance', endurance)],
        result: { symbol: 't_R', label: 'Minimum flight time', value: stillAirTime, unit: 's' },
        assumptions: [STILL_AIR, NO_RESERVE],
        provenance: 'analytical',
      });
    }
  }

  // --- Wind -------------------------------------------------------------------------
  if (wind !== null && speed !== null) {
    if (wind >= speed) {
      checks.push({
        id: 'REQ-WIND-001',
        severity: 'warning',
        title: 'Cruise airspeed cannot make headway into the maximum wind',
        message:
          'Flying directly into the maximum wind at cruise airspeed gives zero or negative ground speed, so the ' +
          'aircraft could not return upwind to its launch point. Make sure the maximum airspeed exceeds the wind ' +
          'speed with margin, or lower the wind limit.',
        equation: 'V_g,upwind = V_c − V_w ≤ 0',
        inputs: [input('cruiseSpeed', speed), input('maxWindSpeed', wind)],
        result: { symbol: 'V_g', label: 'Upwind ground speed', value: speed - wind, unit: 'm/s' },
        assumptions: ['Wind blowing directly along the flight path; constant airspeed.'],
        provenance: 'analytical',
      });
    } else if (wind > 0) {
      const ratio = wind / speed;
      const factor = 1 / (1 - ratio * ratio);
      derived.push({
        id: 'windTimeFactor',
        label: 'Out-and-back time factor in maximum wind',
        symbol: 'k_w',
        value: factor,
        unit: '1',
        equation: 'k_w = 1 / (1 − (V_w / V_c)²)',
        inputs: [input('maxWindSpeed', wind), input('cruiseSpeed', speed)],
        provenance: 'analytical',
        assumptions: [
          'Half of the route flown directly into the wind and half directly with it (out-and-back along the wind).',
          'Constant airspeed; crosswind legs would give a different factor.',
        ],
        note: 'A round trip in wind always takes longer than in still air, even though the tailwind leg is faster.',
      });
      if (stillAirTime !== null && endurance !== null && endurance >= stillAirTime && endurance < stillAirTime * factor) {
        checks.push({
          id: 'REQ-WIND-002',
          severity: 'warning',
          title: 'Endurance covers the range in still air but not in maximum wind',
          message:
            'For an out-and-back route along the wind, the maximum wind lengthens the flight beyond the endurance ' +
            'target. Increase the endurance target, increase the cruise speed, or limit operations to lower winds.',
          equation: 'Required: t_E ≥ k_w · R / V_c',
          inputs: [
            input('range', range),
            input('cruiseSpeed', speed),
            input('maxWindSpeed', wind),
            input('endurance', endurance),
          ],
          result: { symbol: 't_R,w', label: 'Flight time in wind', value: stillAirTime * factor, unit: 's' },
          assumptions: ['Out-and-back route flown along the wind direction.', NO_RESERVE],
          provenance: 'analytical',
        });
      }
    }
  }

  // --- Standard atmosphere at the operating altitude ----------------------------
  if (altitude !== null) {
    const air = isa(altitude);
    derived.push({
      id: 'airDensity',
      label: 'Air density at operating altitude (ISA)',
      symbol: 'ρ',
      value: air.density,
      unit: 'kg/m³',
      equation: 'ρ = p / (R·T), ISA layers (U.S. Standard Atmosphere 1976)',
      inputs: [input('operatingAltitude', altitude)],
      provenance: 'analytical',
      assumptions: ['International Standard Atmosphere, standard day (ΔT = 0).'],
    });
    derived.push({
      id: 'densityRatio',
      label: 'Density ratio σ = ρ/ρ₀',
      symbol: 'σ',
      value: air.densityRatio,
      unit: '1',
      equation: 'σ = ρ / ρ₀,  ρ₀ = 1.225 kg/m³',
      inputs: [input('operatingAltitude', altitude)],
      provenance: 'analytical',
      note:
        'Rotor thrust at a given rotational speed and wing lift at a given airspeed are both proportional to air density.',
    });
    derived.push({
      id: 'airTemperature',
      label: 'Air temperature at operating altitude (ISA)',
      symbol: 'T',
      value: air.temperature,
      unit: 'K',
      equation: 'T = T_b + L·(H − H_b)',
      inputs: [input('operatingAltitude', altitude)],
      provenance: 'analytical',
      assumptions: ['International Standard Atmosphere, standard day (ΔT = 0).'],
    });
    if (air.densityRatio < 0.8) {
      checks.push({
        id: 'REQ-ATM-001',
        severity: 'info',
        title: 'Thin air at the operating altitude',
        message:
          'Standard-atmosphere density at the operating altitude is well below sea level. For the same rotor speed or ' +
          'airspeed, thrust and lift fall in proportion to density, so propulsion and wings must be sized for this altitude.',
        equation: 'T_rotor ∝ ρ·n²·D⁴,  L = ½·ρ·V²·S·C_L',
        inputs: [input('operatingAltitude', altitude)],
        result: { symbol: 'σ', label: 'Density ratio', value: air.densityRatio, unit: '1' },
        assumptions: ['International Standard Atmosphere, standard day (ΔT = 0).'],
        provenance: 'analytical',
      });
    }
  }

  const set = REQUIREMENT_KEYS.filter((key) => valueOf(requirements, key) !== null).length;
  return { checks, derived, completeness: { set, total: REQUIREMENT_KEYS.length } };
}

export const SEVERITY_ORDER = Object.freeze({ error: 0, warning: 1, info: 2 });
