/**
 * Flight dynamics (Build 6). See docs/engineering-models.md §13.
 *
 * Winged aircraft — linearised small-disturbance equations about steady level cruise
 * (Nelson, Flight Stability and Automatic Control, ch. 4–5), with stability derivatives
 * estimated from the geometry, the Aerodynamics model and Mass & Balance:
 *   longitudinal state [u, w, q, θ], lateral state [β, p, r, φ];
 *   eigenvalues give the short-period, phugoid, roll, spiral and Dutch-roll modes;
 *   responses to an elevator step, a vertical gust and a rudder pulse are integrated (RK4).
 *
 * Hovering aircraft — a nonlinear 6-DoF rigid-body simulation in hover with first-order
 * motor lag, thrust limits, rotor-by-rotor allocation and a cascaded PID controller whose
 * gains are placed from the inertia (or your bandwidth), flying a fixed, repeatable
 * scenario: climb 1 m, move 2 m forward, side gust, 45° yaw turn.
 *
 * Simulation only — never connected to a real aircraft or flight controller. Derivative
 * estimates are concept-level (strip theory, tail-volume methods); confirm with XFLR5/
 * OpenVSP stability analysis, wind tunnel or flight test.
 */
import { G0, isa } from './atmosphere.js';
import { eigenvalues, modeOf, rk4, solve, transpose, matMul } from './linalg.js';

const DEG = Math.PI / 180;

export const DYNAMICS_FIELDS = Object.freeze({
  motorTimeConstant: { label: 'Motor + propeller response time', symbol: 'τ_m', unit: 's', displayUnits: ['ms', 's'], min: 0.005, max: 0.5, optional: true, help: 'Time for the thrust to reach 63 % of a step command. Leave blank to estimate it: 15 ms + 0.15 s per metre of propeller diameter (about 25 ms for 2-inch, 55 ms for 10-inch, 70 ms for 15-inch props).' },
  attitudeBandwidth: { label: 'Attitude loop bandwidth', symbol: 'ω_att', unit: 'rad/s', displayUnits: ['rad/s'], min: 1, max: 60, optional: true, help: 'Natural frequency the attitude controller aims for. Leave blank for automatic: one third of the motor bandwidth, at most 12 rad/s.' },
  gustSpeed: { label: 'Gust speed in the scenarios', symbol: 'w_g', unit: 'm/s', displayUnits: ['m/s', 'km/h'], min: 0, max: 30 },
  elevatorStep: { label: 'Elevator step (fixed wing)', symbol: 'δ_e', unit: 'rad', displayUnits: ['deg', 'rad'], min: -0.35, max: 0.35, help: 'Negative = trailing edge up (nose-up command).' },
});
export const DEFAULT_DYNAMICS = Object.freeze({ motorTimeConstant: null, attitudeBandwidth: null, gustSpeed: 4, elevatorStep: -0.5 * DEG });
export const defaultDynamics = () => ({ settings: { ...DEFAULT_DYNAMICS } });

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });
const helmbold = (A, a0 = 2 * Math.PI) => (a0 * A) / (2 + Math.sqrt(A * A + 4));

// ---- Winged aircraft: derivatives, modes, responses ----------------------------------------

