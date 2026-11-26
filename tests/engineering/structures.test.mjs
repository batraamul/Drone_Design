/**
 * Structures (Build 5): beam formulas by hand, auto-sizing, resonance and checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tubeSection, sparCheck, armCheck, autoSize, analyseStructures, defaultStructures, validateStructures, sanitizeStructures, MATERIALS, STANDARD_TUBES } from '../../js/engineering/structures.js';
import { defaultConfiguration } from '../../js/engineering/configuration.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { G0 } from '../../js/engineering/atmosphere.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);
const CF = MATERIALS[0];

test('tube section: area and second moment of area', () => {
  const s = tubeSection(0.012, 0.001);
  close(s.area, (Math.PI / 4) * (0.012 ** 2 - 0.01 ** 2));
  close(s.I, (Math.PI / 64) * (0.012 ** 4 - 0.01 ** 4));
  close(s.c, 0.006);
});

test('spar: root moment n W b / (3π), stress, uniform-load deflection', () => {
  const c = sparCheck({ mass: 3, span: 2, loadFactor: 4, safetyFactor: 1.5, material: CF, outer: 0.012, wall: 0.001 });
  const M = (4 * 3 * G0 * 2) / (3 * Math.PI);
  close(c.moment, M);
  const I = (Math.PI / 64) * (0.012 ** 4 - 0.01 ** 4);
  close(c.stress, (1.5 * M * 0.006) / I);
  close(c.margin, CF.strength / c.stress - 1);
  close(c.deflection, (((4 * 3 * G0) / 2) * 1 ** 4) / (8 * CF.E * I));
});

test('arm: tip-load stress, deflection, Rayleigh frequency, resonance flag', () => {
  const base = { thrust: 15, length: 0.2, tipMass: 0.08, safetyFactor: 1.5, material: CF, outer: 0.012, wall: 0.001 };
  const c = armCheck(base);
  const I = (Math.PI / 64) * (0.012 ** 4 - 0.01 ** 4);
  close(c.stress, (1.5 * 15 * 0.2 * 0.006) / I);
  close(c.deflection, (15 * 0.2 ** 3) / (3 * CF.E * I));
  const marm = tubeSection(0.012, 0.001).area * 0.2 * CF.density;
  close(c.frequency, Math.sqrt((3 * CF.E * I) / (0.2 ** 3 * (0.08 + 0.24 * marm))) / (2 * Math.PI));
  assert.equal(armCheck({ ...base, rotorHz: c.frequency }).resonance, '1P');
  assert.equal(armCheck({ ...base, rotorHz: c.frequency / 2 }).resonance, '2P');
  assert.equal(armCheck({ ...base, rotorHz: c.frequency * 3 }).resonance, null);
});

test('auto-size picks the smallest passing tube and respects a fit limit', () => {
  const pick = autoSize((t) => t.outer >= 0.012);
  assert.equal(pick.outer, 0.012);
  assert.equal(pick.met, true);
  const none = autoSize(() => false, (t) => t.outer <= 0.01);
  assert.equal(none.met, false);
  assert.equal(none.outer, 0.01);
  assert.ok(STANDARD_TUBES.every((t, i) => i === 0 || t.outer > STANDARD_TUBES[i - 1].outer));
});

const prop = (mass, maxThrust = 15, n = 100) => ({ mass: { total: mass }, hover: { maxThrust, op: { n } }, motorMass: 0.08, structureMass: 0.5 });

test('multirotor: auto-sized arms pass and stay above 1.15 × 1P', () => {
  const quad = defaultConfiguration('quad-x');
  const r = analyseStructures({ structures: defaultStructures(), geometry: computeGeometry(quad, {}), configuration: quad, propulsion: prop(1.8) });
  assert.equal(r.spar, null);
  assert.ok(r.arm.margin >= 0);
  assert.ok(r.arm.frequency >= 1.15 * 100);
  assert.equal(r.arm.count, 4);
  assert.ok(!r.checks.some((c) => c.severity === 'error'));
});

test('fixed wing: spar fits the wing depth; a manual thin tube is flagged', () => {
  const fw = defaultConfiguration('conventional');
  const geometry = computeGeometry(fw, {});
  const r = analyseStructures({ structures: defaultStructures(), geometry, configuration: fw, propulsion: prop(3) });
  assert.ok(r.spar.outer <= r.spar.depth);
  assert.ok(r.spar.margin >= 0);
  const manual = defaultStructures();
  manual.settings.sparOuter = 0.004;
  manual.settings.sparWall = 0.0005;
  const bad = analyseStructures({ structures: manual, geometry, configuration: fw, propulsion: prop(3) });
  assert.ok(bad.checks.some((c) => c.id === 'ST-SPAR-001'));
});

test('balloon pull-out load factor governs the spar when it is higher', () => {
  const fw = defaultConfiguration('conventional');
  const geometry = computeGeometry(fw, {});
  const r = analyseStructures({ structures: defaultStructures(), geometry, configuration: fw, propulsion: prop(3), soundingLoadFactor: 6 });
  assert.equal(r.spar.loadFactor, 6);
  assert.ok(r.notes.some((n) => n.includes('pull-out')));
});

test('validation and sanitising', () => {
  assert.deepEqual(validateStructures(defaultStructures()), []);
  assert.ok(validateStructures({ ...defaultStructures(), material: 'unobtainium' }).length);
  const s = sanitizeStructures({ material: 'al-6061-t6', settings: { loadFactor: 99, sparOuter: 0.01, sparWall: null } });
  assert.equal(s.material, 'al-6061-t6');
  assert.equal(s.settings.loadFactor, 3.8);
  assert.equal(s.settings.sparOuter, 0.01);
  assert.deepEqual(validateStructures(s), []);
});
