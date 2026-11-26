/**
 * Propulsion, battery, mass budget and endurance (Build 4).
 *
 * project.modules.propulsion = {
 *   motor:     { name, catalogueId, provenance, source, specs: { kv, resistance, noLoadCurrent, maxCurrent, mass } },
 *   propeller: { name, catalogueId, provenance, source, specs: { diameter, pitch, ct, cp, mass } },
 *   batteryId: cmp id | null   (null: the first battery in modules.components),
 *   settings:  { structureMass, usableFraction, escEfficiency, isaDeltaT, cruiseLD, cruisePropEfficiency, cruiseMotorEfficiency }
 * }
 *
 * Models (docs/engineering-models.md §7):
 *  - Propeller (static coefficients): T = C_T ρ n² D⁴, P = C_P ρ n³ D⁵, Q = P / (2π n).
 *  - Brushless DC motor: K_t = 60 / (2π K_v), I = Q / K_t + I₀, V = 60 n / K_v + I R.
 *  - Battery: open-circuit voltage from a typical SOC curve, internal resistance; terminal
 *    voltage V = V_oc − I R_pack. Current for a power P: I = (V_oc − √(V_oc² − 4 R P)) / (2R).
 *  - Endurance: time-stepped discharge to the usable fraction of capacity.
 *  - Fixed-wing cruise (until the aerodynamics of Build 5): T = W/(L/D), P_shaft = T V / η_prop.
 * The propeller diameter is taken from the configuration (single source of truth); the
 * propeller entry supplies C_T, C_P, pitch and mass.
 */
import { isPlainObject } from '../utils/immutable.js';
import { G0, isa } from './atmosphere.js';
import { CHEMISTRIES } from './components.js';

export const MOTOR_FIELDS = Object.freeze({
  kv: { label: 'Velocity constant K_v', symbol: 'K_v', unit: 'rpm/V', displayUnits: ['rpm/V'], min: 50, max: 50000, help: 'No-load speed per volt, from the motor datasheet.' },
  resistance: { label: 'Winding resistance R', symbol: 'R_m', unit: 'Ω', displayUnits: ['mΩ', 'Ω'], min: 0.001, max: 10, help: 'Phase-to-phase resistance.' },
  noLoadCurrent: { label: 'No-load current I₀', symbol: 'I₀', unit: 'A', displayUnits: ['A', 'mA'], min: 0, max: 20, help: 'Current at no load (iron and friction losses), usually quoted at 10 V.' },
  maxCurrent: { label: 'Maximum continuous current', symbol: 'I_max', unit: 'A', displayUnits: ['A'], min: 0.5, max: 500 },
  mass: { label: 'Mass (each)', symbol: 'm_mot', unit: 'kg', displayUnits: ['g', 'kg'], min: 0.0005, max: 20 },
});

export const PROPELLER_FIELDS = Object.freeze({
  diameter: { label: 'Diameter the coefficients were measured at', symbol: 'D_data', unit: 'm', displayUnits: ['in', 'mm'], min: 0.01, max: 3, help: 'Used only to warn when the drawing uses a different size; the drawing’s diameter is used in the calculation.' },
  pitch: { label: 'Pitch', symbol: 'p', unit: 'm', displayUnits: ['in', 'mm'], min: 0.005, max: 3 },
  ct: { label: 'Static thrust coefficient C_T', symbol: 'C_T', unit: '1', displayUnits: ['1'], min: 0.01, max: 0.4, help: 'T = C_T ρ n² D⁴ with n in rev/s (UIUC convention).' },
  cp: { label: 'Static power coefficient C_P', symbol: 'C_P', unit: '1', displayUnits: ['1'], min: 0.005, max: 0.3, help: 'P = C_P ρ n³ D⁵ with n in rev/s.' },
  mass: { label: 'Mass (each)', symbol: 'm_prop', unit: 'kg', displayUnits: ['g', 'kg'], min: 0.0001, max: 5 },
});

