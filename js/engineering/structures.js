/**
 * Preliminary structural sizing (Build 5). See docs/engineering-models.md §10.
 *
 *  - Wing spar: a single round tube carries the whole wing bending moment. With an
 *    elliptical lift distribution the root moment is M = n W b / (3π). Bending stress
 *    σ = M (D/2) / I. Tip deflection uses a uniform load on a cantilever, δ = w L⁴ / (8 E I),
 *    which over-predicts the elliptical case (conservative).
 *  - Multirotor arms / VTOL booms: cantilevers with the full motor thrust at the tip:
 *    σ = T L (D/2) / I, δ = T L³ / (3 E I). First bending frequency with the motor as a tip
 *    mass: f₁ = (1/2π) √(3 E I / (L³ (m_tip + 0.24 m_arm))). It should stay clear of the
 *    rotor speed (1P) and blade-passing frequency (2P); auto-sizing keeps f₁ ≥ 1.15 × 1P.
 *  - Ultimate loads = limit loads × safety factor (1.5 by default).
 *
 * Simplified beam theory for concept sizing only — not FEA, not a structural substantiation.
 */
import { G0 } from './atmosphere.js';

/** ILLUSTRATIVE material records: typical, rounded room-temperature values. Use supplier data. */
export const MATERIALS = Object.freeze([
  { id: 'cfrp-tube', name: 'Carbon-fibre tube (roll-wrapped, typical)', E: 70e9, strength: 500e6, density: 1550, note: 'Design allowable in bending; pultruded tubes are stiffer along the axis but weaker in hoop.' },
  { id: 'al-6061-t6', name: 'Aluminium 6061-T6 (typical)', E: 69e9, strength: 276e6, density: 2700, note: 'Strength = tensile yield.' },
  { id: 'gfrp-tube', name: 'Glass-fibre tube (typical)', E: 25e9, strength: 300e6, density: 1900, note: 'Cheaper and tougher than carbon, about a third of the stiffness.' },
  { id: 'spruce', name: 'Sitka spruce, along the grain (typical)', E: 10e9, strength: 38e6, density: 450, note: 'Strength = compression parallel to grain; varies widely with moisture and grain.' },
  { id: 'pla-print', name: '3D-printed PLA (typical)', E: 3e9, strength: 40e6, density: 1240, note: 'Strongly depends on print orientation, infill and layer bonding; test your own coupons.' },
]);
export const materialEntry = (id) => MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];

/** Common round-tube sizes (outer × inner diameter, mm) used for auto-sizing. */
export const STANDARD_TUBES = Object.freeze([
  [3, 2], [4, 3], [5, 3], [6, 4], [8, 6], [10, 8], [12, 10], [14, 12], [16, 14], [18, 16], [20, 18], [22, 20], [25, 23], [28, 26], [30, 28], [35, 32], [40, 37], [50, 46],
].map(([o, i]) => ({ outer: o / 1000, wall: (o - i) / 2000 })));

export const STRUCTURE_FIELDS = Object.freeze({
  loadFactor: { label: 'Limit load factor (wing)', symbol: 'n', unit: '1', displayUnits: ['1'], min: 1.5, max: 10, help: 'Largest load factor in normal use: about 3.8 for small UAVs, higher for aerobatic or balloon-release pull-outs.' },
  safetyFactor: { label: 'Safety factor', symbol: 'SF', unit: '1', displayUnits: ['1'], min: 1, max: 3, help: '1.5 is the usual aircraft value (ultimate = 1.5 × limit).' },
  sparOuter: { label: 'Spar tube outer diameter', symbol: 'D_spar', unit: 'm', displayUnits: ['mm', 'm'], min: 0.002, max: 0.2 },
  sparWall: { label: 'Spar tube wall thickness', symbol: 't_spar', unit: 'm', displayUnits: ['mm', 'm'], min: 0.0002, max: 0.02 },
  armOuter: { label: 'Arm / boom tube outer diameter', symbol: 'D_arm', unit: 'm', displayUnits: ['mm', 'm'], min: 0.002, max: 0.2 },
  armWall: { label: 'Arm / boom tube wall thickness', symbol: 't_arm', unit: 'm', displayUnits: ['mm', 'm'], min: 0.0002, max: 0.02 },
});

