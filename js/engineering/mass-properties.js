/**
 * Mass properties (Build 6): centre of gravity and inertia tensor from where every part
 * sits. See docs/engineering-models.md §12.
 *
 * Body frame as in geometry.js: x forward, y to the side, z up (metres). Fixed-wing noses
 * are at x ≈ 0 with the fuselage along −x; multirotors are centred on the origin.
 *
 * The same masses as the mass budget in Propulsion & Energy are placed:
 *  - motors and propellers at each rotor (point masses);
 *  - the structure estimate, split over the airframe as simple shapes (multirotor: central
 *    disc 40 %, arms 60 %; winged: wing 45 %, fuselage 30 %, tail 15 %, booms 10 % — the
 *    boom share goes to the fuselage when there are no booms);
 *  - every avionics component, at its placement (yours, or a sensible default by type);
 *  - the payload target (requirement), at its placement.
 * Parts are point masses except the structure, which uses thin-rod, thin-plate and solid-
 * disc inertias about their own centroids, moved to the CG with the parallel-axis theorem.
 */
import { G0 } from './atmosphere.js';
import { componentType } from './components.js';

const LIMIT = 50; // |coordinate| m

export const emptyMassProperties = () => ({ placements: {}, payload: null });

const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const zero3 = () => [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

/** Inertia of a thin rod from a to b about its centroid. */
function rodInertia(m, a, b) {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const L = Math.hypot(...d);
  if (!(L > 0)) return zero3();
  const u = d.map((c) => c / L);
  const k = (m * L * L) / 12;
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => k * ((i === j ? 1 : 0) - u[i] * u[j])));
}

/** Rod with a radius (thin-walled tube): adds m r² about the axis and m r²/2 across it. */
function tubeInertia(m, a, b, r) {
  const I = rodInertia(m, a, b);
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const L = Math.hypot(...d) || 1;
  const u = d.map((c) => c / L);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => I[i][j] + m * r * r * (0.5 * (i === j ? 1 : 0) + 0.5 * u[i] * u[j])));
}

/** Solid disc in the x–y plane. */
function discInertia(m, R, h) {
  const t = (m * (3 * R * R + h * h)) / 12;
  return [
    [t, 0, 0],
    [0, t, 0],
    [0, 0, (m * R * R) / 2],
  ];
}

/** Default placement of a component by type (and its index among the same type). */
export function defaultPlacement(item, geometry, index = 0) {
  const t = item.type;
  if (geometry.wing && geometry.fuselage?.length > 0) {
    const L = geometry.fuselage.length;
    const r = geometry.fuselage.diameter / 2;
    const at = (f, z = 0) => v3(-f * L, 0, z * r);
    switch (t) {
      case 'battery': return at(0.22);
      case 'regulator': return at(0.28);
      case 'flight-controller': return at(0.32);
      case 'companion': return at(0.38);
      case 'esc': return at(0.06);
      case 'receiver': return at(0.42, 0.3);
      case 'telemetry': return at(0.46, 0.3);
      case 'gnss': return at(0.3, 1.2);
      case 'sensor': return at(0.04, -0.3);
      case 'payload': return at(0.3, -0.8);
      default: return at(0.3);
    }
  }
  const body = geometry.body ?? { diameter: 0.1, height: 0.05 };
  const R = body.diameter / 2;
  const top = body.height / 2;
  switch (t) {
    case 'battery': return v3(0, 0, top + 0.02);
    case 'flight-controller': return v3(0, 0, 0);
    case 'regulator': return v3(-0.3 * R, 0, 0);
    case 'companion': return v3(0.3 * R, 0, -top);
    case 'esc': return v3(0, 0, 0); // spread over the arms (see placeItems)
    case 'receiver': return v3(-0.6 * R, 0.3 * R, 0);
    case 'telemetry': return v3(-0.8 * R, -0.3 * R, 0);
    case 'gnss': return v3(0, 0, top + 0.07);
    case 'sensor': return v3(0.5 * R, 0, -top);
    case 'payload': return v3(0, 0, -top - 0.03 * (1 + index));
    default: return v3(0, 0, 0);
  }
}

