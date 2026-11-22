/**
 * Conceptual geometry model (Build 2).
 *
 * From a configuration (js/engineering/configuration.js) this module computes:
 *  - the positions of rotors, wing, fuselage and tail in a body frame
 *    (x forward, y to the right, z up; metres). For multirotors the origin is the
 *    centre of the frame; for winged aircraft it is the fuselage nose, so x ≤ 0
 *    along the aircraft;
 *  - derived geometric quantities with the equation and inputs used for each;
 *  - geometry checks (overlapping propellers, tail volume coefficients well outside
 *    typical ranges, and so on).
 *
 * Everything here is plan-form geometry and ideal momentum theory. No mass,
 * aerodynamic coefficient or efficiency is estimated, so the results describe the
 * shape of the design, not how well it flies. Equations: docs/engineering-models.md §5.
 */
import { G0, RHO0, isa } from './atmosphere.js';
import { configParam, layoutInfo } from './configuration.js';

const TWO_PI = 2 * Math.PI;
const DEG = Math.PI / 180;

function pInput(params, key) {
  const def = configParam(key);
  return { key, symbol: def.symbol, label: def.label, value: params[key], unit: def.unit };
}

// ---- Rotor arrangements -------------------------------------------------------------------

/** Rotor axis positions (top view) for a multirotor pattern, in clockwise order seen from above. */
export function rotorAxes(pattern, axes, R, frameRatio = 1) {
  if (pattern === 'single') return [{ x: 0, y: 0 }];
  if (pattern === 'h') {
    const k = frameRatio;
    const a = (R * k) / Math.sqrt(1 + k * k);
    const c = R / Math.sqrt(1 + k * k);
    return [
      { x: a, y: c },
      { x: -a, y: c },
      { x: -a, y: -c },
      { x: a, y: -c },
    ];
  }
  const angles =
    pattern === 'y'
      ? [60 * DEG, 180 * DEG, 300 * DEG]
      : Array.from({ length: axes }, (_, i) => (pattern === 'x' ? Math.PI / axes : 0) + (TWO_PI * i) / axes);
  return angles.map((phi) => ({ x: clean(R * Math.cos(phi)), y: clean(R * Math.sin(phi)) }));
}

const clean = (v) => (Math.abs(v) < 1e-12 ? 0 : v);

function spinFor(index, axes, coaxial, upper) {
  const ring = axes % 2 === 0 ? (index % 2 === 0 ? 'ccw' : 'cw') : 'ccw';
  if (!coaxial) return ring;
  const top = axes % 2 === 0 ? ring : 'ccw';
  return upper ? top : top === 'ccw' ? 'cw' : 'ccw';
}

function pairwise(points) {
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
  }
  return { min: Number.isFinite(min) ? min : null, max: points.length > 1 ? max : null };
}

/** Air density for hover estimates: ISA at the operating-altitude target, or sea level. */
function hoverDensity(requirements) {
  const altitude = requirements?.operatingAltitude?.value;
  if (typeof altitude === 'number') {
    return { rho: isa(altitude).density, note: `ISA density at the operating-altitude target (${Math.round(altitude)} m).`, altitude };
  }
  return { rho: RHO0, note: 'ISA sea-level density (no operating-altitude target set).', altitude: null };
}

/**
 * Derived values and checks shared by every rotor system that lifts the aircraft in hover.
 * @param rotors hover rotors (axis 'z'); coaxial pairs share one axis position
 */