/** Stability derivatives (per rad) for steady level flight at speed V. */
export function stabilityDerivatives({ model, geometry, configuration, mass, inertia, V, rho }) {
  const S = model.S;
  const b = model.span;
  const c = model.mac;
  const W = mass * G0;
  const Q = 0.5 * rho * V * V;
  const CL = W / (Q * S);
  const CD = model.cd0 + model.k * CL * CL;
  const aw = model.cla;
  const t = geometry.tail;
  const params = configuration?.params ?? {};
  const lt = params.tailArm ?? 0;
  const eta = model.settings?.tailEfficiency ?? 0.9;
  const sb = model.stability;
  let Sh = 0;
  let Sv = 0;
  let ARh = 4;
  let ARv = 1.5;
  if (t?.type === 'conventional') {
    Sh = t.span * t.chord;
    Sv = t.vHeight * t.vChord;
    ARh = (t.span * t.span) / Sh;
    ARv = (1.55 * t.vHeight * t.vHeight) / Sv; // end-plate effect of the fuselage/tailplane
  } else if (t?.type === 'v') {
    const panels = (t.span * t.chord) / Math.cos(t.angle);
    Sh = panels * Math.cos(t.angle) ** 2;
    Sv = panels * Math.sin(t.angle) ** 2;
    ARh = t.span / t.chord;
    ARv = ARh;
  }
  const at = Sh > 0 ? helmbold(ARh, 6) : 0;
  const av = Sv > 0 ? helmbold(ARv, 6) : 0;
  const VH = Sh > 0 ? (Sh * lt) / (S * c) : 0;
  const VV = Sv > 0 ? (Sv * lt) / (S * b) : 0;
  const deda = sb.downwash ?? 0;
  const tau = 0.45; // control-surface effectiveness (≈ 25–30 % chord surface)
  const CLa = aw + (Sh > 0 ? eta * at * (Sh / S) * (1 - deda) : 0);
  const SM = sb.staticMargin;
  const Cma = -CLa * SM;
  const Cmq = Sh > 0 ? -2.2 * eta * at * VH * (lt / c) : -0.15 * aw; // ×1.1 for the fuselage; tailless: wing-only estimate
  const Cmad = Sh > 0 ? -2 * eta * at * VH * (lt / c) * deda : 0;
  const CLde = Sh > 0 ? eta * at * (Sh / S) * tau : 0.3 * aw * tau * 0.5;
  const Cmde = Sh > 0 ? -eta * at * VH * tau : -0.3 * tau;
  const CDa = 2 * model.k * CL * CLa;
  // Lateral
  const lam = model.taperRatio;
  const gamma = configuration?.params?.dihedral ?? 0;
  const sweep = model.sweepQC;
  const zv = t?.type === 'conventional' ? 0.4 * t.vHeight : t?.type === 'v' ? 0.3 * t.span * Math.tan(t.angle) / 2 : 0;
  const fus = geometry.fuselage?.length > 0 ? geometry.fuselage : null;
  const volFus = fus ? (Math.PI / 4) * fus.diameter ** 2 * fus.length * 0.75 : 0;
  const Cyb = -eta * av * (Sv / S) - (fus ? 0.3 * (fus.diameter * fus.length * 0.5) / S : 0);
  const Cnb = eta * av * VV - (fus ? 1.3 * volFus / (S * b) : 0);
  const Clb = -(aw * gamma / 6) * ((1 + 2 * lam) / (1 + lam)) - (CL * Math.tan(sweep)) / 4 - eta * av * (Sv / S) * (zv / b);
  const Clp = -(aw / 12) * ((1 + 3 * lam) / (1 + lam));
  const Cnp = -CL / 8;
  const Clr = CL / 4 + eta * av * (Sv / S) * (zv / b) * (2 * lt / b);
  const Cnr = -2 * eta * av * VV * (lt / b) - model.cd0 / 4;
  const Cyr = 2 * eta * av * (Sv / S) * (lt / b);
  const Cydr = Sv > 0 ? eta * av * (Sv / S) * tau : 0;
  const Cndr = Sv > 0 ? -eta * av * VV * tau : 0;
  return { Q, CL, CD, CLa, Cma, Cmq, Cmad, CLde, Cmde, CDa, Cyb, Cnb, Clb, Clp, Cnp, Clr, Cnr, Cyr, Cydr, Cndr, VH, VV, Sh, Sv, at, av, tau };
}

