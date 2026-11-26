/**
 * Aerodynamics (Build 5): lifting line against classical results, skin friction and form
 * factors, drag polar identities, stability trends, validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liftingLine, datcomLiftSlope, cfLaminar, cfTurbulent, ffSurface, ffBody, clMaxAtRe, aerodynamicModel, analyseAerodynamics, defaultAerodynamics, polarAt, powerRequired, validateAerodynamics, sanitizeAerodynamics, AEROFOIL_CATALOGUE } from '../../js/engineering/aerodynamics.js';
import { defaultConfiguration } from '../../js/engineering/configuration.js';
import { computeGeometry } from '../../js/engineering/geometry.js';
import { G0 } from '../../js/engineering/atmosphere.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);

function model(layout = 'conventional', patch = {}, req = { cruiseSpeed: { value: 15 }, operatingAltitude: { value: 0 } }) {
  const configuration = defaultConfiguration(layout);
  Object.assign(configuration.params, patch.params ?? {});
  const geometry = computeGeometry(configuration, {});
  const aero = defaultAerodynamics(configuration);
  Object.assign(aero.settings, patch.settings ?? {});
  return aerodynamicModel({ aerodynamics: aero, configuration, geometry, requirements: req });
}

test('lifting line: rectangular AR 6 matches the classical result (e ≈ 0.95, a ≈ 4.5/rad)', () => {
  const r = liftingLine({ span: 6, rootChord: 1, taperRatio: 1 });
  assert.ok(r.e > 0.94 && r.e < 0.965, `e = ${r.e}`);
  assert.ok(r.cla > 4.45 && r.cla < 4.6, `a = ${r.cla}`);
});

test('lifting line: taper ≈ 0.4 is the most efficient straight taper; slope below elliptic', () => {
  const es = [1, 0.6, 0.4, 0.2].map((lam) => liftingLine({ span: 8, rootChord: 2 / (1 + lam), taperRatio: lam }).e);
  assert.ok(es[2] > es[0] && es[2] > es[3], es.join(', '));
  assert.ok(es.every((e) => e <= 1 + 1e-9));
  const AR = 8;
  const elliptic = (2 * Math.PI) / (1 + 2 / AR);
  assert.ok(liftingLine({ span: 8, rootChord: 1, taperRatio: 1 }).cla < elliptic);
});

test('DATCOM slope: sweep lowers the slope; zero sweep approaches Helmbold', () => {
  close(datcomLiftSlope(6, 0), (2 * Math.PI * 6) / (2 + Math.sqrt(36 + 4)));
  assert.ok(datcomLiftSlope(6, 0.5) < datcomLiftSlope(6, 0));
});

test('skin friction and form factors: Blasius, Prandtl–Schlichting, Raymer', () => {
  close(cfLaminar(1e6), 1.328e-3);
  close(cfTurbulent(1e6), 0.455 / 6 ** 2.58);
  assert.ok(cfTurbulent(3e5) > cfLaminar(3e5));
  close(ffSurface(0.12, 0.3), 1 + (0.6 / 0.3) * 0.12 + 100 * 0.12 ** 4);
  close(ffBody(5), 1 + 60 / 125 + 5 / 400);
});

test('c_l,max Reynolds correction is bounded and monotonic', () => {
  const spec = AEROFOIL_CATALOGUE[0].specs;
  close(clMaxAtRe(spec, spec.reRef), spec.clMax);
  assert.ok(clMaxAtRe(spec, spec.reRef / 4) < spec.clMax);
  assert.ok(clMaxAtRe(spec, 1) >= 0.6 * spec.clMax - 1e-12);
});

test('drag polar identities: (L/D)max at C_L* and V_mp = V_md / 3^¼', () => {
  const m = model();
  const atStar = polarAt(m, m.clMd);
  close(atStar.ld, m.ldMax, 1e-9);
  assert.ok(polarAt(m, m.clMd * 1.2).ld < m.ldMax && polarAt(m, m.clMd * 0.8).ld < m.ldMax);
  const a = analyseAerodynamics({ model: m, mass: 3 });
  close(a.performance.vMp, a.performance.vMd / 3 ** 0.25);
  const W = 3 * G0;
  close(a.performance.vStall, Math.sqrt((2 * W) / (m.reference.density * m.S * m.clMaxWing)));
  const p = powerRequired(m, W, m.reference.density, a.performance.vMp).power;
  assert.ok(p <= powerRequired(m, W, m.reference.density, a.performance.vMp * 1.1).power);
  assert.ok(p <= powerRequired(m, W, m.reference.density, a.performance.vMp * 0.9).power);
});

test('drag build-up: more laminar flow and less allowance lower C_D0; booms add drag', () => {
  const base = model();
  assert.ok(model('conventional', { settings: { laminarFraction: 0.5 } }).cd0 < base.cd0);
  assert.ok(model('conventional', { settings: { miscDrag: 0 } }).cd0 < base.cd0);
  close(model('conventional', { settings: { miscDrag: 0 } }).cd0 * (1 + base.settings.miscDrag), base.cd0, 1e-9);
  assert.ok(model('quadplane').cd0 > base.cd0);
  assert.ok(base.cd0 > 0.01 && base.cd0 < 0.06, `C_D0 = ${base.cd0}`);
  assert.ok(base.cd0At(base.reMac / 10) > base.cd0, 'lower Reynolds number → more friction drag');
});

test('stability: a bigger tail or longer tail arm moves the neutral point aft', () => {
  const base = model();
  const bigTail = model('conventional', { params: { hTailSpan: 0.8 } });
  const longArm = model('conventional', { params: { tailArm: 1.1 } });
  assert.ok(bigTail.stability.xNp > base.stability.xNp);
  assert.ok(longArm.stability.xNp > base.stability.xNp);
  close(base.stability.staticMargin, 0.1, 1e-9); // suggested CG gives 10 %
});

test('stability checks: CG behind the neutral point is an error; tailless + cambered warns', () => {
  const m = model();
  const behind = model('conventional', { settings: { cg: m.stability.xNp + 0.02 } });
  assert.ok(analyseAerodynamics({ model: behind, mass: 3 }).checks.some((c) => c.id === 'AE-SM-001'));
  const fw = defaultConfiguration('flying-wing');
  const geo = computeGeometry(fw, {});
  const aero = defaultAerodynamics(fw);
  aero.aerofoil = { ...aero.aerofoil, specs: { ...AEROFOIL_CATALOGUE[0].specs } };
  const r = analyseAerodynamics({ model: aerodynamicModel({ aerodynamics: aero, configuration: fw, geometry: geo, requirements: {} }), mass: 2 });
  assert.ok(r.checks.some((c) => c.id === 'AE-FW-001'));
});

test('stall check fires when cruise is slower than stall', () => {
  const m = model('conventional', {}, { cruiseSpeed: { value: 6 }, operatingAltitude: { value: 0 } });
  assert.ok(analyseAerodynamics({ model: m, mass: 3 }).checks.some((c) => c.id === 'AE-STALL-001'));
});

test('multirotor has no aerodynamic model; validation and sanitising', () => {
  const quad = defaultConfiguration('quad-x');
  assert.equal(aerodynamicModel({ aerodynamics: defaultAerodynamics(quad), configuration: quad, geometry: computeGeometry(quad, {}) }), null);
  const d = defaultAerodynamics(defaultConfiguration('conventional'));
  assert.deepEqual(validateAerodynamics(d), []);
  assert.ok(validateAerodynamics({ ...d, settings: { ...d.settings, miscDrag: 5 } }).length > 0);
  const s = sanitizeAerodynamics({ aerofoil: { name: 'X', specs: { thickness: 9 } }, settings: { cg: 0.4, laminarFraction: 'a' } });
  assert.equal(s.settings.cg, 0.4);
  assert.equal(s.settings.laminarFraction, d.settings.laminarFraction);
  assert.ok(s.aerofoil.specs.thickness < 0.3);
  assert.deepEqual(validateAerodynamics(s), []);
});
