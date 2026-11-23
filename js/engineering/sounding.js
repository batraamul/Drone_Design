/**
 * Stratospheric Sounding Laboratory — balloon-carried glide-sonde mission (Build 13, first part).
 *
 * Mission stages (simulation only; never connected to hardware):
 *   1. Ascent   — latex balloon carries the aircraft to the release altitude (default 33 km AGL).
 *   2. Release  — the aircraft drops nose-down from rest relative to the air ("stall" phase:
 *                 too little dynamic pressure for lift) and pulls out within a load-factor limit.
 *   3. Glide    — unpowered glide at the best lift-to-drag lift coefficient while the sonde samples.
 *   4. Hybrid   — below a switch altitude the motor runs (powered cruise) on the remaining battery.
 *
 * Models (docs/engineering-models.md §8):
 *  - Balloon: lifting gas at ambient temperature and pressure (zero superpressure), so the
 *    gross lift L = n_gas (M_air − M_gas) g is constant with altitude while the volume grows as
 *    V = n_gas R T / p. Free lift F = (L − total weight) is constant; ascent rate from the drag
 *    balance v = √(2F / (ρ C_D A)), A = π r². Burst when the diameter reaches the burst diameter.
 *  - Aircraft: 2-D point mass with lift L = C_L q S, drag D = (C_D0 + k C_L²) q S, k = 1/(π e AR),
 *    integrated with RK4 in the ISA. Pull-out law: C_L = min(C_Lmax, n_max W/(qS)) until the
 *    flight path reaches the equilibrium glide angle; then a flight-path-angle hold about C_L*.
 */
import { isPlainObject } from '../utils/immutable.js';
import { G0, isa } from './atmosphere.js';

export const GASES = Object.freeze({
  helium: { label: 'Helium', molarMass: 0.0040026 },
  hydrogen: { label: 'Hydrogen', molarMass: 0.00201588 },
});
const M_AIR = 0.0289644; // kg/mol
const R_UNIVERSAL = 8.31432; // J/(mol·K), as used by the 1976 standard atmosphere

/** Illustrative latex sounding balloons (mass → burst diameter), typical of manufacturer charts. */
export const BALLOON_CATALOGUE = Object.freeze([
  { catalogueId: 'ill-bal-600', name: 'Example 600 g latex balloon', specs: { mass: 0.6, burstDiameter: 6.0 } },
  { catalogueId: 'ill-bal-1000', name: 'Example 1000 g latex balloon', specs: { mass: 1.0, burstDiameter: 7.9 } },
  { catalogueId: 'ill-bal-1500', name: 'Example 1500 g latex balloon', specs: { mass: 1.5, burstDiameter: 9.4 } },
  { catalogueId: 'ill-bal-2000', name: 'Example 2000 g latex balloon', specs: { mass: 2.0, burstDiameter: 10.5 } },
  { catalogueId: 'ill-bal-3000', name: 'Example 3000 g latex balloon', specs: { mass: 3.0, burstDiameter: 13.0 } },
]);

