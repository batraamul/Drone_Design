import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRequirements,
  emptyRequirements,
  validateRequirementValue,
  REQUIREMENT_FIELDS,
} from '../../js/engineering/requirements.js';

function req(values) {
  const r = emptyRequirements();
  for (const [key, value] of Object.entries(values)) r[key] = { ...r[key], value };
  return r;
}
const ids = (result) => result.checks.map((check) => check.id).sort();
const derivedValue = (result, id) => result.derived.find((d) => d.id === id)?.value;

test('empty requirements produce no checks and zero completeness', () => {
  const result = evaluateRequirements(emptyRequirements());
  assert.deepEqual(result.checks, []);
  assert.deepEqual(result.completeness, { set: 0, total: REQUIREMENT_FIELDS.length });
});

test('payload not less than MTOW is an error; payload fraction is derived', () => {
  const ok = evaluateRequirements(req({ maxTakeoffMass: 5, payloadMass: 1 }));
  assert.deepEqual(ids(ok), []);
  assert.equal(derivedValue(ok, 'payloadFraction'), 0.2);
  const bad = evaluateRequirements(req({ maxTakeoffMass: 2, payloadMass: 2 }));
  assert.deepEqual(ids(bad), ['REQ-MASS-001']);
  assert.equal(bad.checks[0].severity, 'error');
});

test('endurance shorter than range / cruise speed is a warning with the equation inputs', () => {
  // 20 km at 15 m/s needs 1333.3 s (22.2 min); 15 min endurance is not enough.
  const result = evaluateRequirements(req({ range: 20000, cruiseSpeed: 15, endurance: 900 }));
  assert.deepEqual(ids(result), ['REQ-PERF-001']);
  const check = result.checks[0];
  assert.equal(check.severity, 'warning');
  assert.ok(Math.abs(check.result.value - 20000 / 15) < 1e-9);
  assert.deepEqual(check.inputs.map((i) => i.key), ['range', 'cruiseSpeed', 'endurance']);
  assert.ok(check.equation.includes('R / V_c'));
  // Exactly enough endurance passes.
  assert.deepEqual(ids(evaluateRequirements(req({ range: 15000, cruiseSpeed: 15, endurance: 1000 }))), []);
});

test('wind at or above cruise speed is flagged', () => {
  const result = evaluateRequirements(req({ cruiseSpeed: 12, maxWindSpeed: 12 }));
  assert.deepEqual(ids(result), ['REQ-WIND-001']);
  assert.equal(result.checks[0].result.value, 0);
});

test('out-and-back wind factor and the still-air-only endurance warning', () => {
  // V_w/V_c = 0.5 → k = 1 / (1 − 0.25) = 4/3
  const values = { range: 9000, cruiseSpeed: 10, maxWindSpeed: 5, endurance: 1000 };
  const result = evaluateRequirements(req(values));
  assert.ok(Math.abs(derivedValue(result, 'windTimeFactor') - 4 / 3) < 1e-12);
  // Still air needs 900 s (ok with 1000 s), in wind 1200 s (not ok).
  assert.deepEqual(ids(result), ['REQ-WIND-002']);
  const enough = evaluateRequirements(req({ ...values, endurance: 1200 }));
  assert.deepEqual(ids(enough), []);
});

test('operating altitude adds ISA air properties and an info check above ~2 km', () => {
  const low = evaluateRequirements(req({ operatingAltitude: 200 }));
  assert.ok(Math.abs(derivedValue(low, 'airDensity') - 1.2016) < 1e-3);
  assert.deepEqual(ids(low), []);
  const high = evaluateRequirements(req({ operatingAltitude: 4500 }));
  assert.deepEqual(ids(high), ['REQ-ATM-001']);
  assert.equal(high.checks[0].severity, 'info');
  assert.ok(derivedValue(high, 'densityRatio') < 0.8);
});

test('invalid stored values are ignored rather than used', () => {
  const result = evaluateRequirements(req({ maxTakeoffMass: -1, payloadMass: 1 }));
  assert.deepEqual(result.checks, []);
  assert.equal(result.completeness.set, 1);
});

test('value validation rules', () => {
  assert.equal(validateRequirementValue('maxTakeoffMass', null), null);
  assert.match(validateRequirementValue('maxTakeoffMass', 0), /greater than zero/);
  assert.match(validateRequirementValue('payloadMass', -0.1), /negative/);
  assert.equal(validateRequirementValue('payloadMass', 0), null);
  assert.equal(validateRequirementValue('operatingAltitude', -100), null);
  assert.match(validateRequirementValue('operatingAltitude', -9000), /at least/);
  assert.match(validateRequirementValue('endurance', Number.NaN), /finite/);
  assert.match(validateRequirementValue('nope', 1), /Unknown/);
});