export function defaultPayloadPlacement(geometry) {
  if (geometry.wing && geometry.fuselage?.length > 0) return v3(geometry.wing.xAC, 0, -geometry.fuselage.diameter / 2);
  const top = (geometry.body?.height ?? 0.05) / 2;
  return v3(0, 0, -top - 0.04);
}

const validPoint = (p) => p && ['x', 'y', 'z'].every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]) && Math.abs(p[k]) <= LIMIT);

/**
 * Build the list of mass items.
 * @returns {Array<{ id, label, group, mass, position, inertia?, movable, auto }>}
 */
export function massItems({ geometry, components, propulsion, requirements = {}, massProperties, balanceX = null }) {
  const items = [];
  const placements = massProperties?.placements ?? {};
  const lift = geometry.rotors ?? [];
  const motor = propulsion?.motor?.specs?.mass ?? 0;
  const prop = propulsion?.propeller?.specs?.mass ?? 0;
  const separate = lift.some((r) => r.role === 'lift') && lift.some((r) => r.role === 'cruise') && propulsion?.cruise?.motor?.specs && propulsion?.cruise?.propeller?.specs;
  lift.forEach((r, i) => {
    const m = separate && r.role === 'cruise' ? (propulsion.cruise.motor.specs.mass ?? 0) + (propulsion.cruise.propeller.specs.mass ?? 0) : motor + prop;
    if (m > 0) items.push({ id: `rotor-${i}`, label: r.role === 'cruise' ? 'Cruise motor + propeller' : `Motor + propeller ${i + 1}`, group: 'Propulsion', mass: m, position: v3(r.x, r.y, r.z), movable: false, auto: true });
  });

  // Structure
  const structure = propulsion?.settings?.structureMass ?? 0;
  if (structure > 0) {
    if (geometry.wing) {
      const w = geometry.wing;
      const fus = geometry.fuselage?.length > 0 ? geometry.fuselage : null;
      const booms = geometry.booms ?? [];
      const tail = geometry.tail && geometry.tail.type !== 'none' ? geometry.tail : null;
      let share = { wing: 0.45, fuselage: fus ? 0.3 : 0, tail: tail ? 0.15 : 0, booms: booms.length ? 0.1 : 0 };
      const sum = share.wing + share.fuselage + share.tail + share.booms;
      share = Object.fromEntries(Object.entries(share).map(([k, s]) => [k, s / sum]));
      const halfSpan = w.span / 2;
      const tanLE = Math.tan(w.sweepLE ?? 0);
      const dz = halfSpan * Math.tan(w.dihedral ?? 0);
      const xc = (y) => w.xRootLE - y * tanLE - (w.rootChord + (w.tipChord - w.rootChord) * (y / halfSpan)) * 0.4;
      const mw = structure * share.wing;
      for (const side of [1, -1]) {
        const a = v3(xc(0), 0, 0);
        const b = v3(xc(halfSpan), side * halfSpan, dz);
        const I = rodInertia(mw / 2, a, b);
        I[0][0] += 0;
        const chordTerm = ((mw / 2) * w.mac * w.mac) / 12;
        I[1][1] += chordTerm;
        I[2][2] += chordTerm;
        items.push({ id: `wing-${side > 0 ? 'r' : 'l'}`, label: side > 0 ? 'Wing (one side)' : 'Wing (other side)', group: 'Structure', mass: mw / 2, position: v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), inertia: I, movable: false, auto: true });
      }
      if (fus) {
        const m = structure * share.fuselage;
        const a = v3(0, 0, 0);
        const b = v3(-fus.length, 0, 0);
        items.push({ id: 'fuselage', label: 'Fuselage', group: 'Structure', mass: m, position: v3(-0.45 * fus.length, 0, 0), inertia: tubeInertia(m, a, b, fus.diameter / 2), movable: false, auto: true });
      }
      if (tail) {
        const m = structure * share.tail;
        const x = tail.xLE - 0.4 * tail.chord;
        const I = rodInertia(m, v3(x, -tail.span / 2, 0), v3(x, tail.span / 2, 0));
        items.push({ id: 'tail', label: 'Tail', group: 'Structure', mass: m, position: v3(x, 0, (tail.vHeight ?? 0) * 0.25), inertia: I, movable: false, auto: true });
      }
      booms.forEach((bm, i) => {
        const m = (structure * share.booms) / booms.length;
        items.push({ id: `boom-${i}`, label: `Boom ${i + 1}`, group: 'Structure', mass: m, position: v3((bm.from.x + bm.to.x) / 2, (bm.from.y + bm.to.y) / 2, (bm.from.z + bm.to.z) / 2), inertia: rodInertia(m, bm.from, bm.to), movable: false, auto: true });
      });
    } else {
      const body = geometry.body ?? { diameter: 0.1, height: 0.05 };
      const mb = structure * (lift.length ? 0.4 : 1);
      items.push({ id: 'body', label: 'Centre frame', group: 'Structure', mass: mb, position: v3(0, 0, 0), inertia: discInertia(mb, body.diameter / 2, body.height), movable: false, auto: true });
      const arms = lift.filter((r) => Math.hypot(r.x, r.y) > 1e-6);
      arms.forEach((r, i) => {
        const m = (structure * 0.6) / arms.length;
        const a = v3(0, 0, 0);
        const b = v3(r.x, r.y, 0);
        items.push({ id: `arm-${i}`, label: `Arm ${i + 1}`, group: 'Structure', mass: m, position: v3(r.x / 2, r.y / 2, 0), inertia: rodInertia(m, a, b), movable: false, auto: true });
      });
      if (!arms.length && lift.length) items[items.length - 1].mass += structure * 0.6;
    }
  }

  // Components
  const counts = {};
  const liftRotors = lift.filter((r) => r.axis === 'z');
  for (const c of components?.items ?? []) {
    const unit = c.specs?.mass ?? 0;
    const qty = c.quantity ?? 1;
    if (!(unit > 0)) continue;
    const idx = (counts[c.type] = (counts[c.type] ?? -1) + 1);
    const typeLabel = componentType(c.type)?.label ?? c.type;
    const user = placements[c.id];
    if (c.type === 'esc' && !validPoint(user) && !geometry.wing && liftRotors.length && qty > 1) {
      for (let k = 0; k < qty; k += 1) {
        const r = liftRotors[k % liftRotors.length];
        items.push({ id: `${c.id}#${k}`, componentId: c.id, label: `${c.name} ${k + 1}`, group: typeLabel, mass: unit, position: v3(0.6 * r.x, 0.6 * r.y, 0), movable: false, auto: true });
      }
      continue;
    }
    const position = validPoint(user) ? { ...user } : defaultPlacement(c, geometry, idx);
    items.push({ id: c.id, componentId: c.id, label: qty > 1 ? `${c.name} × ${qty}` : c.name, group: typeLabel, mass: unit * qty, position, movable: true, auto: !validPoint(user), type: c.type });
  }
  const payload = requirements.payloadMass?.value ?? 0;
  if (payload > 0) {
    const user = massProperties?.payload;
    items.push({ id: 'payload-target', label: 'Payload (target)', group: 'Payload', mass: payload, position: validPoint(user) ? { ...user } : defaultPayloadPlacement(geometry), movable: true, auto: !validPoint(user) });
  }
  // Winged aircraft: batteries without a placement slide along the fuselage to balance.
  if (typeof balanceX === 'number' && geometry.wing && geometry.fuselage?.length > 0) {
    const autoBatteries = items.filter((i) => i.type === 'battery' && i.auto);
    if (autoBatteries.length) {
      const x = balancedX(items, autoBatteries, balanceX, [-0.9 * geometry.fuselage.length, -0.03 * geometry.fuselage.length]);
      autoBatteries.forEach((b) => {
        b.position = { ...b.position, x: x.value };
        b.balanced = true;
        b.balanceReached = x.reached;
      });
    }
  }
  return items;
}