export const SETTING_FIELDS = Object.freeze({
  structureMass: { label: 'Structure mass (frame, wiring, fasteners)', symbol: 'm_str', unit: 'kg', displayUnits: ['g', 'kg'], min: 0, max: 500, help: 'Your estimate until structural sizing (Build 5). Typically 20–35 % of take-off mass for small UAVs.' },
  usableFraction: { label: 'Usable battery capacity', symbol: 'f_use', unit: '1', displayUnits: ['%', '1'], min: 0.3, max: 1, help: 'Fraction of rated capacity you plan to use; the rest is reserve and protects the battery (80 % is common).' },
  escEfficiency: { label: 'ESC efficiency', symbol: 'η_ESC', unit: '1', displayUnits: ['%', '1'], min: 0.5, max: 1 },
  isaDeltaT: { label: 'Temperature above ISA (hot day)', symbol: 'ΔT', unit: 'ΔK', displayUnits: ['Δ°C'], min: -60, max: 60, help: 'Hot-and-high operation lowers air density and thrust. +20 °C is a typical hot-day design case.' },
  cruiseLD: { label: 'Cruise lift-to-drag ratio (estimate)', symbol: 'L/D', unit: '1', displayUnits: ['1'], min: 2, max: 40, help: 'Until the aerodynamics of Build 5: about 8–12 for small UAVs, 15–25 for gliders.' },
  cruisePropEfficiency: { label: 'Cruise propeller efficiency (estimate)', symbol: 'η_prop', unit: '1', displayUnits: ['%', '1'], min: 0.2, max: 0.9 },
  cruiseMotorEfficiency: { label: 'Cruise motor efficiency (estimate)', symbol: 'η_mot', unit: '1', displayUnits: ['%', '1'], min: 0.3, max: 0.98 },
});

export const DEFAULT_SETTINGS = Object.freeze({ structureMass: 0.35, usableFraction: 0.8, escEfficiency: 0.95, isaDeltaT: 0, cruiseLD: 10, cruisePropEfficiency: 0.65, cruiseMotorEfficiency: 0.8 });

/** Typical open-circuit voltage per cell versus state of charge (conceptual estimate). */
export const OCV_CURVES = Object.freeze({
  lipo: [[0, 3.3], [0.05, 3.5], [0.1, 3.6], [0.2, 3.68], [0.3, 3.73], [0.4, 3.77], [0.5, 3.8], [0.6, 3.84], [0.7, 3.9], [0.8, 3.97], [0.9, 4.07], [1, 4.2]],
  lihv: [[0, 3.3], [0.05, 3.52], [0.1, 3.63], [0.2, 3.72], [0.3, 3.78], [0.4, 3.83], [0.5, 3.87], [0.6, 3.93], [0.7, 4.0], [0.8, 4.09], [0.9, 4.2], [1, 4.35]],
  liion: [[0, 2.8], [0.05, 3.1], [0.1, 3.3], [0.2, 3.45], [0.3, 3.55], [0.4, 3.62], [0.5, 3.68], [0.6, 3.75], [0.7, 3.84], [0.8, 3.93], [0.9, 4.04], [1, 4.2]],
});
/** Internal resistance per series cell group ≈ k / capacity[Ah] when no datasheet value is given (conceptual estimate). */
const R_PER_AH = { lipo: 0.015, lihv: 0.015, liion: 0.08 };
/** Coaxial interference: extra induced-power factor for a coaxial pair (Leishman cites about 1.16–1.28); 1.2 used. */
export const COAXIAL_POWER_FACTOR = 1.2;

export function ocvPerCell(chemistry, soc) {
  const curve = OCV_CURVES[chemistry] ?? OCV_CURVES.lipo;
  const s = Math.min(1, Math.max(0, soc));
  for (let i = 1; i < curve.length; i += 1) {
    if (s <= curve[i][0]) {
      const [s0, v0] = curve[i - 1];
      const [s1, v1] = curve[i];
      return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
    }
  }
  return curve.at(-1)[1];
}

/** Pack model from a battery component. */
export function batteryPack(battery) {
  const chem = battery.specs.chemistry ?? 'lipo';
  const cells = battery.specs.cells;
  const capacityAh = battery.specs.capacity / 3600;
  const given = battery.specs.internalResistance;
  const resistance = typeof given === 'number' ? given : ((R_PER_AH[chem] ?? 0.015) * cells) / Math.max(capacityAh, 0.01);
  return { chemistry: chem, cells, capacity: battery.specs.capacity, capacityAh, resistance, resistanceEstimated: typeof given !== 'number', maxCurrent: battery.specs.maxContinuousCurrent, ocv: (soc) => cells * ocvPerCell(chem, soc), minCell: (CHEMISTRIES[chem] ?? CHEMISTRIES.lipo).min };
}

/** Battery current needed for electrical power P at open-circuit voltage V_oc and pack resistance R. Null when the pack cannot supply it. */
export function batteryCurrent(power, voc, resistance) {
  if (power <= 0) return 0;
  const disc = voc * voc - 4 * resistance * power;
  if (disc < 0) return null;
  return (voc - Math.sqrt(disc)) / (2 * resistance);
}

