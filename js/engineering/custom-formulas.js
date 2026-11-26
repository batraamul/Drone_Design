/**
 * Your own formulas (stored in the project: modules.formulas).
 *
 * A custom formula has a symbol (a variable name), an expression, the SI unit of its result
 * and an optional pass/fail limit. Expressions can use:
 *   - the mission targets (maxTakeoffMass, cruiseSpeed, …),
 *   - the layout parameters (span, rootChord, armLength, …),
 *   - every derived result in the design review, by its id with "-" written as "_"
 *     (ae_cd0, pr_mass, st_spar_stress, …),
 *   - other custom formulas by their symbol (evaluated in dependency order; cycles are errors),
 *   - the constants pi and g0 and the functions listed in expression.js.
 * Units are checked: the expression's dimensions must match the declared result unit.
 */
import { CONFIG_PARAMS } from './configuration.js';
import { REQUIREMENT_FIELDS } from './requirements.js';
import { FormulaError, IDENTIFIER, RESERVED, RESULT_UNITS, dimsToString, evaluate, parseExpression, unitDims, unitsForDims, variablesOf } from './expression.js';

export const FORMULA_LIMIT = 100;
export const CHECK_OPERATORS = Object.freeze(['<=', '>=']);
export const CHECK_SEVERITIES = Object.freeze(['warning', 'error', 'info']);

export const emptyFormulas = () => ({ items: [] });

