/**
 * Conceptual aerodynamics of winged aircraft (Build 5). See docs/engineering-models.md §9.
 *
 *  - Lift-curve slope and span efficiency from Prandtl's lifting-line theory, solved with
 *    Glauert's Fourier series for the straight-tapered wing; sweep corrected with the
 *    DATCOM/Helmbold expression.
 *  - Aerofoil presets with typical rounded values; maximum lift corrected for Reynolds number.
 *  - Zero-lift drag by component build-up (Raymer ch. 12): flat-plate skin friction
 *    (laminar/turbulent mix) × form factor × interference × wetted area, plus a
 *    miscellaneous allowance.
 *  - Drag polar C_D = C_D0 + k C_L², k = 1/(π AR e); Oswald factor after Kroo.
 *  - Performance at the estimated mass: stall speed, cruise C_L and L/D, minimum-drag and
 *    minimum-power speeds, power-required curve.
 *  - Static longitudinal stability: neutral point from the wing, tail and fuselage, and the
 *    static margin for the centre of gravity you enter.
 *
 * All results are conceptual estimates for comparing designs. They are not validated
 * aerodynamic data: confirm with XFLR5/OpenVSP, wind-tunnel or flight test.
 */
import { G0, isa } from './atmosphere.js';
import { wingPlanform } from './geometry.js';

const DEG = Math.PI / 180;

/** Aerofoil fields (SI; angles in rad). */
export const AEROFOIL_FIELDS = Object.freeze({
  thickness: { label: 'Thickness ratio', symbol: 't/c', unit: '1', displayUnits: ['%', '1'], min: 0.03, max: 0.25 },
  xMaxThickness: { label: 'Position of maximum thickness', symbol: '(x/c)_t', unit: '1', displayUnits: ['%', '1'], min: 0.15, max: 0.6 },
  liftSlope: { label: 'Section lift-curve slope', symbol: 'a₀', unit: '1', displayUnits: ['1'], min: 4, max: 7, help: 'Per radian. Thin-aerofoil theory gives 2π ≈ 6.28; real sections at low Reynolds number are about 5.5–6.2.' },
  alphaZeroLift: { label: 'Zero-lift angle of attack', symbol: 'α₀', unit: 'rad', displayUnits: ['deg', 'rad'], min: -0.15, max: 0.05 },
  clMax: { label: 'Maximum section lift coefficient', symbol: 'c_l,max', unit: '1', displayUnits: ['1'], min: 0.5, max: 2.2 },
  reRef: { label: 'Reynolds number of that c_l,max', symbol: 'Re_ref', unit: '1', displayUnits: ['1'], min: 2e4, max: 1e7 },
  cm0: { label: 'Pitching moment about the quarter chord', symbol: 'c_m0', unit: '1', displayUnits: ['1'], min: -0.3, max: 0.1, help: 'Negative for cambered sections; about zero or slightly positive for reflexed flying-wing sections.' },
});

/**
 * ILLUSTRATIVE aerofoil presets: typical, rounded values from published low-speed data.
 * Use measured polars (for example the UIUC low-speed data or XFOIL/XFLR5 at your Reynolds
 * number) for real designs.
 */
export const AEROFOIL_CATALOGUE = Object.freeze([
  { catalogueId: 'af-clark-y', name: 'Clark Y (typical values)', use: 'General-purpose flat-bottomed section, easy to build.', specs: { thickness: 0.117, xMaxThickness: 0.28, liftSlope: 5.9, alphaZeroLift: -3.5 * DEG, clMax: 1.35, reRef: 3e5, cm0: -0.08 } },
  { catalogueId: 'af-naca-2412', name: 'NACA 2412 (typical values)', use: 'Light aircraft and larger UAV wings.', specs: { thickness: 0.12, xMaxThickness: 0.3, liftSlope: 6.0, alphaZeroLift: -2.1 * DEG, clMax: 1.4, reRef: 5e5, cm0: -0.05 } },
  { catalogueId: 'af-naca-0012', name: 'NACA 0012 (typical values)', use: 'Symmetric: tails, aerobatic wings.', specs: { thickness: 0.12, xMaxThickness: 0.3, liftSlope: 6.0, alphaZeroLift: 0, clMax: 1.15, reRef: 5e5, cm0: 0 } },
  { catalogueId: 'af-sd7037', name: 'SD7037 (typical values)', use: 'Low-Reynolds-number glider and survey wings.', specs: { thickness: 0.092, xMaxThickness: 0.28, liftSlope: 5.8, alphaZeroLift: -3.0 * DEG, clMax: 1.2, reRef: 2e5, cm0: -0.09 } },
  { catalogueId: 'af-e387', name: 'Eppler E387 (typical values)', use: 'Well-documented low-Re section (wind-tunnel reference case).', specs: { thickness: 0.091, xMaxThickness: 0.31, liftSlope: 5.8, alphaZeroLift: -3.5 * DEG, clMax: 1.2, reRef: 2e5, cm0: -0.08 } },
  { catalogueId: 'af-mh45', name: 'MH 45 (typical values)', use: 'Reflexed section for flying wings (nearly zero c_m0).', specs: { thickness: 0.098, xMaxThickness: 0.26, liftSlope: 5.8, alphaZeroLift: -1.0 * DEG, clMax: 1.0, reRef: 2e5, cm0: 0.005 } },
]);

