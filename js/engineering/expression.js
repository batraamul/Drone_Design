/**
 * Safe formula engine for user-defined formulas (Formula Library).
 *
 * Expressions are parsed by this module — never passed to eval/Function — and support:
 *   numbers (1.5, 2e-3), numbers with a unit (1.225[kg/m³], 9.81[m/s²]), variables (letters, digits, _), + − × ÷ (* /), powers (^),
 *   parentheses, unary minus, constants pi and g0, and the functions
 *   sqrt abs exp ln log10 sin cos tan asin acos atan atan2 min max.
 * Every SI unit used in AEROLAB X maps to a dimension vector [m, kg, s, A, K], so an
 * expression's result unit can be checked: you cannot add metres to kilograms, and
 * sin()/exp() need dimensionless arguments.
 */

export class FormulaError extends Error {}

const DIM_NAMES = ['m', 'kg', 's', 'A', 'K'];
const D = (m = 0, kg = 0, s = 0, A = 0, K = 0) => [m, kg, s, A, K];
const NONE = D();

/** SI units used in the application and their dimensions. */
export const UNIT_DIMENSIONS = Object.freeze({
  1: NONE,
  rad: NONE,
  m: D(1),
  'm²': D(2),
  'm³': D(3),
  kg: D(0, 1),
  s: D(0, 0, 1),
  'm/s': D(1, 0, -1),
  'm/s²': D(1, 0, -2),
  'rad/s': D(0, 0, -1),
  Hz: D(0, 0, -1),
  N: D(1, 1, -2),
  'N·m': D(2, 1, -2),
  J: D(2, 1, -2),
  W: D(2, 1, -3),
  Pa: D(-1, 1, -2),
  'kg/m³': D(-3, 1),
  A: D(0, 0, 0, 1),
  C: D(0, 0, 1, 1),
  V: D(2, 1, -3, -1),
  'Ω': D(2, 1, -3, -2),
  K: D(0, 0, 0, 0, 1),
  'ΔK': D(0, 0, 0, 0, 1),
  'rpm/V': D(-2, -1, 2, 1),
  'Pa·s': D(-1, 1, -1),
  'N·m/A': D(2, 1, -2, -1),
  'K/m': D(-1, 0, 0, 0, 1),
  'J/(kg·K)': D(2, 0, -2, 0, -1),
  'N/m': D(0, 1, -2),
  'm⁴': D(4),
  'W/kg': D(2, 0, -3),
  'N/W': D(-1, 0, 1),
});
export const RESULT_UNITS = Object.keys(UNIT_DIMENSIONS);

export const CONSTANTS = Object.freeze({ pi: { value: Math.PI, dims: NONE }, g0: { value: 9.80665, dims: D(1, 0, -2) } });

const FUNCTIONS = {
  sqrt: { n: 1, f: Math.sqrt, dims: (d) => d[0].map((x) => x / 2) },
  abs: { n: 1, f: Math.abs, dims: (d) => d[0] },
  exp: { n: 1, f: Math.exp, dimensionless: true },
  ln: { n: 1, f: Math.log, dimensionless: true },
  log10: { n: 1, f: Math.log10, dimensionless: true },
  sin: { n: 1, f: Math.sin, dimensionless: true },
  cos: { n: 1, f: Math.cos, dimensionless: true },
  tan: { n: 1, f: Math.tan, dimensionless: true },
  asin: { n: 1, f: Math.asin, dimensionless: true },
  acos: { n: 1, f: Math.acos, dimensionless: true },
  atan: { n: 1, f: Math.atan, dimensionless: true },
  atan2: { n: 2, f: Math.atan2, same: true, out: () => NONE },
  min: { n: -1, f: Math.min, same: true },
  max: { n: -1, f: Math.max, same: true },
};
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

// ---- Tokenizer and parser ----------------------------------------------------------------