/** Operating point of one motor + propeller producing thrust T. */
export function rotorOperatingPoint({ thrust, rho, diameter, ct, cp, kv, resistance, noLoadCurrent, powerFactor = 1 }) {
  const n = Math.sqrt(thrust / (ct * rho * diameter ** 4)); // rev/s
  const shaftPower = cp * rho * n ** 3 * diameter ** 5 * powerFactor;
  const torque = shaftPower / (2 * Math.PI * n || 1);
  const kt = 60 / (2 * Math.PI * kv);
  const current = torque / kt + noLoadCurrent;
  const backEmf = (60 * n) / kv;
  const voltage = backEmf + current * resistance;
  const electricalPower = voltage * current;
  return { n, rpm: n * 60, shaftPower, torque, current, voltage, electricalPower, efficiency: shaftPower / electricalPower, kt };
}

/** Maximum static thrust of one motor + propeller at motor voltage V (full throttle). */
export function maxStaticThrust({ voltage, rho, diameter, ct, cp, kv, resistance, noLoadCurrent, powerFactor = 1 }) {
  const kt = 60 / (2 * Math.PI * kv);
  const f = (n) => {
    const q = (cp * rho * n ** 3 * diameter ** 5 * powerFactor) / (2 * Math.PI * n || 1);
    return (60 * n) / kv + resistance * (q / kt + noLoadCurrent) - voltage;
  };
  let lo = 0;
  let hi = (kv * voltage) / 60;
  if (f(hi) < 0) return { thrust: ct * rho * hi ** 2 * diameter ** 4, n: hi, current: noLoadCurrent };
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  const n = lo;
  const q = (cp * rho * n ** 3 * diameter ** 5 * powerFactor) / (2 * Math.PI * n || 1);
  return { thrust: ct * rho * n * n * diameter ** 4, n, current: q / kt + noLoadCurrent };
}

/**
 * Discharge a pack at a constant electrical load (W) until the usable fraction is used
 * or the loaded cell voltage drops below the chemistry minimum.
 * @returns {{time, endReason, points: [t_s, V][], current0}}
 */
export function dischargeAtPower(pack, power, usableFraction, dt = 2) {
  let soc = 1;
  let t = 0;
  const points = [];
  const socEnd = 1 - usableFraction;
  let endReason = 'usable capacity used';
  let current0 = null;
  for (let i = 0; i < 200000; i += 1) {
    const voc = pack.ocv(soc);
    const current = batteryCurrent(power, voc, pack.resistance);
    if (current === null) {
      endReason = 'battery cannot supply this power';
      break;
    }
    current0 ??= current;
    const v = voc - current * pack.resistance;
    if (i % 15 === 0) points.push([t, v]);
    if (v < pack.minCell * pack.cells) {
      endReason = 'loaded voltage reached the cell minimum';
      break;
    }
    if (soc <= socEnd) break;
    soc -= (current * dt) / pack.capacity;
    t += dt;
  }
  points.push([t, pack.ocv(Math.max(soc, 0)) - (batteryCurrent(power, pack.ocv(Math.max(soc, 0)), pack.resistance) ?? 0) * pack.resistance]);
  return { time: t, endReason, points, current0 };
}

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });

/**
 * Analyse propulsion and energy.
 * @param {{ propulsion, configuration, geometry, requirements, components, electrical }} input
 */