export const aerofoilEntry = (id) => AEROFOIL_CATALOGUE.find((a) => a.catalogueId === id) ?? null;

/** Analysis settings. */
export const AERO_FIELDS = Object.freeze({
  cg: { label: 'Centre of gravity behind the nose', symbol: 'x_cg', unit: 'm', displayUnits: ['mm', 'cm', 'm'], min: 0, max: 20, help: 'Leave empty and AEROLAB X suggests a CG for a 10 % static margin.' },
  laminarFraction: { label: 'Laminar fraction of wetted surface', symbol: 'f_lam', unit: '1', displayUnits: ['%', '1'], min: 0, max: 0.7, help: 'About 10–30 % for smooth composite skins at low Reynolds number; 0 for rough or film-covered skins.' },
  miscDrag: { label: 'Miscellaneous drag allowance', symbol: 'Δ_misc', unit: '1', displayUnits: ['%', '1'], min: 0, max: 1, help: 'Antennas, gaps, hinges, cooling, leakage. 10–25 % is common for small UAVs.' },
  extraDragArea: { label: 'Extra drag area (D/q)', symbol: 'D/q', unit: 'm²', displayUnits: ['cm²', 'm²'], min: 0, max: 2, help: 'Landing gear, gimbal, parked lift rotors and motors (VTOL): roughly C_D × frontal area of each item.' },
  boomDiameter: { label: 'Boom diameter (VTOL booms)', symbol: 'd_boom', unit: 'm', displayUnits: ['mm', 'm'], min: 0.005, max: 0.3 },
  tailEfficiency: { label: 'Tail dynamic-pressure ratio', symbol: 'η_t', unit: '1', displayUnits: ['1'], min: 0.5, max: 1, help: 'Ratio of dynamic pressure at the tail to free stream; about 0.9.' },
});

export const DEFAULT_AERO_SETTINGS = Object.freeze({ cg: null, laminarFraction: 0.15, miscDrag: 0.15, extraDragArea: 0, boomDiameter: 0.025, tailEfficiency: 0.9 });

export function defaultAerodynamics(configuration) {
  const id = configuration?.layout === 'flying-wing' || configuration?.layout === 'delta' ? 'af-mh45' : configuration?.layout === 'glider' ? 'af-sd7037' : 'af-clark-y';
  const e = aerofoilEntry(id);
  return { aerofoil: { name: e.name, catalogueId: e.catalogueId, provenance: 'illustrative', source: '', specs: { ...e.specs } }, settings: { ...DEFAULT_AERO_SETTINGS } };
}

// ---- Lifting line --------------------------------------------------------------------------

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k += 1) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Prandtl lifting line for an untwisted straight-tapered wing (Glauert's method,
 * symmetric loading: odd terms only).
 * @returns {{ cla: number, e: number, coefficients: number[] }} cla per rad, span efficiency e
 */
export function liftingLine({ span: b, rootChord: cr, taperRatio: lam, a0 = 2 * Math.PI, terms = 12 }) {
  const S = (b * cr * (1 + lam)) / 2;
  const AR = (b * b) / S;
  const N = terms;
  const A = [];
  const rhs = [];
  for (let i = 1; i <= N; i += 1) {
    const th = (i * Math.PI) / (2 * N);
    const eta = Math.abs(Math.cos(th));
    const c = cr * (1 - (1 - lam) * eta);
    const row = [];
    for (let j = 0; j < N; j += 1) {
      const n = 2 * j + 1;
      row.push(Math.sin(n * th) * ((4 * b) / (a0 * c) + n / Math.sin(th)));
    }
    A.push(row);
    rhs.push(1); // α − α₀ = 1 rad
  }
  const An = solveLinear(A, rhs);
  const cla = Math.PI * AR * An[0];
  let delta = 0;
  for (let j = 1; j < N; j += 1) delta += (2 * j + 1) * (An[j] / An[0]) ** 2;
  return { cla, e: 1 / (1 + delta), coefficients: An, aspectRatio: AR };
}

