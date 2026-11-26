/**
 * Flight dynamics (Build 6): eigen-solver against Nelson's Navion, mode classification,
 * derivative trends, hover simulation behaviour, validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eigenvalues, modeOf, charPoly, polyRoots, rk4 } from '../../js/engineering/linalg.js';
import { classifyModes, analyseDynamics, defaultDynamics, simulateHover, DEFAULT_DYNAMICS, validateDynamics, sanitizeDynamics, stabilityDerivatives } from '../../js/engineering/dynamics.js';
import { templateProject } from '../../js/engineering/templates.js';
import { createProject } from '../../js/project-schema.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { analyseElectrical } from '../../js/engineering/electrical.js';
import { analysePropulsion } from '../../js/engineering/propulsion.js';
import { aerodynamicModel, analyseAerodynamics } from '../../js/engineering/aerodynamics.js';
import { analyseMassProperties, emptyMassProperties } from '../../js/engineering/mass-properties.js';

const near = (a, e, tol) => assert.ok(Math.abs(a - e) <= tol, `expected ${e} ± ${tol}, got ${a}`);

test('eigenvalues: Nelson Navion longitudinal example (short period and phugoid)', () => {
  const A = [[-0.045, 0.036, 0, -32.2], [-0.369, -2.02, 176, 0], [0.0019, -0.0396, -2.948, 0], [0, 0, 1, 0]];
  const modes = classifyModes(eigenvalues(A), eigenvalues([[-1, 0, 0, 0], [0, -2, 0, 0], [0, 0, -0.01, 0], [0, 0, 0, -5]]));
  near(modes.shortPeriod.eigenvalue.re, -2.51, 0.03);
  near(Math.abs(modes.shortPeriod.eigenvalue.im), 2.59, 0.03);
  near(modes.phugoid.eigenvalue.re, -0.017, 0.002);
  near(Math.abs(modes.phugoid.eigenvalue.im), 0.213, 0.003);
  near(modes.roll.eigenvalue.re, -5, 1e-9);
  near(modes.spiral.eigenvalue.re, -0.01, 1e-9);
});

test('characteristic polynomial and roots', () => {
  assert.deepEqual(charPoly([[2, 0], [0, 3]]), [1, -5, 6]);
  const r = polyRoots([1, 0, 4]).map((z) => Math.abs(z.im)).sort();
  near(r[0], 2, 1e-9);
  const m = modeOf({ re: -0.5, im: 2 });
  near(m.zeta, 0.5 / Math.hypot(0.5, 2), 1e-12);
  near(m.period, Math.PI, 1e-12);
});

test('RK4 integrates exponential decay accurately', () => {
  const out = rk4((t, x) => [-x[0]], [1], { t1: 1, dt: 0.01 });
  near(out.at(-1).x[0], Math.exp(-1), 1e-8);
});

function setup(id, mutate = () => {}) {
  const init = templateProject(id);
  const doc = createProject(init);
  doc.modules = { ...doc.modules, ...init.modules };
  mutate(doc);
  const req = doc.requirements;
  const geo = computeGeometry(doc.modules.configuration, req);
  const aero = aerodynamicModel({ aerodynamics: doc.modules.aerodynamics, configuration: doc.modules.configuration, geometry: geo, requirements: req });
  const pr = analysePropulsion({ propulsion: doc.modules.propulsion, geometry: geo, requirements: req, components: doc.modules.components, electrical: analyseElectrical(doc.modules.components), aero });
  const mp = analyseMassProperties({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: emptyMassProperties(), maxThrustPerRotor: pr.hover?.maxThrust, balanceX: aero ? -(aero.stability.xNp - 0.1 * aero.mac) : null });
  const ae = aero ? analyseAerodynamics({ model: aero, mass: pr.mass.total, requirements: req, cg: -mp.cg.x }) : null;
  const dy = analyseDynamics({ dynamics: doc.modules.dynamics ?? defaultDynamics(), geometry: geo, configuration: doc.modules.configuration, aerodynamics: ae, massProperties: mp, propulsionModule: doc.modules.propulsion, propulsion: pr, requirements: req });
  return { doc, geo, aero, ae, pr, mp, dy };
}

test('fixed wing at 10 % static margin: stable short period, Dutch roll and roll; phugoid near Lanchester', () => {
  const { dy } = setup('glidesonde');
  const m = dy.winged.modes;
  assert.ok(m.shortPeriod.stable && m.dutchRoll.stable && m.roll.stable);
  const V = dy.winged.V;
  near(m.phugoid.wn, (Math.SQRT2 * 9.80665) / V, 0.35 * ((Math.SQRT2 * 9.80665) / V));
  assert.ok(!dy.checks.some((c) => c.severity === 'error'));
});

test('derivative trends: CG aft → pitch stiffness falls; CG behind NP → short period unstable', () => {
  const { ae, geo, doc, mp } = setup('mapping-wing');
  const d1 = stabilityDerivatives({ model: ae.model, geometry: geo, configuration: doc.modules.configuration, mass: mp.mass, inertia: mp.inertia, V: 13, rho: 1.2 });
  const aft = { ...ae.model, stability: { ...ae.model.stability, staticMargin: -0.1 } };
  const d2 = stabilityDerivatives({ model: aft, geometry: geo, configuration: doc.modules.configuration, mass: mp.mass, inertia: mp.inertia, V: 13, rho: 1.2 });
  assert.ok(d1.Cma < 0 && d2.Cma > 0);
  assert.ok(d1.Cnb > 0, 'fin gives weathercock stability');
  assert.ok(d1.Clp < 0 && d1.Cnr < 0 && d1.Cmq < 0, 'damping derivatives are negative');
  const unstable = setup('mapping-wing', (doc) => {
    doc.modules.aerodynamics.settings.cg = 0.9;
  });
  assert.ok(unstable.dy.checks.some((c) => c.id === 'DY-SP-001'));
});

test('hover: a balanced quadcopter is stable and follows the scenario', () => {
  const { dy } = setup('survey-quad');
  const h = dy.hover;
  assert.equal(h.stable, true);
  const last = h.series.at(-1);
  near(last.z, 1, 0.05);
  near(last.x, 2, 0.05);
  near(last.psi, Math.PI / 4, 0.05);
  assert.ok(h.metrics.climb.overshoot < 0.2);
  assert.ok(h.metrics.saturatedFraction < 0.05);
});

test('hover: deterministic — same inputs, same result', () => {
  const a = setup('micro-quad').dy.hover.series.at(-1);
  const b = setup('micro-quad').dy.hover.series.at(-1);
  assert.deepEqual(a, b);
});

test('hover: too little thrust margin loses control', () => {
  const rotors = [{ x: 0.2, y: 0.2, spin: 'ccw' }, { x: -0.2, y: 0.2, spin: 'cw' }, { x: -0.2, y: -0.2, spin: 'ccw' }, { x: 0.2, y: -0.2, spin: 'cw' }];
  const I = [[0.02, 0, 0], [0, 0.02, 0], [0, 0, 0.035]];
  const ok = simulateHover({ rotors, cg: { x: 0, y: 0, z: 0 }, mass: 2, inertia: I, maxThrust: 12, kQ: 0.015, settings: { ...DEFAULT_DYNAMICS, motorTimeConstant: 0.05 }, dragArea: 0.03 });
  assert.equal(ok.stable, true);
  const weak = simulateHover({ rotors, cg: { x: 0, y: 0, z: 0 }, mass: 2, inertia: I, maxThrust: 4.6, kQ: 0.015, settings: { ...DEFAULT_DYNAMICS, motorTimeConstant: 0.05 }, dragArea: 0.03 });
  assert.ok(!weak.stable || weak.metrics.saturatedFraction > 0.2 || Math.abs(weak.series.at(-1).z - 1) > 0.1);
});

test('validation and sanitising', () => {
  assert.deepEqual(validateDynamics(defaultDynamics()), []);
  assert.ok(validateDynamics({ settings: { ...DEFAULT_DYNAMICS, gustSpeed: 99 } }).length);
  const s = sanitizeDynamics({ settings: { motorTimeConstant: 0.03, attitudeBandwidth: 'x', gustSpeed: -1 } });
  assert.equal(s.settings.motorTimeConstant, 0.03);
  assert.equal(s.settings.attitudeBandwidth, null);
  assert.equal(s.settings.gustSpeed, DEFAULT_DYNAMICS.gustSpeed);
});
