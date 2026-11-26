/**
 * Mass properties (Build 6): CG and inertia by hand, parallel-axis theorem, consistency with
 * the mass budget, automatic balance, hover thrust split, validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combine, hoverThrustSplit, balancedX, massItems, analyseMassProperties, emptyMassProperties, validateMassProperties, sanitizeMassProperties } from '../../js/engineering/mass-properties.js';
import { DESIGN_TEMPLATES, templateProject } from '../../js/engineering/templates.js';
import { createProject } from '../../js/project-schema.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { analyseElectrical } from '../../js/engineering/electrical.js';
import { analysePropulsion } from '../../js/engineering/propulsion.js';
import { aerodynamicModel } from '../../js/engineering/aerodynamics.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);
const pt = (mass, x, y = 0, z = 0) => ({ mass, position: { x, y, z } });

test('CG and inertia of point masses (hand calculation)', () => {
  const r = combine([pt(1, 1), pt(1, -1), pt(2, 0, 0, 0.5)]);
  close(r.mass, 4);
  close(r.cg.x, 0);
  close(r.cg.z, 0.25);
  // I_yy = Σ m (x² + z²) about the CG
  close(r.inertia[1][1], 1 * (1 + 0.0625) * 2 + 2 * 0.0625);
  close(r.inertia[0][0], 2 * 0.0625 + 2 * 0.0625);
  close(r.inertia[2][2], 2);
  close(r.inertia[0][2], -(1 * 1 * -0.25 + 1 * -1 * -0.25 + 0));
});

test('parallel-axis theorem: an own inertia is carried over unchanged plus m d²', () => {
  const own = [[0.01, 0, 0], [0, 0.02, 0], [0, 0, 0.03]];
  const r = combine([{ mass: 1, position: { x: 0.5, y: 0, z: 0 }, inertia: own }, pt(1, -0.5)]);
  close(r.inertia[0][0], 0.01);
  close(r.inertia[1][1], 0.02 + 2 * 0.25);
  close(r.inertia[2][2], 0.03 + 2 * 0.25);
});

test('hover thrust split: centred CG gives equal thrust; offset loads the nearer rotors', () => {
  const rotors = [{ x: 0.2, y: 0.2 }, { x: -0.2, y: 0.2 }, { x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }];
  const even = hoverThrustSplit(rotors, { x: 0, y: 0 }, 20);
  even.thrusts.forEach((t) => close(t, 5));
  const back = hoverThrustSplit(rotors, { x: -0.02, y: 0 }, 20);
  assert.ok(back.thrusts[1] > back.thrusts[0]);
  close(back.thrusts.reduce((a, b) => a + b, 0), 20);
  const moment = back.thrusts.reduce((s, t, i) => s + t * (rotors[i].x + 0.02), 0);
  close(moment, 0, 1e-9);
});

test('balancedX puts the CG on target and respects travel limits', () => {
  const items = [pt(1, -0.5), pt(0.5, -0.2)];
  const x = balancedX(items, [items[1]], -0.4, [-1, 0]);
  close(combine([items[0], { ...items[1], position: { x: x.value, y: 0, z: 0 } }]).cg.x, -0.4);
  assert.equal(x.reached, true);
  const far = balancedX(items, [items[1]], -2, [-1, 0]);
  assert.equal(far.value, -1);
  assert.equal(far.reached, false);
});

function build(id) {
  const init = templateProject(id);
  const doc = createProject(init);
  doc.modules = { ...doc.modules, ...init.modules };
  const req = doc.requirements;
  const geo = computeGeometry(doc.modules.configuration, req);
  const pr = analysePropulsion({ propulsion: doc.modules.propulsion, geometry: geo, requirements: req, components: doc.modules.components, electrical: analyseElectrical(doc.modules.components) });
  const aero = aerodynamicModel({ aerodynamics: doc.modules.aerodynamics, configuration: doc.modules.configuration, geometry: geo, requirements: req });
  return { doc, req, geo, pr, aero };
}

for (const t of DESIGN_TEMPLATES) {
  test(`"${t.name}": placed mass equals the mass budget`, () => {
    const { doc, req, geo, pr } = build(t.id);
    const mp = analyseMassProperties({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: emptyMassProperties() });
    close(mp.mass, pr.mass.total, 1e-9);
    assert.ok(mp.inertia[0][0] > 0 && mp.inertia[1][1] > 0 && mp.inertia[2][2] > 0);
    assert.ok(mp.inertia[2][2] <= mp.inertia[0][0] + mp.inertia[1][1] + 1e-12, 'triangle inequality of principal inertias');
  });
}

test('winged: an unplaced battery balances to a 10 % static margin; a placed one does not move', () => {
  const { doc, req, geo, aero } = build('mapping-wing');
  const target = -(aero.stability.xNp - 0.1 * aero.mac);
  const mp = analyseMassProperties({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: emptyMassProperties(), balanceX: target });
  close(mp.cg.x, target, 1e-9);
  const battery = doc.modules.components.items.find((i) => i.type === 'battery');
  const placed = analyseMassProperties({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: { placements: { [battery.id]: { x: -0.1, y: 0, z: 0 } }, payload: null }, balanceX: target });
  assert.equal(placed.items.find((i) => i.componentId === battery.id).position.x, -0.1);
  assert.ok(placed.cg.x > mp.cg.x, 'battery moved forward → CG forward');
});

test('multirotor: moving the battery off-centre raises a CG check', () => {
  const { doc, req, geo, pr } = build('survey-quad');
  const battery = doc.modules.components.items.find((i) => i.type === 'battery');
  const mp = analyseMassProperties({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: { placements: { [battery.id]: { x: 0.12, y: 0, z: 0.05 } }, payload: null }, maxThrustPerRotor: pr.hover.maxThrust });
  assert.ok(mp.checks.some((c) => c.id.startsWith('MP-CG-')));
  assert.ok(mp.hover.maxRatio > 1.05);
});

test('ESCs of a multirotor sit on the arms; validation and sanitising', () => {
  const { doc, req, geo } = build('survey-quad');
  const items = massItems({ geometry: geo, components: doc.modules.components, propulsion: doc.modules.propulsion, requirements: req, massProperties: emptyMassProperties() });
  assert.equal(items.filter((i) => i.id.includes('#')).length, 4);
  assert.deepEqual(validateMassProperties(emptyMassProperties()), []);
  assert.ok(validateMassProperties({ placements: { bad: { x: 0, y: 0, z: 0 } }, payload: null }).length);
  assert.ok(validateMassProperties({ placements: { cmp_abc: { x: 99, y: 0, z: 0 } }, payload: null }).length);
  const s = sanitizeMassProperties({ placements: { cmp_keep: { x: 0.1, y: 0, z: 0 }, cmp_gone: { x: 0, y: 0, z: 0 }, cmp_bad: { x: 'a' } }, payload: { x: 0, y: 0, z: -0.1 } }, new Set(['cmp_keep', 'cmp_bad']));
  assert.deepEqual(Object.keys(s.placements), ['cmp_keep']);
  assert.deepEqual(s.payload, { x: 0, y: 0, z: -0.1 });
});