function rotorAnalysis({ rotors, diameter, diameterKey, params, requirements, idPrefix, labelPrefix = '', bodyRadius }) {
  const derived = [];
  const checks = [];
  const axesPoints = [];
  for (const r of rotors) if (!axesPoints.some((p) => Math.abs(p.x - r.x) < 1e-9 && Math.abs(p.y - r.y) < 1e-9)) axesPoints.push(r);
  const coaxial = axesPoints.length < rotors.length;
  const D = diameter;
  const Dinput = pInput(params, diameterKey);
  const discArea = (Math.PI * D * D) / 4;
  const totalArea = axesPoints.length * discArea;
  const { min: spacing, max: wheelbase } = pairwise(axesPoints);

  derived.push({ id: `${idPrefix}-count`, label: `${labelPrefix}Number of rotors`, symbol: 'n', value: rotors.length, unit: '1', equation: coaxial ? 'n = 2 × number of coaxial rotor axes' : 'n = number of rotor axes', inputs: [], provenance: 'user-input' });
  derived.push({ id: `${idPrefix}-disc`, label: `${labelPrefix}Disc area of one rotor`, symbol: 'A₁', value: discArea, unit: 'm²', equation: 'A₁ = π D² / 4', inputs: [Dinput], provenance: 'analytical' });
  derived.push({
    id: `${idPrefix}-area`,
    label: `${labelPrefix}Total rotor disc area (projected)`,
    symbol: 'A',
    value: totalArea,
    unit: 'm²',
    equation: coaxial ? 'A = n_axes × A₁ (a coaxial pair counts once)' : 'A = n × A₁',
    inputs: [Dinput],
    provenance: 'analytical',
    assumptions: coaxial ? ['A coaxial pair sweeps one disc; the lower rotor works in the wake of the upper one.'] : [],
  });
  if (wheelbase !== null) {
    derived.push({ id: `${idPrefix}-wheelbase`, label: `${labelPrefix}Largest rotor-to-rotor distance`, symbol: 'W', value: wheelbase, unit: 'm', equation: 'W = max |r_i − r_j| (axis to axis)', inputs: [], provenance: 'analytical', note: 'Often quoted as the frame size or wheelbase.' });
  }
  if (spacing !== null) {
    const clearance = spacing - D;
    derived.push({ id: `${idPrefix}-clearance`, label: `${labelPrefix}Propeller tip clearance (closest pair)`, symbol: 'c_tip', value: clearance, unit: 'm', equation: 'c_tip = s_min − D', inputs: [{ symbol: 's_min', label: 'Closest axis spacing', value: spacing, unit: 'm' }, Dinput], provenance: 'analytical' });
    if (clearance < 0) {
      checks.push({
        id: `${idPrefix.toUpperCase()}-001`,
        severity: 'error',
        title: `${labelPrefix}Propellers overlap`,
        message: 'Two propeller discs overlap in plan view, so the blades would strike each other (unless they are deliberately stacked at different heights, which this layout does not model). Increase the rotor spacing or use smaller propellers.',
        equation: 'Required: s_min > D',
        inputs: [{ symbol: 's_min', label: 'Closest axis spacing', value: spacing, unit: 'm' }, Dinput],
        result: { symbol: 'c_tip', label: 'Tip clearance', value: clearance, unit: 'm' },
        assumptions: ['Plan-view geometry only.'],
        provenance: 'analytical',
      });
    } else if (clearance < 0.1 * D) {
      checks.push({
        id: `${idPrefix.toUpperCase()}-002`,
        severity: 'warning',
        title: `${labelPrefix}Propeller tips are very close`,
        message: 'The gap between neighbouring propeller tips is less than 10 % of the diameter. Close tips increase aerodynamic interference, noise and vibration, and leave no margin for arm flex. The 10 % figure is a common rule of thumb, not a hard limit.',
        equation: 'Rule of thumb: c_tip ≥ 0.1 D',
        inputs: [{ symbol: 's_min', label: 'Closest axis spacing', value: spacing, unit: 'm' }, Dinput],
        result: { symbol: 'c_tip', label: 'Tip clearance', value: clearance, unit: 'm' },
        assumptions: ['Rule-of-thumb threshold (conceptual estimate).'],
        provenance: 'conceptual-estimate',
      });
    }
  }
  if (bodyRadius !== undefined && axesPoints.length > 1) {
    const inner = Math.min(...axesPoints.map((p) => Math.hypot(p.x, p.y))) - D / 2;
    if (inner < bodyRadius) {
      checks.push({
        id: `${idPrefix.toUpperCase()}-003`,
        severity: 'warning',
        title: `${labelPrefix}Propeller discs reach over the central body`,
        message: 'Part of each propeller disc lies over the central body. The body blocks the downwash there, which costs thrust and adds vibration. Lengthen the arms, narrow the body or use smaller propellers.',
        equation: 'Preferred: R − D/2 ≥ d_b / 2',
        inputs: [pInput(params, 'armLength'), Dinput, pInput(params, 'bodyDiameter')],
        result: { symbol: 'R − D/2', label: 'Inner edge of disc from centre', value: inner, unit: 'm' },
        assumptions: ['Plan-view geometry only.'],
        provenance: 'analytical',
      });
    }
  }

  const mass = requirements?.maxTakeoffMass?.value;
  if (typeof mass === 'number' && mass > 0) {
    const weight = mass * G0;
    const loading = weight / totalArea;
    const { rho, note } = hoverDensity(requirements);
    const vh = Math.sqrt(loading / (2 * rho));
    const massInput = { symbol: 'm_TO', label: 'Maximum take-off mass', value: mass, unit: 'kg' };
    const areaInput = { symbol: 'A', label: 'Total disc area', value: totalArea, unit: 'm²' };
    const rhoInput = { symbol: 'ρ', label: 'Air density', value: rho, unit: 'kg/m³' };
    derived.push({ id: `${idPrefix}-loading`, label: `${labelPrefix}Disc loading at MTOW`, symbol: 'DL', value: loading, unit: 'Pa', equation: 'DL = m_TO g₀ / A', inputs: [massInput, areaInput], provenance: 'analytical', note: 'Thrust per unit disc area in hover. Lower disc loading means less induced power.' });
    derived.push({
      id: `${idPrefix}-vh`,
      label: `${labelPrefix}Ideal hover induced velocity`,
      symbol: 'v_h',
      value: vh,
      unit: 'm/s',
      equation: 'v_h = √(DL / (2ρ))',
      inputs: [{ symbol: 'DL', label: 'Disc loading', value: loading, unit: 'Pa' }, rhoInput],
      provenance: 'analytical',
      assumptions: ['Ideal momentum theory (actuator disc).', note],
    });
    derived.push({
      id: `${idPrefix}-pideal`,
      label: `${labelPrefix}Ideal hover power (lower bound)`,
      symbol: 'P_ideal',
      value: weight * vh,
      unit: 'W',
      equation: 'P_ideal = T v_h, with T = m_TO g₀',
      inputs: [massInput, { symbol: 'v_h', label: 'Ideal induced velocity', value: vh, unit: 'm/s' }],
      provenance: 'analytical',
      assumptions: ['Ideal momentum theory: no blade profile drag, tip or swirl losses (figure of merit = 1).', 'Real rotors need substantially more power; propulsion models arrive in Build 4.', note],
    });
  }
  return { derived, checks, totalArea };
}