function tokenize(text) {
  const tokens = [];
  const src = String(text ?? '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Bad number at position ${i + 1}`);
      const token = { type: 'num', value: Number(m[0]), pos: i };
      i += m[0].length;
      const u = /^\s*\[([^\]]{1,20})\]/.exec(src.slice(i));
      if (u) {
        const dims = UNIT_DIMENSIONS[u[1].trim()];
        if (!dims) throw new FormulaError(`Unknown unit "[${u[1]}]" — use one of: ${RESULT_UNITS.filter((x) => x !== '1').join(', ')}`);
        token.dims = dims;
        i += u[0].length;
      }
      tokens.push(token);
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ type: 'id', value: m[0], pos: i });
      i += m[0].length;
    } else if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i += 1;
    } else {
      throw new FormulaError(`Unexpected character "${ch}" at position ${i + 1}`);
    }
  }
  return tokens;
}

/** Parse an expression into a syntax tree. Throws FormulaError with a readable message. */
export function parseExpression(text) {
  if (String(text ?? '').length > 500) throw new FormulaError('Expression is too long (500 characters at most)');
  const tokens = tokenize(text);
  if (!tokens.length) throw new FormulaError('Enter an expression');
  let k = 0;
  const peek = () => tokens[k];
  const take = (value) => {
    const t = tokens[k];
    if (!t || (value && t.value !== value)) throw new FormulaError(t ? `Expected "${value}" at position ${t.pos + 1}` : `Expected "${value}" at the end`);
    k += 1;
    return t;
  };
  let depth = 0;
  const expr = () => {
    depth += 1;
    if (depth > 60) throw new FormulaError('Expression is nested too deeply');
    let node = term();
    while (peek() && (peek().value === '+' || peek().value === '-')) {
      const op = take().value;
      node = { type: 'bin', op, left: node, right: term() };
    }
    depth -= 1;
    return node;
  };
  const term = () => {
    let node = unary();
    while (peek() && (peek().value === '*' || peek().value === '/')) {
      const op = take().value;
      node = { type: 'bin', op, left: node, right: unary() };
    }
    return node;
  };
  const unary = () => {
    if (peek()?.value === '-') {
      take();
      return { type: 'neg', arg: unary() };
    }
    if (peek()?.value === '+') {
      take();
      return unary();
    }
    return power();
  };
  const power = () => {
    const base = primary();
    if (peek()?.value === '^') {
      take();
      return { type: 'bin', op: '^', left: base, right: unary() };
    }
    return base;
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new FormulaError('Expression ends too early');
    if (t.type === 'num') {
      take();
      return { type: 'num', value: t.value, dims: t.dims };
    }
    if (t.type === 'id') {
      take();
      if (peek()?.value === '(') {
        take('(');
        const args = [];
        if (peek()?.value !== ')') {
          args.push(expr());
          while (peek()?.value === ',') {
            take(',');
            args.push(expr());
          }
        }
        take(')');
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new FormulaError(`Unknown function "${t.value}"`);
        if (fn.n > 0 && args.length !== fn.n) throw new FormulaError(`${t.value}() takes ${fn.n} argument${fn.n > 1 ? 's' : ''}`);
        if (fn.n < 0 && args.length < 1) throw new FormulaError(`${t.value}() needs at least one argument`);
        return { type: 'call', name: t.value, args };
      }
      return { type: 'var', name: t.value };
    }
    if (t.value === '(') {
      take('(');
      const node = expr();
      take(')');
      return node;
    }
    throw new FormulaError(`Unexpected "${t.value}" at position ${t.pos + 1}`);
  };
  const tree = expr();
  if (k < tokens.length) throw new FormulaError(`Unexpected "${tokens[k].value}" at position ${tokens[k].pos + 1}`);
  return tree;
}

/** Variable names used in a tree. */
export function variablesOf(tree, out = new Set()) {
  if (tree.type === 'var' && !CONSTANTS[tree.name]) out.add(tree.name);
  for (const child of [tree.left, tree.right, tree.arg, ...(tree.args ?? [])]) if (child) variablesOf(child, out);
  return out;
}

// ---- Evaluation ---------------------------------------------------------------------------

/**
 * Evaluate a tree. `vars` maps name → { value, dims }.
 * @returns {{ value: number, dims: number[] }}
 */
