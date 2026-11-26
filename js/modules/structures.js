/**
 * Structures Laboratory (Build 5): wing spar and arm/boom tube sizing with stress,
 * deflection and vibration checks. Simplified beam theory, not FEA.
 * Data: project.modules.structures. Model: js/engineering/structures.js.
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { MATERIALS, STRUCTURE_FIELDS, materialEntry } from '../engineering/structures.js';
import { flowBar } from '../ui/design-flow.js';

const PATH = ['modules', 'structures'];

function numberRow(ctx, key, value, provenance) {
  const f = STRUCTURE_FIELDS[key];
  const id = nextId('st');
  const control = quantityInput({
    id,
    label: f.label,
    siUnit: f.unit,
    units: f.displayUnits,
    unit: ctx.prefs.displayUnit(`str.${key}`, f.displayUnits[0]),
    valueSI: value,
    validate: (si) => (si === null ? 'A value is required' : si < f.min || si > f.max ? `Must be between ${f.min} and ${f.max} ${f.unit}` : null),
    onCommit: (si) => ctx.store.set([...PATH, 'settings', key], si, { label: `Set ${f.label}` }),
    onUnitChange: (u) => ctx.prefs.setDisplayUnit(`str.${key}`, u),
  });
  return { key, control, element: h('div', { class: 'requirement', dataset: { field: key } }, field({ id, label: `${f.label} (${f.symbol})`, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge(provenance))) };
}

function materialSelect(ctx, which, label) {
  const id = nextId('mat');
  const value = ctx.store.doc.modules.structures[which];
  const select = selectControl({ id, options: MATERIALS.map((m) => ({ value: m.id, label: m.name })), value, onChange: (v) => ctx.store.set([...PATH, which], v, { label: `Choose ${label.toLowerCase()}` }) });
  return field({ id, label, control: select, hint: materialEntry(value).note });
}

function sizingToggle(ctx, outerKey, wallKey, result, label) {
  const st = ctx.store.doc.modules.structures.settings;
  const manual = typeof st[outerKey] === 'number';
  const id = nextId('tg');
  const box = h('input', { id, type: 'checkbox', class: 'switch', checked: !manual });
  box.addEventListener('change', () => {
    ctx.store.transact(box.checked ? `Auto-size ${label}` : `Set ${label} size`, (set) => {
      set([...PATH, 'settings', outerKey], box.checked ? null : result?.outer ?? 0.01);
      set([...PATH, 'settings', wallKey], box.checked ? null : result?.wall ?? 0.001);
    });
  });
  return h('div', { class: 'field' }, h('label', { class: 'switch-row', for: id }, box, h('span', null, `Choose the ${label} tube automatically`)), h('p', { class: 'field__hint' }, 'Picks the smallest common carbon/aluminium tube size that passes the checks. Untick to enter your own tube.'));
}

function stat(label, value, unit, display, tone) {
  return h('div', { class: ['stat', tone ? `stat--${tone}` : null] }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value mono' }, value === null || value === undefined || !Number.isFinite(value) ? '—' : formatQuantity(value, unit, display, { digits: 3 })));
}

/** Frequency bar: arm f₁ against the 1P and 2P rotor excitations. */
function frequencyBar(arm) {
  if (!arm.rotorHz) return null;
  const max = Math.max(arm.frequency, 2 * arm.rotorHz) * 1.25;
  const pos = (f) => `${Math.min(100, (f / max) * 100).toFixed(1)}%`;
  const tick = (f, label, cls) => {
    const el = h('span', { class: `freq__tick ${cls}` }, h('span', { class: 'freq__label' }, label));
    el.style.left = pos(f);
    return el;
  };
  const band = (f) => {
    const el = h('span', { class: 'freq__band' });
    el.style.left = pos(0.85 * f);
    el.style.width = `${((0.3 * f) / max) * 100}%`;
    return el;
  };
  return h(
    'figure',
    { class: 'freq' },
    h('div', { class: 'freq__track', role: 'img', 'aria-label': `Arm frequency ${arm.frequency.toFixed(0)} Hz; rotor 1P ${arm.rotorHz.toFixed(0)} Hz, 2P ${(2 * arm.rotorHz).toFixed(0)} Hz` }, band(arm.rotorHz), band(2 * arm.rotorHz), tick(arm.rotorHz, '1P', 'freq--exc'), tick(2 * arm.rotorHz, '2P', 'freq--exc'), tick(arm.frequency, `f₁ ${arm.frequency.toFixed(0)} Hz`, arm.resonance ? 'freq--bad' : 'freq--ok')),
    h('figcaption', { class: 'muted' }, 'Shaded bands are ±15 % around the rotor speed (1P) and blade passing (2P) in hover. Keep the arm frequency out of them, ideally above 2P.'),
  );
}