// ---- Multirotor -----------------------------------------------------------------------------

function multirotor(layout, params, requirements) {
  const { pattern, axes, coaxial } = layout.rotor;
  const R = pattern === 'single' ? 0 : params.armLength;
  const D = params.propDiameter;
  const points = rotorAxes(pattern, axes, R, params.frameRatio ?? 1);
  const h = params.bodyHeight;
  const rotors = [];
  points.forEach((p, i) => {
    if (coaxial) {
      const dz = params.coaxialSpacing / 2;
      rotors.push({ ...p, z: h / 2 + dz, diameter: D, axis: 'z', role: 'lift', spin: spinFor(i, axes, true, true), level: 'upper' });
      rotors.push({ ...p, z: h / 2 - dz, diameter: D, axis: 'z', role: 'lift', spin: spinFor(i, axes, true, false), level: 'lower' });
    } else {
      rotors.push({ ...p, z: h / 2 + 0.02 * D, diameter: D, axis: 'z', role: 'lift', spin: spinFor(i, axes, false, true) });
    }
  });
  const analysis = rotorAnalysis({ rotors, diameter: D, diameterKey: 'propDiameter', params, requirements, idPrefix: 'geo-mr', bodyRadius: pattern === 'single' ? undefined : params.bodyDiameter / 2 });
  const xs = rotors.map((r) => r.x);
  const ys = rotors.map((r) => r.y);
  const zs = rotors.map((r) => r.z);
  const extents = {
    x: [Math.min(...xs) - D / 2, Math.max(...xs) + D / 2],
    y: [Math.min(...ys) - D / 2, Math.max(...ys) + D / 2],
    z: [-h / 2 - 0.25 * h, Math.max(...zs) + 0.02],
  };
  const derived = [
    { id: 'geo-mr-length', label: 'Overall length including propellers', symbol: 'L', value: extents.x[1] - extents.x[0], unit: 'm', equation: 'L = x_max − x_min + D', inputs: [], provenance: 'analytical' },
    { id: 'geo-mr-width', label: 'Overall width including propellers', symbol: 'B', value: extents.y[1] - extents.y[0], unit: 'm', equation: 'B = y_max − y_min + D', inputs: [], provenance: 'analytical' },
    ...analysis.derived,
  ];
  return {
    family: 'multirotor',
    body: { diameter: params.bodyDiameter, height: h },
    arms: pattern === 'single' ? [] : points.map((p) => ({ from: { x: 0, y: 0, z: 0 }, to: { x: p.x, y: p.y, z: 0 } })),
    rotors,
    extents,
    derived,
    checks: analysis.checks,
    notes: [
      'Propeller spin directions alternate so that rotor torques cancel in hover. Motor numbering and direction must follow your flight controller’s documented motor map.',
      ...(layout.rotor.pattern === 'y' && !coaxial ? ['A tricopter cannot cancel yaw torque with spin direction alone; it needs a tilting rear motor (not modelled).'] : []),
      ...(layout.tethered ? ['The tether, its weight and its drag are not modelled in this build.'] : []),
    ],
  };
}