export const SOUNDING_FIELDS = Object.freeze({
  launchElevation: { label: 'Launch site elevation', symbol: 'h₀', unit: 'm', displayUnits: ['m', 'ft'], min: -400, max: 6000 },
  balloonMass: { label: 'Balloon mass', symbol: 'm_b', unit: 'kg', displayUnits: ['g', 'kg'], min: 0.1, max: 50 },
  burstDiameter: { label: 'Burst diameter', symbol: 'd_burst', unit: 'm', displayUnits: ['m'], min: 1, max: 60, help: 'From the balloon datasheet; real bursts vary by ±10 % or more.' },
  balloonCd: { label: 'Balloon drag coefficient', symbol: 'C_D,b', unit: '1', displayUnits: ['1'], min: 0.1, max: 1, help: '0.25–0.3 is commonly used for latex sounding balloons.' },
  freeLift: { label: 'Free lift', symbol: 'F', unit: 'kg', displayUnits: ['g', 'kg'], min: 0.05, max: 50, help: 'Lift beyond the total weight (as measured with a weight on the filler). Sets the ascent rate.' },
  trainMass: { label: 'Flight train mass (stays with balloon)', symbol: 'm_t', unit: 'kg', displayUnits: ['g', 'kg'], min: 0, max: 20, help: 'Cord, release mechanism, parachute for the balloon remains.' },
  payloadMass: { label: 'Aircraft mass (if not from the design)', symbol: 'm_ac', unit: 'kg', displayUnits: ['g', 'kg'], min: 0.05, max: 100 },
  releaseAltitude: { label: 'Release altitude above ground', symbol: 'h_rel', unit: 'm', displayUnits: ['km', 'm', 'ft'], min: 1000, max: 45000 },
  wingArea: { label: 'Wing area (if no wing in the design)', symbol: 'S', unit: 'm²', displayUnits: ['m²', 'cm²'], min: 0.01, max: 20 },
  wingSpan: { label: 'Wing span (if no wing in the design)', symbol: 'b', unit: 'm', displayUnits: ['m', 'cm'], min: 0.1, max: 20 },
  cd0: { label: 'Zero-lift drag coefficient', symbol: 'C_D0', unit: '1', displayUnits: ['1'], min: 0.005, max: 0.2, help: 'Includes fuselage and sonde; low-Reynolds-number flight at altitude raises it.' },
  oswald: { label: 'Oswald efficiency', symbol: 'e', unit: '1', displayUnits: ['1'], min: 0.4, max: 1 },
  clMax: { label: 'Maximum lift coefficient', symbol: 'C_Lmax', unit: '1', displayUnits: ['1'], min: 0.3, max: 2.5 },
  maxLoadFactor: { label: 'Pull-out load factor limit', symbol: 'n_max', unit: '1', displayUnits: ['1'], min: 1.2, max: 10, help: 'Structural and control limit used during the pull-out.' },
  sampleInterval: { label: 'Sonde sample interval', symbol: 'Δt_s', unit: 's', displayUnits: ['s'], min: 0.1, max: 60 },
  hybridAltitude: { label: 'Powered-stage switch altitude (AGL)', symbol: 'h_sw', unit: 'm', displayUnits: ['m', 'km', 'ft'], min: 0, max: 30000, help: 'Below this altitude the motor runs (hybrid glide-sonde). 0 = glide all the way.' },
  poweredLD: { label: 'Lift-to-drag in powered stage', symbol: '(L/D)_p', unit: '1', displayUnits: ['1'], min: 2, max: 40 },
  poweredEfficiency: { label: 'Powered-stage overall efficiency', symbol: 'η_p', unit: '1', displayUnits: ['%', '1'], min: 0.1, max: 0.9, help: 'Propeller × motor × ESC.' },
});

export function defaultSounding() {
  return {
    gas: 'helium',
    balloon: { name: BALLOON_CATALOGUE[3].name, catalogueId: BALLOON_CATALOGUE[3].catalogueId, provenance: 'illustrative', source: '' },
    useDesignMass: true,
    useDesignWing: true,
    params: { launchElevation: 216, balloonMass: 2.0, burstDiameter: 10.5, balloonCd: 0.3, freeLift: 1.2, trainMass: 0.25, payloadMass: 1.5, releaseAltitude: 33000, wingArea: 0.48, wingSpan: 2.0, cd0: 0.035, oswald: 0.8, clMax: 1.1, maxLoadFactor: 3, sampleInterval: 1, hybridAltitude: 2000, poweredLD: 10, poweredEfficiency: 0.5 },
    site: { latitude: 28.58, longitude: 77.21 },
  };
}

// ---- Stage 1: balloon ascent -------------------------------------------------------------

/**
 * @param {{balloonMass, burstDiameter, balloonCd, freeLift, trainMass, launchElevation, releaseAltitude}} p
 * @param {number} payloadMass aircraft mass (kg)
 */
