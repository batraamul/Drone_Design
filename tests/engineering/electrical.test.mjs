/**
 * Electrical model (Build 3): rails, converter input current, power-budget checks,
 * interface checks and the example set. Values are checked by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComponent, createConnection, validateComponents, sanitizeComponents, canSupply, COMPONENT_TYPES } from '../../js/engineering/components.js';
import { CATALOGUE, catalogueEntry, exampleQuadSet } from '../../js/engineering/catalogue.js';
import { analyseElectrical } from '../../js/engineering/electrical.js';

const close = (a, e, tol = 1e-9) => assert.ok(Math.abs(a - e) <= tol * Math.max(1, Math.abs(e)), `expected ${e}, got ${a}`);
const from = (id, extra) => createComponent({ catalogueEntry: catalogueEntry(id), ...extra });
const link = (kind, a, b) => createConnection({ kind, from: a.id, to: b.id });
const ids = (result) => result.checks.map((c) => c.id);

test('every catalogue entry builds a valid component; all are illustrative', () => {
  for (const entry of CATALOGUE) {
    const item = createComponent({ catalogueEntry: entry });
    assert.equal(item.provenance, 'illustrative', entry.catalogueId);
    assert.deepEqual(validateComponents({ items: [item], connections: [] }), [], entry.catalogueId);
    assert.match(entry.name, /^Example /, 'catalogue names never imitate real products');
  }
  for (const t of COMPONENT_TYPES) assert.deepEqual(validateComponents({ items: [createComponent({ type: t.id })], connections: [] }), [], t.id);
});

test('the example quadcopter set is valid and raises no errors or warnings', () => {
  const set = exampleQuadSet({ createComponent, createConnection });
  assert.deepEqual(validateComponents(set), []);
  const result = analyseElectrical(set);
  assert.deepEqual(result.checks.filter((c) => c.severity !== 'info').map((c) => `${c.id} ${c.title}`), []);
  assert.ok(ids(result).includes('AV-DATA-002'), 'illustrative data is flagged');
  assert.ok(ids(result).includes('AV-PWR-007'), 'missing ESC estimate is flagged');
});

test('battery rail, pass-through flight controller and converter input current (hand calculation)', () => {
  const set = exampleQuadSet({ createComponent, createConnection });
  const [battery, pm, fc] = set.items;
  const result = analyseElectrical(set);
  const rail = (id) => result.rails.find((r) => r.id === id);
  close(rail(battery.id).rail.min, 4 * 3.3);
  close(rail(battery.id).rail.max, 4 * 4.2);
  assert.equal(rail(fc.id).rail.passThrough, true);
  // FC output: receiver 0.12 + GNSS 0.15 + telemetry 0.5 = 0.77 A; FC own 0.3 A → PM load 1.07 A.
  close(rail(fc.id).load, 0.77);
  close(rail(pm.id).load, 1.07);
  // PM input current: I_q + V_out I_load / (η V_in,min) = 0.01 + 5.3 × 1.07 / (0.9 × 13.2)
  const ipm = 0.01 + (5.3 * 1.07) / (0.9 * 13.2);
  close(result.loads.get(pm.id).current, ipm);
  close(result.totals.batteryCurrent, ipm, 1e-9);
  close(result.totals.batteryPower, ipm * 4 * 3.7);
});

test('ESC operating-current estimates enter the battery budget', () => {
  const set = exampleQuadSet({ createComponent, createConnection });
  const escs = set.items.find((i) => i.type === 'esc');
  escs.specs.loadCurrent = 8;
  const result = analyseElectrical(set);
  assert.ok(!ids(result).includes('AV-PWR-007'));
  assert.ok(result.totals.batteryCurrent > 32 && result.totals.batteryCurrent < 33);
});

test('over-voltage, under-voltage, overload and derating are reported', () => {
  const battery = from('ill-bat-6s-10000'); // 16.8–25.2 V
  const fc = from('ill-fc-h7'); // 4.5–5.5 V
  const over = analyseElectrical({ items: [battery, fc], connections: [link('power', battery, fc)] });
  assert.ok(ids(over).includes('AV-PWR-001'));

  const small = from('ill-bat-3s-2200'); // 9.9–12.6 V
  const cam = from('ill-cam-12v'); // 10–14 V
  const under = analyseElectrical({ items: [small, cam], connections: [link('power', small, cam)] });
  assert.ok(ids(under).includes('AV-PWR-002'));

  const reg = from('ill-pm-5v-3a');
  const cc = from('ill-cc-arm'); // 3 A on a 3 A regulator → exactly rated (not an overload), above 80 %
  const tel = from('ill-tel-sub1ghz');
  const derate = analyseElectrical({ items: [small, reg, cc], connections: [link('power', small, reg), link('power', reg, cc)] });
  assert.ok(ids(derate).includes('AV-PWR-004'));
  const overload = analyseElectrical({ items: [small, reg, cc, tel], connections: [link('power', small, reg), link('power', reg, cc), link('power', reg, tel)] });
  assert.ok(ids(overload).includes('AV-PWR-003'));
});

test('unpowered parts, invalid suppliers and power loops are reported', () => {
  const gnss = from('ill-gnss-compass');
  const rx = from('ill-rx-serial');
  assert.ok(ids(analyseElectrical({ items: [gnss], connections: [] })).includes('AV-PWR-005'));
  assert.ok(ids(analyseElectrical({ items: [gnss, rx], connections: [link('power', gnss, rx)] })).includes('AV-PWR-006'));
  const a = from('ill-pm-5v-3a');
  const b = from('ill-bec-5v-8a');
  assert.ok(ids(analyseElectrical({ items: [a, b], connections: [link('power', a, b), link('power', b, a)] })).includes('AV-PWR-000'));
  assert.equal(canSupply(from('ill-fc-h7')), true);
  assert.equal(canSupply(gnss), false);
});

test('interface checks: missing port, too many links, logic levels', () => {
  const fc = from('ill-fc-f4'); // 5 UARTs, 8 PWM, 3.3 V not 5 V tolerant
  const s5 = from('ill-sensor-5v-i2c');
  const logic = analyseElectrical({ items: [fc, s5], connections: [link('i2c', fc, s5)] });
  assert.ok(ids(logic).includes('AV-IF-003'));
  const noPort = analyseElectrical({ items: [fc, s5], connections: [link('uart', fc, s5)] });
  assert.ok(ids(noPort).includes('AV-IF-001'));
  const escs = from('ill-esc-40a', { quantity: 10 });
  const pwm = analyseElectrical({ items: [fc, escs], connections: [link('pwm', fc, escs)] });
  assert.ok(ids(pwm).some((id) => id === 'AV-IF-002'), '10 ESCs on 8 PWM outputs');
  const rx = from('ill-rx-serial');
  assert.ok(ids(analyseElectrical({ items: [rx], connections: [] })).includes('AV-IF-004'));
});

test('sanitising keeps valid data, drops dangling connections and reports repairs', () => {
  const set = exampleQuadSet({ createComponent, createConnection });
  const broken = structuredClone(set);
  broken.items[0].specs.cells = -2;
  broken.items.push({ type: 'warp-core', name: 'x' });
  broken.connections.push({ id: 'con_abcdefgh', kind: 'power', from: 'cmp_missing00', to: set.items[1].id });
  const { components, warnings } = sanitizeComponents(broken);
  assert.equal(components.items.length, set.items.length);
  assert.equal(components.connections.length, set.connections.length);
  assert.equal(components.items[0].specs.cells, 4, 'invalid value reset to the default');
  assert.equal(components.items[0].id, set.items[0].id, 'ids are kept');
  assert.equal(warnings.length, 3);
  assert.deepEqual(validateComponents(components), []);
});
