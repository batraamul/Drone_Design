/**
 * Propulsion and energy (Build 4): propeller/motor operating point, full-throttle solve,
 * battery model, discharge, and the design checks. Hand-checked values.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotorOperatingPoint, maxStaticThrust, batteryCurrent, ocvPerCell, batteryPack, dischargeAtPower, analysePropulsion, validatePropulsion, sanitizePropulsion, OCV_CURVES } from '../../js/engineering/propulsion.js';
import { createProject, defaultPropulsionFor } from '../../js/project-schema.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { createComponent, createConnection } from '../../js/engineering/components.js';
import { exampleQuadSet, MOTOR_CATALOGUE, PROPELLER_CATALOGUE } from '../../js/engineering/catalogue.js';
import { analyseElectrical } from '../../js/engineering/electrical.js';
import { G0 } from '../../js/engineering/atmosphere.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);

test('rotor operating point matches the propeller and motor equations (hand calculation)', () => {
  const args = { thrust: 3.5, rho: 1.225, diameter: 0.254, ct: 0.11, cp: 0.044, kv: 920, resistance: 0.1, noLoadCurrent: 0.5 };
  const op = rotorOperatingPoint(args);
  const n = Math.sqrt(3.5 / (0.11 * 1.225 * 0.254 ** 4));
  close(op.n, n);
  close(op.shaftPower, 0.044 * 1.225 * n ** 3 * 0.254 ** 5);
  const kt = 60 / (2 * Math.PI * 920);
  const I = op.shaftPower / (2 * Math.PI * n) / kt + 0.5;
  close(op.current, I);
  close(op.voltage, (60 * n) / 920 + I * 0.1);
  assert.ok(op.efficiency > 0.5 && op.efficiency < 0.95);
  // Thrust from the solved speed reproduces the demanded thrust.
  close(0.11 * 1.225 * op.n ** 2 * 0.254 ** 4, 3.5);
});

test('full-throttle solve satisfies the motor voltage equation', () => {
  const args = { voltage: 14, rho: 1.225, diameter: 0.254, ct: 0.11, cp: 0.044, kv: 920, resistance: 0.1, noLoadCurrent: 0.5 };
  const max = maxStaticThrust(args);
  const kt = 60 / (2 * Math.PI * 920);
  const q = (0.044 * 1.225 * max.n ** 3 * 0.254 ** 5) / (2 * Math.PI * max.n);
  close((60 * max.n) / 920 + 0.1 * (q / kt + 0.5), 14, 1e-6);
  close(max.thrust, 0.11 * 1.225 * max.n ** 2 * 0.254 ** 4, 1e-9);
});

test('battery: OCV curve, current for a power, and terminal voltage', () => {
  close(ocvPerCell('lipo', 1), 4.2);
  close(ocvPerCell('lipo', 0), 3.3);
  close(ocvPerCell('lipo', 0.45), (3.77 + 3.8) / 2);
  for (const curve of Object.values(OCV_CURVES)) for (let i = 1; i < curve.length; i += 1) assert.ok(curve[i][1] > curve[i - 1][1], 'monotonic');
  const I = batteryCurrent(150, 15, 0.02);
  close(I * (15 - I * 0.02), 150, 1e-12);
  assert.equal(batteryCurrent(10000, 15, 0.02), null, 'more than V²/4R cannot be delivered');
  const pack = batteryPack(createComponent({ type: 'battery', specs: { chemistry: 'lipo', cells: 4, capacity: 5000 * 3.6, maxContinuousCurrent: 100, mass: 0.55 } }));
  close(pack.resistance, (0.015 * 4) / 5, 1e-12);
  assert.equal(pack.resistanceEstimated, true);
});

test('discharge time agrees with the energy estimate', () => {
  const pack = batteryPack(createComponent({ type: 'battery', specs: { chemistry: 'lipo', cells: 4, capacity: 5000 * 3.6, maxContinuousCurrent: 100, internalResistance: 0.012, mass: 0.55 } }));
  const run = dischargeAtPower(pack, 150, 0.8);
  // Energy between SOC 1 and 0.2 on the OCV curve, minus I²R losses: roughly 4 Ah × ~14.9 V.
  const rough = (0.8 * 5 * 3600 * 4 * 3.82) / 150;
  assert.ok(Math.abs(run.time - rough) / rough < 0.05, `${run.time} vs ${rough}`);
  assert.equal(run.endReason, 'usable capacity used');
});

test('every catalogue motor/propeller and every layout default yields a consistent analysis', () => {
  for (const e of [...MOTOR_CATALOGUE, ...PROPELLER_CATALOGUE]) assert.match(e.name, /^Example /);
  for (const category of ['multirotor', 'fixed-wing', 'vtol', 'special', 'micro']) {
    const doc = createProject({ name: 'x', category });
    assert.deepEqual(validatePropulsion(doc.modules.propulsion), [], category);
    const geometry = computeGeometry(doc.modules.configuration, {});
    if (!geometry) continue;
    const components = exampleQuadSet({ createComponent, createConnection });
    const result = analysePropulsion({ propulsion: doc.modules.propulsion, geometry, components, electrical: analyseElectrical(components) });
    assert.ok(result.endurance?.time > 0, category);
  }
});

test('example quadcopter: mass budget, hover power and endurance are consistent', () => {
  const doc = createProject({ name: 'q', category: 'multirotor' });
  const components = exampleQuadSet({ createComponent, createConnection });
  const geometry = computeGeometry(doc.modules.configuration, {});
  const r = analysePropulsion({ propulsion: doc.modules.propulsion, geometry, requirements: { payloadMass: { value: 0.2 } }, components, electrical: analyseElectrical(components) });
  const compMass = components.items.reduce((s, i) => s + i.specs.mass * i.quantity, 0);
  close(r.mass.total, compMass + 4 * 0.056 + 4 * 0.012 + 0.35 + 0.2, 1e-12);
  close(r.hover.thrust * 4, r.mass.total * G0, 1e-12);
  assert.ok(r.hover.throttle > 0.3 && r.hover.throttle < 0.6);
  assert.ok(r.endurance.time > 15 * 60 && r.endurance.time < 30 * 60, `${r.endurance.time / 60} min`);
});

test('design checks: cannot hover, overweight, short endurance, no battery', () => {
  const doc = createProject({ name: 'c', category: 'multirotor' });
  const geometry = computeGeometry(doc.modules.configuration, {});
  const components = exampleQuadSet({ createComponent, createConnection });
  const electrical = analyseElectrical(components);
  const weak = structuredClone(doc.modules.propulsion);
  weak.motor.specs.kv = 150;
  const ids = (r) => r.checks.map((c) => c.id);
  assert.ok(ids(analysePropulsion({ propulsion: weak, geometry, components, electrical })).includes('PR-HOV-001'));
  const over = analysePropulsion({ propulsion: doc.modules.propulsion, geometry, requirements: { maxTakeoffMass: { value: 1 }, endurance: { value: 3600 } }, components, electrical });
  assert.ok(ids(over).includes('PR-MASS-001'));
  assert.ok(ids(over).includes('PR-END-001'));
  const none = analysePropulsion({ propulsion: doc.modules.propulsion, geometry, components: { items: [], connections: [] }, electrical: analyseElectrical({ items: [], connections: [] }) });
  assert.equal(none.status, 'no-battery');
  const hot = analysePropulsion({ propulsion: { ...doc.modules.propulsion, settings: { ...doc.modules.propulsion.settings, isaDeltaT: 30 } }, geometry, requirements: { operatingAltitude: { value: 4500 } }, components, electrical });
  const cool = analysePropulsion({ propulsion: doc.modules.propulsion, geometry, components, electrical });
  assert.ok(hot.hover.totalPower > cool.hover.totalPower * 1.2, 'hot-and-high needs more power');
});

test('sanitising keeps valid parts and repairs invalid values', () => {
  const fallback = defaultPropulsionFor({ params: { propDiameter: 0.254 } });
  const broken = structuredClone(fallback);
  broken.motor.specs.kv = -5;
  broken.settings.usableFraction = 7;
  const { propulsion, warnings } = sanitizePropulsion(broken, fallback);
  assert.equal(propulsion.motor.specs.kv, fallback.motor.specs.kv);
  assert.equal(propulsion.settings.usableFraction, 0.8);
  assert.equal(warnings.length, 1);
  assert.deepEqual(validatePropulsion(propulsion), []);
});
