/**
 * Aerodynamics Laboratory (Build 5): aerofoil, drag build-up, drag polar, performance
 * and static stability for winged aircraft (fixed wing and VTOL).
 * Data: project.modules.aerodynamics. Model: js/engineering/aerodynamics.js.
 */
import { h, s as svg, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { AEROFOIL_CATALOGUE, AEROFOIL_FIELDS, AERO_FIELDS } from '../engineering/aerodynamics.js';
import { provenanceInfo } from '../engineering/provenance.js';
import { lineChart } from '../visualisation/plots.js';
import { flowBar } from '../ui/design-flow.js';

const PATH = ['modules', 'aerodynamics'];
const PROVENANCE = ['illustrative', 'datasheet', 'measured', 'user-input'];

function numberRow(ctx, { key, f, value, prefKey, onCommit, provenance, optional = false }) {
  const id = nextId('ae');
  const control = quantityInput({
    id,
    label: f.label,
    siUnit: f.unit,
    units: f.displayUnits,
    unit: ctx.prefs.displayUnit(prefKey, f.displayUnits[0]),
    valueSI: value,
    validate: (si) => (si === null ? (optional ? null : 'A value is required') : si < f.min || si > f.max ? `Must be between ${f.min} and ${f.max} ${f.unit}` : null),
    onCommit,
    onUnitChange: (u) => ctx.prefs.setDisplayUnit(prefKey, u),
  });
  return { key, control, element: h('div', { class: 'requirement', dataset: { field: key } }, field({ id, label: `${f.label} (${f.symbol})`, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge(provenance))) };
}

function aerofoilCard(ctx) {
  const { store } = ctx;
  const af = store.doc.modules.aerodynamics.aerofoil;
  const pickId = nextId('af');
  const pick = selectControl({
    id: pickId,
    options: [...AEROFOIL_CATALOGUE.map((e) => ({ value: e.catalogueId, label: e.name })), { value: '', label: 'My own aerofoil (enter its data)' }],
    value: af.catalogueId ?? '',
    onChange: (value) => {
      const e = AEROFOIL_CATALOGUE.find((x) => x.catalogueId === value);
      if (e) store.set([...PATH, 'aerofoil'], { name: e.name, catalogueId: e.catalogueId, provenance: 'illustrative', source: '', specs: { ...e.specs } }, { label: `Choose ${e.name}`, coalesce: false });
      else store.set([...PATH, 'aerofoil'], { ...store.doc.modules.aerodynamics.aerofoil, catalogueId: null, provenance: 'measured', name: 'My aerofoil' }, { label: 'Use my own aerofoil', coalesce: false });
    },
  });
  const entry = AEROFOIL_CATALOGUE.find((e) => e.catalogueId === af.catalogueId);
  const provId = nextId('afp');
  const prov = selectControl({ id: provId, options: PROVENANCE.map((p) => ({ value: p, label: provenanceInfo(p).label })), value: af.provenance, onChange: (v) => store.set([...PATH, 'aerofoil', 'provenance'], v, { label: 'Set aerofoil data provenance' }) });
  const srcId = nextId('afs');
  const src = h('input', { id: srcId, class: 'input', type: 'text', maxlength: 300, value: af.source, placeholder: 'e.g. XFLR5 polar at Re 300 000, or UIUC LSATs vol. 3' });
  src.addEventListener('change', () => store.set([...PATH, 'aerofoil', 'source'], src.value, { label: 'Set aerofoil source' }));
  const rows = Object.entries(AEROFOIL_FIELDS).map(([key, f]) =>
    numberRow(ctx, { key, f, value: af.specs[key], prefKey: `af.${key}`, provenance: af.provenance, onCommit: (si) => store.set([...PATH, 'aerofoil', 'specs', key], si, { label: `Set ${f.label}` }) }),
  );
  return {
    element: card({
      title: 'Aerofoil',
      icon: 'airfoil',
      description: 'The wing section. Presets carry typical, rounded values; for real work, run your aerofoil in XFLR5 at your Reynolds number and enter the results here.',
      body: h(
        'div',
        { class: 'stack' },
        field({ id: pickId, label: 'Start from', control: pick, hint: entry?.use }),
        h('div', { class: 'requirement-list' }, field({ id: provId, label: 'Data provenance', control: prov }), field({ id: srcId, label: 'Source', control: src })),
        h('div', { class: 'requirement-list' }, rows.map((r) => r.element)),
      ),
    }),
    sync: (force) => {
      const s = store.doc.modules.aerodynamics.aerofoil.specs;
      rows.forEach((r) => r.control.update(s[r.key], { force }));
    },
  };
}

function settingsCard(ctx, geo) {
  const { store } = ctx;
  const st = store.doc.modules.aerodynamics.settings;
  const keys = ['cg', 'laminarFraction', 'miscDrag', 'extraDragArea', 'tailEfficiency', ...(geo.booms?.length ? ['boomDiameter'] : [])];
  const rows = keys.map((key) =>
    numberRow(ctx, { key, f: AERO_FIELDS[key], value: st[key], optional: key === 'cg', prefKey: `aes.${key}`, provenance: key === 'cg' ? 'user-input' : 'conceptual-estimate', onCommit: (si) => store.set([...PATH, 'settings', key], si, { label: `Set ${AERO_FIELDS[key].label}` }) }),
  );
  return {
    element: card({ title: 'Drag and balance', icon: 'sliders', description: 'Where the centre of gravity is and how clean the airframe is. Leave the CG empty to see where it should go.', body: h('div', { class: 'requirement-list' }, rows.map((r) => r.element)) }),
    sync: (force) => {
      const s = store.doc.modules.aerodynamics.settings;
      rows.forEach((r) => r.control.update(s[r.key], { force }));
    },
  };
}

function stat(label, value, unit, display, tone, hint) {
  return h('div', { class: ['stat', tone ? `stat--${tone}` : null], title: hint ?? '' }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value mono' }, value === null || value === undefined || !Number.isFinite(value) ? '—' : formatQuantity(value, unit, display, { digits: 3 })));
}

/** Nose-to-tail strip showing the wing AC, neutral point and CG. */
function balanceStrip(m, length) {
  const s = m.stability;
  const L = Math.max(length, s.xNp + m.mac, s.xCg + 0.05);
  const W = 640;
  const x = (v) => 20 + ((W - 40) * v) / L;
  const mark = (v, label, cls, dy) => [svg('line', { x1: x(v), x2: x(v), y1: 26, y2: 54, class: `balance__mark ${cls}` }), svg('text', { x: x(v), y: dy, 'text-anchor': 'middle', class: `balance__label ${cls}` }, label)];
  return h(
    'figure',
    { class: 'balance' },
    svg(
      'svg',
      { viewBox: `0 0 ${W} 80`, role: 'img', 'aria-label': `Balance: neutral point ${(s.xNp * 1000).toFixed(0)} mm, CG ${(s.xCg * 1000).toFixed(0)} mm behind the nose` },
      svg('rect', { x: x(0), y: 36, width: x(length) - x(0), height: 8, rx: 4, class: 'balance__body' }),
      svg('rect', { x: x(s.xAc - 0.25 * m.mac), y: 32, width: Math.max(x(m.mac) - x(0), 2), height: 16, rx: 2, class: 'balance__wing' }),
      ...mark(s.xAc, 'AC', 'balance--ac', 18),
      ...mark(s.xNp, 'NP', 'balance--np', 72),
      ...mark(s.xCg, 'CG', s.staticMargin < 0 ? 'balance--bad' : 'balance--cg', 18),
    ),
    h('figcaption', { class: 'muted' }, `Nose at left. Static margin ${(s.staticMargin * 100).toFixed(1)} % of the MAC${s.cgSet ? '' : ' (suggested CG)'}. CG ahead of NP = stable.`),
  );
}

function results(ctx, a) {
  const m = a.model;
  const p = a.performance;
  const sb = m.stability;
  const stats = h(
    'div',
    { class: 'stat-grid' },
    stat('Zero-lift drag C_D0', m.cd0, '1', '1'),
    stat('Oswald factor e', m.oswald, '1', '1'),
    stat('Best L/D', m.ldMax, '1', '1', 'accent'),
    p ? stat('Cruise L/D', p.cruise.ld, '1', '1') : null,
    p ? stat('Stall speed', p.vStall, 'm/s', 'm/s', p.cruise.speed < 1.3 * p.vStall ? 'warn' : null) : null,
    p ? stat('Best-glide speed', p.vMd, 'm/s', 'm/s') : null,
    p ? stat('Best-endurance speed', p.vMp, 'm/s', 'm/s') : null,
    stat(sb.cgSet ? 'Static margin' : 'Static margin (suggested CG)', sb.staticMargin, '1', '%', sb.staticMargin < 0.05 ? 'warn' : null),
  );
  const polar = [];
  for (let cl = -0.2; cl <= m.clMaxWing + 1e-9; cl += m.clMaxWing / 30) polar.push([m.cd0 + m.k * cl * cl, cl]);
  const charts = [lineChart({ points: polar, marker: p ? [m.cd0 + m.k * p.cruise.cl ** 2, p.cruise.cl] : undefined, title: 'Drag polar', description: 'Lift coefficient against drag coefficient; marker at cruise.', xLabel: 'C_D', yLabel: 'C_L' })];
  if (p) charts.push(lineChart({ points: p.curve.map((pt) => [pt.x, pt.y]), marker: [p.cruise.speed, p.cruise.power], title: 'Power needed to fly level', description: 'Aerodynamic power (drag × speed) against airspeed at the estimated mass; marker at cruise. The lowest point is the best-endurance speed.', xLabel: 'Airspeed (m/s)', yLabel: 'Power (W)' }));
  const total = m.drag.rows.reduce((s, r) => s + r.cd, 0) || 1;
  const dragTable = h(
    'table',
    { class: 'table table--compact drag-table' },
    h('thead', null, h('tr', null, ['Part', 'Re', 'C_f', 'Form factor', 'Wetted area', 'ΔC_D0', 'Share'].map((t) => h('th', { scope: 'col' }, t)))),
    h(
      'tbody',
      null,
      m.drag.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.name), h('td', { class: 'mono num' }, Math.round(r.re).toLocaleString('en')), h('td', { class: 'mono num' }, r.cf.toFixed(5)), h('td', { class: 'mono num' }, (r.ff * r.Q).toFixed(2)), h('td', { class: 'mono num' }, formatQuantity(r.swet, 'm²', 'm²', { digits: 3 })), h('td', { class: 'mono num' }, r.cd.toFixed(4)), h('td', { class: 'mono num' }, `${Math.round((r.cd / total) * 100)} %`))),
      h('tr', { class: 'table__total' }, h('th', { scope: 'row' }, `Total with ${Math.round(m.drag.misc * 100)} % allowance${m.drag.extraDragArea ? ' and extra drag area' : ''}`), h('td', { colspan: 4 }), h('td', { class: 'mono num' }, m.cd0.toFixed(4)), h('td')),
    ),
  );
  return [
    card({ title: 'Results', icon: 'airfoil', class: 'span-2', description: p ? `At the estimated take-off mass of ${formatQuantity(p.mass, 'kg', p.mass < 1 ? 'g' : 'kg', { digits: 3 })}, ${formatQuantity(m.reference.speed, 'm/s', 'm/s', { digits: 3 })} cruise and ${Math.round(m.reference.altitude)} m altitude.` : 'Set a take-off mass target or complete the mass budget to see performance.', body: h('div', { class: 'stack' }, stats, h('div', { class: 'chart-row' }, charts)) }),
    card({ title: 'Balance and stability', icon: 'attitude', class: 'span-2', body: h('div', { class: 'stack' }, balanceStrip(m, ctx.engineering.geometry()?.fuselage?.length ?? 1), sb.cgSet ? null : h('p', { class: 'notice notice--info' }, icon('info', { size: 18 }), h('span', null, `Put the centre of gravity about ${formatQuantity(sb.xCg, 'm', 'mm', { digits: 3 })} behind the nose (10 % static margin), then enter your measured CG above.`))) }),
    card({ title: 'Where the drag comes from', icon: 'layers', class: 'span-2', description: 'Component build-up: skin friction × form factor × interference × wetted area.', body: h('div', { class: 'table-scroll' }, dragTable) }),
    card({
      title: 'Checks and calculations',
      icon: 'checkCircle',
      class: 'span-2',
      body: h(
        'div',
        { class: 'stack' },
        a.checks.length ? h('div', { class: 'check-list' }, a.checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No aerodynamic problems found.'),
        a.notes.length ? h('ul', { class: 'scope-list' }, a.notes.map((n) => h('li', null, n))) : null,
        derivedList(a.derived, ctx.prefs),
      ),
    }),
  ];
}

export async function mount(container, ctx) {
  const { store } = ctx;
  let editors = [];
  let out = null;
  let key = null;
  const structure = () => {
    const d = store.doc;
    return d ? [d.modules.configuration?.layout, d.modules.aerodynamics?.aerofoil?.catalogueId ?? 'own', (ctx.engineering.geometry()?.booms ?? []).length].join('|') : 'none';
  };
  const header = () => pageHeader({ title: 'Aerodynamics', icon: 'airfoil', subtitle: 'How much the wing lifts and drags, how fast it stalls, and where the balance point must be.', badges: [badge('Build 5', 'neutral'), badge('Concept estimate', 'info')], actions: [button({ label: 'Structures', icon: 'truss', onClick: () => ctx.router.navigate('structures') })] });
  const render = () => {
    if (!out) return;
    const a = ctx.engineering.aerodynamics();
    out.replaceChildren(...(a?.model ? results(ctx, a) : []));
  };
  const build = () => {
    key = structure();
    editors = [];
    out = null;
    if (!store.doc) {
      container.replaceChildren(header(), flowBar(ctx, 'aerodynamics'), emptyState({ icon: 'airfoil', title: 'Open a project first', message: 'Aerodynamics is worked out for a project’s wing, mass and cruise speed.', actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() })] }));
      return;
    }
    const geo = ctx.engineering.geometry();
    if (!geo?.wing) {
      container.replaceChildren(
        header(),
        flowBar(ctx, 'aerodynamics'),
        emptyState({ icon: 'multirotor', title: 'This layout has no wing', message: 'Wing aerodynamics applies to fixed-wing and VTOL aircraft. A multirotor’s lift comes from its rotors (Propulsion & Energy). You can still size its arms on the Structures page.', actions: [button({ label: 'Go to Structures', icon: 'truss', variant: 'primary', onClick: () => ctx.router.navigate('structures') }), button({ label: 'Change the layout', icon: 'cube', onClick: () => ctx.router.navigate('architecture') })] }),
      );
      return;
    }
    const af = aerofoilCard(ctx);
    const st = settingsCard(ctx, geo);
    editors = [af, st];
    out = h('div', { class: 'page-grid span-2 results-grid' });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'aerodynamics'),
      h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'Conceptual estimates (lifting-line theory and a drag build-up) for comparing designs. They are not validated aerodynamic data: check the final design in XFLR5 or OpenVSP, and in flight tests.')),
      h('div', { class: 'page-grid propulsion-grid' }, af.element, st.element, out),
    );
    render();
  };
  const refresh = debounce(render, 80);
  build();
  const offs = [
    store.on('change', ({ undo, redo }) => {
      if (structure() !== key) return build();
      if (undo || redo) editors.forEach((e) => e.sync(true));
      refresh();
    }),
    store.on('load', () => build()),
  ];
  return () => offs.forEach((off) => off());
}