/** x position for the chosen items (moved together) that puts the overall CG at targetX. */
export function balancedX(items, movers, targetX, [lo, hi]) {
  const set = new Set(movers);
  const total = items.reduce((sum, i) => sum + i.mass, 0);
  const mm = movers.reduce((sum, i) => sum + i.mass, 0);
  const others = items.filter((i) => !set.has(i)).reduce((sum, i) => sum + i.mass * i.position.x, 0);
  if (!(mm > 0)) return { value: movers[0]?.position.x ?? 0, reached: false };
  const x = (targetX * total - others) / mm;
  const value = Math.min(hi, Math.max(lo, x));
  return { value, reached: Math.abs(value - x) < 1e-9 };
}

/** Totals: mass, CG and inertia tensor about the CG. */
export function combine(items) {
  const mass = items.reduce((s, i) => s + i.mass, 0);
  if (!(mass > 0)) return { mass: 0, cg: v3(), inertia: zero3() };
  const cg = v3(...['x', 'y', 'z'].map((k) => items.reduce((s, i) => s + i.mass * i.position[k], 0) / mass));
  const I = zero3();
  for (const it of items) {
    const r = [it.position.x - cg.x, it.position.y - cg.y, it.position.z - cg.z];
    const r2 = r[0] ** 2 + r[1] ** 2 + r[2] ** 2;
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        I[i][j] += (it.inertia?.[i]?.[j] ?? 0) + it.mass * ((i === j ? r2 : 0) - r[i] * r[j]);
      }
    }
  }
  return { mass, cg, inertia: I };
}

