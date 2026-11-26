/**
 * Formula Library (Build 5): the safe expression engine, the built-in formula registry
 * (every entry parses, has consistent units and points at real code, tests and docs),
 * and user-defined formulas (dependencies, cycles, units, limits, validation).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseExpression, evaluate, dimsToString, unitDims, FormulaError, variablesOf } from '../../js/engineering/expression.js';
import { BUILTIN_FORMULAS, FORMULA_AREAS } from '../../js/engineering/formulas.js';
import { createFormula, evaluateFormulas, validateFormulas, sanitizeFormulas, formulaVariables } from '../../js/engineering/custom-formulas.js';
import { createProject } from '../../js/project-schema.js';

const run = (text, vars = {}) => evaluate(parseExpression(text), vars);
const m = (value) => ({ value, dims: unitDims('m') });
const kg = (value) => ({ value, dims: unitDims('kg') });

test('expression engine: precedence, unary minus, powers, functions, constants', () => {
  assert.equal(run('1 + 2 * 3').value, 7);
  assert.equal(run('(1 + 2) * 3').value, 9);
  assert.equal(run('-2^2').value, -4);
  assert.equal(run('2^3^2').value, 512);
  assert.equal(run('max(1, 5, 3) - min(4, 2)').value, 3);
  assert.ok(Math.abs(run('sqrt(2)^2').value - 2) < 1e-12);
  assert.ok(Math.abs(run('sin(pi/2)').value - 1) < 1e-12);
  assert.equal(run('g0').value, 9.80665);
  assert.equal(run('2 × 3 − 1').value, 5);
});

test('expression engine: units are tracked and checked', () => {
  assert.equal(dimsToString(run('a * b', { a: m(2), b: m(3) }).dims), 'm^2');
  assert.equal(dimsToString(run('sqrt(a)', { a: { value: 4, dims: unitDims('m²') } }).dims), 'm');
  assert.equal(dimsToString(run('1.225[kg/m³] * (10[m/s])^2 / 2').dims), dimsToString(unitDims('Pa')));
  assert.throws(() => run('a + b', { a: m(1), b: kg(1) }), FormulaError);
  assert.throws(() => run('sin(a)', { a: m(1) }), /dimensionless/);
  assert.throws(() => run('a ^ b', { a: m(1), b: { value: 2, dims: unitDims('1') } }), /fixed number/);
});

test('expression engine: errors are readable and nothing executes', () => {
  assert.throws(() => parseExpression(''), /Enter an expression/);
  assert.throws(() => parseExpression('1 +'), FormulaError);
  assert.throws(() => parseExpression('alert(1)'), /Unknown function/);
  assert.throws(() => parseExpression('a; b'), /Unexpected character/);
  assert.throws(() => parseExpression('x.constructor'), FormulaError);
  assert.throws(() => parseExpression('a["b"]'), FormulaError);
  assert.throws(() => parseExpression('2[furlong]'), /Unknown unit/);
  assert.throws(() => run('1/0'), /finite/);
  assert.throws(() => run('x'), /Unknown variable/);
  assert.deepEqual([...variablesOf(parseExpression('a*b + pi + sqrt(c)'))].sort(), ['a', 'b', 'c']);
});

test('built-in registry: every formula parses, has matching units, and points at real code, tests and docs', () => {
  const ids = new Set();
  const areas = new Set(FORMULA_AREAS.map((a) => a.id));
  for (const f of BUILTIN_FORMULAS) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    assert.ok(areas.has(f.area), `${f.id}: unknown area`);
    const vars = Object.fromEntries(f.inputs.map((i) => {
      const dims = unitDims(i.unit);
      assert.ok(dims, `${f.id}: unknown unit ${i.unit}`);
      return [i.name, { value: i.value, dims }];
    }));
    const r = run(f.calc, vars);
    assert.ok(Number.isFinite(r.value), `${f.id}: not finite`);
    assert.equal(dimsToString(r.dims), dimsToString(unitDims(f.result.unit)), `${f.id}: unit mismatch`);
    const used = variablesOf(parseExpression(f.calc));
    assert.deepEqual([...used].sort(), f.inputs.map((i) => i.name).sort(), `${f.id}: inputs and calc variables differ`);
    assert.ok(existsSync(f.model), `${f.id}: missing ${f.model}`);
    assert.match(readFileSync(f.model, 'utf8'), new RegExp(`(function|const)\\s+${f.fn}\\b`), `${f.id}: ${f.fn} not found in ${f.model}`);
    assert.ok(existsSync(f.test), `${f.id}: missing ${f.test}`);
    const [docFile, section] = f.doc.split(' ');
    assert.match(readFileSync(`docs/${docFile}`, 'utf8'), new RegExp(`^## ${section.replace('§', '')}\\. `, 'm'), `${f.id}: ${f.doc} not found`);
  }
});

test('built-in registry: calculators reproduce the model code', async () => {
  const { rotorOperatingPoint, batteryCurrent } = await import('../../js/engineering/propulsion.js');
  const { sparCheck, MATERIALS } = await import('../../js/engineering/structures.js');
  const thrust = BUILTIN_FORMULAS.find((f) => f.id === 'prop-thrust');
  const v = Object.fromEntries(thrust.inputs.map((i) => [i.name, { value: i.value, dims: unitDims(i.unit) }]));
  const T = run(thrust.calc, v).value;
  const op = rotorOperatingPoint({ thrust: T, rho: v.rho.value, diameter: v.D.value, ct: v.CT.value, cp: 0.045, kv: 920, resistance: 0.1, noLoadCurrent: 0.5 });
  assert.ok(Math.abs(op.n - v.n.value) < 1e-9);
  const bc = BUILTIN_FORMULAS.find((f) => f.id === 'battery-current');
  const b = Object.fromEntries(bc.inputs.map((i) => [i.name, { value: i.value, dims: unitDims(i.unit) }]));
  assert.ok(Math.abs(run(bc.calc, b).value - batteryCurrent(b.P.value, b.Voc.value, b.R.value)) < 1e-9);
  const sm = BUILTIN_FORMULAS.find((f) => f.id === 'spar-moment');
  const s = Object.fromEntries(sm.inputs.map((i) => [i.name, { value: i.value, dims: unitDims(i.unit) }]));
  assert.ok(Math.abs(run(sm.calc, s).value - sparCheck({ mass: s.m.value, span: s.b.value, loadFactor: s.n.value, safetyFactor: 1, material: MATERIALS[0], outer: 0.01, wall: 0.001 }).moment) < 1e-9);
});

const doc = createProject({ name: 'F', requirements: { maxTakeoffMass: { value: 3 }, cruiseSpeed: { value: 18 } } });
const review = { derived: [{ id: 'geo-fw-area', label: 'Wing area', value: 0.5, unit: 'm²' }, { id: 'bad', label: 'Odd unit', value: 1, unit: 'furlongs' }] };

test('your formulas: variables include targets, layout parameters and results', () => {
  const vars = formulaVariables({ doc, review });
  assert.equal(vars.get('maxTakeoffMass').value, 3);
  assert.equal(vars.get('geo_fw_area').value, 0.5);
  assert.ok(vars.has('armLength'));
  assert.ok(!vars.has('bad'), 'unknown units are not offered');
});

test('your formulas: dependencies, units, limits, cycles', () => {
  const items = [
    createFormula({ name: 'Wing loading', symbol: 'WS', expression: 'maxTakeoffMass * g0 / geo_fw_area', unit: 'Pa', check: { op: '<=', limit: 50, severity: 'warning' } }),
    createFormula({ name: 'Dynamic pressure', symbol: 'q', expression: '0.5 * 1.225[kg/m³] * cruiseSpeed^2', unit: 'Pa' }),
    createFormula({ name: 'Cruise CL', symbol: 'CLc', expression: 'WS / q', unit: '1', check: { op: '<=', limit: 1, severity: 'error' } }),
    createFormula({ name: 'Wrong unit', symbol: 'wu', expression: 'maxTakeoffMass', unit: 'm' }),
    createFormula({ name: 'A', symbol: 'ca', expression: 'cb + 1', unit: '1' }),
    createFormula({ name: 'B', symbol: 'cb', expression: 'ca + 1', unit: '1' }),
  ];
  assert.deepEqual(validateFormulas({ items }), []);
  const r = evaluateFormulas({ items }, { doc, review });
  const by = Object.fromEntries(r.results.map((x) => [x.symbol, x]));
  assert.ok(Math.abs(by.WS.value - (3 * 9.80665) / 0.5) < 1e-9);
  assert.ok(Math.abs(by.q.value - 0.5 * 1.225 * 324) < 1e-9);
  assert.ok(Math.abs(by.CLc.value - by.WS.value / by.q.value) < 1e-12);
  assert.match(by.wu.error, /result unit is m/);
  assert.match(by.ca.error + by.cb.error, /Circular/);
  assert.ok(r.checks.some((c) => c.id === 'CF-WS' && c.severity === 'warning'), 'limit broken → warning');
  assert.ok(!r.checks.some((c) => c.id === 'CF-CLc'), 'limit met → no check');
  assert.ok(r.derived.some((d) => d.id === 'cf-WS' && d.unit === 'Pa'));
});

test('your formulas: validation and sanitising', () => {
  const a = createFormula({ name: 'A', symbol: 'x1', expression: '1', unit: '1' });
  assert.ok(validateFormulas({ items: [a, { ...a, id: 'fml_other1' }] }).some((e) => e.includes('already uses')));
  assert.ok(validateFormulas({ items: [{ ...a, symbol: 'sqrt' }] }).some((e) => e.includes('built-in')));
  assert.ok(validateFormulas({ items: [{ ...a, expression: '1 +' }] }).length);
  assert.ok(validateFormulas({ items: [{ ...a, unit: 'furlong' }] }).length);
  const s = sanitizeFormulas({ items: [a, { ...a, symbol: '9bad' }, 'junk', { ...a, id: 'evil', symbol: 'y' }] });
  assert.equal(s.formulas.items.length, 2);
  assert.ok(s.warnings.length >= 1);
  assert.deepEqual(validateFormulas(s.formulas), []);
});
