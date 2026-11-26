/**
 * Propulsion & Energy (Build 4): motor, propeller and battery selection, the hover or
 * cruise operating point, the mass budget and endurance. Serves both the
 * "Propulsion Laboratory" and "Power & Energy" entries.
 * Data: project.modules.propulsion. Model: js/engineering/propulsion.js.
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, progressBar, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { MOTOR_CATALOGUE, PROPELLER_CATALOGUE, motorEntry } from '../engineering/catalogue.js';
import { MOTOR_FIELDS, PROPELLER_FIELDS, SETTING_FIELDS, maxStaticThrust, parsePropTable, validateField } from '../engineering/propulsion.js';

const defaultCruiseSet = () => {
  const part = (e) => ({ name: e.name, catalogueId: e.catalogueId, provenance: 'illustrative', source: '', specs: { ...e.specs } });
  return { motor: part(motorEntry('ill-mot-3520-520')), propeller: part(PROPELLER_CATALOGUE.find((e) => e.catalogueId === 'ill-prop-13x8')) };
};
import { provenanceInfo } from '../engineering/provenance.js';
import { isa } from '../engineering/atmosphere.js';
import { lineChart } from '../visualisation/plots.js';
import { flowBar } from '../ui/design-flow.js';

const PROVENANCE = ['illustrative', 'datasheet', 'user-input', 'measured'];

const partAt = (doc, base, which) => base.reduce((o, k) => o?.[k], doc.modules.propulsion)?.[which];

/** Forward-speed data: paste C_T(J), C_P(J) rows (e.g. from the UIUC Propeller Data Site). */
function tableEditor(ctx, path, part) {
  const id = nextId('pt');
  const rows = part.table?.length ?? 0;
  const area = h('textarea', { id, class: 'textarea mono', rows: 5, spellcheck: false, placeholder: 'J    CT      CP\n0.10 0.1050  0.0440\n0.20 0.0950  0.0420\n…' }, (part.table ?? []).map((r) => `${r.J} ${r.ct} ${r.cp}`).join('\n'));
  const apply = button({
    label: 'Use this data',
    size: 'sm',
    variant: 'primary',
    onClick: () => {
      const table = parsePropTable(area.value);
      if (!table) {
        ctx.notify({ level: 'warning', title: 'Could not read the table', message: 'Paste at least 3 rows of “J CT CP” numbers (spaces, tabs or commas), J increasing. Header lines are ignored.' });
        return;
      }
      ctx.store.set([...path, 'table'], table, { label: 'Set propeller forward-speed data', coalesce: false });
      ctx.notify({ level: 'success', title: `${table.length} rows in use`, message: 'Cruise now uses your measured C_T(J) and C_P(J).' });
    },
  });
  const clear = button({ label: 'Use the generic model', size: 'sm', disabled: !rows, onClick: () => ctx.store.set([...path, 'table'], null, { label: 'Remove propeller forward-speed data', coalesce: false }) });
  return h(
    'details',
    { class: 'prop-table', open: rows > 0 },
    h('summary', null, rows ? `Forward-speed data: your table (${rows} rows)` : 'Forward-speed data: generic model — paste measured data'),
    h('p', { class: 'field__hint' }, 'In cruise the propeller works at advance ratio J = V/(nD), where thrust and power fall. Without data, a generic curve from C_T, C_P and pitch/diameter is used (a concept estimate). Paste rows of “J CT CP” from a wind-tunnel test, e.g. the UIUC Propeller Data Site files.'),
    field({ id, label: 'J  C_T  C_P (one row per line)', control: area, wide: true }),
    h('div', { class: 'toolbar' }, apply, clear),
  );
}