// ---- Wing and fuselage ----------------------------------------------------------------------

/** Plan-form properties of a straight-tapered wing. */
export function wingPlanform({ span: b, rootChord: cr, taperRatio: lam, sweepLE }) {
  const ct = lam * cr;
  const S = (b * (cr + ct)) / 2;
  const AR = (b * b) / S;
  const mac = ((2 / 3) * cr * (1 + lam + lam * lam)) / (1 + lam);
  const yMac = (b / 6) * ((1 + 2 * lam) / (1 + lam));
  const xMacLE = yMac * Math.tan(sweepLE);
  const sweepQC = Math.atan(Math.tan(sweepLE) - (1 - lam) / (AR * (1 + lam)));
  return { tipChord: ct, area: S, aspectRatio: AR, mac, yMac, xMacLE, sweepQC };
}

function winged(layout, params, options, requirements) {
  const derived = [];
  const checks = [];
  const notes = [];
  const wp = wingPlanform(params);
  const xRootLE = -params.wingPosition;
  const xAC = xRootLE - wp.xMacLE - 0.25 * wp.mac; // wing aerodynamic centre ≈ quarter-chord of the MAC
  const inp = (key) => pInput(params, key);

  derived.push(
    { id: 'geo-fw-ct', label: 'Tip chord', symbol: 'c_t', value: wp.tipChord, unit: 'm', equation: 'c_t = λ c_r', inputs: [inp('taperRatio'), inp('rootChord')], provenance: 'analytical' },
    { id: 'geo-fw-area', label: 'Wing reference area', symbol: 'S', value: wp.area, unit: 'm²', equation: 'S = b (c_r + c_t) / 2', inputs: [inp('span'), inp('rootChord'), inp('taperRatio')], provenance: 'analytical', note: 'Trapezoidal reference area, including the part covered by the fuselage.' },
    { id: 'geo-fw-ar', label: 'Aspect ratio', symbol: 'AR', value: wp.aspectRatio, unit: '1', equation: 'AR = b² / S', inputs: [inp('span'), { symbol: 'S', label: 'Wing area', value: wp.area, unit: 'm²' }], provenance: 'analytical', note: 'Higher aspect ratio lowers induced drag but adds structural weight.' },
    { id: 'geo-fw-mac', label: 'Mean aerodynamic chord', symbol: 'c̄', value: wp.mac, unit: 'm', equation: 'c̄ = (2/3) c_r (1 + λ + λ²) / (1 + λ)', inputs: [inp('rootChord'), inp('taperRatio')], provenance: 'analytical' },
    { id: 'geo-fw-ymac', label: 'Spanwise position of the MAC', symbol: 'ȳ', value: wp.yMac, unit: 'm', equation: 'ȳ = (b/6)(1 + 2λ)/(1 + λ)', inputs: [inp('span'), inp('taperRatio')], provenance: 'analytical' },
    { id: 'geo-fw-sweepqc', label: 'Quarter-chord sweep', symbol: 'Λ_c/4', value: wp.sweepQC, unit: 'rad', equation: 'tan Λ_c/4 = tan Λ_LE − (1 − λ) / (AR (1 + λ))', inputs: [inp('sweepLE'), inp('taperRatio'), { symbol: 'AR', label: 'Aspect ratio', value: wp.aspectRatio, unit: '1' }], provenance: 'analytical' },
    { id: 'geo-fw-xac', label: 'Wing aerodynamic centre behind the nose', symbol: 'x_ac', value: -xAC, unit: 'm', equation: 'x_ac = x_w + ȳ tan Λ_LE + 0.25 c̄', inputs: [inp('wingPosition'), inp('sweepLE')], provenance: 'conceptual-estimate', assumptions: ['Aerodynamic centre taken at the quarter-chord of the MAC (thin-aerofoil, subsonic approximation).'] },
    { id: 'geo-fw-fineness', label: 'Fuselage fineness ratio', symbol: 'L_f/d_f', value: params.fuselageLength / params.fuselageDiameter, unit: '1', equation: 'L_f / d_f', inputs: [inp('fuselageLength'), inp('fuselageDiameter')], provenance: 'analytical' },
  );

  const mass = requirements?.maxTakeoffMass?.value;
  if (typeof mass === 'number' && mass > 0) {
    derived.push({ id: 'geo-fw-ws', label: 'Wing loading at MTOW', symbol: 'W/S', value: (mass * G0) / wp.area, unit: 'Pa', equation: 'W/S = m_TO g₀ / S', inputs: [{ symbol: 'm_TO', label: 'Maximum take-off mass', value: mass, unit: 'kg' }, { symbol: 'S', label: 'Wing area', value: wp.area, unit: 'm²' }], provenance: 'analytical', note: 'Sets stall speed and gust response together with the lift coefficient (Build 5).' });
  }

  let tail = { type: layout.tail };
  if (layout.tail === 'conventional' || layout.tail === 'v') {
    const xTailAC = xAC - params.tailArm;
    const hSpan = params.hTailSpan;
    const hChord = params.hTailChord;
    let Sh;
    let Sv;
    if (layout.tail === 'v') {
      const gamma = params.vTailAngle;
      const Spanels = (hSpan * hChord) / Math.cos(gamma);
      Sh = Spanels * Math.cos(gamma) ** 2;
      Sv = Spanels * Math.sin(gamma) ** 2;
      derived.push({ id: 'geo-tail-sv-total', label: 'V-tail panel area (both panels)', symbol: 'S_V', value: Spanels, unit: 'm²', equation: 'S_V = b_h c_h / cos Γ_v', inputs: [inp('hTailSpan'), inp('hTailChord'), inp('vTailAngle')], provenance: 'analytical' });
      tail = { type: 'v', xLE: xTailAC + 0.25 * hChord, span: hSpan, chord: hChord, angle: gamma };
    } else {
      Sh = hSpan * hChord;
      Sv = params.vTailHeight * params.vTailChord;
      tail = { type: 'conventional', xLE: xTailAC + 0.25 * hChord, span: hSpan, chord: hChord, vHeight: params.vTailHeight, vChord: params.vTailChord, xLEv: xTailAC + 0.25 * params.vTailChord };
    }
    const VH = (Sh * params.tailArm) / (wp.area * wp.mac);
    const VV = (Sv * params.tailArm) / (wp.area * params.span);
    const tailInputs = [{ symbol: 'l_t', label: 'Tail arm', value: params.tailArm, unit: 'm' }, { symbol: 'S', label: 'Wing area', value: wp.area, unit: 'm²' }];
    derived.push(
      { id: 'geo-tail-sh', label: layout.tail === 'v' ? 'Effective horizontal tail area' : 'Horizontal tail area', symbol: 'S_h', value: Sh, unit: 'm²', equation: layout.tail === 'v' ? 'S_h = S_V cos² Γ_v' : 'S_h = b_h c_h', inputs: [inp('hTailSpan'), inp('hTailChord')], provenance: 'analytical' },
      { id: 'geo-tail-svert', label: layout.tail === 'v' ? 'Effective vertical tail area' : 'Vertical tail area', symbol: 'S_v', value: Sv, unit: 'm²', equation: layout.tail === 'v' ? 'S_v = S_V sin² Γ_v' : 'S_v = h_v c_v', inputs: layout.tail === 'v' ? [inp('vTailAngle')] : [inp('vTailHeight'), inp('vTailChord')], provenance: 'analytical' },
      { id: 'geo-tail-vh', label: 'Horizontal tail volume coefficient', symbol: 'V_H', value: VH, unit: '1', equation: 'V_H = S_h l_t / (S c̄)', inputs: [...tailInputs, { symbol: 'S_h', label: 'Horizontal tail area', value: Sh, unit: 'm²' }, { symbol: 'c̄', label: 'MAC', value: wp.mac, unit: 'm' }], provenance: 'analytical', note: 'Measures pitch stability and control power of the tail. Typical values: about 0.4–0.7 for light aircraft and gliders (Raymer, Aircraft Design: A Conceptual Approach, table 6.4).' },
      { id: 'geo-tail-vv', label: 'Vertical tail volume coefficient', symbol: 'V_V', value: VV, unit: '1', equation: 'V_V = S_v l_t / (S b)', inputs: [...tailInputs, { symbol: 'S_v', label: 'Vertical tail area', value: Sv, unit: 'm²' }, inp('span')], provenance: 'analytical', note: 'Measures directional stability. Typical values: about 0.02–0.05 (Raymer, table 6.4).' },
    );
    if (VH < 0.3) checks.push(tailCheck('GEO-TAIL-001', 'warning', 'Horizontal tail looks small for pitch stability', `The horizontal tail volume coefficient is ${VH.toFixed(2)}, below the range usually seen on conventional aircraft (about 0.4–0.7). The aircraft may lack pitch stability or elevator authority. Enlarge the tail or lengthen the tail arm.`, 'Typical: 0.4 ≤ V_H ≤ 0.7', tailInputs, { symbol: 'V_H', label: 'Horizontal tail volume', value: VH, unit: '1' }));
    else if (VH > 1.2) checks.push(tailCheck('GEO-TAIL-002', 'info', 'Horizontal tail is large', `The horizontal tail volume coefficient is ${VH.toFixed(2)}, well above typical values. That is stable but heavy and draggy; check that it is intended.`, 'Typical: 0.4 ≤ V_H ≤ 0.7', tailInputs, { symbol: 'V_H', label: 'Horizontal tail volume', value: VH, unit: '1' }));
    if (VV < 0.015) checks.push(tailCheck('GEO-TAIL-003', 'warning', 'Vertical tail looks small for directional stability', `The vertical tail volume coefficient is ${VV.toFixed(3)}, below the range usually seen (about 0.02–0.05). The aircraft may weathercock poorly or lack rudder authority.`, 'Typical: 0.02 ≤ V_V ≤ 0.05', tailInputs, { symbol: 'V_V', label: 'Vertical tail volume', value: VV, unit: '1' }));
    const wingTE = params.wingPosition + params.rootChord;
    if (-tail.xLE < wingTE) {
      checks.push({ id: 'GEO-TAIL-004', severity: 'error', title: 'Tail overlaps the wing', message: 'With this tail arm the tail’s leading edge lies ahead of the wing root trailing edge. Lengthen the tail arm or move the wing forward.', equation: 'Required: x_tail,LE > x_w + c_r', inputs: [inp('tailArm'), inp('wingPosition'), inp('rootChord')], result: { symbol: 'x_tail,LE', label: 'Tail leading edge behind nose', value: -tail.xLE, unit: 'm' }, assumptions: ['Plan-view geometry only.'], provenance: 'analytical' });
    }
  } else {
    notes.push('Tailless layout: pitch stability depends on sweep, twist and reflex, which are analysed in the stability build (Build 6).');
  }

  if (wp.aspectRatio < 3 && layout.id !== 'delta' && layout.family !== 'vtol') {
    checks.push({ id: 'GEO-FW-001', severity: 'info', title: 'Very low aspect ratio', message: `The aspect ratio is ${wp.aspectRatio.toFixed(1)}. Below about 3 the wing behaves like a delta or low-aspect-ratio planform with high induced drag. Check that this is intended.`, equation: 'AR = b² / S', inputs: [inp('span'), inp('rootChord'), inp('taperRatio')], result: { symbol: 'AR', label: 'Aspect ratio', value: wp.aspectRatio, unit: '1' }, assumptions: [], provenance: 'analytical' });
  }

  const wing = { span: params.span, rootChord: params.rootChord, tipChord: wp.tipChord, sweepLE: params.sweepLE, dihedral: params.dihedral, xRootLE, mac: wp.mac, yMac: wp.yMac, xAC };
  const fuselage = { length: params.fuselageLength, diameter: params.fuselageDiameter };
  const rotors = [];
  if (layout.propulsion && options?.propulsion && params.propDiameter) {
    const pusher = options.propulsion === 'pusher';
    const xp = pusher ? -Math.max(params.fuselageLength, params.wingPosition + params.rootChord) - 0.02 : 0.02;
    rotors.push({ x: xp, y: 0, z: 0, diameter: params.propDiameter, axis: 'x', role: 'cruise', spin: 'cw' });
  }
  return { wing, fuselage, tail, rotors, derived, checks, notes, xAC };
}

