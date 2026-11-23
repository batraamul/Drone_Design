/**
 * Balloon glide-sonde mission: balloon physics, release/pull-out/glide simulation,
 * hybrid stage, Tawhiri helpers. Hand-checked relations.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balloonAscent, simulateGlide, gliderPolar, glideSinkRate, analyseSounding, defaultSounding, tawhiriQuery, parseTawhiri, trackToKml, validateSounding, sanitizeSounding, GASES } from '../../js/engineering/sounding.js';
import { isa, G0 } from '../../js/engineering/atmosphere.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);
const P = defaultSounding().params;

test('balloon: lift budget, launch volume and ascent rate (hand calculation)', () => {
  const a = balloonAscent({ ...P, launchElevation: 0 }, 1.5, 'helium');
  close(a.grossLift, 2.0 + 0.25 + 1.5 + 1.2);
  close(a.neckLift, 0.25 + 1.5 + 1.2);
  const moles = a.grossLift / (0.0289644 - GASES.helium.molarMass);
  const sl = isa(0);
  close(a.launchVolume, (moles * 8.31432 * sl.temperature) / sl.pressure, 1e-9);
  const r = Math.cbrt((6 * a.launchVolume) / Math.PI) / 2;
  close(a.launchRate, Math.sqrt((2 * 1.2 * G0) / (sl.density * 0.3 * Math.PI * r * r)), 1e-9);
  // Volume at burst equals the burst-diameter sphere.
  const top = isa(a.burstAltitude);
  close((moles * 8.31432 * top.temperature) / top.pressure, (Math.PI * 10.5 ** 3) / 6, 1e-6);
  assert.ok(a.timeToRelease > 3600 && a.timeToRelease < 2.5 * 3600, `${a.timeToRelease / 60} min`);
});

test('balloon: more free lift rises faster but bursts lower; hydrogen needs less gas', () => {
  const slow = balloonAscent({ ...P, freeLift: 0.8 }, 1.5);
  const fast = balloonAscent({ ...P, freeLift: 2.0 }, 1.5);
  assert.ok(fast.launchRate > slow.launchRate);
  assert.ok(fast.burstAltitude < slow.burstAltitude);
  const he = balloonAscent(P, 1.5, 'helium');
  const h2 = balloonAscent(P, 1.5, 'hydrogen');
  assert.ok(h2.launchVolume < he.launchVolume && h2.gasMass < he.gasMass);
});

test('a small balloon bursts before 33 km and the mission stops at the ascent', () => {
  const s = defaultSounding();
  s.params = { ...s.params, balloonMass: 0.6, burstDiameter: 6.0 };
  const r = analyseSounding({ sounding: s });
  assert.equal(r.ascent.reachesRelease, false);
  assert.ok(r.checks.some((c) => c.id === 'SD-ASC-001' && c.severity === 'error'));
  assert.equal(r.glide, null);
});

test('glide polar and steady glide (hand calculation)', () => {
  const a = { wingArea: 0.48, wingSpan: 2, cd0: 0.035, oswald: 0.8 };
  const p = gliderPolar(a);
  close(p.AR, 4 / 0.48);
  close(p.k, 1 / (Math.PI * 0.8 * (4 / 0.48)));
  close(p.ldMax, 1 / (2 * Math.sqrt(0.035 * p.k)));
  const g = glideSinkRate({ ...a, mass: 1.5 }, p.clStar, 10000);
  close(g.V, Math.sqrt((2 * 1.5 * G0) / (isa(10000).density * 0.48 * p.clStar)));
  close(g.sink, g.V / p.ldMax, 1e-9);
});

test('release at 33 km: stall drop, pull-out within limits, then steady glide', () => {
  const aircraft = { mass: 1.5, wingArea: 0.48, wingSpan: 2, chord: 0.245, cd0: 0.035, oswald: 0.8, clMax: 1.1, maxLoadFactor: 3 };
  const g = simulateGlide(aircraft, 33216, 2216);
  assert.ok(g.completedPullOut);
  const loss = 33216 - g.stats.pullOut.h;
  assert.ok(loss > 200 && loss < 3000, `altitude lost ${loss}`);
  assert.ok(g.stats.maxN <= 3 + 1e-6, 'load factor limit respected');
  assert.ok(g.stats.maxMach > 0.2 && g.stats.maxMach < 0.6);
  // Energy check: glide distance ≈ (L/D) × height lost, within the variation of L/D during the glide.
  const ld = gliderPolar(aircraft).ldMax;
  const ratio = (g.range - g.stats.pullOut.x) / ((g.stats.pullOut.h - g.end.h) * ld);
  assert.ok(ratio > 0.9 && ratio < 1.02, `range ratio ${ratio}`);
  assert.ok(Math.abs(g.end.h - 2216) < 50);
});

test('full mission: four stages, hybrid energy budget, low-Re warning', () => {
  const r = analyseSounding({ sounding: defaultSounding(), designMass: 1.5, designWing: { area: 0.48, span: 2, mac: 0.245 }, battery: { energy: 60 * 3600, avionicsPower: 3 } });
  assert.deepEqual(r.stages.map((s) => s.id), ['ascent', 'stall', 'glide', 'powered']);
  const before = r.ascent.timeToRelease + r.glide.time;
  close(r.powered.avionicsEnergy, 3 * before, 1e-9);
  close(r.powered.time, (60 * 3600 - 3 * before) / r.powered.power, 1e-9);
  assert.ok(r.checks.some((c) => c.id === 'SD-GL-002'));
  const starved = analyseSounding({ sounding: defaultSounding(), designMass: 1.5, designWing: { area: 0.48, span: 2, mac: 0.245 }, battery: { energy: 10 * 3600, avionicsPower: 3 } });
  assert.ok(starved.checks.some((c) => c.id === 'SD-PW-001'));
});

test('Tawhiri helpers: query, parsing, KML', () => {
  const url = new URL(tawhiriQuery({ latitude: 28.58, longitude: 77.21, elevation: 216, datetime: '2026-12-01T06:00:00Z', ascentRate: 5.123, releaseAltitudeAMSL: 33216 }));
  assert.equal(url.origin + url.pathname, 'https://api.v2.sondehub.org/tawhiri');
  assert.equal(url.searchParams.get('profile'), 'standard_profile');
  assert.equal(url.searchParams.get('burst_altitude'), '33216');
  assert.equal(url.searchParams.get('ascent_rate'), '5.12');
  assert.equal(new URL(tawhiriQuery({ latitude: 0, longitude: -75, elevation: 0, datetime: 'x', ascentRate: 5, releaseAltitudeAMSL: 30000 })).searchParams.get('launch_longitude'), '285.00000');
  const track = parseTawhiri({ prediction: [{ stage: 'ascent', trajectory: [{ latitude: 28.58, longitude: 77.21, altitude: 216, datetime: 'a' }, { latitude: 28.7, longitude: 278.5, altitude: 33216, datetime: 'b' }] }, { stage: 'descent', trajectory: [] }] });
  assert.equal(track[1].lon, 278.5 - 360);
  assert.throws(() => parseTawhiri({ error: { description: 'bad' } }), /bad/);
  const kml = trackToKml(track, 'A & B');
  assert.match(kml, /<kml/);
  assert.match(kml, /A &amp; B/);
});

test('validation and repair', () => {
  const s = { ...defaultSounding(), enabled: false };
  assert.deepEqual(validateSounding(s), []);
  const { sounding, warnings } = sanitizeSounding({ ...s, params: { ...s.params, releaseAltitude: -5 } });
  assert.equal(sounding.params.releaseAltitude, 33000);
  assert.equal(warnings.length, 1);
});