function partEditor(ctx, which, fields, catalogue, title, iconName, description, base = []) {
  const { store, prefs } = ctx;
  const part = partAt(store.doc, base, which);
  const path = ['modules', 'propulsion', ...base, which];
  const pickId = nextId('pk');
  const pick = selectControl({
    id: pickId,
    options: [...catalogue.map((e) => ({ value: e.catalogueId, label: e.name })), { value: '', label: 'My own (enter datasheet values)' }],
    value: part.catalogueId ?? '',
    onChange: (value) => {
      const entry = catalogue.find((e) => e.catalogueId === value);
      if (entry) store.set(path, { name: entry.name, catalogueId: entry.catalogueId, provenance: 'illustrative', source: '', specs: { ...entry.specs } }, { label: `Choose ${entry.name}`, coalesce: false });
      else store.set(path, { ...partAt(store.doc, base, which), catalogueId: null, provenance: 'datasheet', name: `My ${which}` }, { label: `Use my own ${which}`, coalesce: false });
    },
  });
  const nameId = nextId('pn');
  const name = h('input', { id: nameId, class: 'input', type: 'text', maxlength: 120, value: part.name });
  name.addEventListener('change', () => name.value.trim() && store.set([...path, 'name'], name.value.trim(), { label: 'Rename' }));
  const provId = nextId('pp');
  const prov = selectControl({ id: provId, options: PROVENANCE.map((p) => ({ value: p, label: provenanceInfo(p).label })), value: part.provenance, onChange: (v) => store.set([...path, 'provenance'], v, { label: 'Set data provenance' }) });
  const srcId = nextId('ps');
  const src = h('input', { id: srcId, class: 'input', type: 'text', maxlength: 500, value: part.source, placeholder: which === 'propeller' ? 'e.g. UIUC Propeller Data Site, vol. 1, static test' : 'Datasheet title and revision, or test report' });
  src.addEventListener('change', () => store.set([...path, 'source'], src.value, { label: 'Set data source' }));
  const controls = [];
  const rows = Object.entries(fields).map(([key, f]) => {
    const id = nextId('pf');
    const control = quantityInput({
      id,
      label: f.label,
      siUnit: f.unit,
      units: f.displayUnits,
      unit: prefs.displayUnit(`prop.${key}`, f.displayUnits[0]),
      valueSI: part.specs[key],
      validate: (si) => (si === null ? 'A value is required' : validateField(fields, key, si)),
      onCommit: (si) => store.set([...path, 'specs', key], si, { label: `Set ${f.label}` }),
      onUnitChange: (u) => prefs.setDisplayUnit(`prop.${key}`, u),
    });
    controls.push([key, control]);
    return h('div', { class: 'requirement', dataset: { field: `${base.length ? 'cruise.' : ''}${which}.${key}` } }, field({ id, label: f.label, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge(part.provenance)));
  });
  return {
    element: card({
      title,
      icon: iconName,
      description,
      body: h('div', { class: 'stack' }, field({ id: pickId, label: 'Start from', control: pick, hint: 'Library entries are illustrative examples. For a real design, choose “My own” and enter datasheet or measured values.' }), h('div', { class: 'requirement-list' }, field({ id: nameId, label: 'Name', control: name }), field({ id: provId, label: 'Data provenance', control: prov }), field({ id: srcId, label: 'Source', control: src })), h('div', { class: 'requirement-list' }, rows), which === 'propeller' ? tableEditor(ctx, path, part) : null),
    }),
    sync: (force) => {
      const specs = partAt(store.doc, base, which).specs;
      for (const [key, control] of controls) control.update(specs[key], { force });
    },
  };
}

function settingsEditor(ctx, winged, hovering) {
  const { store, prefs } = ctx;
  const settings = store.doc.modules.propulsion.settings;
  const batteries = (store.doc.modules.components?.items ?? []).filter((i) => i.type === 'battery');
  const batId = nextId('pb');
  const batSelect = batteries.length
    ? selectControl({ id: batId, options: batteries.map((b) => ({ value: b.id, label: b.name })), value: store.doc.modules.propulsion.batteryId ?? batteries[0].id, onChange: (v) => store.set(['modules', 'propulsion', 'batteryId'], v, { label: 'Choose battery' }) })
    : null;
  const aeroLD = winged && Boolean(ctx.engineering.aeroModel?.());
  const opKnown = Boolean(ctx.engineering.propulsion?.()?.cruise?.op);
  const keys = ['structureMass', 'usableFraction', 'escEfficiency', 'isaDeltaT', ...(winged ? [...(aeroLD ? [] : ['cruiseLD']), ...(opKnown ? [] : ['cruisePropEfficiency', 'cruiseMotorEfficiency'])] : [])];
  const controls = [];
  const rows = keys.map((key) => {
    const f = SETTING_FIELDS[key];
    const id = nextId('st');
    const control = quantityInput({
      id,
      label: f.label,
      siUnit: f.unit,
      units: f.displayUnits,
      unit: prefs.displayUnit(`set.${key}`, f.displayUnits[0]),
      valueSI: settings[key],
      validate: (si) => (si === null ? 'A value is required' : validateField(SETTING_FIELDS, key, si)),
      onCommit: (si) => store.set(['modules', 'propulsion', 'settings', key], si, { label: `Set ${f.label}` }),
      onUnitChange: (u) => prefs.setDisplayUnit(`set.${key}`, u),
    });
    controls.push([key, control]);
    return h('div', { class: 'requirement', dataset: { field: `settings.${key}` } }, field({ id, label: f.label, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge(key === 'structureMass' || key.startsWith('cruise') ? 'conceptual-estimate' : 'user-input')));
  });
  return {
    element: card({
      title: 'Battery and operating conditions',
      icon: 'battery',
      description: hovering ? 'The battery comes from your component list (Avionics Laboratory). Hot-and-high conditions lower thrust.' : 'The battery comes from your component list (Avionics Laboratory).',
      body: h(
        'div',
        { class: 'stack' },
        batSelect ? field({ id: batId, label: 'Battery', control: batSelect, hint: 'Edit its cells, capacity and internal resistance in the Avionics Laboratory.' }) : h('div', { class: 'notice notice--warning', role: 'status' }, icon('warning', { size: 18 }), h('p', null, 'No battery yet. ', button({ label: 'Add one in the Avionics Laboratory', size: 'sm', onClick: () => ctx.router.navigate('avionics') }))),
        h('div', { class: 'requirement-list' }, rows),
        aeroLD ? h('p', { class: 'muted' }, icon('airfoil', { size: 14 }), ' Cruise lift-to-drag comes from the drag polar on the ', h('a', { href: '#/aerodynamics' }, 'Aerodynamics'), ' page.') : null,
        h('p', { class: 'muted' }, icon('truss', { size: 14 }), ' Check the structure-mass estimate against the spar and arm tubes on the ', h('a', { href: '#/structures' }, 'Structures'), ' page.'),
      ),
    }),
    sync: (force) => {
      const s = store.doc.modules.propulsion.settings;
      for (const [key, control] of controls) control.update(s[key], { force });
    },
  };
}

function bigNumber(label, value, unit, display, tone) {
  return h('div', { class: ['stat', tone ? `stat--${tone}` : null] }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value mono' }, value === null || value === undefined ? '—' : formatQuantity(value, unit, display, { digits: 3 })));
}

function resultsView(ctx, r) {
  const doc = ctx.store.doc;
  const blocks = [];
  if (r.mass) {
    const mtow = doc.requirements?.maxTakeoffMass?.value;
    blocks.push(
      card({
        title: 'Mass budget',
        icon: 'sliders',
        description: 'Everything that flies. Components come from the Avionics Laboratory, payload from your targets.',
        body: h(
          'div',
          { class: 'stack' },
          h('table', { class: 'table table--compact' }, h('tbody', null, r.mass.rows.map(([label, m]) => h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'mono num' }, formatQuantity(m, 'kg', m < 1 ? 'g' : 'kg')))), h('tr', { class: 'table__total' }, h('th', { scope: 'row' }, 'Estimated take-off mass'), h('td', { class: 'mono num' }, formatQuantity(r.mass.total, 'kg', 'kg', { digits: 4 }))))),
          typeof mtow === 'number' ? h('div', null, h('p', { class: 'muted' }, `Target: ${mtow} kg (${Math.round((r.mass.total / mtow) * 100)} % used)`), progressBar(Math.min(100, (r.mass.total / mtow) * 100), 100, { label: 'Mass budget used' })) : h('p', { class: 'muted' }, 'Set a maximum take-off mass target to compare.'),
        ),
      }),
    );
  }
  const stats = [];
  if (r.hover) {
    stats.push(
      bigNumber('Hover power', r.hover.totalPower, 'W', 'W'),
      bigNumber('Hover throttle', r.hover.throttle, '1', '%', r.hover.throttle > 0.75 ? 'warn' : null),
      bigNumber('Thrust / weight', r.hover.thrustToWeight, '1', '1', r.hover.thrustToWeight < 1.5 ? 'warn' : null),
      bigNumber('Battery current', r.hover.batteryCurrent, 'A', 'A'),
      bigNumber('Rotor speed', r.hover.op.n * 2 * Math.PI, 'rad/s', 'rpm'),
    );
  }
  if (r.cruise) stats.push(bigNumber('Cruise power', r.cruise.totalPower, 'W', 'W'), bigNumber('Cruise speed', r.cruise.speed, 'm/s', 'km/h'), bigNumber(r.cruise.ldFromAero ? 'Cruise L/D (aerodynamics)' : 'Cruise L/D (estimate)', r.cruise.liftToDrag, '1', '1'));
  if (r.endurance) stats.push(bigNumber(r.endurance.mode === 'cruise' ? 'Cruise endurance' : 'Hover endurance', r.endurance.time, 's', 'min', 'accent'));
  if (r.endurance && r.cruise) stats.push(bigNumber('Range (still air)', r.endurance.time * r.cruise.speed, 'm', 'km'));
  const charts = [];
  if (r.endurance?.points?.length > 2) {
    charts.push(lineChart({ points: r.endurance.points.map(([t, v]) => [t / 60, v]), title: 'Battery voltage during the flight', description: 'Loaded pack voltage versus time at constant power.', xLabel: 'Time (min)', yLabel: 'Voltage (V)' }));
  }
  if (r.hover && r.battery) {
    const p = doc.modules.propulsion;
    const D = ctx.engineering.geometry().rotors.find((x) => x.role === 'lift').diameter;
    const rho = isa(doc.requirements?.operatingAltitude?.value ?? 0, { deltaT: p.settings.isaDeltaT }).density;
    const vbat = r.hover.terminalVoltage ?? r.battery.nominal;
    const pts = [];
    for (let k = 0.1; k <= 1.0001; k += 0.05) {
      const t = maxStaticThrust({ voltage: k * vbat * p.settings.escEfficiency, rho, diameter: D, ct: p.propeller.specs.ct, cp: p.propeller.specs.cp, kv: p.motor.specs.kv, resistance: p.motor.specs.resistance, noLoadCurrent: p.motor.specs.noLoadCurrent, powerFactor: r.hover.coaxial ? 1.2 : 1 });
      pts.push([k * 100, (t.thrust * r.hover.rotors) / 9.80665]);
    }
    charts.push(lineChart({ points: pts, marker: [r.hover.throttle * 100, r.mass.total], title: 'Total thrust versus throttle', description: 'Static thrust of all lift rotors in kilograms-force; marker at the hover point.', xLabel: 'Throttle (%)', yLabel: 'Thrust (kgf)' }));
  }
  blocks.push(card({ title: r.hover ? 'Operating point' : 'Cruise and endurance', icon: 'propeller', class: 'span-2', body: h('div', { class: 'stack' }, h('div', { class: 'stat-grid' }, stats), charts.length ? h('div', { class: 'chart-row' }, charts) : null) }));
  blocks.push(
    card({
      title: 'Checks and calculations',
      icon: 'checkCircle',
      class: 'span-2',
      body: h(
        'div',
        { class: 'stack' },
        r.checks.length ? h('div', { class: 'check-list' }, r.checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No propulsion or energy problems found.'),
        r.notes.length ? h('ul', { class: 'scope-list' }, r.notes.map((n) => h('li', null, n))) : null,
        derivedList(r.derived, ctx.prefs),
      ),
    }),
  );
  return blocks;
}

export async function mount(container, ctx, route) {
  const { store } = ctx;
  let editors = [];
  let results = null;
  let key = null;
  const structure = () => {
    const d = store.doc;
    if (!d) return 'none';
    const p = d.modules.propulsion;
    return [d.modules.configuration?.layout, p.motor.catalogueId, p.propeller.catalogueId, p.propeller.table?.length ?? 0, p.cruise ? `${p.cruise.motor.catalogueId}/${p.cruise.propeller.catalogueId}/${p.cruise.propeller.table?.length ?? 0}` : 'same', (d.modules.components?.items ?? []).filter((i) => i.type === 'battery').map((b) => b.id).join(',')].join('|');
  };
  const header = () => pageHeader({ title: route?.module === 'power' ? 'Power & Energy' : 'Propulsion & Energy', icon: 'propeller', subtitle: 'Match motor, propeller and battery to the aircraft; check thrust, mass and endurance.', badges: [badge('Build 4', 'neutral')] });

  const renderResults = () => {
    if (!results) return;
    const r = ctx.engineering.propulsion();
    results.replaceChildren(...(r ? resultsView(ctx, r) : []));
  };

  const build = () => {
    key = structure();
    editors = [];
    results = null;
    const doc = store.doc;
    if (!doc) {
      container.replaceChildren(header(), flowBar(ctx, 'propulsion'), emptyState({ icon: 'propeller', title: 'Open a project first', message: 'Propulsion is sized for a project’s layout, mass and battery.', actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() })] }));
      return;
    }
    const geo = ctx.engineering.geometry();
    if (!geo) {
      container.replaceChildren(header(), flowBar(ctx, 'propulsion'), h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'This layout has no geometry model, so propulsion cannot be sized. Choose a modelled layout in Drone Architecture.')));
      return;
    }
    const hovering = geo.rotors.some((r) => r.role === 'lift');
    const winged = Boolean(geo.wing);
    const D = (geo.rotors.find((r) => r.role === 'lift') ?? geo.rotors[0])?.diameter;
    const motor = partEditor(ctx, 'motor', MOTOR_FIELDS, MOTOR_CATALOGUE, 'Motor', 'lightning', `${geo.rotors.length} motor(s) of this type. Brushless DC model: K_v, winding resistance and no-load current.`);
    const prop = partEditor(ctx, 'propeller', PROPELLER_FIELDS, PROPELLER_CATALOGUE, 'Propeller', 'propeller', `Diameter from the drawing: ${D ? (D / 0.0254).toFixed(1) : '—'} in (change it in Drone Architecture). Static coefficients C_T and C_P; measured values are on the UIUC Propeller Data Site.`);
    const settings = settingsEditor(ctx, winged, hovering);
    editors = [motor, prop, settings];
    const both = hovering && geo.rotors.some((r) => r.role === 'cruise');
    const cruiseCards = [];
    if (both && doc.modules.propulsion.cruise) {
      const cMotor = partEditor(ctx, 'motor', MOTOR_FIELDS, MOTOR_CATALOGUE, 'Cruise motor', 'lightning', 'Drives the forward-flight propeller.', ['cruise']);
      const cProp = partEditor(ctx, 'propeller', PROPELLER_FIELDS, PROPELLER_CATALOGUE, 'Cruise propeller', 'propeller', 'Higher pitch than the lift propellers suits forward flight.', ['cruise']);
      editors.push(cMotor, cProp);
      cruiseCards.push(cMotor.element, cProp.element, h('div', { class: 'span-2 toolbar' }, button({ label: 'Use the lift motor and propeller for cruise too', size: 'sm', onClick: () => store.set(['modules', 'propulsion', 'cruise'], null, { label: 'Use lift set for cruise', coalesce: false }) })));
    } else if (both) {
      cruiseCards.push(
        h('div', { class: 'notice notice--info span-2', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'The cruise propeller currently uses the lift motor and propeller, which are usually poor in forward flight. ', button({ label: 'Add a separate cruise motor and propeller', size: 'sm', variant: 'primary', onClick: () => store.set(['modules', 'propulsion', 'cruise'], defaultCruiseSet(), { label: 'Add cruise motor and propeller', coalesce: false }) }))),
      );
    }
    results = h('div', { class: 'page-grid span-2 results-grid' });
    container.replaceChildren(header(), flowBar(ctx, 'propulsion'), h('div', { class: 'page-grid propulsion-grid' }, motor.element, prop.element, ...cruiseCards, settings.element, results));
    renderResults();
  };

  const refresh = debounce(renderResults, 80);
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