function vtolLift(layout, params, base, requirements) {
  const D = params.liftPropDiameter;
  const rotors = [];
  const booms = [];
  const halfSpan = params.span / 2;
  if (layout.lift === 'quadplane') {
    const y = params.liftRotorY;
    const x = params.liftRotorX;
    for (const side of [1, -1]) {
      rotors.push({ x: base.xAC + x, y: side * y, z: 0.04, diameter: D, axis: 'z', role: 'lift', spin: side > 0 ? 'ccw' : 'cw' });
      rotors.push({ x: base.xAC - x, y: side * y, z: 0.04, diameter: D, axis: 'z', role: 'lift', spin: side > 0 ? 'cw' : 'ccw' });
      booms.push({ from: { x: base.xAC + x + D * 0.1, y: side * y, z: 0 }, to: { x: base.xAC - x - D * 0.1, y: side * y, z: 0 } });
    }
  } else if (layout.lift === 'tiltrotor') {
    const tipX = base.wing.xRootLE - halfSpan * Math.tan(params.sweepLE) + 0.05 * D;
    rotors.push({ x: tipX, y: halfSpan, z: 0.05, diameter: D, axis: 'z', role: 'lift', spin: 'ccw', tilting: true });
    rotors.push({ x: tipX, y: -halfSpan, z: 0.05, diameter: D, axis: 'z', role: 'lift', spin: 'cw', tilting: true });
    rotors.push({ x: base.xAC - params.tailArm, y: 0, z: 0.05, diameter: D * 0.8, axis: 'z', role: 'lift', spin: 'ccw' });
  } else if (layout.lift === 'tailsitter') {
    const y = halfSpan / 2;
    const x = base.wing.xRootLE - y * Math.tan(params.sweepLE) + 0.05;
    const z = 0.6 * D;
    [[y, z, 'ccw'], [y, -z, 'cw'], [-y, -z, 'ccw'], [-y, z, 'cw']].forEach(([yy, zz, spin]) => rotors.push({ x, y: yy, z: zz, diameter: D, axis: 'x', role: 'lift', spin }));
  }
  const hoverRotors = layout.lift === 'tailsitter' ? rotors.map((r) => ({ ...r, x: r.y, y: r.z })) : rotors;
  // The tiltrotor rear rotor is smaller; the disc analysis uses the main diameter for all (stated).
  const analysis = rotorAnalysis({ rotors: hoverRotors, diameter: D, diameterKey: 'liftPropDiameter', params, requirements, idPrefix: 'geo-lift', labelPrefix: 'Lift rotors: ' });
  const notes = [];
  if (layout.lift === 'tailsitter') notes.push('Tailsitter: the rotors face forward in cruise and lift the aircraft nose-up in hover. Their spacing is checked in the hover plane.');
  if (layout.lift === 'tiltrotor') notes.push('Tilt-rotor: the wing-tip rotors are drawn in hover position. The rear rotor is drawn at 80 % of the lift diameter; the disc area uses the lift diameter for all three (upper bound).');
  if (layout.lift === 'quadplane' && params.liftRotorY - D / 2 < params.fuselageDiameter / 2) {
    analysis.checks.push({ id: 'GEO-LIFT-004', severity: 'warning', title: 'Lift rotors reach over the fuselage', message: 'The inner part of each lift-rotor disc lies over the fuselage, which blocks the downwash. Move the booms outwards or use smaller lift propellers.', equation: 'Preferred: y_L − D_L/2 ≥ d_f/2', inputs: [pInput(params, 'liftRotorY'), pInput(params, 'liftPropDiameter'), pInput(params, 'fuselageDiameter')], result: { symbol: 'y_L − D_L/2', label: 'Inner disc edge from centreline', value: params.liftRotorY - D / 2, unit: 'm' }, assumptions: ['Plan-view geometry only.'], provenance: 'analytical' });
  }
  return { rotors, booms, derived: analysis.derived, checks: analysis.checks, notes };
}