let counter = 0;
export function formulaId() {
  counter += 1;
  return `fml_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Build a new formula record (not yet validated). */
export function createFormula({ name = 'New formula', symbol = 'f1', expression = '', unit = '1', description = '', check = null } = {}) {
  return { id: formulaId(), name, symbol, expression, unit, description, check };
}

/** Variables available to custom formulas, from the current project and its review. */
export function formulaVariables({ doc, review }) {
  const vars = new Map();
  const add = (name, entry) => {
    if (!IDENTIFIER.test(name) || RESERVED.has(name) || vars.has(name)) return;
    const dims = unitDims(entry.unit);
    if (!dims) return;
    vars.set(name, { name, ...entry, dims });
  };
  for (const f of REQUIREMENT_FIELDS) {
    const value = doc?.requirements?.[f.key]?.value;
    add(f.key, { label: f.label, value: typeof value === 'number' ? value : null, unit: f.unit, group: 'Mission targets' });
  }
  const params = doc?.modules?.configuration?.params ?? {};
  for (const [key, value] of Object.entries(params)) {
    const p = CONFIG_PARAMS.find((c) => c.key === key);
    if (p && typeof value === 'number') add(key, { label: p.label, value, unit: p.unit, group: 'Layout parameters' });
  }
  for (const d of review?.derived ?? []) {
    if (typeof d.value !== 'number' || !Number.isFinite(d.value) || !d.id) continue;
    if (d.id.startsWith('cf-')) continue;
    add(d.id.replace(/-/g, '_'), { label: d.label, value: d.value, unit: d.unit, group: 'Design results' });
  }
  return vars;
}

/** Validate the stored shape of one formula (not its evaluation). */
export function validateFormula(f, others = []) {
  const errors = [];
  if (!f || typeof f !== 'object') return ['Invalid formula'];
  if (typeof f.id !== 'string' || !/^fml_[A-Za-z0-9]{4,64}$/.test(f.id)) errors.push('Invalid id');
  if (typeof f.name !== 'string' || !f.name.trim() || f.name.length > 120) errors.push('Name is required (120 characters at most)');
  if (typeof f.symbol !== 'string' || !IDENTIFIER.test(f.symbol)) errors.push('Symbol must start with a letter or _ and use only letters, digits and _');
  else if (RESERVED.has(f.symbol)) errors.push(`"${f.symbol}" is a built-in function or constant name`);
  else if (others.some((o) => o.id !== f.id && o.symbol === f.symbol)) errors.push(`Another formula already uses the symbol "${f.symbol}"`);
  if (typeof f.expression !== 'string' || f.expression.length > 500) errors.push('Expression must be text (500 characters at most)');
  else {
    try {
      parseExpression(f.expression);
    } catch (e) {
      errors.push(e instanceof FormulaError ? e.message : 'Invalid expression');
    }
  }
  if (!RESULT_UNITS.includes(f.unit)) errors.push('Unknown result unit');
  if (typeof f.description !== 'string' || f.description.length > 1000) errors.push('Description must be text (1000 characters at most)');
  if (f.check !== null && f.check !== undefined) {
    const c = f.check;
    if (!c || !CHECK_OPERATORS.includes(c.op) || typeof c.limit !== 'number' || !Number.isFinite(c.limit) || !CHECK_SEVERITIES.includes(c.severity)) errors.push('Invalid limit check');
  }
  return errors;
}

export function validateFormulas(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return ['modules.formulas must be { items: [] }'];
  if (data.items.length > FORMULA_LIMIT) errors.push(`At most ${FORMULA_LIMIT} formulas`);
  data.items.forEach((f, i) => {
    for (const m of validateFormula(f, data.items)) errors.push(`modules.formulas.items.${i}: ${m}`);
  });
  return errors;
}

export function sanitizeFormulas(input) {
  const warnings = [];
  if (!input || typeof input !== 'object' || !Array.isArray(input.items)) return { formulas: emptyFormulas(), warnings };
  const items = [];
  for (const raw of input.items.slice(0, FORMULA_LIMIT)) {
    if (!raw || typeof raw !== 'object') continue;
    const f = {
      id: typeof raw.id === 'string' && /^fml_[A-Za-z0-9]{4,64}$/.test(raw.id) && !items.some((i) => i.id === raw.id) ? raw.id : formulaId(),
      name: String(raw.name ?? 'Formula').slice(0, 120) || 'Formula',
      symbol: String(raw.symbol ?? ''),
      expression: String(raw.expression ?? '').slice(0, 500),
      unit: RESULT_UNITS.includes(raw.unit) ? raw.unit : '1',
      description: String(raw.description ?? '').slice(0, 1000),
      check: raw.check && CHECK_OPERATORS.includes(raw.check.op) && Number.isFinite(raw.check.limit) && CHECK_SEVERITIES.includes(raw.check.severity) ? { op: raw.check.op, limit: raw.check.limit, severity: raw.check.severity } : null,
    };
    const errs = validateFormula(f, items);
    if (errs.length) {
      warnings.push(`Formula "${f.name}" was dropped: ${errs[0]}.`);
      continue;
    }
    items.push(f);
  }
  return { formulas: { items }, warnings };
}

/**
 * Evaluate all custom formulas against the design.
 * @returns {{ results: Array<{id, symbol, value, unit, dims, error, uses}>, checks, derived }}
 */
export function evaluateFormulas(formulas, { doc, review }) {
  const items = formulas?.items ?? [];
  const base = formulaVariables({ doc, review });
  const results = new Map();
  const bySymbol = new Map(items.map((f) => [f.symbol, f]));
  const trees = new Map();
  for (const f of items) {
    try {
      trees.set(f.id, parseExpression(f.expression));
    } catch (e) {
      results.set(f.id, { id: f.id, symbol: f.symbol, value: null, unit: f.unit, error: e.message, uses: [] });
    }
  }
  const visiting = new Set();
  const solve = (f) => {
    if (results.has(f.id)) return results.get(f.id);
    if (visiting.has(f.id)) throw new FormulaError(`Circular reference through "${f.symbol}"`);
    visiting.add(f.id);
    const tree = trees.get(f.id);
    const uses = [...variablesOf(tree)];
    const vars = {};
    let result;
    try {
      for (const name of uses) {
        if (bySymbol.has(name) && !base.has(name)) {
          const dep = solve(bySymbol.get(name));
          if (dep.error) throw new FormulaError(`"${name}" has an error: ${dep.error}`);
          vars[name] = { value: dep.value, dims: unitDims(dep.unit) };
        } else if (base.has(name)) {
          const b = base.get(name);
          if (b.value === null) throw new FormulaError(`"${name}" (${b.label}) has no value yet`);
          vars[name] = b;
        } else {
          throw new FormulaError(`Unknown variable "${name}"`);
        }
      }
      const out = evaluate(tree, vars);
      const want = unitDims(f.unit);
      if (dimsToString(out.dims) !== dimsToString(want)) {
        const fits = unitsForDims(out.dims);
        throw new FormulaError(`The expression gives ${dimsToString(out.dims)}${fits.length ? ` (${fits.join(', ')})` : ''} but the result unit is ${f.unit}`);
      }
      result = { id: f.id, symbol: f.symbol, value: out.value, unit: f.unit, error: null, uses };
    } catch (e) {
      result = { id: f.id, symbol: f.symbol, value: null, unit: f.unit, error: e instanceof FormulaError ? e.message : 'Evaluation failed', uses };
    }
    visiting.delete(f.id);
    results.set(f.id, result);
    return result;
  };
  for (const f of items) {
    if (results.has(f.id)) continue;
    try {
      solve(f);
    } catch (e) {
      results.set(f.id, { id: f.id, symbol: f.symbol, value: null, unit: f.unit, error: e.message, uses: [] });
    }
  }
  const checks = [];
  const derived = [];
  for (const f of items) {
    const r = results.get(f.id);
    if (r.error) {
      checks.push({ id: `CF-${f.symbol}`, severity: 'warning', title: `Your formula "${f.name}" cannot be evaluated`, message: r.error, equation: `${f.symbol} = ${f.expression}`, inputs: [], assumptions: [], provenance: 'user-input' });
      continue;
    }
    derived.push({ id: `cf-${f.symbol}`, label: f.name, symbol: f.symbol, value: r.value, unit: f.unit, equation: `${f.symbol} = ${f.expression}`, inputs: r.uses.map((u) => ({ symbol: u, label: base.get(u)?.label ?? 'Your formula', value: base.get(u)?.value ?? results.get(bySymbol.get(u)?.id)?.value, unit: base.get(u)?.unit ?? bySymbol.get(u)?.unit })), provenance: 'user-input', note: f.description || 'Your own formula (Formula Library).' });
    if (f.check) {
      const pass = f.check.op === '<=' ? r.value <= f.check.limit : r.value >= f.check.limit;
      if (!pass) checks.push({ id: `CF-${f.symbol}`, severity: f.check.severity, title: `${f.name} is outside your limit`, message: `${f.symbol} = ${r.value.toPrecision(4)} ${f.unit}; your limit is ${f.check.op === '<=' ? '≤' : '≥'} ${f.check.limit} ${f.unit}.`, equation: `${f.symbol} ${f.check.op === '<=' ? '≤' : '≥'} ${f.check.limit}`, inputs: [], assumptions: [], provenance: 'user-input' });
    }
  }
  return { results: items.map((f) => results.get(f.id)), checks, derived };
}