export function balloonAscent(p, payloadMass, gas = 'helium') {
  const g = GASES[gas] ?? GASES.helium;
  const suspended = payloadMass + p.trainMass;
  const grossLiftKg = p.balloonMass + suspended + p.freeLift; // kg of lift
  const moles = grossLiftKg / (M_AIR - g.molarMass);
  const volumeAt = (z) => {
    const a = isa(z);
    return (moles * R_UNIVERSAL * a.temperature) / a.pressure;
  };
  const diameterOf = (v) => Math.cbrt((6 * v) / Math.PI);
  const burstVolume = (Math.PI * p.burstDiameter ** 3) / 6;
  const z0 = p.launchElevation;
  const zRelease = z0 + p.releaseAltitude;
  const launchVolume = volumeAt(z0);
  const totalMass = p.balloonMass + suspended;
  const F = p.freeLift * G0;
  const rate = (z) => {
    const a = isa(z);
    const r = diameterOf(volumeAt(z)) / 2;
    return Math.sqrt((2 * F) / (a.density * p.balloonCd * Math.PI * r * r));
  };
  // Burst altitude: diameter reaches the burst diameter.
  let burst = null;
  const zTop = Math.min(z0 + 60000, 85000);
  if (launchVolume >= burstVolume) burst = z0;
  else {
    let lo = z0;
    let hi = zTop;
    if (volumeAt(hi) < burstVolume) burst = null;
    else {
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (volumeAt(mid) >= burstVolume) hi = mid;
        else lo = mid;
      }
      burst = hi;
    }
  }
  const zEnd = burst === null ? zRelease : Math.min(zRelease, burst);
  const points = [];
  let t = 0;
  const dz = 50;
  for (let z = z0; z < zEnd; z += dz) {
    const step = Math.min(dz, zEnd - z);
    const v = (rate(z) + rate(z + step)) / 2;
    if (points.length === 0 || Math.round(z) % 1000 < dz) points.push({ t, z, v: rate(z), d: diameterOf(volumeAt(z)) });
    t += step / v;
  }
  points.push({ t, z: zEnd, v: rate(zEnd), d: diameterOf(volumeAt(zEnd)) });
  return {
    grossLift: grossLiftKg,
    neckLift: suspended + p.freeLift,
    totalMass,
    launchVolume,
    launchDiameter: diameterOf(launchVolume),
    launchRate: rate(z0),
    burstAltitude: burst,
    reachesRelease: burst === null || burst > zRelease,
    releaseAltitudeAMSL: zRelease,
    timeToRelease: t,
    meanRate: (zEnd - z0) / Math.max(t, 1e-9),
    releaseDiameter: diameterOf(volumeAt(zEnd)),
    points,
    gasMass: moles * g.molarMass,
  };
}

// ---- Stages 2–3: release, stall/pull-out and glide --------------------------------------------

export function gliderPolar({ wingArea: S, wingSpan: b, cd0, oswald }) {
  const AR = (b * b) / S;
  const k = 1 / (Math.PI * oswald * AR);
  const clStar = Math.sqrt(cd0 / k);
  const ldMax = 1 / (2 * Math.sqrt(cd0 * k));
  return { AR, k, clStar, ldMax };
}

/**
 * Simulate release, pull-out and glide down to the switch altitude.
 * @param {{mass, wingArea, wingSpan, cd0, oswald, clMax, maxLoadFactor, chord}} a aircraft
 * @param {number} zRelease release altitude AMSL (m)
 * @param {number} zEnd end of glide (AMSL, m)
 */
export function simulateGlide(a, zRelease, zEnd) {
  const { k, clStar, ldMax } = gliderPolar(a);
  const clGlide = Math.min(clStar, 0.9 * a.clMax);
  const gammaEq = -Math.atan(1 / ((clGlide / (a.cd0 + k * clGlide * clGlide)) || 1));
  const W = a.mass * G0;
  const chord = a.chord ?? a.wingArea / a.wingSpan;
  let phase = 'stall';
  let pullOutDone = false;
  const forces = (s) => {
    const atm = isa(Math.max(s.h, -1000));
    const q = 0.5 * atm.density * s.V * s.V;
    let cl;
    if (!pullOutDone) cl = q > 1e-9 ? Math.min(a.clMax, (a.maxLoadFactor * W) / (q * a.wingArea)) : a.clMax;
    else cl = Math.max(0, Math.min(a.clMax, clGlide + 2.5 * (gammaEq - s.gamma)));
    const L = cl * q * a.wingArea;
    const D = (a.cd0 + k * cl * cl) * q * a.wingArea;
    return { L, D, q, cl, atm };
  };
  const deriv = (s) => {
    const f = forces(s);
    const V = Math.max(s.V, 0.05);
    return { V: -f.D / a.mass - G0 * Math.sin(s.gamma), gamma: (f.L - W * Math.cos(s.gamma)) / (a.mass * V), h: s.V * Math.sin(s.gamma), x: s.V * Math.cos(s.gamma) };
  };
  const add = (s, d, h) => ({ V: s.V + d.V * h, gamma: s.gamma + d.gamma * h, h: s.h + d.h * h, x: s.x + d.x * h });
  let s = { V: 1, gamma: -Math.PI / 2 + 0.01, h: zRelease, x: 0 };
  let t = 0;
  const points = [];
  const stats = { maxMach: 0, maxQ: 0, maxN: 0, maxV: 0, stallEnd: null, pullOut: null, minRe: Infinity, reAtRelease: null, samples: [] };
  let lastRecord = -1;
  for (let i = 0; i < 400000 && s.h > zEnd; i += 1) {
    const dt = pullOutDone && t > 60 ? 0.5 : 0.02;
    const k1 = deriv(s);
    const k2 = deriv(add(s, k1, dt / 2));
    const k3 = deriv(add(s, k2, dt / 2));
    const k4 = deriv(add(s, k3, dt));
    s = {
      V: s.V + (dt / 6) * (k1.V + 2 * k2.V + 2 * k3.V + k4.V),
      gamma: s.gamma + (dt / 6) * (k1.gamma + 2 * k2.gamma + 2 * k3.gamma + k4.gamma),
      h: s.h + (dt / 6) * (k1.h + 2 * k2.h + 2 * k3.h + k4.h),
      x: s.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    };
    t += dt;
    const f = forces(s);
    const mach = s.V / f.atm.speedOfSound;
    const n = f.L / W;
    const re = (f.atm.density * s.V * chord) / f.atm.dynamicViscosity;
    stats.maxMach = Math.max(stats.maxMach, mach);
    stats.maxQ = Math.max(stats.maxQ, f.q);
    stats.maxN = Math.max(stats.maxN, n);
    stats.maxV = Math.max(stats.maxV, s.V);
    if (pullOutDone) stats.minRe = Math.min(stats.minRe, re);
    if (phase === 'stall' && f.cl < a.clMax - 1e-6) {
      phase = 'pull-out';
      stats.stallEnd = { t, h: s.h, V: s.V };
    }
    if (!pullOutDone && s.gamma >= gammaEq) {
      pullOutDone = true;
      phase = 'glide';
      stats.pullOut = { t, h: s.h, V: s.V, x: s.x, mach };
      stats.reAtRelease = re;
    }
    if (t - lastRecord >= (pullOutDone ? 20 : 1)) {
      points.push({ t, h: s.h, x: s.x, V: s.V, gamma: s.gamma, mach, phase });
      lastRecord = t;
    }
  }
  points.push({ t, h: s.h, x: s.x, V: s.V, gamma: s.gamma, mach: s.V / isa(Math.max(s.h, -1000)).speedOfSound, phase });
  return { points, time: t, range: s.x, end: s, stats, polar: { k, clStar, clGlide, ldMax, gammaEq }, completedPullOut: pullOutDone };
}