function extentsOf(parts) {
  const xs = [];
  const ys = [];
  const zs = [];
  const { wing, fuselage, tail, rotors, booms } = parts;
  if (fuselage) {
    xs.push(0, -fuselage.length);
    zs.push(fuselage.diameter / 2, -fuselage.diameter / 2);
  }
  if (wing) {
    const half = wing.span / 2;
    const tipLE = wing.xRootLE - half * Math.tan(wing.sweepLE);
    xs.push(wing.xRootLE, wing.xRootLE - wing.rootChord, tipLE, tipLE - wing.tipChord);
    ys.push(half, -half);
    zs.push(half * Math.tan(wing.dihedral));
  }
  if (tail?.xLE !== undefined) {
    xs.push(tail.xLE, tail.xLE - tail.chord);
    ys.push(tail.span / 2, -tail.span / 2);
    if (tail.type === 'v') zs.push((tail.span / 2) * Math.tan(tail.angle));
    if (tail.vHeight) {
      zs.push(tail.vHeight);
      xs.push(tail.xLEv - tail.vChord);
    }
  }
  for (const r of rotors ?? []) {
    const radius = r.diameter / 2;
    if (r.axis === 'z') {
      xs.push(r.x + radius, r.x - radius);
      ys.push(r.y + radius, r.y - radius);
      zs.push(r.z);
    } else {
      xs.push(r.x);
      ys.push(r.y + radius, r.y - radius);
      zs.push(r.z + radius, r.z - radius);
    }
  }
  for (const b of booms ?? []) xs.push(b.from.x, b.to.x);
  return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)], z: [Math.min(...zs), Math.max(...zs)] };
}