/** Thrust each lift rotor must give to hover without a pitch or roll moment (minimum-norm). */
export function hoverThrustSplit(rotors, cg, weight) {
  const n = rotors.length;
  if (n < 3) return null;
  const A = [rotors.map(() => 1), rotors.map((r) => r.x - cg.x), rotors.map((r) => r.y - cg.y)];
  const b = [weight, 0, 0];
  const AAt = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i].reduce((s, a, k) => s + a * A[j][k], 0)));
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(AAt);
  if (Math.abs(D) < 1e-12) return null;
  const solve = (col) => det(AAt.map((row, i) => row.map((v, j) => (j === col ? b[i] : v)))) / D;
  const lam = [solve(0), solve(1), solve(2)];
  const thrusts = rotors.map((_, k) => lam[0] * A[0][k] + lam[1] * A[1][k] + lam[2] * A[2][k]);
  const mean = weight / n;
  return { thrusts, mean, maxRatio: Math.max(...thrusts) / mean, minRatio: Math.min(...thrusts) / mean };
}

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });

/**
 * @returns {{ items, mass, cg, inertia, thrustCentre, hover, checks, derived, notes, reference }}
 */
export function analyseMassProperties({ geometry, components, propulsion, requirements = {}, massProperties, maxThrustPerRotor = null, balanceX = null }) {
  const checks = [];
  const derived = [];
  if (!geometry) return { items: [], mass: 0, cg: v3(), inertia: zero3(), checks, derived, notes: [] };
  const items = massItems({ geometry, components, propulsion, requirements, massProperties, balanceX });
  const { mass, cg, inertia } = combine(items);
  const notes = [];
  if (!(mass > 0)) return { items, mass, cg, inertia, checks, derived, notes: ['Add parts, a motor and a structure estimate to see the balance.'] };
  const liftRotors = (geometry.rotors ?? []).filter((r) => r.axis === 'z' && r.role !== 'cruise');
  const thrustCentre = liftRotors.length ? v3(liftRotors.reduce((s, r) => s + r.x, 0) / liftRotors.length, liftRotors.reduce((s, r) => s + r.y, 0) / liftRotors.length, 0) : null;
  const hover = liftRotors.length >= 3 ? hoverThrustSplit(liftRotors, cg, mass * G0) : null;
  const span = geometry.wing?.span ?? Math.max(geometry.extents.y[1] - geometry.extents.y[0], 0.05);
  const armR = liftRotors.length ? Math.max(...liftRotors.map((r) => Math.hypot(r.x - (thrustCentre?.x ?? 0), r.y - (thrustCentre?.y ?? 0)))) : null;

  derived.push(
    { id: 'mp-mass', label: 'Mass placed', symbol: 'm', value: mass, unit: 'kg', displayUnit: mass < 1 ? 'g' : 'kg', equation: 'm = Σ m_i', inputs: [], provenance: 'conceptual-estimate', note: 'The same parts as the mass budget in Propulsion & Energy.' },
    { id: 'mp-cg-x', label: geometry.wing ? 'CG position behind the nose' : 'CG position forward of centre', symbol: geometry.wing ? 'x_cg' : 'x_cg', value: geometry.wing ? -cg.x : cg.x, unit: 'm', displayUnit: 'mm', equation: 'x_cg = Σ m_i x_i / Σ m_i', inputs: [], provenance: 'conceptual-estimate' },
    { id: 'mp-cg-y', label: 'CG side offset', symbol: 'y_cg', value: cg.y, unit: 'm', displayUnit: 'mm', equation: 'y_cg = Σ m_i y_i / Σ m_i', inputs: [], provenance: 'conceptual-estimate' },
    { id: 'mp-cg-z', label: 'CG height', symbol: 'z_cg', value: cg.z, unit: 'm', displayUnit: 'mm', equation: 'z_cg = Σ m_i z_i / Σ m_i', inputs: [], provenance: 'conceptual-estimate' },
    { id: 'mp-ixx', label: 'Roll moment of inertia', symbol: 'I_xx', value: inertia[0][0], unit: 'kg·m²', equation: 'I = Σ [I_i + m_i (|r_i|² E − r_i r_iᵀ)]', inputs: [], provenance: 'conceptual-estimate', note: 'About the CG; structure as rods, plates and discs, parts as points.' },
    { id: 'mp-iyy', label: 'Pitch moment of inertia', symbol: 'I_yy', value: inertia[1][1], unit: 'kg·m²', equation: 'parallel-axis theorem about the CG', inputs: [], provenance: 'conceptual-estimate' },
    { id: 'mp-izz', label: 'Yaw moment of inertia', symbol: 'I_zz', value: inertia[2][2], unit: 'kg·m²', equation: 'parallel-axis theorem about the CG', inputs: [], provenance: 'conceptual-estimate' },
    { id: 'mp-ixz', label: 'Product of inertia', symbol: 'I_xz', value: -inertia[0][2], unit: 'kg·m²', equation: 'I_xz = Σ m_i x_i z_i (about the CG)', inputs: [], provenance: 'conceptual-estimate' },
  );

  if (hover && thrustCentre) {
    const off = Math.hypot(cg.x - thrustCentre.x, cg.y - thrustCentre.y);
    derived.push({ id: 'mp-hover-split', label: 'Most-loaded rotor in hover, relative to the mean', symbol: 'T_max/T̄', value: hover.maxRatio, unit: '1', displayUnit: '%', equation: 'Minimum-norm T with ΣT = W, Σ T (x − x_cg) = 0, Σ T (y − y_cg) = 0', inputs: [q('d', 'CG offset from the thrust centre', off, 'm', 'mm')], provenance: 'analytical' });
    if (hover.minRatio < 0) checks.push({ id: 'MP-CG-001', severity: 'error', title: 'The CG is outside the rotors: it cannot hover level', message: `The CG is ${(off * 1000).toFixed(0)} mm from the centre of the rotors, beyond the rotor ring. Move heavy parts (battery, payload) towards the centre.`, equation: 'All T_i ≥ 0', inputs: [], assumptions: [], provenance: 'analytical' });
    else if (maxThrustPerRotor && hover.thrusts.some((t) => t > 0.8 * maxThrustPerRotor)) checks.push({ id: 'MP-CG-002', severity: 'warning', title: 'An off-centre CG overloads one motor', message: `To hover level, the most-loaded rotor needs ${((hover.maxRatio - 1) * 100).toFixed(0)} % more than the average — over 80 % of its full-throttle thrust, leaving little for control. Move the CG towards the centre.`, equation: 'T_i ≤ 0.8 T_max', inputs: [], assumptions: [], provenance: 'analytical' });
    else if (armR && off > 0.03 * armR) checks.push({ id: 'MP-CG-003', severity: 'warning', title: 'CG is off the centre of thrust', message: `The CG is ${(off * 1000).toFixed(0)} mm from the centre of the rotors; one side works ${((hover.maxRatio - 1) * 100).toFixed(0)} % harder than average in hover. Within 3 % of the arm radius (${(0.03 * armR * 1000).toFixed(0)} mm) is good practice.`, equation: 'd ≤ 0.03 R_arm', inputs: [q('d', 'CG offset', off, 'm', 'mm')], assumptions: [], provenance: 'analytical' });
  }
  if (Math.abs(cg.y) > 0.01 * span && !hover) checks.push({ id: 'MP-CG-004', severity: 'warning', title: 'CG is off the centre line', message: `The CG is ${(Math.abs(cg.y) * 1000).toFixed(0)} mm to one side; the aircraft will need constant aileron or rudder trim. Balance the parts across the centre line.`, equation: '|y_cg| ≤ 1 % span', inputs: [], assumptions: [], provenance: 'analytical' });
  const balanced = items.filter((i) => i.balanced);
  if (balanced.length) {
    if (balanced[0].balanceReached) notes.push('The battery is placed automatically to give a 10 % static margin. Move it (or place it yourself) to see the effect.');
    else checks.push({ id: 'MP-BAL-001', severity: 'warning', title: 'The battery cannot balance the aircraft inside the fuselage', message: 'Even at the end of the fuselage the CG misses the 10 % static-margin target. Move other heavy parts, lengthen the nose or tail, or resize the tail.', equation: 'x_battery within the fuselage', inputs: [], assumptions: [], provenance: 'analytical' });
  }
  if (items.some((i) => i.movable && i.auto && !i.balanced)) notes.push('Parts without a placement use a typical default position; move them to where they really sit.');
  return { items, mass, cg, inertia, thrustCentre, hover, checks, derived, notes, balanceX };
}