/** Sink rate in steady glide at C_L at altitude z. */
export function glideSinkRate(a, clGlide, z) {
  const { k } = gliderPolar(a);
  const rho = isa(z).density;
  const V = Math.sqrt((2 * a.mass * G0) / (rho * a.wingArea * clGlide));
  const ld = clGlide / (a.cd0 + k * clGlide * clGlide);
  return { V, sink: V / ld, ld };
}

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });

/**
 * Full mission analysis.
 * @param {{ sounding, designMass?, designWing?: {area, span, mac}, battery?: {energy, avionicsPower} }} input
 */
export function analyseSounding({ sounding, designMass = null, designWing = null, battery = null }) {
  const p = sounding.params;
  const checks = [];
  const derived = [];
  const notes = [];
  const mass = sounding.useDesignMass && designMass ? designMass : p.payloadMass;
  const wing = sounding.useDesignWing && designWing ? designWing : { area: p.wingArea, span: p.wingSpan, mac: p.wingArea / p.wingSpan };
  const ascent = balloonAscent(p, mass, sounding.gas);
  const stages = [];
  stages.push({ id: 'ascent', name: 'Balloon ascent', start: 0, duration: ascent.timeToRelease, from: p.launchElevation, to: ascent.reachesRelease ? ascent.releaseAltitudeAMSL : ascent.burstAltitude, range: 0 });

  derived.push(
    { id: 'sd-lift', label: 'Gross lift to fill', symbol: 'L_gross', value: ascent.grossLift, unit: 'kg', equation: 'L = m_balloon + m_train + m_aircraft + F', inputs: [], provenance: 'analytical' },
    { id: 'sd-neck', label: 'Neck lift (weigh-off at the filler)', symbol: 'L_neck', value: ascent.neckLift, unit: 'kg', equation: 'L_neck = m_train + m_aircraft + F', inputs: [], provenance: 'analytical' },
    { id: 'sd-volume', label: `${GASES[sounding.gas].label} volume at launch`, symbol: 'V₀', value: ascent.launchVolume, unit: 'm³', equation: 'V = n R T / p,  n = L_gross / (M_air − M_gas)', inputs: [], provenance: 'analytical', assumptions: ['Gas at ambient temperature and pressure (zero superpressure).'] },
    { id: 'sd-gasmass', label: 'Gas mass', symbol: 'm_gas', value: ascent.gasMass, unit: 'kg', displayUnit: 'g', equation: 'm_gas = n M_gas', inputs: [], provenance: 'analytical' },
    { id: 'sd-launchrate', label: 'Ascent rate at launch', symbol: 'w₀', value: ascent.launchRate, unit: 'm/s', equation: 'w = √(2 F g / (ρ C_D π r²))', inputs: [q('F', 'Free lift', p.freeLift, 'kg'), q('C_D', 'Balloon drag coefficient', p.balloonCd, '1')], provenance: 'analytical' },
    { id: 'sd-meanrate', label: 'Mean ascent rate to release', symbol: 'w̄', value: ascent.meanRate, unit: 'm/s', equation: 'w̄ = Δh / t', inputs: [], provenance: 'analytical' },
    { id: 'sd-ascenttime', label: 'Time to release altitude', symbol: 't_asc', value: ascent.timeToRelease, unit: 's', displayUnit: 'min', equation: 't = ∫ dz / w(z)', inputs: [], provenance: 'analytical' },
  );
  if (ascent.burstAltitude !== null) derived.push({ id: 'sd-burst', label: 'Predicted burst altitude (AGL)', symbol: 'h_burst', value: ascent.burstAltitude - p.launchElevation, unit: 'm', displayUnit: 'km', equation: 'V(h_burst) = π d_burst³ / 6', inputs: [q('d_burst', 'Burst diameter', p.burstDiameter, 'm')], provenance: 'analytical', assumptions: ['Real burst altitudes scatter by a few kilometres (fill accuracy, temperature, balloon ageing).'] });
  if (!ascent.reachesRelease) {
    checks.push({ id: 'SD-ASC-001', severity: 'error', title: 'Balloon bursts before the release altitude', message: `The balloon is predicted to burst at ${((ascent.burstAltitude - p.launchElevation) / 1000).toFixed(1)} km, below the ${(p.releaseAltitude / 1000).toFixed(1)} km release altitude. Use a larger balloon, less free lift, or a lighter aircraft.`, equation: 'Required: h_burst > h_release', inputs: [], assumptions: [], provenance: 'analytical' });
  } else if (ascent.burstAltitude !== null && ascent.burstAltitude - ascent.releaseAltitudeAMSL < 2000) {
    checks.push({ id: 'SD-ASC-002', severity: 'warning', title: 'Little margin between release and burst', message: `Predicted burst is only ${((ascent.burstAltitude - ascent.releaseAltitudeAMSL) / 1000).toFixed(1)} km above release. Burst altitude scatters by several kilometres; aim for 3 km or more.`, equation: 'Guideline: h_burst − h_release ≥ 3 km', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  }
  if (ascent.launchRate < 3 || ascent.launchRate > 8) {
    checks.push({ id: 'SD-ASC-003', severity: 'warning', title: 'Unusual ascent rate', message: `Launch ascent rate is ${ascent.launchRate.toFixed(1)} m/s. Sounding flights usually use about 4–6 m/s: slower drifts far and freezes longer, faster bursts lower.`, equation: 'Typical: 4 ≤ w ≤ 6 m/s', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  }
  if (sounding.gas === 'hydrogen') notes.push('Hydrogen is flammable: filling needs a hydrogen safety procedure, earthing, no ignition sources and trained staff.');

  const aircraft = { mass, wingArea: wing.area, wingSpan: wing.span, chord: wing.mac, cd0: p.cd0, oswald: p.oswald, clMax: p.clMax, maxLoadFactor: p.maxLoadFactor };
  const result = { ascent, stages, checks, derived, notes, glide: null, powered: null, mass, wing, totalTime: ascent.timeToRelease };
  if (!ascent.reachesRelease) return result;

  const zRel = ascent.releaseAltitudeAMSL;
  const zSwitch = p.launchElevation + Math.min(p.hybridAltitude, p.releaseAltitude - 500);
  const glide = simulateGlide(aircraft, zRel, Math.max(zSwitch, p.launchElevation));
  result.glide = glide;
  const t0 = ascent.timeToRelease;
  const po = glide.stats.pullOut;
  if (po) {
    stages.push({ id: 'stall', name: 'Release, stall and pull-out', start: t0, duration: po.t, from: zRel, to: po.h, range: po.x });
    stages.push({ id: 'glide', name: 'Unpowered glide (sonde sampling)', start: t0 + po.t, duration: glide.time - po.t, from: po.h, to: glide.end.h, range: glide.range - po.x });
  }
  const relAtm = isa(zRel);
  derived.push(
    { id: 'sd-rel-p', label: 'Pressure at release', symbol: 'p_rel', value: relAtm.pressure, unit: 'Pa', displayUnit: 'hPa', equation: 'ISA', inputs: [], provenance: 'analytical' },
    { id: 'sd-rel-t', label: 'Temperature at release (ISA)', symbol: 'T_rel', value: relAtm.temperature, unit: 'K', displayUnit: '°C', equation: 'ISA', inputs: [], provenance: 'analytical' },
    { id: 'sd-ld', label: 'Best lift-to-drag ratio', symbol: '(L/D)max', value: glide.polar.ldMax, unit: '1', equation: '(L/D)max = 1 / (2 √(C_D0 k)),  k = 1/(π e AR)', inputs: [q('C_D0', 'Zero-lift drag', p.cd0, '1'), q('e', 'Oswald efficiency', p.oswald, '1')], provenance: 'conceptual-estimate' },
  );
  if (po) {
    derived.push(
      { id: 'sd-stall-loss', label: 'Altitude lost in the stall drop and pull-out', symbol: 'Δh_pull', value: zRel - po.h, unit: 'm', equation: '2-D point-mass simulation (RK4)', inputs: [q('n_max', 'Load-factor limit', p.maxLoadFactor, '1'), q('C_Lmax', 'Maximum lift coefficient', p.clMax, '1')], provenance: 'analytical', assumptions: ['Released from rest relative to the air, nose down.', 'Pull-out at the load-factor limit or C_Lmax, whichever is lower.'] },
      { id: 'sd-stall-time', label: 'Time to complete the pull-out', symbol: 't_pull', value: po.t, unit: 's', equation: 'simulation', inputs: [], provenance: 'analytical' },
      { id: 'sd-maxv', label: 'Highest true airspeed', symbol: 'V_max', value: glide.stats.maxV, unit: 'm/s', equation: 'simulation', inputs: [], provenance: 'analytical' },
      { id: 'sd-maxmach', label: 'Highest Mach number', symbol: 'M_max', value: glide.stats.maxMach, unit: '1', equation: 'M = V / a(h)', inputs: [], provenance: 'analytical' },
      { id: 'sd-maxn', label: 'Highest load factor', symbol: 'n', value: glide.stats.maxN, unit: '1', equation: 'n = L / W', inputs: [], provenance: 'analytical' },
      { id: 'sd-re', label: 'Reynolds number after pull-out (MAC)', symbol: 'Re', value: glide.stats.reAtRelease, unit: '1', equation: 'Re = ρ V c̄ / μ', inputs: [q('c̄', 'Mean chord', wing.mac, 'm')], provenance: 'analytical' },
    );
    const glideTime = glide.time - po.t;
    const glideRange = glide.range - po.x;
    derived.push(
      { id: 'sd-glide-time', label: 'Glide duration to the switch altitude', symbol: 't_glide', value: glideTime, unit: 's', displayUnit: 'min', equation: 'simulation', inputs: [], provenance: 'analytical' },
      { id: 'sd-glide-range', label: 'Still-air glide distance', symbol: 'x_glide', value: glideRange, unit: 'm', displayUnit: 'km', equation: 'simulation', inputs: [], provenance: 'analytical', assumptions: ['No wind. Real ground track depends on stratospheric and jet-stream winds.'] },
    );
    // Sonde vertical resolution at three heights.
    for (const [label, z] of [['just below release', po.h], ['mid-glide', (po.h + glide.end.h) / 2], ['at the switch altitude', glide.end.h]]) {
      const { sink, V } = glideSinkRate(aircraft, glide.polar.clGlide, z);
      derived.push({ id: `sd-res-${label}`, label: `Sonde vertical resolution ${label} (${((z - p.launchElevation) / 1000).toFixed(1)} km)`, symbol: 'Δz', value: sink * p.sampleInterval, unit: 'm', equation: 'Δz = w_sink Δt_s', inputs: [q('w_sink', 'Sink rate', sink, 'm/s'), q('V', 'Airspeed', V, 'm/s'), q('Δt_s', 'Sample interval', p.sampleInterval, 's')], provenance: 'analytical' });
    }
    if (glide.stats.maxMach > 0.6) {
      checks.push({ id: 'SD-GL-001', severity: 'warning', title: 'High Mach number during the pull-out', message: `The aircraft reaches Mach ${glide.stats.maxMach.toFixed(2)} in the thin air after release. Above about 0.6 compressibility changes lift, drag and stability; flutter risk rises. Raise the load-factor limit or C_Lmax (pull out earlier), or reduce wing loading.`, equation: 'Guideline: M < 0.6 for an incompressible design', inputs: [], result: q('M', 'Maximum Mach', glide.stats.maxMach, '1'), assumptions: [], provenance: 'conceptual-estimate' });
    }
    if (glide.stats.reAtRelease < 60000) {
      checks.push({ id: 'SD-GL-002', severity: 'warning', title: 'Very low Reynolds number at altitude', message: `After the pull-out the wing works at Re ≈ ${Math.round(glide.stats.reAtRelease).toLocaleString('en')}. Below about 50 000–100 000 laminar separation bubbles reduce C_Lmax and raise drag sharply. Use low-Reynolds-number aerofoil data (for example the UIUC low-speed aerofoil tests) for C_D0 and C_Lmax.`, equation: 'Re = ρ V c̄ / μ', inputs: [], result: q('Re', 'Reynolds number', glide.stats.reAtRelease, '1'), assumptions: [], provenance: 'analytical' });
    }
  } else {
    checks.push({ id: 'SD-GL-003', severity: 'error', title: 'The aircraft does not recover from the release drop', message: 'The simulated aircraft never reached a steady glide before the end altitude. Check the wing area, C_Lmax and load-factor limit.', equation: '', inputs: [], assumptions: [], provenance: 'analytical' });
  }

  // ---- Stage 4: hybrid powered stage --------------------------------------------------------
  const zLow = glide.end.h;
  const hybridTime = ascent.timeToRelease + glide.time;
  if (battery && p.hybridAltitude > 0) {
    const used = battery.avionicsPower * hybridTime;
    const left = battery.energy - used;
    const { V } = glideSinkRate(aircraft, glide.polar.clGlide, zLow);
    const power = (mass * G0 * V) / p.poweredLD / p.poweredEfficiency + battery.avionicsPower;
    const tPow = left > 0 ? left / power : 0;
    result.powered = { energyAtSwitch: left, avionicsEnergy: used, power, time: tPow, range: V * tPow, speed: V };
    stages.push({ id: 'powered', name: 'Powered stage (hybrid)', start: ascent.timeToRelease + glide.time, duration: tPow, from: zLow, to: zLow, range: V * tPow });
    derived.push(
      { id: 'sd-av-energy', label: 'Battery energy used by avionics before the powered stage', symbol: 'E_av', value: used, unit: 'J', displayUnit: 'Wh', equation: 'E = P_avionics (t_ascent + t_glide)', inputs: [q('P_av', 'Avionics power', battery.avionicsPower, 'W'), q('t', 'Time', hybridTime, 's', 'min')], provenance: 'analytical' },
      { id: 'sd-pow-power', label: 'Power in the powered stage', symbol: 'P_cruise', value: power, unit: 'W', equation: 'P = W V / ((L/D) η) + P_avionics', inputs: [q('V', 'Airspeed', V, 'm/s'), q('L/D', 'Lift-to-drag', p.poweredLD, '1'), q('η', 'Overall efficiency', p.poweredEfficiency, '1', '%')], provenance: 'conceptual-estimate' },
      { id: 'sd-pow-time', label: 'Powered-stage endurance', symbol: 't_pow', value: tPow, unit: 's', displayUnit: 'min', equation: 't = E_left / P', inputs: [q('E_left', 'Energy left', Math.max(left, 0), 'J', 'Wh')], provenance: 'analytical' },
      { id: 'sd-pow-range', label: 'Powered-stage still-air range', symbol: 'x_pow', value: V * tPow, unit: 'm', displayUnit: 'km', equation: 'x = V t', inputs: [], provenance: 'analytical' },
    );
    if (left <= 0) {
      checks.push({ id: 'SD-PW-001', severity: 'error', title: 'Battery is exhausted before the powered stage', message: `The avionics use ${(used / 3600).toFixed(1)} Wh during the ${(hybridTime / 3600).toFixed(1)} h ascent and glide, more than the ${(battery.energy / 3600).toFixed(1)} Wh usable. Use a larger battery, lower avionics power, or a lower release altitude.`, equation: 'E_usable > P_av t', inputs: [], assumptions: [], provenance: 'analytical' });
    }
    notes.push('Cold soak: at 30 km the air is about −45 °C. Lithium batteries lose capacity and power when cold; insulate and heat the battery, and test it in a thermal chamber.');
  } else if (p.hybridAltitude > 0) {
    notes.push('Add a battery in the Avionics Laboratory to size the powered (hybrid) stage.');
  }

  result.totalTime = stages.reduce((sum, st) => Math.max(sum, st.start + st.duration), 0);
  const order = { error: 0, warning: 1, info: 2 };
  checks.sort((x, y) => order[x.severity] - order[y.severity]);
  return result;
}

// ---- Wind-aware ascent prediction (SondeHub Tawhiri API) ------------------------------------------

export const TAWHIRI_URL = 'https://api.v2.sondehub.org/tawhiri';

/** Query URL for a standard-profile prediction; the glide descent is not part of the API, so the descent stage is ignored. */
export function tawhiriQuery({ latitude, longitude, elevation, datetime, ascentRate, releaseAltitudeAMSL }) {
  const lon = ((longitude % 360) + 360) % 360;
  const params = new URLSearchParams({
    profile: 'standard_profile',
    launch_latitude: latitude.toFixed(5),
    launch_longitude: lon.toFixed(5),
    launch_altitude: String(Math.round(elevation)),
    launch_datetime: datetime,
    ascent_rate: ascentRate.toFixed(2),
    burst_altitude: String(Math.round(releaseAltitudeAMSL)),
    descent_rate: '5',
  });
  return `${TAWHIRI_URL}?${params}`;
}

/** Extract the ascent track [{lat, lon, alt, time}] from a Tawhiri response. */
export function parseTawhiri(json) {
  const stage = json?.prediction?.find((s) => s.stage === 'ascent');
  if (!stage || !Array.isArray(stage.trajectory)) throw new Error(json?.error?.description ?? 'The prediction service returned no ascent track.');
  return stage.trajectory.map((pt) => ({ lat: pt.latitude, lon: pt.longitude > 180 ? pt.longitude - 360 : pt.longitude, alt: pt.altitude, time: pt.datetime }));
}

/** KML document for the ascent track and release point (opens in Google Earth, QGIS, …). */
export function trackToKml(track, name) {
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
  const coords = track.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)},${Math.round(p.alt)}`).join(' ');
  const last = track.at(-1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>
<Placemark><name>Predicted balloon ascent</name><LineString><extrude>1</extrude><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>
<Placemark><name>Predicted release point (${Math.round(last.alt)} m)</name><Point><altitudeMode>absolute</altitudeMode><coordinates>${last.lon.toFixed(6)},${last.lat.toFixed(6)},${Math.round(last.alt)}</coordinates></Point></Placemark>
</Document></kml>`;
}

// ---- Data validation / repair ----------------------------------------------------------------------

export function validateSounding(data) {
  const errors = [];
  if (!isPlainObject(data)) return [{ path: '', message: 'Sounding data must be an object' }];
  if (!GASES[data.gas]) errors.push({ path: 'gas', message: 'Unknown lifting gas' });
  if (typeof data.enabled !== 'boolean') errors.push({ path: 'enabled', message: 'enabled must be true or false' });
  if (!isPlainObject(data.params)) return [...errors, { path: 'params', message: 'Parameters missing' }];
  for (const [key, f] of Object.entries(SOUNDING_FIELDS)) {
    const v = data.params[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max) errors.push({ path: `params.${key}`, message: `${f.label}: must be between ${f.min} and ${f.max}` });
  }
  return errors;
}

export function sanitizeSounding(input) {
  const base = defaultSounding();
  if (!isPlainObject(input)) return { sounding: base, warnings: input === undefined ? [] : ['Invalid sounding data replaced with defaults.'] };
  const warnings = [];
  const out = { ...base, gas: GASES[input.gas] ? input.gas : base.gas, useDesignMass: input.useDesignMass !== false, useDesignWing: input.useDesignWing !== false };
  if (isPlainObject(input.balloon)) out.balloon = { name: String(input.balloon.name ?? base.balloon.name).slice(0, 120), catalogueId: typeof input.balloon.catalogueId === 'string' ? input.balloon.catalogueId : null, provenance: ['illustrative', 'datasheet', 'user-input', 'measured'].includes(input.balloon.provenance) ? input.balloon.provenance : 'user-input', source: String(input.balloon.source ?? '').slice(0, 500) };
  if (isPlainObject(input.site) && Number.isFinite(input.site.latitude) && Number.isFinite(input.site.longitude) && Math.abs(input.site.latitude) <= 90 && Math.abs(input.site.longitude) <= 180) out.site = { latitude: input.site.latitude, longitude: input.site.longitude };
  out.params = { ...base.params };
  for (const [key, f] of Object.entries(SOUNDING_FIELDS)) {
    const v = input.params?.[key];
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max) out.params[key] = v;
    else warnings.push(`Sounding: ${f.label} was invalid and reset.`);
  }
  return { sounding: out, warnings };
}