/** Readable display unit for a geometric quantity (values stay in SI). */
export function geometryDisplayUnit(value, unit) {
  if (unit === 'm') return Math.abs(value) < 1 ? 'mm' : 'm';
  if (unit === 'm²') return Math.abs(value) < 0.01 ? 'cm²' : 'm²';
  if (unit === 'rad') return 'deg';
  return undefined;
}

function annotateUnits(result) {
  const tag = (item) => {
    if (!item) return;
    const unit = geometryDisplayUnit(item.value, item.unit);
    if (unit) item.displayUnit = unit;
  };
  for (const d of result.derived) {
    tag(d);
    d.inputs?.forEach(tag);
  }
  for (const c of result.checks) {
    tag(c.result);
    c.inputs?.forEach(tag);
  }
  return result;
}

/**
 * Compute the conceptual geometry of a configuration.
 * @returns {object|null} null when the layout has no geometry model in this build
 */
export function computeGeometry(configuration, requirements = {}) {
  const layout = layoutInfo(configuration?.layout);
  if (!layout || layout.family === 'none') return null;
  const params = configuration.params ?? {};
  const order = { error: 0, warning: 1, info: 2 };
  if (layout.family === 'multirotor') {
    const result = { layout: layout.id, ...multirotor(layout, params, requirements) };
    result.checks.sort((a, b) => order[a.severity] - order[b.severity]);
    return annotateUnits(result);
  }
  const base = winged(layout, params, configuration.options, requirements);
  const result = { layout: layout.id, family: layout.family, wing: base.wing, fuselage: base.fuselage, tail: base.tail, rotors: base.rotors, booms: [], derived: base.derived, checks: base.checks, notes: base.notes };
  if (layout.family === 'vtol') {
    const lift = vtolLift(layout, params, base, requirements);
    result.rotors = [...result.rotors, ...lift.rotors];
    result.booms = lift.booms;
    result.derived = [...result.derived, ...lift.derived];
    result.checks = [...result.checks, ...lift.checks];
    result.notes = [...result.notes, ...lift.notes];
  }
  result.extents = extentsOf(result);
  result.checks.sort((a, b) => order[a.severity] - order[b.severity]);
  return annotateUnits(result);
}

function tailCheck(id, severity, title, message, equation, inputs, result) {
  return { id, severity, title, message, equation, inputs, result, assumptions: ['Typical ranges from conceptual-design statistics (Raymer, table 6.4); they are guidance, not limits.'], provenance: 'conceptual-estimate' };
}