export function defaultStructures() {
  return { material: 'cfrp-tube', armMaterial: 'cfrp-tube', settings: { loadFactor: 3.8, safetyFactor: 1.5, sparOuter: null, sparWall: null, armOuter: null, armWall: null } };
}

export const tubeSection = (D, t) => {
  const d = Math.max(D - 2 * t, 0);
  return { area: (Math.PI / 4) * (D * D - d * d), I: (Math.PI / 64) * (D ** 4 - d ** 4), c: D / 2 };
};

/** Wing spar check for one tube. */
export function sparCheck({ mass, span, loadFactor, safetyFactor, material, outer, wall }) {
  const W = mass * G0;
  const M = (loadFactor * W * span) / (3 * Math.PI);
  const sec = tubeSection(outer, wall);
  const stress = (safetyFactor * M * sec.c) / sec.I;
  const w = (loadFactor * W) / span; // uniform load per unit length on each half (N/m)
  const L = span / 2;
  const deflection = (w * L ** 4) / (8 * material.E * sec.I);
  return { moment: M, ultimateMoment: safetyFactor * M, stress, margin: material.strength / stress - 1, deflection, deflectionRatio: deflection / L, mass: sec.area * span * material.density, section: sec };
}

/** Arm/boom cantilever check for one tube. */
export function armCheck({ thrust, length, tipMass, safetyFactor, material, outer, wall, rotorHz, blades = 2 }) {
  const sec = tubeSection(outer, wall);
  const M = thrust * length;
  const stress = (safetyFactor * M * sec.c) / sec.I;
  const deflection = (thrust * length ** 3) / (3 * material.E * sec.I);
  const armMass = sec.area * length * material.density;
  const freq = (1 / (2 * Math.PI)) * Math.sqrt((3 * material.E * sec.I) / (length ** 3 * (tipMass + 0.24 * armMass)));
  const near = (f) => Math.abs(freq - f) / f < 0.15;
  const resonance = rotorHz ? (near(rotorHz) ? '1P' : near(blades * rotorHz) ? `${blades}P` : null) : null;
  return { moment: M, stress, margin: material.strength / stress - 1, deflection, deflectionRatio: deflection / length, mass: armMass, frequency: freq, resonance, section: sec };
}

/** Smallest standard tube meeting the requirement predicate, or the largest one. */
export function autoSize(predicate, fits = () => true) {
  for (const tube of STANDARD_TUBES) if (fits(tube) && predicate(tube)) return { ...tube, met: true };
  const candidates = STANDARD_TUBES.filter(fits);
  return candidates.length ? { ...candidates[candidates.length - 1], met: false } : { ...STANDARD_TUBES[0], met: false };
}

const q = (symbol, label, value, unit, displayUnit) => ({ symbol, label, value, unit, ...(displayUnit ? { displayUnit } : {}) });

/**
 * @param {{ structures, geometry, configuration, propulsion, aerodynamics?, sounding? }} input
 *  propulsion: the Propulsion & Energy result (mass, hover.maxThrust, hover.op.n, cruise)
 *  aerodynamics: the Aerodynamics result (aerofoil thickness for spar fit)
 */