function results(ctx, r) {
  const blocks = [];
  if (r.spar) {
    const sp = r.spar;
    blocks.push(
      card({
        title: 'Wing spar',
        icon: 'fixedWing',
        description: `${sp.auto ? 'Auto-sized' : 'Your'} ${formatQuantity(sp.outer, 'm', 'mm', { digits: 3 })} × ${formatQuantity(sp.wall, 'm', 'mm', { digits: 2 })} ${sp.material.name}, designed for n = ${sp.loadFactor.toFixed(1)}.`,
        body: h('div', { class: 'stat-grid' }, stat('Root moment (limit)', sp.moment, 'N·m', 'N·m'), stat('Stress (ultimate)', sp.stress, 'Pa', 'MPa', sp.margin < 0 ? 'warn' : null), stat('Margin of safety', sp.margin, '1', '%', sp.margin < 0 ? 'warn' : 'accent'), stat('Tip deflection', sp.deflection, 'm', 'mm', sp.deflectionRatio > 0.1 ? 'warn' : null), stat('Spar mass', sp.mass, 'kg', 'g')),
      }),
    );
  }
  if (r.arm) {
    const a = r.arm;
    blocks.push(
      card({
        title: ctx.engineering.geometry()?.wing ? 'Lift-rotor booms' : 'Arms',
        icon: 'multirotor',
        description: `${a.count} × ${a.auto ? 'auto-sized' : 'your'} ${formatQuantity(a.outer, 'm', 'mm', { digits: 3 })} × ${formatQuantity(a.wall, 'm', 'mm', { digits: 2 })} ${a.material.name}, ${formatQuantity(a.length, 'm', 'mm', { digits: 3 })} long, full motor thrust at the tip.`,
        body: h('div', { class: 'stack' }, h('div', { class: 'stat-grid' }, stat('Stress (ultimate)', a.stress, 'Pa', 'MPa', a.margin < 0 ? 'warn' : null), stat('Margin of safety', a.margin, '1', '%', a.margin < 0 ? 'warn' : 'accent'), stat('Tip deflection', a.deflection, 'm', 'mm'), stat('First bending frequency', a.frequency, 'Hz', 'Hz', a.resonance ? 'warn' : null), stat('Tube mass (all)', a.mass * a.count, 'kg', 'g')), frequencyBar(a)),
      }),
    );
  }
  const checks = r.checks;
  blocks.push(
    card({
      title: 'Checks and calculations',
      icon: 'checkCircle',
      class: 'span-2',
      body: h(
        'div',
        { class: 'stack' },
        checks.length ? h('div', { class: 'check-list' }, checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No structural problems found at this level of analysis.'),
        r.notes.length ? h('ul', { class: 'scope-list' }, r.notes.map((n) => h('li', null, n))) : null,
        derivedList(r.derived, ctx.prefs),
      ),
    }),
  );
  blocks.push(
    card({
      title: 'Material records (typical values)',
      icon: 'database',
      class: 'span-2',
      description: 'Illustrative, rounded room-temperature properties. Use your supplier’s data and test coupons for real parts.',
      body: h('div', { class: 'table-scroll' }, h('table', { class: 'table table--compact' }, h('thead', null, h('tr', null, ['Material', 'Young’s modulus', 'Allowable stress', 'Density', 'Specific stiffness'].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', null, MATERIALS.map((m) => h('tr', null, h('th', { scope: 'row' }, m.name), h('td', { class: 'mono num' }, formatQuantity(m.E, 'Pa', 'GPa', { digits: 3 })), h('td', { class: 'mono num' }, formatQuantity(m.strength, 'Pa', 'MPa', { digits: 3 })), h('td', { class: 'mono num' }, formatQuantity(m.density, 'kg/m³', 'kg/m³', { digits: 4 })), h('td', { class: 'mono num' }, `${(m.E / m.density / 1e6).toFixed(1)} MN·m/kg`)))))),
    }),
  );
  return blocks;
}

export async function mount(container, ctx) {
  const { store } = ctx;
  let editors = [];
  let out = null;
  let key = null;
  const structure = () => {
    const d = store.doc;
    if (!d) return 'none';
    const st = d.modules.structures;
    return [d.modules.configuration?.layout, st.material, st.armMaterial, typeof st.settings.sparOuter, typeof st.settings.armOuter].join('|');
  };
  const header = () => pageHeader({ title: 'Structural Analysis', icon: 'truss', subtitle: 'Size the wing spar and the arms so they are strong and stiff enough, without carrying extra weight.', badges: [badge('Build 5', 'neutral'), badge('Simplified beam theory', 'info')], actions: [button({ label: 'Aerodynamics', icon: 'airfoil', onClick: () => ctx.router.navigate('aerodynamics') })] });
  const render = () => {
    if (!out) return;
    const r = ctx.engineering.structures();
    if (!r || r.status === 'no-mass') {
      out.replaceChildren(h('div', { class: 'notice notice--info span-2', role: 'status' }, icon('info', { size: 18 }), h('p', null, 'Structures are sized for the estimated take-off mass. Add a battery and parts in the Avionics Laboratory first. ', button({ label: 'Open Avionics', size: 'sm', onClick: () => ctx.router.navigate('avionics') }))));
      return;
    }
    out.replaceChildren(...results(ctx, r));
  };
  const build = () => {
    key = structure();
    editors = [];
    out = null;
    if (!store.doc) {
      container.replaceChildren(header(), flowBar(ctx, 'structures'), emptyState({ icon: 'truss', title: 'Open a project first', message: 'Spars and arms are sized for a project’s mass, layout and motors.', actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() })] }));
      return;
    }
    const geo = ctx.engineering.geometry();
    const r = ctx.engineering.structures();
    const st = store.doc.modules.structures.settings;
    const hasLift = (geo?.rotors ?? []).some((x) => x.role !== 'cruise' && x.axis !== 'x');
    const rows = [numberRow(ctx, 'loadFactor', st.loadFactor, 'user-input'), numberRow(ctx, 'safetyFactor', st.safetyFactor, 'user-input')];
    const sparRows = geo?.wing && typeof st.sparOuter === 'number' ? [numberRow(ctx, 'sparOuter', st.sparOuter, 'user-input'), numberRow(ctx, 'sparWall', st.sparWall, 'user-input')] : [];
    const armRows = hasLift && typeof st.armOuter === 'number' ? [numberRow(ctx, 'armOuter', st.armOuter, 'user-input'), numberRow(ctx, 'armWall', st.armWall, 'user-input')] : [];
    const all = [...rows, ...sparRows, ...armRows];
    editors = [{ sync: (force) => all.forEach((x) => x.control.update(store.doc.modules.structures.settings[x.key], { force })) }];
    const inputs = card({
      title: 'Loads, materials and tubes',
      icon: 'sliders',
      class: 'span-2',
      description: 'Ultimate load = limit load × safety factor. Material data are typical values.',
      body: h(
        'div',
        { class: 'structure-inputs' },
        h('div', { class: 'requirement-list' }, rows.map((x) => x.element)),
        geo?.wing ? h('fieldset', { class: 'fieldset' }, h('legend', null, 'Wing spar'), materialSelect(ctx, 'material', 'Spar material'), sizingToggle(ctx, 'sparOuter', 'sparWall', r?.spar, 'spar'), sparRows.length ? h('div', { class: 'requirement-list' }, sparRows.map((x) => x.element)) : null) : null,
        hasLift ? h('fieldset', { class: 'fieldset' }, h('legend', null, geo?.wing ? 'Lift-rotor booms' : 'Arms'), materialSelect(ctx, 'armMaterial', 'Arm material'), sizingToggle(ctx, 'armOuter', 'armWall', r?.arm, 'arm'), armRows.length ? h('div', { class: 'requirement-list' }, armRows.map((x) => x.element)) : null) : null,
      ),
    });
    out = h('div', { class: 'page-grid span-2 results-grid' });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'structures'),
      h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'Hand-calculation level: straight round tubes, simple beam theory, typical material values. Good for choosing sizes early; not a substitute for FEA, joint design or a load test.')),
      h('div', { class: 'page-grid propulsion-grid' }, inputs, out),
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