/** Longitudinal and lateral state matrices (Nelson, eq. 4.x and 5.x). */
export function stateMatrices({ d, model, mass, inertia, V }) {
  const { Q } = d;
  const S = model.S;
  const c = model.mac;
  const b = model.span;
  const m = mass;
  const Iyy = inertia[1][1];
  const Ixx = inertia[0][0];
  const Izz = inertia[2][2];
  const Xu = (-2 * d.CD * Q * S) / (m * V);
  const Xw = (-(d.CDa - d.CL) * Q * S) / (m * V);
  const Zu = (-2 * d.CL * Q * S) / (m * V);
  const Zw = (-(d.CLa + d.CD) * Q * S) / (m * V);
  const Mw = (d.Cma * Q * S * c) / (V * Iyy);
  const Mwd = (d.Cmad * (c / (2 * V)) * Q * S * c) / (V * Iyy);
  const Mq = (d.Cmq * (c / (2 * V)) * Q * S * c) / Iyy;
  const Zde = (-d.CLde * Q * S) / m;
  const Mde = (d.Cmde * Q * S * c) / Iyy;
  const lon = [
    [Xu, Xw, 0, -G0],
    [Zu, Zw, V, 0],
    [Mwd * Zu, Mw + Mwd * Zw, Mq + Mwd * V, 0],
    [0, 0, 1, 0],
  ];
  const lonB = [0, Zde, Mde + Mwd * Zde, 0];
  const Yb = (Q * S * d.Cyb) / m;
  const Yr = (Q * S * b * d.Cyr) / (2 * m * V);
  const Lb = (Q * S * b * d.Clb) / Ixx;
  const Lp = (Q * S * b * b * d.Clp) / (2 * Ixx * V);
  const Lr = (Q * S * b * b * d.Clr) / (2 * Ixx * V);
  const Nb = (Q * S * b * d.Cnb) / Izz;
  const Np = (Q * S * b * b * d.Cnp) / (2 * Izz * V);
  const Nr = (Q * S * b * b * d.Cnr) / (2 * Izz * V);
  const lat = [
    [Yb / V, 0, -(1 - Yr / V), G0 / V],
    [Lb, Lp, Lr, 0],
    [Nb, Np, Nr, 0],
    [0, 1, 0, 0],
  ];
  const latB = [(Q * S * d.Cydr) / (m * V), 0, (Q * S * b * d.Cndr) / Izz, 0];
  return { lon, lonB, lat, latB, dims: { Xu, Xw, Zu, Zw, Mw, Mwd, Mq, Zde, Mde, Yb, Lb, Lp, Lr, Nb, Np, Nr } };
}

/** Classify longitudinal and lateral eigenvalues into the classical modes. */
export function classifyModes(lonEig, latEig) {
  const lon = lonEig.map(modeOf);
  const lat = latEig.map(modeOf);
  const pairs = (list) => {
    const osc = list.filter((m) => m.oscillatory && m.eigenvalue.im > 0).sort((a, b) => b.wn - a.wn);
    const real = list.filter((m) => !m.oscillatory).sort((a, b) => Math.abs(b.eigenvalue.re) - Math.abs(a.eigenvalue.re));
    return { osc, real };
  };
  const L = pairs(lon);
  const T = pairs(lat);
  const modes = {};
  // A pair of real roots stands for an overdamped (or divergent) mode: report the worse root.
  const fromReals = (roots) => {
    const bad = roots.find((r) => !r.stable);
    return { ...(bad ?? roots[0]), overdamped: true };
  };
  if (L.osc.length >= 2) {
    modes.shortPeriod = L.osc[0];
    modes.phugoid = L.osc[1];
  } else if (L.osc.length === 1) {
    // One pair and two real roots: the faster of the two is the short-period (pitch) motion.
    const fastestReal = Math.max(...L.real.map((r) => Math.abs(r.eigenvalue.re)));
    if (fastestReal > L.osc[0].wn) {
      modes.phugoid = L.osc[0];
      modes.shortPeriod = fromReals(L.real.slice(0, 2));
    } else {
      modes.shortPeriod = L.osc[0];
      modes.phugoid = fromReals(L.real.slice(-2));
    }
  } else {
    modes.shortPeriod = fromReals(L.real.slice(0, 2));
    modes.phugoid = fromReals(L.real.slice(2));
  }
  if (T.osc.length) modes.dutchRoll = T.osc[0];
  modes.roll = T.real[0] ?? null;
  modes.spiral = T.real[T.real.length - 1] && T.real.length > 1 ? T.real[T.real.length - 1] : null;
  return modes;
}

/** Linear response ẋ = A x + B u(t) + G w(t). */
function linearResponse(A, B, u, x0 = [0, 0, 0, 0], t1 = 30, dt = 0.01, G = null, w = null) {
  return rk4((t, x) => A.map((row, i) => row.reduce((s, a, k) => s + a * x[k], 0) + B[i] * u(t) + (G && w ? G[i] * w(t) : 0)), x0, { t1, dt, every: 5 });
}