/** DATCOM / Helmbold lift-curve slope (per rad) with mid-chord sweep, M ≈ 0. */
export function datcomLiftSlope(AR, sweepHalfChord, a0 = 2 * Math.PI) {
  const kappa = a0 / (2 * Math.PI);
  return (2 * Math.PI * AR) / (2 + Math.sqrt(((AR * AR) / (kappa * kappa)) * (1 + Math.tan(sweepHalfChord) ** 2) + 4));
}

// ---- Skin friction and form factors ---------------------------------------------------------

export const cfLaminar = (re) => 1.328 / Math.sqrt(Math.max(re, 1));
export const cfTurbulent = (re) => 0.455 / Math.log10(Math.max(re, 10)) ** 2.58;
export const cfMixed = (re, laminarFraction) => laminarFraction * cfLaminar(re) + (1 - laminarFraction) * cfTurbulent(re);
/** Lifting-surface form factor (Raymer 12.30, low-speed: compressibility term omitted). */
export const ffSurface = (tc, xm, sweepMax = 0) => (1 + (0.6 / xm) * tc + 100 * tc ** 4) * Math.cos(sweepMax) ** 0.28;
/** Fuselage/boom form factor (Raymer 12.31). */
export const ffBody = (f) => 1 + 60 / f ** 3 + f / 400;
const surfaceWetted = (Sexposed, tc) => Sexposed * (1.977 + 0.52 * tc);
function bodyWetted(L, d) {
  const f = L / d;
  return f > 3 ? Math.PI * d * L * (1 - 2 / f) ** (2 / 3) * (1 + 1 / (f * f)) : 0.75 * Math.PI * d * L;
}

/** Fuselage pitching-moment factor K_f (per degree): approximate fit to the trend in Raymer Fig. 16.14. */
export const fuselageKf = (p) => 0.004 + 0.07 * Math.min(Math.max(p, 0), 0.7) ** 2;

/** Helmbold lift-curve slope of a low-aspect-ratio surface (per rad). */
export const helmbold = (AR, a0 = 2 * Math.PI) => datcomLiftSlope(AR, 0, a0);

/** c_l,max corrected to Reynolds number (empirical exponent 0.1, clamped). */
export function clMaxAtRe(spec, re) {
  const ratio = Math.min(1.15, Math.max(0.6, (re / spec.reRef) ** 0.1));
  return spec.clMax * ratio;
}

// ---- Model ----------------------------------------------------------------------------------

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });

/**
 * Mass-independent aerodynamic model of the current design.
 * @returns {null | object} null when the layout has no wing.
 */
