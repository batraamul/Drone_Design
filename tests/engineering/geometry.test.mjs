/**
 * Geometry model (Build 2): hand-checked values for each family, every layout's
 * defaults, and the geometry checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS, defaultConfiguration, switchLayout, validateConfiguration, paramsFor, sanitizeConfiguration } from '../../js/engineering/configuration.js';
import { computeGeometry, rotorAxes, wingPlanform } from '../../js/engineering/geometry.js';
import { RHO0, G0 } from '../../js/engineering/atmosphere.js';

const close = (actual, expected, tol = 1e-9, msg) => assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${msg ?? ''} expected ${expected}, got ${actual}`);
const value = (geo, id) => geo.derived.find((d) => d.id === id)?.value;
const withParams = (layout, params) => { const c = defaultConfiguration(layout); return { ...c, params: { ...c.params, ...params } }; };

test('every layout default is valid and modelled layouts produce geometry without errors', () => {
  for (const layout of LAYOUTS) {
    const config = defaultConfiguration(layout.id);
    assert.deepEqual(validateConfiguration(config), [], layout.id);
    const geo = computeGeometry(config, { maxTakeoffMass: { value: 2 }, operatingAltitude: { value: 500 } });
    if (layout.family === 'none') {
      assert.equal(geo, null, layout.id);
      continue;
    }
    assert.ok(geo, layout.id);
    assert.deepEqual(geo.checks.filter((c) => c.severity !== 'info').map((c) => c.id), [], `${layout.id} defaults raise no warnings`);
    for (const d of geo.derived) assert.ok(Number.isFinite(d.value), `${layout.id} ${d.id}`);
    for (const axis of ['x', 'y', 'z']) assert.ok(geo.extents[axis][1] >= geo.extents[axis][0], `${layout.id} extents ${axis}`);
  }
});

test('rotor arrangements: X, +, Y and H patterns', () => {
  const x = rotorAxes('x', 4, 1);
  close(x[0].x, Math.SQRT1_2);
  close(x[0].y, Math.SQRT1_2, 1e-9, 'first X rotor is front-right');
  const plus = rotorAxes('plus', 4, 1);
  assert.deepEqual(plus.map((p) => [Math.round(p.x), Math.round(p.y)]), [[1, 0], [0, 1], [-1, 0], [0, -1]]);
  const y = rotorAxes('y', 3, 1);
  close(y[1].x, -1);
  const h = rotorAxes('h', 4, 1, 2);
  close(Math.hypot(h[0].x, h[0].y), 1, 1e-12, 'H rotors stay at distance R');
  close(h[0].x / h[0].y, 2, 1e-12, 'H ratio');
});

test('quadcopter X: wheelbase, tip clearance, disc area and ideal hover (hand calculation)', () => {
  const geo = computeGeometry(withParams('quad-x', { armLength: 0.225, propDiameter: 0.254 }), { maxTakeoffMass: { value: 1.5 } });
  close(value(geo, 'geo-mr-wheelbase'), 0.45);
  close(value(geo, 'geo-mr-clearance'), 2 * 0.225 * Math.sin(Math.PI / 4) - 0.254);
  const A = 4 * Math.PI * 0.254 ** 2 / 4;
  close(value(geo, 'geo-mr-area'), A);
  const DL = 1.5 * G0 / A;
  close(value(geo, 'geo-mr-loading'), DL);
  close(value(geo, 'geo-mr-vh'), Math.sqrt(DL / (2 * RHO0)));
  close(value(geo, 'geo-mr-pideal'), 1.5 * G0 * Math.sqrt(DL / (2 * RHO0)));
  assert.equal(geo.rotors.filter((r) => r.spin === 'cw').length, 2, 'two rotors each way');
});

test('overlapping and crowded propellers are reported', () => {
  const overlap = computeGeometry(withParams('hexa-x', { armLength: 0.3, propDiameter: 0.3048 }));
  assert.equal(overlap.checks[0].id, 'GEO-MR-001');
  assert.equal(overlap.checks[0].severity, 'error');
  const crowded = computeGeometry(withParams('quad-x', { armLength: 0.2, propDiameter: 0.27 }));
  assert.ok(crowded.checks.some((c) => c.id === 'GEO-MR-002'));
  const overBody = computeGeometry(withParams('quad-x', { bodyDiameter: 0.3 }));
  assert.ok(overBody.checks.some((c) => c.id === 'GEO-MR-003'));
});

test('coaxial layouts double the rotor count but not the disc area', () => {
  const geo = computeGeometry(defaultConfiguration('x8'));
  assert.equal(geo.rotors.length, 8);
  close(value(geo, 'geo-mr-area'), 4 * Math.PI * geo.rotors[0].diameter ** 2 / 4);
  for (let i = 0; i < 8; i += 2) assert.notEqual(geo.rotors[i].spin, geo.rotors[i + 1].spin, 'coaxial pair counter-rotates');
});

test('trapezoidal wing: area, aspect ratio, MAC and quarter-chord sweep (hand calculation)', () => {
  const wp = wingPlanform({ span: 2, rootChord: 0.3, taperRatio: 0.6, sweepLE: 0 });
  close(wp.area, 0.48);
  close(wp.aspectRatio, 4 / 0.48);
  close(wp.mac, (2 / 3) * 0.3 * (1 + 0.6 + 0.36) / 1.6);
  close(wp.yMac, (2 / 6) * (2.2 / 1.6));
  close(Math.tan(wp.sweepQC), -(0.4) / ((4 / 0.48) * 1.6));
  const rect = wingPlanform({ span: 1, rootChord: 0.2, taperRatio: 1, sweepLE: 0 });
  close(rect.mac, 0.2);
  close(rect.sweepQC, 0, 1e-12);
});

test('tail volume coefficients and the small-tail warning', () => {
  const geo = computeGeometry(defaultConfiguration('conventional'), { maxTakeoffMass: { value: 3 } });
  const wp = wingPlanform(geo.wing.span ? { span: 2, rootChord: 0.3, taperRatio: 0.6, sweepLE: 3 * Math.PI / 180 } : {});
  close(value(geo, 'geo-tail-vh'), (0.6 * 0.16 * 0.8) / (wp.area * wp.mac));
  close(value(geo, 'geo-tail-vv'), (0.25 * 0.18 * 0.8) / (wp.area * 2));
  close(value(geo, 'geo-fw-ws'), 3 * G0 / wp.area);
  const small = computeGeometry(withParams('conventional', { hTailSpan: 0.3, hTailChord: 0.1, vTailHeight: 0.1, vTailChord: 0.1 }));
  assert.ok(small.checks.some((c) => c.id === 'GEO-TAIL-001'));
  assert.ok(small.checks.some((c) => c.id === 'GEO-TAIL-003'));
  const short = computeGeometry(withParams('conventional', { tailArm: 0.1 }));
  assert.ok(short.checks.some((c) => c.id === 'GEO-TAIL-004' && c.severity === 'error'));
});

test('V-tail splits the panel area into horizontal and vertical projections', () => {
  const geo = computeGeometry(defaultConfiguration('v-tail'));
  const g = 35 * Math.PI / 180;
  const panels = (0.6 * 0.16) / Math.cos(g);
  close(value(geo, 'geo-tail-sv-total'), panels);
  close(value(geo, 'geo-tail-sh') + value(geo, 'geo-tail-svert'), panels, 1e-12, 'cos² + sin² = 1');
});

test('quadplane lift rotors sit on booms either side of the wing aerodynamic centre', () => {
  const geo = computeGeometry(defaultConfiguration('quadplane'));
  const lift = geo.rotors.filter((r) => r.role === 'lift');
  assert.equal(lift.length, 4);
  assert.equal(geo.booms.length, 2);
  close(lift[0].x - lift[1].x, 2 * 0.45);
  assert.equal(geo.rotors.filter((r) => r.role === 'cruise').length, 1);
});

test('switching layout keeps compatible values; sanitising repairs bad ones', () => {
  const quad = withParams('quad-x', { propDiameter: 0.2 });
  const plus = switchLayout(quad, 'quad-plus');
  assert.equal(plus.params.propDiameter, 0.2, 'same rotor count keeps the propeller');
  const hexa = switchLayout(quad, 'hexa-x');
  assert.equal(hexa.params.propDiameter, 0.3048, 'a new rotor arrangement takes its own arm and propeller');
  assert.deepEqual(computeGeometry(hexa).checks.filter((c) => c.severity === 'error'), []);
  assert.deepEqual(Object.keys(hexa.params).sort(), paramsFor('hexa-x').map((p) => p.key).sort());
  const plane = switchLayout(quad, 'conventional');
  assert.equal(plane.params.span, 2);
  assert.equal(plane.params.propDiameter, 0.3302, 'a different family starts from its own example values');
  const { configuration, warnings } = sanitizeConfiguration({ layout: 'quad-x', params: { armLength: -3, propDiameter: 0.3 } }, 'multirotor');
  assert.equal(configuration.params.propDiameter, 0.3);
  assert.equal(configuration.params.armLength, 0.225);
  assert.equal(warnings.length, 1);
});