export function analyseWingedDynamics({ model, geometry, configuration, mass, inertia, requirements = {}, settings }) {
  const V = requirements.cruiseSpeed?.value ?? model.reference.speed;
  const rho = isa(requirements.operatingAltitude?.value ?? 0).density;
  const d = stabilityDerivatives({ model, geometry, configuration, mass, inertia, V, rho });
  const M = stateMatrices({ d, model, mass, inertia, V });
  const modes = classifyModes(eigenvalues(M.lon), eigenvalues(M.lat));
  const de = settings.elevatorStep;
  const elevator = linearResponse(M.lon, M.lonB, (t) => (t >= 1 ? de : 0), [0, 0, 0, 0], 40, 0.01);
  const gust = settings.gustSpeed;
  // Vertical gust: 1 − cos profile, 2 s long, enters as a change of w relative to the air.
  const wg = (t) => (t >= 1 && t <= 3 ? (gust / 2) * (1 - Math.cos(Math.PI * (t - 1))) : 0);
  const gustRun = rk4((t, x) => {
    const xr = [x[0], x[1] - wg(t), x[2], x[3]];
    return M.lon.map((row, i) => row.reduce((s, a, k) => s + a * xr[k], 0) + (i === 1 ? 0 : 0));
  }, [0, 0, 0, 0], { t1: 20, dt: 0.01, every: 5 });
  const rudder = linearResponse(M.lat, M.latB, (t) => (t >= 1 && t < 2 ? 5 * DEG : 0), [0, 0, 0, 0], 30, 0.01);
  return { V, rho, derivatives: d, matrices: M, modes, responses: { elevator, gust: gustRun, rudder } };
}

// ---- Hovering aircraft: 6-DoF simulation ----------------------------------------------------

/** Control allocation matrix rows [ΣT, τx, τy, τz] for rotors about the CG. */
export function allocation(rotors, cg, kQ) {
  const rows = [
    rotors.map(() => 1),
    rotors.map((r) => r.y - cg.y),
    rotors.map((r) => -(r.x - cg.x)),
    rotors.map((r) => (r.spin === 'ccw' ? -kQ : kQ)),
  ];
  const Bt = transpose(rows);
  const BBt = matMul(rows, Bt);
  const solveCols = (w) => {
    const lam = solve(BBt, w);
    return lam ? Bt.map((row) => row.reduce((s, b, k) => s + b * lam[k], 0)) : null;
  };
  return { rows, allocate: solveCols };
}

/**
 * Hover scenario: 1 m climb at 1 s, 2 m forward at 5 s, side gust at 10 s, 45° yaw at 14 s.
 * State: [x y z, vx vy vz, φ θ ψ, p q r, ∫e_z, T₁…T_N].
 */