export function aerodynamicModel({ aerodynamics, configuration, geometry, requirements = {} }) {
  if (!geometry?.wing || !aerodynamics?.aerofoil) return null;
  const params = configuration?.params ?? {};
  const af = aerodynamics.aerofoil.specs;
  const st = { ...DEFAULT_AERO_SETTINGS, ...(aerodynamics.settings ?? {}) };
  const w = geometry.wing;
  const lam = w.tipChord / w.rootChord;
  const wp = wingPlanform({ span: w.span, rootChord: w.rootChord, taperRatio: lam, sweepLE: w.sweepLE });
  const S = wp.area;
  const AR = wp.aspectRatio;
  const tanLE = Math.tan(w.sweepLE);
  const sweepAt = (frac) => Math.atan(tanLE - (4 * frac * (1 - lam)) / (AR * (1 + lam)));
  const sweepHalf = sweepAt(0.5);
  const sweepQC = sweepAt(0.25);
  const sweepMaxT = sweepAt(af.xMaxThickness);

  const ll = liftingLine({ span: w.span, rootChord: w.rootChord, taperRatio: lam, a0: af.liftSlope });
  const sweepFactor = datcomLiftSlope(AR, sweepHalf, af.liftSlope) / datcomLiftSlope(AR, 0, af.liftSlope);
  const cla = ll.cla * sweepFactor;

  const altitude = requirements.operatingAltitude?.value ?? 0;
  const atm = isa(altitude);
  const V = requirements.cruiseSpeed?.value ?? 15;
  const reMac = (atm.density * V * wp.mac) / atm.dynamicViscosity;
  const clMaxSection = clMaxAtRe(af, reMac);
  const clMaxWing = 0.9 * clMaxSection * Math.cos(sweepQC);

  // Drag build-up components: { name, length, swet, ff, Q }
  const fus = geometry.fuselage && geometry.fuselage.length > 0 && geometry.fuselage.diameter > 0 ? geometry.fuselage : null;
  const df = fus?.diameter ?? 0;
  const parts = [];
  const sExposed = Math.max(S - df * w.rootChord, 0.5 * S);
  parts.push({ name: 'Wing', length: wp.mac, swet: surfaceWetted(sExposed, af.thickness), ff: ffSurface(af.thickness, af.xMaxThickness, sweepMaxT), Q: 1.0 });
  if (fus) parts.push({ name: 'Fuselage', length: fus.length, swet: bodyWetted(fus.length, fus.diameter), ff: ffBody(Math.max(fus.length / fus.diameter, 1.5)), Q: 1.0 });
  const t = geometry.tail;
  let Sh = 0;
  let tailArea = 0;
  if (t?.type === 'conventional') {
    Sh = t.span * t.chord;
    tailArea = Sh + t.vHeight * t.vChord;
    parts.push({ name: 'Horizontal tail', length: t.chord, swet: surfaceWetted(Sh, 0.09), ff: ffSurface(0.09, 0.3), Q: 1.05 });
    parts.push({ name: 'Vertical tail', length: t.vChord, swet: surfaceWetted(t.vHeight * t.vChord, 0.09), ff: ffSurface(0.09, 0.3), Q: 1.05 });
  } else if (t?.type === 'v') {
    const panels = (t.span * t.chord) / Math.cos(t.angle);
    Sh = panels * Math.cos(t.angle) ** 2;
    tailArea = panels;
    parts.push({ name: 'V-tail', length: t.chord, swet: surfaceWetted(panels, 0.09), ff: ffSurface(0.09, 0.3), Q: 1.05 });
  }
  for (const [i, bm] of (geometry.booms ?? []).entries()) {
    const L = Math.hypot(bm.to.x - bm.from.x, bm.to.y - bm.from.y);
    if (L > 0) parts.push({ name: `Boom ${i + 1}`, length: L, swet: bodyWetted(L, st.boomDiameter), ff: ffBody(Math.max(L / st.boomDiameter, 1.5)), Q: 1.1 });
  }

  const build = (re) => {
    const scale = re / reMac;
    return parts.map((p) => {
      const reP = (re * p.length) / wp.mac;
      const cf = cfMixed(Math.max(reP, 1e3), p.name === 'Wing' || p.name.includes('tail') ? st.laminarFraction : st.laminarFraction * 0.5);
      return { ...p, re: reP, cf, cd: (cf * p.ff * p.Q * p.swet) / S, scale };
    });
  };
  const cd0At = (re) => {
    const rows = build(re);
    return (rows.reduce((s, r) => s + r.cd, 0) + st.extraDragArea / S) * (1 + st.miscDrag);
  };
  const rows = build(reMac);
  const cd0 = cd0At(reMac);
  const eInviscid = ll.e * (1 - 2 * (df / w.span) ** 2);
  const oswald = 1 / (1 / eInviscid + 0.38 * cd0 * Math.PI * AR);
  const k = 1 / (Math.PI * AR * oswald);

  // Static stability
  const xAc = -w.xAC; // behind nose
  const notes = [];
  let hn = 0; // (x_np − x_ac) / c̄
  let tailTerm = 0;
  let downwash = 0;
  let VH = 0;
  if (Sh > 0) {
    const lt = params.tailArm ?? 0;
    VH = (Sh * lt) / (S * wp.mac);
    const ARt = t.type === 'v' ? t.span / t.chord : (t.span * t.span) / Sh;
    const at = helmbold(ARt, 6.0);
    downwash = Math.min((2 * cla) / (Math.PI * AR), 0.6);
    tailTerm = st.tailEfficiency * VH * (at / cla) * (1 - downwash);
    hn += tailTerm;
  } else if (t?.type && t.type !== 'none') {
    notes.push(`Tail type "${t.type}" is not modelled; the neutral point uses the wing and fuselage only.`);
  }
  let fusTerm = 0;
  if (fus) {
    const p = (-w.xRootLE + 0.25 * w.rootChord) / fus.length;
    const cmaFusDeg = (fuselageKf(p) * df * df * fus.length) / (wp.mac * S);
    fusTerm = -cmaFusDeg / (cla * DEG);
    hn += fusTerm;
  }
  const xNp = xAc + hn * wp.mac;
  const cgSet = typeof st.cg === 'number' && Number.isFinite(st.cg);
  const xCg = cgSet ? st.cg : xNp - 0.1 * wp.mac;
  const staticMargin = (xNp - xCg) / wp.mac;

  return {
    S,
    AR,
    mac: wp.mac,
    span: w.span,
    taperRatio: lam,
    sweepQC,
    sweepHalf,
    aerofoil: aerodynamics.aerofoil,
    liftingLine: ll,
    sweepFactor,
    cla,
    reMac,
    reference: { altitude, density: atm.density, viscosity: atm.dynamicViscosity, speed: V, speedAssumed: requirements.cruiseSpeed?.value === undefined },
    clMaxSection,
    clMaxWing,
    alphaZeroLift: af.alphaZeroLift,
    cm0: af.cm0,
    drag: { rows, extraDragArea: st.extraDragArea, misc: st.miscDrag },
    cd0,
    cd0At,
    eInviscid,
    oswald,
    k,
    ldMax: 0.5 * Math.sqrt(1 / (cd0 * k)),
    clMd: Math.sqrt(cd0 / k),
    stability: { xAc, xNp, xCg, cgSet, staticMargin, VH, tailTerm, fusTerm, downwash, tailless: Sh === 0 },
    notes,
    settings: st,
  };
}