export function validateMassProperties(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || typeof data.placements !== 'object' || data.placements === null || Array.isArray(data.placements)) return ['modules.massProperties must be { placements: {}, payload }'];
  const keys = Object.keys(data.placements);
  if (keys.length > 400) errors.push('Too many placements');
  for (const k of keys) {
    if (!/^cmp_[A-Za-z0-9_-]{1,64}$/.test(k)) errors.push(`Invalid placement key ${k.slice(0, 40)}`);
    else if (!validPoint(data.placements[k])) errors.push(`Placement of ${k} must be { x, y, z } within ±${LIMIT} m`);
  }
  if (data.payload !== null && data.payload !== undefined && !validPoint(data.payload)) errors.push('Payload placement must be { x, y, z } or null');
  return errors;
}

export function sanitizeMassProperties(input, componentIds = null) {
  const out = emptyMassProperties();
  if (!input || typeof input !== 'object') return out;
  for (const [k, p] of Object.entries(input.placements ?? {})) {
    if (/^cmp_[A-Za-z0-9_-]{1,64}$/.test(k) && validPoint(p) && (!componentIds || componentIds.has(k))) out.placements[k] = { x: p.x, y: p.y, z: p.z };
  }
  if (validPoint(input.payload)) out.payload = { x: input.payload.x, y: input.payload.y, z: input.payload.z };
  return out;
}