export function simulateHover({ rotors, cg, mass, inertia, maxThrust, kQ, settings, dragArea, rho = 1.225, t1 = 20, dt = 0.004 }) {
  const N = rotors.length;
  const Ixx = inertia[0][0];
  const Iyy = inertia[1][1];
  const Izz = inertia[2][2];
  const tm = settings.motorTimeConstant;
  const wAtt = settings.attitudeBandwidth ?? Math.min(12, 1 / (3 * tm));
  const zeta = 0.8;
  const tzMaxAll = 0.25 * kQ * mass * G0;
  const wYaw = Math.min(wAtt / 2, 4, Math.sqrt(tzMaxAll / (Izz * (Math.PI / 4))));
  const wZ = wAtt / 3;
  const wPos = wAtt / 5;
  const tilt = 25 * DEG;
  const alloc = allocation(rotors, cg, kQ);
  const W = mass * G0;
  const gustPeak = settings.gustSpeed;
  const wind = (t) => (t >= 10 && t <= 12 ? (gustPeak / 2) * (1 - Math.cos(Math.PI * (t - 10))) : 0);
  const ref = (t) => ({ x: t >= 5 ? 2 : 0, y: 0, z: t >= 1 ? 1 : 0, psi: t >= 14 ? 45 * DEG : 0 });
  let saturatedTime = 0;
  let peakRatio = 0;
  const command = (t, s) => {
    const [x, y, z, vx, vy, vz, phi, th, psi, p, qq, r, iz] = s;
    const rf = ref(t);
    const ax = wPos * wPos * (rf.x - x) - 2 * zeta * wPos * vx;
    const ay = wPos * wPos * (rf.y - y) - 2 * zeta * wPos * vy;
    const c = Math.cos(psi);
    const sn = Math.sin(psi);
    const ahx = c * ax + sn * ay;
    const ahy = -sn * ax + c * ay;
    const thDes = Math.max(-tilt, Math.min(tilt, ahx / G0));
    const phDes = Math.max(-tilt, Math.min(tilt, -ahy / G0));
    const ez = rf.z - z;
    const az = wZ * wZ * ez - 2 * zeta * wZ * vz + 0.02 * wZ * wZ * wZ * iz;
    const Tsum = (mass * (G0 + az)) / Math.max(0.5, Math.cos(phi) * Math.cos(th));
    let dpsi = rf.psi - psi;
    dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
    const tx = Ixx * (wAtt * wAtt * (phDes - phi) - 2 * zeta * wAtt * p);
    const ty = Iyy * (wAtt * wAtt * (thDes - th) - 2 * zeta * wAtt * qq);
    // Yaw has the least control power (rotor drag torque): limit it so roll and pitch keep priority.
    const tzMax = 0.25 * kQ * W;
    const tz = Math.max(-tzMax, Math.min(tzMax, Izz * (wYaw * wYaw * dpsi - 2 * zeta * wYaw * r)));
    const Tc = alloc.allocate([Tsum, tx, ty, tz]) ?? rotors.map(() => Tsum / N);
    return Tc.map((v) => Math.max(0, Math.min(maxThrust, v)));
  };
  const f = (t, s) => {
    const [, , , vx, vy, vz, phi, th, psi, p, qq, r] = s;
    const T = s.slice(13, 13 + N);
    const Tc = command(t, s);
    const cph = Math.cos(phi);
    const sph = Math.sin(phi);
    const cth = Math.cos(th);
    const sth = Math.sin(th);
    const cps = Math.cos(psi);
    const sps = Math.sin(psi);
    const Ts = T.reduce((a, b) => a + b, 0);
    // Body z axis in world (ZYX Euler, x forward, y left, z up).
    const bz = [cps * sth * cph + sps * sph, sps * sth * cph - cps * sph, cth * cph];
    const vrx = vx;
    const vry = vy - wind(t);
    const vrz = vz;
    const vrel = Math.hypot(vrx, vry, vrz);
    const kd = 0.5 * rho * dragArea * vrel;
    const axw = (Ts * bz[0] - kd * vrx) / mass;
    const ayw = (Ts * bz[1] - kd * vry) / mass;
    const azw = (Ts * bz[2] - kd * vrz) / mass - G0;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    rotors.forEach((ro, i) => {
      tx += (ro.y - cg.y) * T[i];
      ty += -(ro.x - cg.x) * T[i];
      tz += (ro.spin === 'ccw' ? -kQ : kQ) * T[i];
    });
    const pd = (tx - (Izz - Iyy) * qq * r) / Ixx;
    const qd = (ty - (Ixx - Izz) * p * r) / Iyy;
    const rd = (tz - (Iyy - Ixx) * p * qq) / Izz;
    const tanth = Math.tan(th);
    const phid = p + (qq * sph + r * cph) * tanth;
    const thd = qq * cph - r * sph;
    const psid = (qq * sph + r * cph) / Math.max(0.2, cth);
    const ezd = ref(t).z - s[2];
    const Td = T.map((v, i) => (Tc[i] - v) / tm);
    return [vx, vy, vz, axw, ayw, azw, phid, thd, psid, pd, qd, rd, ezd, ...Td];
  };
  const x0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...rotors.map(() => W / N)];
  const out = rk4(f, x0, {
    t1,
    dt,
    every: 10,
    onStep: (t, s) => {
      const Tc = command(t, s);
      if (Tc.some((v) => v >= maxThrust - 1e-9 || v <= 1e-9)) saturatedTime += dt;
      const T = s.slice(13);
      peakRatio = Math.max(peakRatio, Math.max(...T) / maxThrust);
      return s;
    },
  });
  const series = out.map(({ t, x }) => ({ t, x: x[0], y: x[1], z: x[2], phi: x[6], theta: x[7], psi: x[8], tmin: Math.min(...x.slice(13)), tmax: Math.max(...x.slice(13)) }));
  const stable = out.length === Math.round(t1 / dt / 10) + 1 && series.every((p) => Math.abs(p.phi) < 1.2 && Math.abs(p.theta) < 1.2 && Math.abs(p.z) < 50);
  const window = (a, b) => series.filter((p) => p.t >= a && p.t < b);
  const stepMetrics = (pts, key, target, t0) => {
    const peak = Math.max(...pts.map((p) => p[key]));
    const overshoot = (peak - target) / target;
    const rise = pts.find((p) => p[key] >= 0.9 * target);
    let settle = null;
    for (let i = pts.length - 1; i >= 0; i -= 1) {
      if (Math.abs(pts[i][key] - target) > 0.05 * Math.abs(target)) {
        settle = i < pts.length - 1 ? pts[i + 1].t - t0 : null;
        break;
      }
      if (i === 0) settle = 0;
    }
    return { overshoot: Math.max(0, overshoot), riseTime: rise ? rise.t - t0 : null, settlingTime: settle };
  };
  const climb = stable ? stepMetrics(window(1, 5), 'z', 1, 1) : null;
  const move = stable ? stepMetrics(window(5, 10), 'x', 2, 5) : null;
  const gustPts = window(10, 14);
  const gustDev = stable && gustPts.length ? Math.max(...gustPts.map((p) => Math.abs(p.y))) : null;
  const yawPts = window(14, t1);
  const yaw = stable && yawPts.length ? stepMetrics(yawPts, 'psi', 45 * DEG, 14) : null;
  const maxTilt = Math.max(...series.map((p) => Math.max(Math.abs(p.phi), Math.abs(p.theta))));
  return { series, stable, gains: { wAtt, wYaw, wZ, wPos, zeta }, metrics: { climb, move, gustDeviation: gustDev, yaw, saturatedFraction: saturatedTime / t1, peakThrustRatio: peakRatio, maxTilt } };
}

