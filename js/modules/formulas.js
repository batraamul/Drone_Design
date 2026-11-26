/**
 * Formula Library (Build 5).
 *
 *  - Built-in formulas: every equation the models use, with variables, units, the code
 *    location, the test that checks it, the documentation section, the reference, and a
 *    "try it" calculator (safe expression engine, units checked).
 *  - Your formulas: add, change and delete your own formulas in the open project. They
 *    can use mission targets, layout parameters, every design result and each other;
 *    results and optional pass/fail limits appear in the design review and the summary.
 *
 * Changing a built-in formula is a code change: see docs/formulas.md (linked on the page).
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, emptyState, field, formatQuantity, linkButton, nextId, pageHeader, selectControl } from '../ui/components.js';
import { confirmDialog, openDialog } from '../ui/dialog.js';
import { BUILTIN_FORMULAS, FORMULA_AREAS } from '../engineering/formulas.js';
import { FormulaError, FUNCTION_NAMES, RESULT_UNITS, dimsToString, evaluate, parseExpression, unitDims, unitsForDims } from '../engineering/expression.js';
import { CHECK_SEVERITIES, FORMULA_LIMIT, createFormula, emptyFormulas, formulaVariables, validateFormula } from '../engineering/custom-formulas.js';

const REPO = 'https://github.com/batraamul/Drone_Design/blob/main/';
const PATH = ['modules', 'formulas'];

const fmt = (value) => (Math.abs(value) >= 1e5 || (Math.abs(value) < 1e-3 && value !== 0) ? value.toExponential(4) : Number(value.toPrecision(5)).toString());

// ---- Built-in formulas ----------------------------------------------------------------------

function tryIt(f) {
  const out = h('output', { class: 'formula__result mono', 'aria-live': 'polite' });
  const inputs = f.inputs.map((v) => {
    const id = nextId('fx');
    const input = h('input', { id, class: 'input input--num mono', type: 'text', inputmode: 'decimal', value: String(v.value), 'aria-label': `${v.label} (${v.unit})` });
    return { v, input, row: h('label', { class: 'formula__input', for: id }, h('span', { class: 'formula__var mono' }, v.name), h('span', { class: 'formula__varlabel' }, v.label), input, h('span', { class: 'formula__unit mono' }, v.unit === '1' ? '—' : v.unit)) };
  });
  const run = () => {
    try {
      const vars = {};
      for (const { v, input } of inputs) {
        const value = Number(input.value.replace(',', '.'));
        if (!Number.isFinite(value)) throw new FormulaError(`Enter a number for ${v.name}`);
        vars[v.name] = { value, dims: unitDims(v.unit) };
      }
      const r = evaluate(parseExpression(f.calc), vars);
      out.textContent = `${f.result.symbol} = ${fmt(r.value)} ${f.result.unit === '1' ? '' : f.result.unit}`;
      out.classList.remove('formula__result--error');
    } catch (e) {
      out.textContent = e.message;
      out.classList.add('formula__result--error');
    }
  };
  inputs.forEach(({ input }) => input.addEventListener('input', debounce(run, 120)));
  run();
  return h('div', { class: 'formula__try' }, h('div', { class: 'formula__inputs' }, inputs.map((i) => i.row)), out);
}

function builtinCard(f) {
  const details = h('details', { class: 'formula__details' }, h('summary', null, 'Try it and see where it lives'), tryIt(f), h('dl', { class: 'formula__meta' }, h('dt', null, 'Code'), h('dd', null, h('a', { href: `${REPO}${f.model}`, target: '_blank', rel: 'noopener' }, h('code', null, `${f.model} → ${f.fn}()`))), h('dt', null, 'Checked by'), h('dd', null, h('a', { href: `${REPO}${f.test}`, target: '_blank', rel: 'noopener' }, h('code', null, f.test))), h('dt', null, 'Explained in'), h('dd', null, h('a', { href: `${REPO}docs/${f.doc.split(' ')[0]}`, target: '_blank', rel: 'noopener' }, f.doc)), h('dt', null, 'Reference'), h('dd', null, f.reference)));
  return h('article', { class: 'formula', dataset: { formula: f.id, area: f.area } }, h('header', { class: 'formula__head' }, h('h3', { class: 'formula__title' }, f.title), badge(FORMULA_AREAS.find((a) => a.id === f.area)?.label ?? f.area, 'neutral')), h('p', { class: 'formula__eq mono' }, f.equation), details);
}

function builtinPanel() {
  const searchId = nextId('fs');
  const search = h('input', { id: searchId, class: 'input', type: 'search', placeholder: 'Search formulas (e.g. stall, thrust, Reynolds)', autocomplete: 'off' });
  const areaId = nextId('fa');
  const area = selectControl({ id: areaId, options: [{ value: '', label: 'All areas' }, ...FORMULA_AREAS.map((a) => ({ value: a.id, label: a.label }))], value: '' });
  const list = h('div', { class: 'formula-grid' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const items = BUILTIN_FORMULAS.filter((f) => (!area.value || f.area === area.value) && (!q || `${f.title} ${f.equation} ${f.id} ${f.reference}`.toLowerCase().includes(q)));
    count.textContent = `${items.length} of ${BUILTIN_FORMULAS.length} built-in formulas`;
    list.replaceChildren(...(items.length ? items.map(builtinCard) : [h('p', { class: 'muted' }, 'No formula matches.')]));
  };
  search.addEventListener('input', debounce(render, 120));
  area.addEventListener('change', render);
  render();
  return h('div', { class: 'stack' }, h('div', { class: 'toolbar' }, field({ id: searchId, label: 'Search', control: search }), field({ id: areaId, label: 'Area', control: area })), count, list);
}

// ---- Your formulas -----------------------------------------------------------------------------

function formulas(ctx) {
  return ctx.store.doc.modules.formulas ?? emptyFormulas();
}

function variablePicker(ctx, onPick) {
  const vars = [...formulaVariables({ doc: ctx.store.doc, review: ctx.engineering.evaluate() }).values()];
  const own = formulas(ctx).items.map((f) => ({ name: f.symbol, label: f.name, value: null, unit: f.unit, group: 'Your formulas' }));
  const all = [...vars, ...own];
  const id = nextId('vp');
  const search = h('input', { id, class: 'input', type: 'search', placeholder: 'Find a variable (mass, span, drag…)', autocomplete: 'off' });
  const list = h('ul', { class: 'var-list', role: 'listbox', 'aria-label': 'Variables' });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const items = all.filter((v) => !q || `${v.name} ${v.label}`.toLowerCase().includes(q)).slice(0, 60);
    list.replaceChildren(
      ...items.map((v) =>
        h(
          'li',
          null,
          h(
            'button',
            { type: 'button', class: 'var-list__item', title: `Insert ${v.name}`, onClick: () => onPick(v.name) },
            h('code', { class: 'var-list__name' }, v.name),
            h('span', { class: 'var-list__label' }, v.label),
            h('span', { class: 'var-list__value mono' }, v.value === null || v.value === undefined ? v.unit : formatQuantity(v.value, v.unit, v.unit, { digits: 4 })),
            h('span', { class: 'var-list__group' }, v.group),
          ),
        ),
      ),
    );
  };
  search.addEventListener('input', debounce(render, 100));
  render();
  return h('div', { class: 'stack var-picker' }, field({ id, label: `Variables you can use (${all.length})`, control: search, hint: 'Click one to insert it at the cursor.' }), list);
}

async function editDialog(ctx, existing = null) {
  const items = formulas(ctx).items;
  const f = existing ? structuredClone(existing) : createFormula({ name: '', symbol: `f${items.length + 1}`, expression: '', unit: '1' });
  const ids = { name: nextId('fn'), symbol: nextId('fy'), expr: nextId('fe'), unit: nextId('fu'), desc: nextId('fd'), op: nextId('fo'), limit: nextId('fl'), sev: nextId('fv') };
  const name = h('input', { id: ids.name, class: 'input', type: 'text', maxlength: 120, value: f.name, placeholder: 'e.g. Wing loading' });
  const symbol = h('input', { id: ids.symbol, class: 'input mono', type: 'text', maxlength: 41, value: f.symbol, placeholder: 'e.g. WS', autocomplete: 'off', spellcheck: false });
  const expr = h('textarea', { id: ids.expr, class: 'textarea mono formula-editor__expr', rows: 3, maxlength: 500, spellcheck: false, placeholder: 'e.g. maxTakeoffMass * g0 / geo_fw_area' }, f.expression);
  const unit = selectControl({ id: ids.unit, options: RESULT_UNITS.map((u) => ({ value: u, label: u === '1' ? '1 (no unit)' : u })), value: f.unit });
  const desc = h('textarea', { id: ids.desc, class: 'textarea', rows: 2, maxlength: 1000, placeholder: 'What it means and where it comes from (reference).' }, f.description);
  const op = selectControl({ id: ids.op, options: [{ value: '', label: 'No limit' }, { value: '<=', label: 'must be ≤' }, { value: '>=', label: 'must be ≥' }], value: f.check?.op ?? '' });
  const limit = h('input', { id: ids.limit, class: 'input input--num mono', type: 'text', inputmode: 'decimal', value: f.check ? String(f.check.limit) : '' });
  const sev = selectControl({ id: ids.sev, options: CHECK_SEVERITIES.map((s) => ({ value: s, label: { warning: 'Warning', error: 'Error', info: 'Note' }[s] })), value: f.check?.severity ?? 'warning' });
  const preview = h('output', { class: 'formula__result mono', 'aria-live': 'polite' });
  const insert = (text) => {
    const start = expr.selectionStart ?? expr.value.length;
    const end = expr.selectionEnd ?? start;
    expr.value = `${expr.value.slice(0, start)}${text}${expr.value.slice(end)}`;
    expr.focus();
    expr.setSelectionRange(start + text.length, start + text.length);
    update();
  };
  const vars = formulaVariables({ doc: ctx.store.doc, review: ctx.engineering.evaluate() });
  const ownResults = new Map((ctx.engineering.formulas()?.results ?? []).map((r) => [r.symbol, r]));
  const update = () => {
    try {
      const tree = parseExpression(expr.value);
      const scope = {};
      const walk = (n) => {
        if (n.type === 'var' && !['pi', 'g0'].includes(n.name)) {
          const v = vars.get(n.name);
          const mine = items.find((x) => x.symbol === n.name && x.id !== f.id);
          if (v) scope[n.name] = v;
          else if (mine && ownResults.get(n.name)?.value !== null && ownResults.get(n.name)) scope[n.name] = { value: ownResults.get(n.name).value, dims: unitDims(mine.unit) };
          else if (mine) throw new FormulaError(`"${n.name}" has no value yet`);
          else throw new FormulaError(`Unknown variable "${n.name}" — pick one from the list`);
        }
        for (const c of [n.left, n.right, n.arg, ...(n.args ?? [])]) if (c) walk(c);
      };
      walk(tree);
      const r = evaluate(tree, scope);
      const want = unitDims(unit.value);
      if (dimsToString(r.dims) !== dimsToString(want)) {
        const fits = unitsForDims(r.dims);
        preview.textContent = `Units: the expression gives ${dimsToString(r.dims)}${fits.length ? ` = ${fits.join(' or ')}` : ''}, not ${unit.value}.`;
        preview.classList.add('formula__result--error');
        if (fits.length) preview.append(' ', button({ label: `Use ${fits[0]}`, size: 'sm', onClick: () => { unit.value = fits[0]; update(); } }));
        return;
      }
      preview.textContent = `${symbol.value || '?'} = ${fmt(r.value)} ${unit.value === '1' ? '' : unit.value}`;
      preview.classList.remove('formula__result--error');
    } catch (e) {
      preview.textContent = e.message;
      preview.classList.add('formula__result--error');
    }
  };
  [expr, symbol].forEach((el) => el.addEventListener('input', debounce(update, 150)));
  unit.addEventListener('change', update);
  update();
  let saved = null;
  await openDialog({
    title: existing ? `Change “${existing.name}”` : 'Add your own formula',
    size: 'lg',
    description: 'Write it with + − * / ^ and brackets. Numbers can carry a unit, e.g. 1.225[kg/m³]. Functions: ' + FUNCTION_NAMES.join(', ') + '. Constants: pi, g0.',
    body: h(
      'div',
      { class: 'formula-editor' },
      h('div', { class: 'stack' }, h('div', { class: 'requirement-list' }, field({ id: ids.name, label: 'Name', control: name }), field({ id: ids.symbol, label: 'Symbol (variable name)', control: symbol, hint: 'Letters, digits and _. Other formulas can use it.' })), field({ id: ids.expr, label: 'Expression', control: expr, wide: true }), h('div', { class: 'formula-editor__preview' }, h('span', { class: 'muted' }, 'Result now: '), preview), field({ id: ids.unit, label: 'Result unit (SI)', control: unit }), h('fieldset', { class: 'fieldset' }, h('legend', null, 'Optional limit (shows in the design review)'), h('div', { class: 'requirement-list' }, field({ id: ids.op, label: 'Rule', control: op }), field({ id: ids.limit, label: 'Limit (in the result unit)', control: limit }), field({ id: ids.sev, label: 'If broken, show as', control: sev }))), field({ id: ids.desc, label: 'Description and reference', control: desc, wide: true })),
      variablePicker(ctx, insert),
    ),
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: existing ? 'Save changes' : 'Add formula', value: 'save', variant: 'primary' },
    ],
    onSubmit: () => {
      const limitValue = Number(limit.value.replace(',', '.'));
      if (op.value && !Number.isFinite(limitValue)) throw new Error('Enter a number for the limit, or choose “No limit”.');
      const next = { ...f, name: name.value.trim(), symbol: symbol.value.trim(), expression: expr.value.trim(), unit: unit.value, description: desc.value.trim(), check: op.value ? { op: op.value, limit: limitValue, severity: sev.value } : null };
      const errors = validateFormula(next, items);
      if (errors.length) throw new Error(errors[0]);
      saved = next;
      return true;
    },
  });
  if (!saved) return;
  const list = formulas(ctx).items;
  const nextItems = existing ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved];
  ctx.store.set([...PATH], { items: nextItems }, { label: existing ? `Change formula ${saved.symbol}` : `Add formula ${saved.symbol}`, coalesce: false });
  ctx.notify({ level: 'success', title: existing ? 'Formula changed' : 'Formula added', message: `${saved.symbol} is now part of the design review and the summary.` });
}

async function deleteFormula(ctx, f) {
  const users = formulas(ctx).items.filter((x) => x.id !== f.id && new RegExp(`\\b${f.symbol}\\b`).test(x.expression));
  const ok = await confirmDialog({ title: `Delete “${f.name}”?`, message: users.length ? `${users.map((u) => u.symbol).join(', ')} use${users.length === 1 ? 's' : ''} it and will show an error until you change ${users.length === 1 ? 'it' : 'them'}. You can undo this.` : 'You can undo this with Ctrl+Z.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  ctx.store.set([...PATH], { items: formulas(ctx).items.filter((x) => x.id !== f.id) }, { label: `Delete formula ${f.symbol}`, coalesce: false });
}

function move(ctx, f, delta) {
  const items = [...formulas(ctx).items];
  const i = items.findIndex((x) => x.id === f.id);
  const j = i + delta;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  ctx.store.set([...PATH], { items }, { label: `Move formula ${f.symbol}`, coalesce: false });
}

function yourPanel(ctx) {
  if (!ctx.store.doc) return emptyState({ icon: 'note', title: 'Open a project to add your own formulas', message: 'Your formulas are saved in the project, so they travel with it (export, Google Drive sync) and use its numbers.', actions: [button({ label: 'Open projects', icon: 'folder', variant: 'primary', onClick: () => ctx.router.navigate('projects') })] });
  const items = formulas(ctx).items;
  const results = new Map((ctx.engineering.formulas()?.results ?? []).map((r) => [r.id, r]));
  const add = button({ label: 'Add a formula', icon: 'plus', variant: 'primary', disabled: items.length >= FORMULA_LIMIT, onClick: () => editDialog(ctx) });
  const example = button({
    label: 'Add an example (wing loading)',
    icon: 'copy',
    onClick: () => {
      const has = ctx.engineering.geometry()?.wing;
      const f = has ? createFormula({ name: 'Wing loading at MTOW', symbol: `WS${items.length ? items.length + 1 : ''}`, expression: 'maxTakeoffMass * g0 / geo_fw_area', unit: 'Pa', description: 'W/S = m g₀ / S. Typical small UAVs: 50–150 Pa (example limit).', check: { op: '<=', limit: 150, severity: 'warning' } }) : createFormula({ name: 'Hover power per kilogram', symbol: `PW${items.length ? items.length + 1 : ''}`, expression: 'geo_mr_pideal / maxTakeoffMass', unit: 'W/kg', description: 'Ideal hover power divided by take-off mass. Lower is a more efficient hovering design (example limit 200 W/kg).', check: { op: '<=', limit: 200, severity: 'info' } });
      ctx.store.set([...PATH], { items: [...items, f] }, { label: `Add formula ${f.symbol}`, coalesce: false });
    },
  });
  const rows = items.map((f, i) => {
    const r = results.get(f.id);
    const value = r?.error ? h('span', { class: 'formula__result--error' }, icon('warning', { size: 14 }), ' ', r.error) : r ? h('span', { class: 'mono' }, `${fmt(r.value)} ${f.unit === '1' ? '' : f.unit}`) : '—';
    const pass = f.check && r && !r.error ? (f.check.op === '<=' ? r.value <= f.check.limit : r.value >= f.check.limit) : null;
    return h(
      'tr',
      { dataset: { formula: f.symbol } },
      h('th', { scope: 'row' }, h('div', null, f.name), h('code', { class: 'muted' }, f.symbol)),
      h('td', null, h('code', { class: 'formula-row__expr' }, f.expression)),
      h('td', { class: 'num' }, value),
      h('td', null, f.check ? badge(`${f.check.op === '<=' ? '≤' : '≥'} ${f.check.limit}`, pass === null ? 'neutral' : pass ? 'success' : f.check.severity === 'error' ? 'danger' : 'warning') : h('span', { class: 'muted' }, '—')),
      h('td', { class: 'formula-row__actions' }, button({ label: 'Change', icon: 'sliders', size: 'sm', onClick: () => editDialog(ctx, f) }), button({ label: 'Up', ariaLabel: `Move ${f.name} up`, size: 'sm', disabled: i === 0, onClick: () => move(ctx, f, -1) }), button({ label: 'Delete', icon: 'trash', size: 'sm', variant: 'danger', onClick: () => deleteFormula(ctx, f) })),
    );
  });
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'toolbar' }, add, example),
    items.length
      ? h('div', { class: 'table-scroll' }, h('table', { class: 'table formula-table' }, h('thead', null, h('tr', null, ['Formula', 'Expression', 'Result', 'Limit', ''].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', null, rows)))
      : h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'No formulas yet. Add one to compute anything the built-in models do not — a rule of thumb from your organisation, a coefficient from a paper, a requirement check. It updates live with the design.')),
  );
}

function howToCard() {
  return card({
    title: 'Adding, changing or deleting formulas',
    icon: 'book',
    class: 'span-2',
    body: h(
      'div',
      { class: 'how-to' },
      h('div', null, h('h3', null, 'Your own formulas (no code)'), h('ol', { class: 'steps' }, h('li', null, 'Open a project and choose ', h('strong', null, 'Your formulas'), ' → ', h('strong', null, 'Add a formula'), '.'), h('li', null, 'Give it a name and a symbol; write the expression, clicking variables from the list.'), h('li', null, 'Pick the result unit. The live preview checks the units and shows the value.'), h('li', null, 'Optionally add a limit. Broken limits appear in the design review.'), h('li', null, h('strong', null, 'Change'), ' edits it; ', h('strong', null, 'Delete'), ' removes it (Ctrl+Z undoes either).'))),
      h('div', null, h('h3', null, 'Built-in formulas (code change)'), h('ol', { class: 'steps' }, h('li', null, 'Change the function in the model file shown under “Try it”.'), h('li', null, 'Update its entry in js/engineering/formulas.js.'), h('li', null, 'Update or add the unit test; run npm test.'), h('li', null, 'Update the docs section and CHANGELOG; add a migration if saved data changes.')), linkButton({ href: `${REPO}docs/formulas.md`, label: 'Full procedure (docs/formulas.md)', icon: 'external', external: true })),
    ),
  });
}

export async function mount(container, ctx, route) {
  const { store } = ctx;
  const tab = route?.params?.tab === 'yours' ? 'yours' : 'builtin';
  const panel = h('div', { id: 'formula-panel', role: 'tabpanel', 'aria-labelledby': `formula-tab-${tab}` });
  const tabs = h(
    'div',
    { class: 'tabs tabs--page', role: 'tablist', 'aria-label': 'Formula sets' },
    [
      ['builtin', 'Built-in formulas', 'book', BUILTIN_FORMULAS.length],
      ['yours', 'Your formulas', 'note', store.doc ? formulas(ctx).items.length : 0],
    ].map(([id, label, ic, n]) => h('a', { class: 'tab', role: 'tab', id: `formula-tab-${id}`, href: `#/formulas?tab=${id}`, 'aria-selected': String(id === tab), 'aria-controls': 'formula-panel' }, icon(ic, { size: 15 }), h('span', null, label), h('span', { class: 'tab__count', dataset: { tabCount: id } }, String(n)))),
  );
  const render = () => {
    panel.replaceChildren(tab === 'yours' ? yourPanel(ctx) : builtinPanel());
    const count = container.querySelector('[data-tab-count="yours"]');
    if (count) count.textContent = String(store.doc ? formulas(ctx).items.length : 0);
  };
  container.replaceChildren(
    pageHeader({ title: 'Formula Library', icon: 'book', subtitle: 'Every equation behind the numbers — and your own, checked for units and used in the design review.', badges: [badge('Build 5', 'neutral'), badge(`${BUILTIN_FORMULAS.length} built-in`, 'info')] }),
    tabs,
    panel,
    h('div', { class: 'page-grid' }, howToCard()),
  );
  render();
  if (tab !== 'yours') return () => {};
  const refresh = debounce(render, 120);
  const offs = [store.on('change', refresh), store.on('load', render)];
  return () => offs.forEach((off) => off());
}