export function analysePropulsion({ propulsion, geometry, requirements = {}, components, electrical, aero = null }) {
  const checks = [];
  const derived = [];
  const notes = [];
  const result = { status: 'ok', checks, derived, notes, mass: null, hover: null, cruise: null, battery: null, endurance: null };
  if (!propulsion || !geometry) {
    result.status = 'no-geometry';
    return result;
  }
  const items = components?.items ?? [];
  const battery = items.find((i) => i.id === propulsion.batteryId && i.type === 'battery') ?? items.find((i) => i.type === 'battery') ?? null;
  const esc = items.find((i) => i.type === 'esc') ?? null;
  const s = { ...DEFAULT_SETTINGS, ...(propulsion.settings ?? {}) };
  const m = propulsion.motor.specs;
  const p = propulsion.propeller.specs;

  const liftRotors = geometry.rotors.filter((r) => r.role === 'lift');
  const cruiseRotors = geometry.rotors.filter((r) => r.role === 'cruise');
  const motorCount = geometry.rotors.length;
  result.motorMass = m.mass + p.mass;
  result.structureMass = s.structureMass;

  // ---- Mass budget -------------------------------------------------------------------------
  const componentMass = items.reduce((sum, i) => sum + (i.specs.mass ?? 0) * (i.quantity ?? 1), 0);
  const payload = requirements.payloadMass?.value ?? 0;
  const motorsMass = motorCount * m.mass;
  const propsMass = motorCount * p.mass;
  const total = componentMass + motorsMass + propsMass + s.structureMass + payload;
  result.mass = {
    rows: [
      ['Avionics, battery and ESCs (component list)', componentMass],
      [`Motors (${motorCount} × ${(m.mass * 1000).toFixed(0)} g)`, motorsMass],
      [`Propellers (${motorCount} × ${(p.mass * 1000).toFixed(0)} g)`, propsMass],
      ['Structure (your estimate)', s.structureMass],
      ['Payload (requirement)', payload],
    ],
    total,
  };
  derived.push({ id: 'pr-mass', label: 'Estimated take-off mass', symbol: 'm_TO,est', value: total, unit: 'kg', displayUnit: total < 1 ? 'g' : 'kg', equation: 'm = m_components + n(m_motor + m_prop) + m_structure + m_payload', inputs: [], provenance: 'conceptual-estimate', note: 'Built from your component list, motor and propeller data, structure estimate and payload.' });
  const mtow = requirements.maxTakeoffMass?.value;
  if (typeof mtow === 'number' && total > mtow) {
    checks.push({ id: 'PR-MASS-001', severity: 'error', title: 'Estimated mass exceeds the take-off mass target', message: `The mass budget adds up to ${total.toFixed(2)} kg, above your ${mtow} kg target. Lighten components or structure, or raise the target.`, equation: 'Required: m_est ≤ m_TO,target', inputs: [q('m_est', 'Estimated mass', total, 'kg'), q('m_TO', 'Target', mtow, 'kg')], result: q('Δm', 'Over by', total - mtow, 'kg'), assumptions: ['Structure mass is your estimate.'], provenance: 'conceptual-estimate' });
  }
  const weight = total * G0;

  if (!battery) {
    result.status = 'no-battery';
    checks.push({ id: 'PR-BAT-000', severity: 'warning', title: 'No battery selected', message: 'Add a battery in the Avionics Laboratory (or the Component Library) to compute currents and endurance.', equation: '', inputs: [], assumptions: [], provenance: 'analytical' });
    return result;
  }
  const pack = batteryPack(battery);
  result.battery = { name: battery.name, ...pack, ocv: undefined, nominal: pack.cells * ocvPerCell(pack.chemistry, 0.5) };
  result.battery.usableEnergy = pack.capacity * result.battery.nominal * s.usableFraction;
  if (pack.resistanceEstimated) notes.push(`Battery internal resistance not given; estimated as ${(pack.resistance * 1000).toFixed(1)} mΩ for the pack (typical for its chemistry and capacity). Enter the datasheet value in the Avionics Laboratory for better accuracy.`);
  const altitude = requirements.operatingAltitude?.value ?? 0;
  const atm = isa(altitude, { deltaT: s.isaDeltaT });
  const rho = atm.density;
  const avionicsPower = Math.max(0, electrical?.totals?.avionicsPower ?? 0);
  result.avionicsPower = avionicsPower;
  const densityNote = `ISA${s.isaDeltaT ? ` ${s.isaDeltaT > 0 ? '+' : ''}${s.isaDeltaT} °C` : ''} at ${Math.round(altitude)} m: ρ = ${rho.toFixed(4)} kg/m³.`;

  const D = liftRotors[0]?.diameter ?? cruiseRotors[0]?.diameter;
  if (p.diameter && D && Math.abs(p.diameter - D) / D > 0.08) {
    checks.push({ id: 'PR-PROP-001', severity: 'warning', title: 'Propeller data is for a different size', message: `The propeller coefficients are for ${(p.diameter / 0.0254).toFixed(1)} in, but the drawing uses ${(D / 0.0254).toFixed(1)} in. C_T and C_P change with size and Reynolds number; choose matching data or change the diameter in Drone Architecture.`, equation: '|D_data − D| ≤ 8 % D', inputs: [q('D_data', 'Data diameter', p.diameter, 'm', 'in'), q('D', 'Drawing diameter', D, 'm', 'in')], assumptions: [], provenance: 'analytical' });
  }
  const fm = p.ct ** 1.5 / (Math.SQRT2 * p.cp);
  if (fm > 0.85) {
    checks.push({ id: 'PR-PROP-002', severity: 'warning', title: 'Propeller coefficients look too efficient', message: `C_T and C_P imply a figure of merit of ${fm.toFixed(2)}; measured small propellers are about 0.5–0.75. Check the data source.`, equation: 'FM = C_T^1.5 / (√2 C_P)', inputs: [q('C_T', 'Thrust coefficient', p.ct, '1'), q('C_P', 'Power coefficient', p.cp, '1')], result: q('FM', 'Figure of merit', fm, '1'), assumptions: [], provenance: 'analytical' });
  }

  // ---- Hover (multirotor and VTOL lift system) -------------------------------------------------
  const motorArgs = { kv: m.kv, resistance: m.resistance, noLoadCurrent: m.noLoadCurrent, ct: p.ct, cp: p.cp, rho };
  let hoverPower = null;
  if (liftRotors.length) {
    const coaxial = liftRotors.some((r) => r.level);
    const factor = coaxial ? COAXIAL_POWER_FACTOR : 1;
    const thrust = weight / liftRotors.length;
    const op = rotorOperatingPoint({ thrust, diameter: liftRotors[0].diameter, powerFactor: factor, ...motorArgs });
    const motorsPower = liftRotors.length * op.electricalPower;
    hoverPower = motorsPower / s.escEfficiency + avionicsPower;
    const voc = pack.ocv(1 - s.usableFraction / 2);
    const iBatt = batteryCurrent(hoverPower, voc, pack.resistance);
    const vTerm = iBatt === null ? null : voc - iBatt * pack.resistance;
    const throttle = vTerm ? op.voltage / vTerm : Infinity;
    const vFull = pack.ocv(1 - s.usableFraction) - (iBatt ?? 0) * pack.resistance; // conservative: near the end of the flight
    const max = maxStaticThrust({ voltage: Math.max(vFull, 0.1) * s.escEfficiency, diameter: liftRotors[0].diameter, powerFactor: factor, ...motorArgs });
    const tw = (liftRotors.length * max.thrust) / weight;
    result.hover = { thrust, op, motorsPower, totalPower: hoverPower, batteryCurrent: iBatt, terminalVoltage: vTerm, throttle, maxThrust: max.thrust, thrustToWeight: tw, rotors: liftRotors.length, coaxial };
    const rotorInputs = [q('T', 'Thrust per rotor', thrust, 'N'), q('ρ', 'Air density', rho, 'kg/m³'), q('D', 'Diameter', liftRotors[0].diameter, 'm', 'in'), q('C_T', 'Thrust coefficient', p.ct, '1'), q('C_P', 'Power coefficient', p.cp, '1')];
    derived.push(
      { id: 'pr-h-rpm', label: 'Hover rotor speed', symbol: 'N', value: op.n * 2 * Math.PI, unit: 'rad/s', displayUnit: 'rpm', equation: 'n = √(T / (C_T ρ D⁴))', inputs: rotorInputs, provenance: 'analytical', assumptions: [densityNote, 'Static propeller coefficients (hover, no climb).'] },
      { id: 'pr-h-shaft', label: 'Shaft power per rotor', symbol: 'P_shaft', value: op.shaftPower, unit: 'W', equation: coaxial ? `P = ${COAXIAL_POWER_FACTOR} × C_P ρ n³ D⁵ (coaxial interference)` : 'P = C_P ρ n³ D⁵', inputs: rotorInputs, provenance: 'analytical' },
      { id: 'pr-h-current', label: 'Motor current in hover (each)', symbol: 'I_m', value: op.current, unit: 'A', equation: 'I = Q / K_t + I₀,  K_t = 60 / (2π K_v)', inputs: [q('Q', 'Torque', op.torque, 'N·m'), q('K_v', 'Velocity constant', m.kv, 'rpm/V'), q('I₀', 'No-load current', m.noLoadCurrent, 'A')], provenance: 'analytical' },
      { id: 'pr-h-volt', label: 'Motor voltage in hover', symbol: 'V_m', value: op.voltage, unit: 'V', equation: 'V = 60 n / K_v + I R', inputs: [q('R', 'Winding resistance', m.resistance, 'Ω', 'mΩ')], provenance: 'analytical' },
      { id: 'pr-h-eff', label: 'Motor efficiency in hover', symbol: 'η_m', value: op.efficiency, unit: '1', displayUnit: '%', equation: 'η = P_shaft / (V I)', inputs: [], provenance: 'analytical' },
      { id: 'pr-h-power', label: 'Total electrical power in hover', symbol: 'P_hover', value: hoverPower, unit: 'W', equation: 'P = n_rotors V I / η_ESC + P_avionics', inputs: [q('η_ESC', 'ESC efficiency', s.escEfficiency, '1', '%'), q('P_av', 'Avionics power', avionicsPower, 'W')], provenance: 'analytical' },
      { id: 'pr-h-throttle', label: 'Hover throttle', symbol: 'δ', value: throttle, unit: '1', displayUnit: '%', equation: 'δ ≈ V_m / V_battery (loaded)', inputs: [], provenance: 'conceptual-estimate', note: 'Below about 60 % leaves margin for gusts, climb and manoeuvres.' },
      { id: 'pr-h-tw', label: 'Thrust-to-weight ratio (full throttle, nearly empty battery)', symbol: 'T/W', value: tw, unit: '1', equation: 'T/W = n_rotors T_max / W', inputs: [q('T_max', 'Maximum thrust per rotor', max.thrust, 'N'), q('W', 'Weight', weight, 'N')], provenance: 'analytical' },
    );
    if (iBatt !== null) derived.push({ id: 'pr-h-ibatt', label: 'Battery current in hover', symbol: 'I_batt', value: iBatt, unit: 'A', equation: 'I = (V_oc − √(V_oc² − 4 R P)) / (2R)', inputs: [q('V_oc', 'Open-circuit voltage (mid-flight)', voc, 'V'), q('R', 'Pack resistance', pack.resistance, 'Ω', 'mΩ'), q('P', 'Hover power', hoverPower, 'W')], provenance: 'analytical' });

    if (throttle > 1 || iBatt === null) {
      checks.push({ id: 'PR-HOV-001', severity: 'error', title: 'Cannot hover with this motor, propeller and battery', message: 'The motor would need more voltage than the battery supplies (or the battery cannot deliver the power). Use a higher-K_v motor, larger propellers, more cells, or reduce mass.', equation: 'Required: V_m < V_battery', inputs: [q('V_m', 'Motor voltage needed', op.voltage, 'V'), q('V_batt', 'Battery voltage under load', vTerm ?? 0, 'V')], assumptions: [densityNote], provenance: 'analytical' });
    } else if (throttle > 0.75) {
      checks.push({ id: 'PR-HOV-002', severity: 'warning', title: 'High hover throttle', message: `Hover needs about ${(throttle * 100).toFixed(0)} % throttle, leaving little reserve for wind, climb and control. Aim for 40–60 %.`, equation: 'Guideline: δ_hover ≤ 0.6–0.75', inputs: [], result: q('δ', 'Hover throttle', throttle, '1', '%'), assumptions: [], provenance: 'conceptual-estimate' });
    }
    if (tw < 1.5) {
      checks.push({ id: 'PR-HOV-003', severity: tw < 1.1 ? 'error' : 'warning', title: 'Low thrust-to-weight ratio', message: `Maximum thrust is ${tw.toFixed(2)} × the weight. Multirotors need about 2 for good control and climb (1.6–1.8 minimum for heavy-lift designs).`, equation: 'Guideline: T/W ≥ 2', inputs: [q('T_max', 'Maximum thrust per rotor', max.thrust, 'N'), q('W', 'Weight', weight, 'N')], result: q('T/W', 'Thrust-to-weight', tw, '1'), assumptions: ['Full throttle, battery near the end of its usable capacity.'], provenance: 'conceptual-estimate' });
    }
    if (op.current > m.maxCurrent) {
      checks.push({ id: 'PR-MOT-001', severity: 'error', title: 'Motor current above its rating in hover', message: `Each motor draws ${op.current.toFixed(1)} A in hover, more than its ${m.maxCurrent} A rating.`, equation: 'Required: I_hover ≤ I_max', inputs: [q('I', 'Hover current', op.current, 'A'), q('I_max', 'Rating', m.maxCurrent, 'A')], assumptions: [], provenance: 'analytical' });
    } else if (max.current > m.maxCurrent) {
      checks.push({ id: 'PR-MOT-002', severity: 'warning', title: 'Motor exceeds its rating at full throttle', message: `At full throttle each motor would draw about ${max.current.toFixed(1)} A (rating ${m.maxCurrent} A). Limit throttle in the flight controller or choose a larger motor.`, equation: 'I_full ≤ I_max', inputs: [q('I_full', 'Full-throttle current', max.current, 'A'), q('I_max', 'Rating', m.maxCurrent, 'A')], assumptions: [], provenance: 'analytical' });
    }
    if (esc && max.current > esc.specs.maxContinuousCurrent) {
      checks.push({ id: 'PR-ESC-001', severity: 'warning', title: 'ESC rating below the full-throttle motor current', message: `${esc.name} is rated ${esc.specs.maxContinuousCurrent} A; the motor can draw about ${max.current.toFixed(1)} A at full throttle.`, equation: 'I_full ≤ I_ESC', inputs: [], assumptions: [], provenance: 'analytical' });
    }
    if (esc && (esc.quantity ?? 1) !== motorCount) {
      checks.push({ id: 'PR-ESC-002', severity: 'info', title: 'ESC count differs from motor count', message: `The design has ${motorCount} motors and the component list has ${esc.quantity ?? 1} × ${esc.name}. Set the ESC quantity to match (or use a multi-channel ESC).`, equation: '', inputs: [], assumptions: [], provenance: 'analytical' });
    }
    if (iBatt !== null && iBatt > pack.maxCurrent) {
      checks.push({ id: 'PR-BAT-001', severity: 'error', title: 'Battery current above its rating', message: `Hover draws ${iBatt.toFixed(1)} A from a battery rated ${pack.maxCurrent} A continuous.`, equation: 'I_batt ≤ I_rated', inputs: [], assumptions: [], provenance: 'analytical' });
    }
  }

  // ---- Cruise (fixed wing and VTOL) -------------------------------------------------------------
  let cruisePower = null;
  if (cruiseRotors.length) {
    const V = requirements.cruiseSpeed?.value ?? 18;
    let ld = s.cruiseLD;
    let ldFromAero = false;
    if (aero?.S > 0) {
      const cl = (2 * weight) / (rho * V * V * aero.S);
      const value = cl / (aero.cd0 + aero.k * cl * cl);
      if (Number.isFinite(value) && value > 0) {
        ld = value;
        ldFromAero = true;
      }
    }
    const thrust = weight / ld;
    const shaft = (thrust * V) / s.cruisePropEfficiency;
    cruisePower = shaft / (s.cruiseMotorEfficiency * s.escEfficiency) + avionicsPower;
    const max = maxStaticThrust({ voltage: pack.ocv(1 - s.usableFraction) * s.escEfficiency, diameter: cruiseRotors[0].diameter, ...motorArgs });
    result.cruise = { speed: V, thrust, shaftPower: shaft, totalPower: cruisePower, staticThrust: max.thrust, liftToDrag: ld, ldFromAero };
    derived.push(
      { id: 'pr-c-thrust', label: 'Cruise thrust (estimate)', symbol: 'T_c', value: thrust, unit: 'N', equation: 'T = W / (L/D)', inputs: [q('W', 'Weight', weight, 'N'), q('L/D', ldFromAero ? 'Lift-to-drag (Aerodynamics page)' : 'Lift-to-drag (your estimate)', ld, '1')], provenance: 'conceptual-estimate', assumptions: [ldFromAero ? 'Steady level flight; L/D from the drag polar on the Aerodynamics page at this mass, speed and altitude.' : 'Steady level flight; L/D is your estimate (this layout has no wing model).'] },
      { id: 'pr-c-power', label: 'Electrical power in cruise', symbol: 'P_cruise', value: cruisePower, unit: 'W', equation: 'P = T V / (η_prop η_mot η_ESC) + P_avionics', inputs: [q('V', 'Cruise speed', V, 'm/s'), q('η_prop', 'Propeller efficiency', s.cruisePropEfficiency, '1', '%'), q('η_mot', 'Motor efficiency', s.cruiseMotorEfficiency, '1', '%')], provenance: 'conceptual-estimate' },
      { id: 'pr-c-static', label: 'Static thrust of the cruise propeller (take-off)', symbol: 'T_0', value: max.thrust, unit: 'N', equation: 'Full throttle, static coefficients', inputs: [], provenance: 'analytical' },
    );
    if (!liftRotors.length && max.thrust < 0.3 * weight) {
      checks.push({ id: 'PR-CRU-001', severity: 'warning', title: 'Low static thrust for take-off', message: `Static thrust is ${((max.thrust / weight) * 100).toFixed(0)} % of the weight. Hand or runway launch usually needs about 30–50 %.`, equation: 'Guideline: T_0/W ≥ 0.3', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    }
  }

  // ---- Endurance ---------------------------------------------------------------------------------
  const missionPower = cruisePower ?? hoverPower;
  if (missionPower) {
    const run = dischargeAtPower(pack, missionPower, s.usableFraction);
    result.endurance = { ...run, mode: cruisePower ? 'cruise' : 'hover', power: missionPower };
    const energy = pack.capacity * result.battery.nominal * s.usableFraction;
    derived.push({ id: 'pr-endurance', label: cruisePower ? 'Cruise endurance' : 'Hover endurance', symbol: 't_end', value: run.time, unit: 's', displayUnit: 'min', equation: 'Time-stepped discharge: dSOC/dt = −I(t)/Q, until the usable fraction is used', inputs: [q('Q', 'Capacity', pack.capacity, 'C', 'mAh'), q('f_use', 'Usable fraction', s.usableFraction, '1', '%'), q('P', 'Power', missionPower, 'W')], provenance: 'analytical', assumptions: [`Stopped because: ${run.endReason}.`, 'Constant power; typical open-circuit voltage curve; internal resistance constant.', densityNote] });
    if (cruisePower) derived.push({ id: 'pr-range', label: 'Still-air range at cruise speed', symbol: 'R', value: run.time * result.cruise.speed, unit: 'm', displayUnit: 'km', equation: 'R = V t_end', inputs: [], provenance: 'analytical' });
    derived.push({ id: 'pr-energy', label: 'Usable battery energy', symbol: 'E', value: energy, unit: 'J', displayUnit: 'Wh', equation: 'E = Q V_nom f_use', inputs: [], provenance: 'analytical' });
    const target = requirements.endurance?.value;
    if (typeof target === 'number' && run.time < target) {
      checks.push({ id: 'PR-END-001', severity: 'warning', title: 'Endurance below the requirement', message: `Estimated ${(run.time / 60).toFixed(1)} min against a ${(target / 60).toFixed(0)} min requirement. A bigger battery adds mass too, so compare options here, or reduce mass and power.`, equation: 't_end ≥ t_required', inputs: [], result: q('t_end', 'Estimated endurance', run.time, 's', 'min'), assumptions: [], provenance: 'analytical' });
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  checks.sort((a, b) => order[a.severity] - order[b.severity]);
  return result;
}

// ---- Data: defaults, validation, sanitising -------------------------------------------------------

export function validateField(fields, key, value) {
  const f = fields[key];
  if (!f) return 'Unknown field';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number';
  if (value < f.min || value > f.max) return `Must be between ${f.min} and ${f.max}`;
  return null;
}

const PROVENANCE = ['illustrative', 'datasheet', 'user-input', 'measured'];

function cleanPart(input, fields, fallback) {
  const warnings = [];
  if (!isPlainObject(input)) return { part: structuredClone(fallback), warnings };
  const src = input;
  const part = {
    name: typeof src.name === 'string' && src.name.trim() ? src.name.slice(0, 120) : fallback.name,
    catalogueId: typeof src.catalogueId === 'string' ? src.catalogueId.slice(0, 80) : null,
    provenance: PROVENANCE.includes(src.provenance) ? src.provenance : fallback.provenance,
    source: typeof src.source === 'string' ? src.source.slice(0, 500) : '',
    specs: {},
  };
  for (const key of Object.keys(fields)) {
    const v = src.specs?.[key];
    if (v !== undefined && validateField(fields, key, v) === null) part.specs[key] = v;
    else {
      if (v !== undefined) warnings.push(`${part.name}: ${fields[key].label} was invalid and reset.`);
      part.specs[key] = fallback.specs[key];
    }
  }
  return { part, warnings };
}

export function validatePropulsion(data) {
  const errors = [];
  if (!isPlainObject(data)) return [{ path: '', message: 'Propulsion must be an object' }];
  for (const [name, fields] of [['motor', MOTOR_FIELDS], ['propeller', PROPELLER_FIELDS]]) {
    const part = data[name];
    if (!isPlainObject(part) || !isPlainObject(part.specs)) {
      errors.push({ path: name, message: `${name} is missing` });
      continue;
    }
    if (!PROVENANCE.includes(part.provenance)) errors.push({ path: `${name}.provenance`, message: 'Unknown provenance' });
    for (const key of Object.keys(fields)) {
      const message = validateField(fields, key, part.specs[key]);
      if (message) errors.push({ path: `${name}.specs.${key}`, message: `${fields[key].label}: ${message}` });
    }
  }
  if (!(data.batteryId === null || typeof data.batteryId === 'string')) errors.push({ path: 'batteryId', message: 'Invalid battery reference' });
  if (!isPlainObject(data.settings)) errors.push({ path: 'settings', message: 'Settings must be an object' });
  else for (const key of Object.keys(SETTING_FIELDS)) {
    const message = validateField(SETTING_FIELDS, key, data.settings[key]);
    if (message) errors.push({ path: `settings.${key}`, message: `${SETTING_FIELDS[key].label}: ${message}` });
  }
  return errors;
}

/** Repair imported/merged propulsion data against fallback defaults. */
export function sanitizePropulsion(input, fallback) {
  const warnings = [];
  const src = isPlainObject(input) ? input : {};
  const motor = cleanPart(src.motor, MOTOR_FIELDS, fallback.motor);
  const propeller = cleanPart(src.propeller, PROPELLER_FIELDS, fallback.propeller);
  warnings.push(...motor.warnings, ...propeller.warnings);
  const settings = {};
  for (const key of Object.keys(SETTING_FIELDS)) {
    const v = src.settings?.[key];
    settings[key] = v !== undefined && validateField(SETTING_FIELDS, key, v) === null ? v : fallback.settings[key];
  }
  return { propulsion: { motor: motor.part, propeller: propeller.part, batteryId: typeof src.batteryId === 'string' ? src.batteryId : null, settings }, warnings: input === undefined ? [] : warnings };
}