// ---- Analysis entry point --------------------------------------------------------------------

/**
 * @param {{ dynamics, geometry, configuration, aerodynamics, massProperties, propulsion, requirements }} input
 *  aerodynamics: analyseAerodynamics() result (model with CG); massProperties: analyseMassProperties();
 *  propulsion: the propulsion module (motor/propeller) and analysis (hover.maxThrust).
 */
export function analyseDynamics({ dynamics, geometry, configuration, aerodynamics, massProperties, propulsionModule, propulsion, requirements = {} }) {
  const checks = [];
  const derived = [];
  const notes = [];
  const settings = { ...DEFAULT_DYNAMICS, ...(dynamics?.settings ?? {}) };
  const result = { status: 'ok', settings, winged: null, hover: null, checks, derived, notes };
  const mp = massProperties;
  if (!geometry || !mp || !(mp.mass > 0)) return { ...result, status: 'no-mass' };
  const inertia = mp.inertia;
  if (!(inertia[0][0] > 0 && inertia[1][1] > 0 && inertia[2][2] > 0)) return { ...result, status: 'no-mass' };

  if (aerodynamics?.model && geometry.wing) {
    const w = analyseWingedDynamics({ model: aerodynamics.model, geometry, configuration, mass: mp.mass, inertia, requirements, settings });
    result.winged = w;
    const m = w.modes;
    const add = (id, label, mode, note) => {
      if (!mode) return;
      derived.push({ id: `${id}-wn`, label: `${label}: natural frequency`, symbol: 'ω_n', value: mode.wn, unit: 'rad/s', equation: 'eigenvalues of the linearised state matrix (Nelson)', inputs: [], provenance: 'conceptual-estimate', note });
      derived.push({ id: `${id}-zeta`, label: `${label}: damping ratio`, symbol: 'ζ', value: mode.zeta, unit: '1', equation: 'ζ = −Re(λ)/|λ|', inputs: [], provenance: 'conceptual-estimate' });
    };
    add('dy-sp', 'Short period', m.shortPeriod, 'Fast pitch oscillation; sets how crisply the aircraft answers the elevator.');
    add('dy-ph', 'Phugoid', m.phugoid, 'Slow exchange of height and speed.');
    add('dy-dr', 'Dutch roll', m.dutchRoll, 'Coupled yaw–roll oscillation.');
    if (m.roll) derived.push({ id: 'dy-roll-tau', label: 'Roll subsidence time constant', symbol: 'τ_R', value: m.roll.timeConstant, unit: 's', equation: 'τ = 1/|λ_roll|', inputs: [], provenance: 'conceptual-estimate' });
    if (m.spiral) derived.push({ id: 'dy-spiral', label: m.spiral.stable ? 'Spiral mode: time to half amplitude' : 'Spiral mode: time to double amplitude', symbol: 't_½ / t₂', value: m.spiral.halfOrDouble, unit: 's', equation: 't = ln 2 / |λ_spiral|', inputs: [], provenance: 'conceptual-estimate' });
    const d = w.derivatives;
    derived.push(
      { id: 'dy-cma', label: 'Pitch stiffness', symbol: 'C_mα', value: d.Cma, unit: '1', equation: 'C_mα = −C_Lα · SM', inputs: [q('C_Lα', 'Aircraft lift slope', d.CLa, '1'), q('SM', 'Static margin', aerodynamics.model.stability.staticMargin, '1', '%')], provenance: 'conceptual-estimate' },
      { id: 'dy-cnb', label: 'Weathercock stability', symbol: 'C_nβ', value: d.Cnb, unit: '1', equation: 'C_nβ = η a_v V_V − 1.3 Vol_f/(S b)', inputs: [q('V_V', 'Fin volume coefficient', d.VV, '1')], provenance: 'conceptual-estimate' },
      { id: 'dy-clb', label: 'Dihedral effect', symbol: 'C_lβ', value: d.Clb, unit: '1', equation: 'C_lβ = −(a Γ/6)(1+2λ)/(1+λ) − C_L tanΛ/4 − fin term', inputs: [], provenance: 'conceptual-estimate' },
    );
    if (m.shortPeriod && !m.shortPeriod.stable) checks.push({ id: 'DY-SP-001', severity: 'error', title: 'Pitch is unstable (short period diverges)', message: 'The aircraft pitches away by itself. Move the CG forward (Mass & Balance) or enlarge the tail.', equation: 'Re(λ_sp) < 0 required', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    else if (m.shortPeriod?.oscillatory && m.shortPeriod.zeta < 0.3) checks.push({ id: 'DY-SP-002', severity: 'warning', title: 'Lightly damped pitch oscillation', message: `Short-period damping ζ = ${m.shortPeriod.zeta.toFixed(2)}. Below about 0.3 the nose bobs after every input and gust; a larger tail arm or a pitch-rate damper in the autopilot helps.`, equation: 'Guideline: 0.35 ≤ ζ_sp ≤ 1.3 (MIL-F-8785C, Level 1)', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    if (m.dutchRoll && !m.dutchRoll.stable) checks.push({ id: 'DY-DR-001', severity: 'warning', title: 'Dutch roll is unstable', message: 'A yaw–roll wobble grows. Increase the fin area or tail arm (more C_nβ), or reduce dihedral; tailless designs need winglets or yaw damping.', equation: 'Re(λ_DR) < 0', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    else if (m.dutchRoll && m.dutchRoll.zeta < 0.08) checks.push({ id: 'DY-DR-002', severity: 'info', title: 'Lightly damped Dutch roll', message: `Dutch-roll damping ζ = ${m.dutchRoll.zeta.toFixed(2)}; a yaw damper in the autopilot is advisable.`, equation: 'Guideline: ζ_DR ≥ 0.08', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    if (m.spiral && !m.spiral.stable && m.spiral.halfOrDouble < 8) checks.push({ id: 'DY-SPI-001', severity: 'warning', title: 'Fast spiral divergence', message: `Bank angle doubles in ${m.spiral.halfOrDouble.toFixed(1)} s without control. More dihedral or a smaller fin slows it.`, equation: 'Guideline: time to double ≥ 8 s for manual flight', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    if (m.phugoid && !m.phugoid.stable && m.phugoid.halfOrDouble < 20) checks.push({ id: 'DY-PH-001', severity: 'info', title: 'Phugoid diverges', message: `The slow height–speed oscillation doubles in ${m.phugoid.halfOrDouble.toFixed(0)} s. An autopilot handles this easily, but it is tiring by hand.`, equation: 'Guideline: t₂ ≥ 55 s (Level 2)', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    if (geometry.tail?.type === 'none' || !geometry.tail) notes.push('Tailless aircraft: no fin is modelled, so directional stability comes only from the fuselage; real flying wings use winglets, sweep and active yaw damping.');
  }

  const lift = (geometry.rotors ?? []).filter((r) => r.axis === 'z' && r.role !== 'cruise');
  if (lift.length >= 3 && propulsion?.hover?.maxThrust > 0) {
    const prop = propulsionModule?.propeller?.specs;
    const D = lift[0].diameter;
    const kQ = prop ? (prop.cp / (2 * Math.PI * prop.ct)) * D : 0.015;
    const body = geometry.body ?? { diameter: geometry.fuselage?.diameter ?? 0.1, height: geometry.fuselage?.diameter ?? 0.05 };
    const dragArea = 1.0 * body.diameter * body.height + 0.03 * lift.length * (Math.PI / 4) * D * D + (geometry.wing ? 0.02 * geometry.wing.span * geometry.wing.mac : 0);
    const tm = settings.motorTimeConstant ?? 0.015 + 0.15 * D;
    const used = { ...settings, motorTimeConstant: tm };
    const h = simulateHover({ rotors: lift, cg: mp.cg, mass: mp.mass, inertia, maxThrust: propulsion.hover.maxThrust, kQ, settings: used, dragArea, dt: Math.min(0.005, tm / 5) });
    result.hover = { ...h, kQ, dragArea, motorTimeConstant: tm };
    derived.push({ id: 'dy-h-tm', label: 'Motor + propeller response time', symbol: 'τ_m', value: tm, unit: 's', displayUnit: 'ms', equation: settings.motorTimeConstant ? 'your setting' : 'τ_m ≈ 0.015 s + 0.15 s/m × D', inputs: [q('D', 'Propeller diameter', D, 'm', 'mm')], provenance: settings.motorTimeConstant ? 'user-input' : 'conceptual-estimate' });
    const mt = h.metrics;
    derived.push({ id: 'dy-h-watt', label: 'Attitude loop bandwidth used', symbol: 'ω_att', value: h.gains.wAtt, unit: 'rad/s', equation: settings.attitudeBandwidth ? 'your setting' : 'ω = min(12, 1/(3 τ_m))', inputs: [q('τ_m', 'Motor time constant', tm, 's', 'ms')], provenance: settings.attitudeBandwidth ? 'user-input' : 'analytical', note: 'Gains: K_p = I ω², K_d = 2 ζ I ω with ζ = 0.8 (pole placement).' });
    if (h.stable) {
      derived.push(
        { id: 'dy-h-climb', label: '1 m climb: settling time (5 %)', symbol: 't_s', value: mt.climb.settlingTime, unit: 's', equation: 'Simulated 6-DoF response', inputs: [], provenance: 'conceptual-estimate' },
        { id: 'dy-h-move', label: '2 m move: overshoot', symbol: 'M_p', value: mt.move.overshoot, unit: '1', displayUnit: '%', equation: 'Simulated 6-DoF response', inputs: [], provenance: 'conceptual-estimate' },
        { id: 'dy-h-gust', label: `Drift in a ${settings.gustSpeed} m/s side gust`, symbol: 'Δy_max', value: mt.gustDeviation, unit: 'm', displayUnit: 'cm', equation: '1 − cos gust, 2 s', inputs: [], provenance: 'conceptual-estimate' },
        { id: 'dy-h-sat', label: 'Time with a motor at its limit', symbol: 'f_sat', value: mt.saturatedFraction, unit: '1', displayUnit: '%', equation: 'share of the 20 s scenario', inputs: [], provenance: 'conceptual-estimate' },
      );
      if (mt.saturatedFraction > 0.05) checks.push({ id: 'DY-H-002', severity: 'warning', title: 'Motors hit their limits during manoeuvres', message: `A motor is at full or zero thrust for ${(mt.saturatedFraction * 100).toFixed(0)} % of the scenario, so control is momentarily lost. More thrust margin (T/W), a lower control bandwidth or a centred CG helps.`, equation: 'Guideline: saturation < 5 %', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    } else {
      checks.push({ id: 'DY-H-001', severity: 'error', title: 'The hover simulation lost control', message: 'With these motors, inertia and controller bandwidth the simulated aircraft could not hold attitude. Check thrust-to-weight, centre the CG, or lower the attitude bandwidth (Flight Dynamics settings).', equation: 'bounded attitude and altitude', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    }
    if (h.gains.wAtt > 1 / (2 * tm)) checks.push({ id: 'DY-H-003', severity: 'warning', title: 'Attitude bandwidth is too high for the motors', message: `You asked for ${h.gains.wAtt.toFixed(1)} rad/s but the motors respond at about ${(1 / tm).toFixed(0)} rad/s; keep the attitude bandwidth below a third of that.`, equation: 'ω_att ≤ 1/(3 τ_m)', inputs: [], assumptions: [], provenance: 'analytical' });
  }
  if (!result.winged && !result.hover) result.status = 'unsupported';
  return result;
}

export function validateDynamics(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || typeof data.settings !== 'object' || data.settings === null) return ['modules.dynamics must be { settings }'];
  for (const [key, f] of Object.entries(DYNAMICS_FIELDS)) {
    const v = data.settings[key];
    if (v === null && f.optional) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max) errors.push(`modules.dynamics.settings: ${f.label} must be between ${f.min} and ${f.max}`);
  }
  return errors;
}

export function sanitizeDynamics(input) {
  const out = defaultDynamics();
  for (const [key, f] of Object.entries(DYNAMICS_FIELDS)) {
    const v = input?.settings?.[key];
    if (v === null && f.optional) out.settings[key] = null;
    else if (typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max) out.settings[key] = v;
  }
  return out;
}