export function analyseStructures({ structures, geometry, configuration, propulsion, aerodynamics = null, soundingLoadFactor = null }) {
  const checks = [];
  const derived = [];
  const notes = [];
  const result = { status: 'ok', spar: null, arm: null, checks, derived, notes };
  const mass = propulsion?.mass?.total;
  if (!geometry || !(mass > 0)) return { ...result, status: 'no-mass' };
  const st = { ...defaultStructures().settings, ...(structures?.settings ?? {}) };
  const sparMat = materialEntry(structures?.material);
  const armMat = materialEntry(structures?.armMaterial);
  const SF = st.safetyFactor;

  if (geometry.wing) {
    const nDesign = Math.max(st.loadFactor, soundingLoadFactor ?? 0);
    if (soundingLoadFactor && soundingLoadFactor > st.loadFactor) notes.push(`The balloon-release pull-out load factor (${soundingLoadFactor.toFixed(1)}) is higher than the wing limit load factor; the spar is sized for the pull-out.`);
    const tc = aerodynamics?.model?.aerofoil?.specs?.thickness ?? 0.12;
    const depth = tc * geometry.wing.rootChord * 0.9;
    const base = { mass, span: geometry.wing.span, loadFactor: nDesign, safetyFactor: SF, material: sparMat };
    const manual = typeof st.sparOuter === 'number' && typeof st.sparWall === 'number';
    const tube = manual ? { outer: st.sparOuter, wall: st.sparWall, met: null } : autoSize((t) => { const c = sparCheck({ ...base, ...t }); return c.margin >= 0 && c.deflectionRatio <= 0.1; }, (t) => t.outer <= depth);
    const c = sparCheck({ ...base, outer: tube.outer, wall: tube.wall });
    result.spar = { ...c, outer: tube.outer, wall: tube.wall, auto: !manual, material: sparMat, loadFactor: nDesign, depth };
    const tubeLabel = `${(tube.outer * 1000).toFixed(0)} × ${(tube.wall * 1000).toFixed(1)} mm ${sparMat.name}`;
    derived.push(
      { id: 'st-spar-tube', label: manual ? 'Wing spar tube' : 'Wing spar tube (auto-sized)', symbol: 'D × t', value: tube.outer, unit: 'm', displayUnit: 'mm', equation: manual ? 'your input' : 'Smallest standard tube with MS ≥ 0 and δ ≤ 10 % of semi-span that fits the wing', inputs: [q('t_w', 'Wing depth available', depth, 'm', 'mm')], provenance: manual ? 'user-input' : 'analytical', note: tubeLabel },
      { id: 'st-spar-moment', label: 'Wing root bending moment (limit)', symbol: 'M_root', value: c.moment, unit: 'N·m', equation: 'M = n W b / (3π)', inputs: [q('n', 'Load factor', nDesign, '1'), q('m', 'Mass', mass, 'kg'), q('b', 'Span', geometry.wing.span, 'm')], provenance: 'analytical', assumptions: ['Elliptical lift distribution; whole moment carried by the spar tube.'] },
      { id: 'st-spar-stress', label: 'Spar bending stress (ultimate)', symbol: 'σ', value: c.stress, unit: 'Pa', displayUnit: 'MPa', equation: 'σ = SF M (D/2) / I,  I = π (D⁴ − d⁴) / 64', inputs: [q('SF', 'Safety factor', SF, '1'), q('σ_allow', 'Material allowable', sparMat.strength, 'Pa', 'MPa')], provenance: 'analytical' },
      { id: 'st-spar-ms', label: 'Spar margin of safety', symbol: 'MS', value: c.margin, unit: '1', displayUnit: '%', equation: 'MS = σ_allow / σ − 1', inputs: [], provenance: 'analytical', note: 'Must be ≥ 0. Material values are typical, not certified allowables.' },
      { id: 'st-spar-defl', label: 'Wing tip deflection at limit load', symbol: 'δ_tip', value: c.deflection, unit: 'm', displayUnit: 'mm', equation: 'δ = w L⁴ / (8 E I),  w = n W / b,  L = b/2', inputs: [q('E', 'Modulus', sparMat.E, 'Pa', 'MPa')], provenance: 'conceptual-estimate', assumptions: ['Uniform load on each half (conservative for elliptical loading).'] },
      { id: 'st-spar-mass', label: 'Spar tube mass', symbol: 'm_spar', value: c.mass, unit: 'kg', displayUnit: 'g', equation: 'm = ρ A b', inputs: [], provenance: 'analytical' },
    );
    if (c.margin < 0) checks.push({ id: 'ST-SPAR-001', severity: 'error', title: manual ? 'Wing spar is overstressed' : 'No standard spar tube fits the wing and carries the load', message: manual ? `The spar stress at ultimate load is ${(c.stress / 1e6).toFixed(0)} MPa, above the ${(sparMat.strength / 1e6).toFixed(0)} MPa allowable. Use a larger or thicker tube, a stronger material, or a lower load factor.` : `Even the largest tube that fits inside the ${(depth * 1000).toFixed(0)} mm wing depth is overstressed. Use a thicker aerofoil, a deeper root chord, two spars, or a box spar.`, equation: 'Required: MS ≥ 0', inputs: [q('σ', 'Stress', c.stress, 'Pa', 'MPa'), q('σ_allow', 'Allowable', sparMat.strength, 'Pa', 'MPa')], assumptions: [], provenance: 'analytical' });
    else if (c.deflectionRatio > 0.1) checks.push({ id: 'ST-SPAR-002', severity: 'warning', title: 'Wing is very flexible', message: `Tip deflection at limit load is ${(c.deflectionRatio * 100).toFixed(0)} % of the semi-span. Large deflection reduces lift, risks flutter and loads the joints; use a stiffer spar.`, equation: 'Guideline: δ ≤ 10 % of b/2', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
    if (manual && tube.outer > depth) checks.push({ id: 'ST-SPAR-003', severity: 'warning', title: 'Spar tube is deeper than the wing', message: `The ${(tube.outer * 1000).toFixed(0)} mm tube does not fit inside the ${(depth * 1000).toFixed(0)} mm available at the root (90 % of t/c × c_r).`, equation: 'D_spar ≤ 0.9 (t/c) c_r', inputs: [], assumptions: [], provenance: 'analytical' });
  }

  const lift = (geometry.rotors ?? []).filter((r) => r.role !== 'cruise' && r.axis !== 'x');
  const hover = propulsion?.hover;
  const motorMass = propulsion?.motorMass ?? 0;
  if (lift.length && hover?.maxThrust > 0) {
    const params = configuration?.params ?? {};
    const xRef = geometry.wing ? geometry.wing.xAC : 0;
    const bodyR = geometry.wing ? (geometry.fuselage?.diameter ?? 0) / 2 : (params.bodyDiameter ?? 0) / 2;
    const lengths = lift.map((r) => (geometry.wing ? Math.abs(r.x - xRef) : Math.max(Math.hypot(r.x, r.y) - bodyR, 0.01)));
    const L = Math.max(...lengths);
    const rotorHz = hover.op?.n ?? null;
    const base = { thrust: hover.maxThrust, length: L, tipMass: motorMass, safetyFactor: SF, material: armMat, rotorHz };
    const manual = typeof st.armOuter === 'number' && typeof st.armWall === 'number';
    const tube = manual ? { outer: st.armOuter, wall: st.armWall } : autoSize((t) => { const c = armCheck({ ...base, ...t }); return c.margin >= 0 && c.deflectionRatio <= 0.02 && !c.resonance && (!rotorHz || c.frequency >= 1.15 * rotorHz); });
    const c = armCheck({ ...base, outer: tube.outer, wall: tube.wall });
    result.arm = { ...c, outer: tube.outer, wall: tube.wall, auto: !manual, material: armMat, length: L, count: lift.length, rotorHz };
    const what = geometry.wing ? 'Lift-rotor boom' : 'Arm';
    derived.push(
      { id: 'st-arm-tube', label: `${what} tube${manual ? '' : ' (auto-sized)'}`, symbol: 'D × t', value: tube.outer, unit: 'm', displayUnit: 'mm', equation: manual ? 'your input' : 'Smallest standard tube with MS ≥ 0, δ ≤ 2 % L, f₁ ≥ 1.15 × 1P and no 2P resonance', inputs: [q('L', 'Cantilever length', L, 'm', 'mm')], provenance: manual ? 'user-input' : 'analytical', note: `${(tube.outer * 1000).toFixed(0)} × ${(tube.wall * 1000).toFixed(1)} mm ${armMat.name}` },
      { id: 'st-arm-stress', label: `${what} bending stress (ultimate)`, symbol: 'σ_arm', value: c.stress, unit: 'Pa', displayUnit: 'MPa', equation: 'σ = SF T_max L (D/2) / I', inputs: [q('T_max', 'Full-throttle thrust per rotor', hover.maxThrust, 'N'), q('L', 'Length', L, 'm', 'mm')], provenance: 'analytical' },
      { id: 'st-arm-ms', label: `${what} margin of safety`, symbol: 'MS_arm', value: c.margin, unit: '1', displayUnit: '%', equation: 'MS = σ_allow / σ − 1', inputs: [], provenance: 'analytical' },
      { id: 'st-arm-defl', label: `${what} tip deflection at full thrust`, symbol: 'δ_arm', value: c.deflection, unit: 'm', displayUnit: 'mm', equation: 'δ = T L³ / (3 E I)', inputs: [], provenance: 'analytical' },
      { id: 'st-arm-freq', label: `${what} first bending frequency`, symbol: 'f₁', value: c.frequency, unit: 'Hz', equation: 'f₁ = (1/2π) √(3EI / (L³ (m_tip + 0.24 m_arm)))', inputs: [q('m_tip', 'Motor mass', motorMass, 'kg', 'g')], provenance: 'conceptual-estimate', note: rotorHz ? `Hover rotor speed 1P = ${rotorHz.toFixed(0)} Hz, blade passing 2P = ${(2 * rotorHz).toFixed(0)} Hz.` : undefined },
      { id: 'st-arm-mass', label: `${what} tube mass (all)`, symbol: 'm_arms', value: c.mass * lift.length, unit: 'kg', displayUnit: 'g', equation: 'm = n ρ A L', inputs: [], provenance: 'analytical' },
    );
    if (c.margin < 0) checks.push({ id: 'ST-ARM-001', severity: 'error', title: `${what} is overstressed at full thrust`, message: `Stress at ultimate load is ${(c.stress / 1e6).toFixed(0)} MPa against ${(armMat.strength / 1e6).toFixed(0)} MPa allowable. Use a larger tube or a stronger material.`, equation: 'Required: MS ≥ 0', inputs: [], assumptions: [], provenance: 'analytical' });
    if (c.resonance) checks.push({ id: 'ST-ARM-002', severity: 'warning', title: `${what} resonates near the ${c.resonance} rotor frequency`, message: `The first bending frequency (${c.frequency.toFixed(0)} Hz) is within 15 % of the ${c.resonance} excitation in hover. Expect vibration in the IMU; stiffen or shorten the ${what.toLowerCase()}.`, equation: '|f₁ − f_exc| / f_exc > 15 %', inputs: [], assumptions: ['Rotor speed from the hover operating point.'], provenance: 'conceptual-estimate' });
    else if (rotorHz && c.frequency < rotorHz) checks.push({ id: 'ST-ARM-003', severity: 'info', title: `${what} is softer than the rotor frequency`, message: `f₁ = ${c.frequency.toFixed(0)} Hz is below 1P = ${rotorHz.toFixed(0)} Hz. Throttle changes pass through resonance at spool-up; a stiffer ${what.toLowerCase()} (f₁ above 2P) is easier to tune.`, equation: 'Preferred: f₁ > 2P', inputs: [], assumptions: [], provenance: 'conceptual-estimate' });
  }
  const structureEstimate = propulsion?.structureMass;
  const tubes = (result.spar?.mass ?? 0) + (result.arm ? result.arm.mass * result.arm.count : 0);
  if (structureEstimate && tubes > structureEstimate) checks.push({ id: 'ST-MASS-001', severity: 'warning', title: 'Tubes alone exceed the structure-mass estimate', message: `Spar and arm tubes weigh ${(tubes * 1000).toFixed(0)} g, more than the ${(structureEstimate * 1000).toFixed(0)} g structure estimate in Propulsion & Energy. Raise the estimate there so the mass budget stays honest.`, equation: 'm_tubes ≤ m_structure', inputs: [], assumptions: [], provenance: 'analytical' });
  result.tubeMass = tubes;
  return result;
}

export function validateStructures(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['modules.structures must be an object'];
  if (!MATERIALS.some((m) => m.id === data.material)) errors.push('modules.structures.material is unknown');
  if (!MATERIALS.some((m) => m.id === data.armMaterial)) errors.push('modules.structures.armMaterial is unknown');
  for (const [key, f] of Object.entries(STRUCTURE_FIELDS)) {
    const v = data.settings?.[key];
    const optional = !['loadFactor', 'safetyFactor'].includes(key);
    if (v === null && optional) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max) errors.push(`modules.structures.settings: ${f.label} must be between ${f.min} and ${f.max}`);
  }
  return errors;
}

export function sanitizeStructures(input) {
  const base = defaultStructures();
  if (!input || typeof input !== 'object') return base;
  const out = structuredClone(base);
  if (MATERIALS.some((m) => m.id === input.material)) out.material = input.material;
  if (MATERIALS.some((m) => m.id === input.armMaterial)) out.armMaterial = input.armMaterial;
  for (const [key, f] of Object.entries(STRUCTURE_FIELDS)) {
    const v = input.settings?.[key];
    if (v === null) out.settings[key] = ['loadFactor', 'safetyFactor'].includes(key) ? base.settings[key] : null;
    else if (typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max) out.settings[key] = v;
  }
  return out;
}