/** Drag coefficient and L/D at a lift coefficient. */
export const polarAt = (m, cl) => ({ cd: m.cd0 + m.k * cl * cl, ld: cl / (m.cd0 + m.k * cl * cl) });

/** Power required (W) at speed V for weight W and density rho. */
export function powerRequired(m, W, rho, V) {
  const qd = 0.5 * rho * V * V;
  const cl = W / (qd * m.S);
  return { cl, drag: (m.cd0 + m.k * cl * cl) * qd * m.S, power: (m.cd0 + m.k * cl * cl) * qd * m.S * V };
}

/**
 * Full aerodynamic analysis with performance at the given mass.
 * @returns {{ status, model, performance, checks, derived, notes }}
 */
export function analyseAerodynamics({ model, mass, requirements = {} }) {
  const checks = [];
  const derived = [];
  if (!model) return { status: 'no-wing', model: null, performance: null, checks, derived, notes: [] };
  const notes = [...model.notes];
  const m = model;
  const ref = m.reference;
  const af = m.aerofoil;
  derived.push(
    { id: 'ae-cla', label: 'Wing lift-curve slope', symbol: 'C_Lα', value: m.cla, unit: '1', equation: 'Lifting line: C_Lα = π AR A₁; sweep factor from DATCOM', inputs: [q('AR', 'Aspect ratio', m.AR, '1'), q('a₀', 'Section lift slope', af.specs.liftSlope, '1'), q('Λ_c/2', 'Mid-chord sweep', m.sweepHalf, 'rad', 'deg')], provenance: 'analytical', note: 'Per radian. Untwisted wing; Glauert Fourier series with 12 terms.' },
    { id: 'ae-e-ll', label: 'Span efficiency (lifting line)', symbol: 'e_LL', value: m.liftingLine.e, unit: '1', equation: 'e = 1 / (1 + δ),  δ = Σ n (A_n / A₁)²', inputs: [q('λ', 'Taper ratio', m.taperRatio, '1')], provenance: 'analytical', note: 'Inviscid. A taper ratio of about 0.4 gives a nearly elliptical lift distribution.' },
    { id: 'ae-re', label: 'Reynolds number at cruise (MAC)', symbol: 'Re', value: m.reMac, unit: '1', equation: 'Re = ρ V c̄ / μ', inputs: [q('V', 'Cruise speed', ref.speed, 'm/s'), q('c̄', 'Mean aerodynamic chord', m.mac, 'm'), q('ρ', 'Air density', ref.density, 'kg/m³')], provenance: 'analytical', assumptions: [`ISA at ${Math.round(ref.altitude)} m.`, ...(ref.speedAssumed ? ['No cruise-speed target set: 15 m/s assumed.'] : [])] },
    { id: 'ae-clmax', label: 'Wing maximum lift coefficient', symbol: 'C_Lmax', value: m.clMaxWing, unit: '1', equation: 'C_Lmax ≈ 0.9 c_l,max(Re) cos Λ_c/4;  c_l,max(Re) = c_l,max,ref (Re/Re_ref)^0.1', inputs: [q('c_l,max', 'Section maximum (at Re)', m.clMaxSection, '1'), q('Λ_c/4', 'Quarter-chord sweep', m.sweepQC, 'rad', 'deg')], provenance: 'conceptual-estimate', assumptions: ['Clean wing, no flaps. The Reynolds-number correction is empirical; use measured section data at your Re.'] },
    { id: 'ae-cd0', label: 'Zero-lift drag coefficient', symbol: 'C_D0', value: m.cd0, unit: '1', equation: 'C_D0 = (Σ C_f FF Q S_wet / S + (D/q)/S)(1 + Δ_misc)', inputs: [q('f_lam', 'Laminar fraction', m.settings.laminarFraction, '1', '%'), q('Δ_misc', 'Miscellaneous allowance', m.settings.miscDrag, '1', '%')], provenance: 'conceptual-estimate', assumptions: ['Component build-up after Raymer, Aircraft Design, ch. 12; low-speed form factors.'] },
    { id: 'ae-oswald', label: 'Oswald efficiency factor', symbol: 'e', value: m.oswald, unit: '1', equation: '1/e = 1/(e_LL (1 − 2(d_f/b)²)) + 0.38 C_D0 π AR', inputs: [], provenance: 'conceptual-estimate', note: 'Viscous correction after Kroo (Aircraft Design: Synthesis and Analysis).' },
    { id: 'ae-ldmax', label: 'Maximum lift-to-drag ratio', symbol: '(L/D)max', value: m.ldMax, unit: '1', equation: '(L/D)max = ½ √(π AR e / C_D0)', inputs: [q('C_D0', 'Zero-lift drag', m.cd0, '1'), q('e', 'Oswald factor', m.oswald, '1'), q('AR', 'Aspect ratio', m.AR, '1')], provenance: 'conceptual-estimate' },
  );
  const sb = m.stability;
  derived.push(
    { id: 'ae-np', label: 'Neutral point behind the nose', symbol: 'x_np', value: sb.xNp, unit: 'm', equation: 'h_n = h_ac + η_t V_H (a_t / a_w)(1 − dε/dα) − K_f d_f² L_f / (c̄ S C_Lα)', inputs: [q('V_H', 'Tail volume', sb.VH, '1'), q('dε/dα', 'Downwash gradient', sb.downwash, '1'), q('x_ac', 'Wing aerodynamic centre', sb.xAc, 'm', 'mm')], provenance: 'conceptual-estimate', assumptions: ['Fuselage term: approximate fit to Raymer Fig. 16.14.', 'dε/dα ≈ 2 C_Lα / (π AR).'] },
    { id: 'ae-cg', label: sb.cgSet ? 'Centre of gravity behind the nose' : 'Suggested CG for a 10 % static margin', symbol: 'x_cg', value: sb.xCg, unit: 'm', equation: sb.cgSet ? 'your input' : 'x_cg = x_np − 0.10 c̄', inputs: [], provenance: sb.cgSet ? 'user-input' : 'analytical' },
    { id: 'ae-sm', label: 'Static margin', symbol: 'SM', value: sb.staticMargin, unit: '1', displayUnit: '%', equation: 'SM = (x_np − x_cg) / c̄', inputs: [q('x_np', 'Neutral point', sb.xNp, 'm', 'mm'), q('x_cg', 'Centre of gravity', sb.xCg, 'm', 'mm'), q('c̄', 'MAC', m.mac, 'm', 'mm')], provenance: 'conceptual-estimate', note: 'Positive = statically stable in pitch. 5–15 % is typical for small UAVs.' },
  );

  if (sb.cgSet) {
    if (sb.staticMargin < 0) checks.push({ id: 'AE-SM-001', severity: 'error', title: 'Unstable in pitch: CG behind the neutral point', message: `The static margin is ${(sb.staticMargin * 100).toFixed(1)} %. Move the battery or payload forward until the CG is at least 5 % MAC ahead of the neutral point, or enlarge the tail.`, equation: 'Required: SM > 0', inputs: [q('x_np', 'Neutral point', sb.xNp, 'm', 'mm'), q('x_cg', 'CG', sb.xCg, 'm', 'mm')], assumptions: [], provenance: 'conceptual-estimate' });
    else if (sb.staticMargin < 0.05) checks.push({ id: 'AE-SM-002', severity: 'warning', title: 'Small static margin', message: `The static margin is ${(sb.staticMargin * 100).toFixed(1)} %. Below about 5 % the aircraft is sensitive to CG errors and gusts.`, equation: 'Guideline: SM ≥ 5 %', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    else if (sb.staticMargin > 0.3) checks.push({ id: 'AE-SM-003', severity: 'info', title: 'Large static margin (nose-heavy)', message: `The static margin is ${(sb.staticMargin * 100).toFixed(0)} %. Stable, but the elevator needs more deflection to trim, which costs drag.`, equation: 'Typical: 5–15 %', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  }
  if (sb.tailless && m.cm0 < -0.02) checks.push({ id: 'AE-FW-001', severity: 'warning', title: 'Tailless design with a nose-down aerofoil', message: `With no tail, the wing must trim itself. The selected aerofoil has c_m0 = ${m.cm0.toFixed(3)}; choose a reflexed section (c_m0 ≥ 0, e.g. MH 45) or add sweep with washout.`, equation: 'Tailless trim needs C_m0 ≥ 0', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  if (m.reMac < 1e5) checks.push({ id: 'AE-RE-001', severity: 'info', title: 'Low Reynolds number', message: `Cruise Re ≈ ${Math.round(m.reMac).toLocaleString('en')}. Below about 100 000 laminar separation bubbles raise drag and lower c_l,max; use aerofoil data measured at this Re.`, equation: 'Re = ρ V c̄ / μ', inputs: [], assumptions: [], provenance: 'analytical' });

  let performance = null;
  const massKg = typeof mass === 'number' && mass > 0 ? mass : requirements.maxTakeoffMass?.value;
  if (typeof massKg === 'number' && massKg > 0) {
    const W = massKg * G0;
    const rho = ref.density;
    const vStall = Math.sqrt((2 * W) / (rho * m.S * m.clMaxWing));
    const vMd = Math.sqrt((2 * W) / (rho * m.S * m.clMd));
    const vMp = vMd / 3 ** 0.25;
    const cruise = powerRequired(m, W, rho, ref.speed);
    const ldCruise = cruise.cl / (m.cd0 + m.k * cruise.cl * cruise.cl);
    const curve = [];
    const vLo = Math.max(vStall * 0.95, 1);
    const vHi = Math.max(ref.speed * 1.4, vMd * 2.2);
    for (let i = 0; i <= 40; i += 1) {
      const V = vLo + ((vHi - vLo) * i) / 40;
      curve.push({ x: V, y: powerRequired(m, W, rho, V).power });
    }
    performance = { mass: massKg, weight: W, vStall, vMd, vMp, cruise: { speed: ref.speed, cl: cruise.cl, ld: ldCruise, drag: cruise.drag, power: cruise.power }, pMin: powerRequired(m, W, rho, vMp).power, curve, wingLoading: W / m.S };
    derived.push(
      { id: 'ae-vs', label: 'Stall speed (clean)', symbol: 'V_s', value: vStall, unit: 'm/s', equation: 'V_s = √(2W / (ρ S C_Lmax))', inputs: [q('m', 'Mass', massKg, 'kg'), q('S', 'Wing area', m.S, 'm²'), q('C_Lmax', 'Wing C_Lmax', m.clMaxWing, '1')], provenance: 'conceptual-estimate' },
      { id: 'ae-cl-cruise', label: 'Lift coefficient in cruise', symbol: 'C_L', value: cruise.cl, unit: '1', equation: 'C_L = 2W / (ρ V² S)', inputs: [q('V', 'Cruise speed', ref.speed, 'm/s')], provenance: 'analytical' },
      { id: 'ae-ld-cruise', label: 'Lift-to-drag ratio in cruise', symbol: 'L/D', value: ldCruise, unit: '1', equation: 'L/D = C_L / (C_D0 + k C_L²)', inputs: [q('k', 'Induced-drag factor', m.k, '1')], provenance: 'conceptual-estimate' },
      { id: 'ae-vmd', label: 'Speed for best L/D (best glide / range)', symbol: 'V_md', value: vMd, unit: 'm/s', equation: 'V_md = √(2W / (ρ S C_L*)),  C_L* = √(C_D0 / k)', inputs: [], provenance: 'conceptual-estimate' },
      { id: 'ae-vmp', label: 'Speed for minimum power (best endurance)', symbol: 'V_mp', value: vMp, unit: 'm/s', equation: 'V_mp = V_md / 3^¼', inputs: [], provenance: 'conceptual-estimate' },
      { id: 'ae-pmin', label: 'Minimum aerodynamic power', symbol: 'P_min', value: performance.pMin, unit: 'W', equation: 'P = D V at V_mp', inputs: [], provenance: 'conceptual-estimate', note: 'Power delivered to the air; divide by propeller, motor and ESC efficiencies for electrical power.' },
    );
    if (ref.speed < vStall * 1.05) checks.push({ id: 'AE-STALL-001', severity: 'error', title: 'Cruise speed is at or below the stall speed', message: `The stall speed is ${vStall.toFixed(1)} m/s, cruise is ${ref.speed.toFixed(1)} m/s. Enlarge the wing, reduce mass, or cruise faster.`, equation: 'Required: V_cruise ≥ 1.3 V_s', inputs: [q('V_s', 'Stall speed', vStall, 'm/s'), q('V', 'Cruise speed', ref.speed, 'm/s')], assumptions: [], provenance: 'conceptual-estimate' });
    else if (ref.speed < vStall * 1.3) checks.push({ id: 'AE-STALL-002', severity: 'warning', title: 'Cruise speed is close to stall', message: `Cruise is only ${((ref.speed / vStall - 1) * 100).toFixed(0)} % above the ${vStall.toFixed(1)} m/s stall speed. Aim for at least 30 % margin for gusts and turns.`, equation: 'Guideline: V_cruise ≥ 1.3 V_s', inputs: [q('V_s', 'Stall speed', vStall, 'm/s')], assumptions: [], provenance: 'conceptual-estimate' });
    if (ref.speed > 2 * vMd) checks.push({ id: 'AE-SPD-001', severity: 'info', title: 'Cruise is much faster than best-L/D speed', message: `Best L/D is near ${vMd.toFixed(1)} m/s. A smaller wing would cruise more efficiently at ${ref.speed.toFixed(1)} m/s.`, equation: 'V_cruise vs V_md', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  }
  return { status: 'ok', model, performance, checks, derived, notes };
}

// ---- Validation -------------------------------------------------------------------------------

function fieldError(fields, key, value, optional = false) {
  const f = fields[key];
  if (value === null && optional) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${f.label}: a number is required`;
  if (value < f.min || value > f.max) return `${f.label}: must be between ${f.min} and ${f.max}`;
  return null;
}

export function validateAerodynamics(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['modules.aerodynamics must be an object'];
  if (!data.aerofoil || typeof data.aerofoil !== 'object' || !data.aerofoil.specs) errors.push('modules.aerodynamics.aerofoil is missing');
  else for (const key of Object.keys(AEROFOIL_FIELDS)) {
    const m = fieldError(AEROFOIL_FIELDS, key, data.aerofoil.specs[key]);
    if (m) errors.push(`modules.aerodynamics.aerofoil: ${m}`);
  }
  for (const key of Object.keys(AERO_FIELDS)) {
    const m = fieldError(AERO_FIELDS, key, data.settings?.[key], key === 'cg');
    if (m) errors.push(`modules.aerodynamics.settings: ${m}`);
  }
  return errors;
}

export function sanitizeAerodynamics(input, configuration) {
  const base = defaultAerodynamics(configuration);
  if (!input || typeof input !== 'object') return base;
  const out = structuredClone(base);
  if (input.aerofoil?.specs) {
    out.aerofoil = { name: String(input.aerofoil.name ?? base.aerofoil.name).slice(0, 120), catalogueId: input.aerofoil.catalogueId ?? null, provenance: String(input.aerofoil.provenance ?? 'user-input'), source: String(input.aerofoil.source ?? '').slice(0, 300), specs: { ...base.aerofoil.specs } };
    for (const key of Object.keys(AEROFOIL_FIELDS)) if (fieldError(AEROFOIL_FIELDS, key, input.aerofoil.specs[key]) === null) out.aerofoil.specs[key] = input.aerofoil.specs[key];
  }
  for (const key of Object.keys(AERO_FIELDS)) {
    const v = input.settings?.[key];
    if (v !== undefined && fieldError(AERO_FIELDS, key, v, key === 'cg') === null) out.settings[key] = v;
  }
  return out;
}