export function evaluate(tree, vars) {
  const same = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  const walk = (n) => {
    switch (n.type) {
      case 'num':
        return { value: n.value, dims: n.dims ?? NONE, constant: true };
      case 'var': {
        const v = CONSTANTS[n.name] ?? vars[n.name];
        if (!v) throw new FormulaError(`Unknown variable "${n.name}"`);
        if (typeof v.value !== 'number' || !Number.isFinite(v.value)) throw new FormulaError(`"${n.name}" has no value yet`);
        return { value: v.value, dims: v.dims ?? NONE };
      }
      case 'neg': {
        const a = walk(n.arg);
        return { value: -a.value, dims: a.dims, constant: a.constant };
      }
      case 'bin': {
        const a = walk(n.left);
        const b = walk(n.right);
        if (n.op === '+' || n.op === '-') {
          if (!same(a.dims, b.dims)) throw new FormulaError(`Cannot ${n.op === '+' ? 'add' : 'subtract'} ${dimsToString(b.dims)} ${n.op === '+' ? 'to' : 'from'} ${dimsToString(a.dims)}`);
          return { value: n.op === '+' ? a.value + b.value : a.value - b.value, dims: a.dims, constant: a.constant && b.constant };
        }
        if (n.op === '*') return { value: a.value * b.value, dims: a.dims.map((x, i) => x + b.dims[i]), constant: a.constant && b.constant };
        if (n.op === '/') return { value: a.value / b.value, dims: a.dims.map((x, i) => x - b.dims[i]), constant: a.constant && b.constant };
        // power
        if (!same(b.dims, NONE)) throw new FormulaError('An exponent must be dimensionless');
        if (!same(a.dims, NONE) && !b.constant) throw new FormulaError('A quantity with units can only be raised to a fixed number');
        return { value: a.value ** b.value, dims: a.dims.map((x) => x * b.value), constant: a.constant && b.constant };
      }
      case 'call': {
        const fn = FUNCTIONS[n.name];
        const args = n.args.map(walk);
        if (fn.dimensionless && !args.every((a) => same(a.dims, NONE))) throw new FormulaError(`${n.name}() needs a dimensionless argument (angles in radians)`);
        if (fn.same && !args.every((a) => same(a.dims, args[0].dims))) throw new FormulaError(`All arguments of ${n.name}() need the same units`);
        const value = fn.f(...args.map((a) => a.value));
        const dims = fn.dims ? fn.dims(args.map((a) => a.dims)) : fn.out ? fn.out() : fn.same ? args[0].dims : NONE;
        return { value, dims, constant: args.every((a) => a.constant) };
      }
      default:
        throw new FormulaError('Invalid expression');
    }
  };
  const result = walk(tree);
  if (!Number.isFinite(result.value)) throw new FormulaError('The result is not a finite number (division by zero or a value out of range)');
  return { value: result.value, dims: result.dims };
}

export function dimsToString(dims) {
  const pos = [];
  const neg = [];
  dims.forEach((x, i) => {
    const e = Math.round(x * 1000) / 1000;
    if (e > 0) pos.push(e === 1 ? DIM_NAMES[i] : `${DIM_NAMES[i]}^${e}`);
    if (e < 0) neg.push(e === -1 ? DIM_NAMES[i] : `${DIM_NAMES[i]}^${-e}`);
  });
  if (!pos.length && !neg.length) return 'dimensionless';
  return `${pos.join('·') || '1'}${neg.length ? `/${neg.length > 1 ? `(${neg.join('·')})` : neg[0]}` : ''}`;
}

export function unitDims(unit) {
  return UNIT_DIMENSIONS[unit] ?? null;
}

/** Named SI units that match a dimension vector (for suggestions). */
export function unitsForDims(dims) {
  return RESULT_UNITS.filter((u) => UNIT_DIMENSIONS[u].every((x, i) => Math.abs(x - dims[i]) < 1e-9));
}

export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
export const RESERVED = new Set([...FUNCTION_NAMES, ...Object.keys(CONSTANTS)]);
