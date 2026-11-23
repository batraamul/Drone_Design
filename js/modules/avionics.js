/**
 * Avionics Laboratory (Build 3): the project's electrical architecture.
 * Add components (from the illustrative library or your own datasheets), connect power
 * and data, and see the block diagram, power budget and compatibility checks update.
 * Data: project.modules.components (SI units). Model: js/engineering/electrical.js.
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, progressBar, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { openDialog, confirmDialog } from '../ui/dialog.js';
import { CHEMISTRIES, COMPONENT_TYPES, CONNECTION_KINDS, INTERFACE_KINDS, LIMITS, PROVENANCE_OPTIONS, SPEC_FIELDS, canSupply, componentType, createComponent, createConnection, validateSpecValue } from '../engineering/components.js';
import { CATALOGUE, exampleQuadSet } from '../engineering/catalogue.js';
import { provenanceInfo } from '../engineering/provenance.js';
import { LINK_STYLES, drawBlockDiagram } from '../visualisation/block-diagram.js';
import { flowBar } from '../ui/design-flow.js';

const components = (store) => store.doc?.modules?.components ?? { items: [], connections: [] };

function setComponents(store, next, label) {
  store.set(['modules', 'components'], next, { label, coalesce: false });
}

/** Add a component (and optionally connect nothing). Used by this page and the Component Library. */
export function addComponent(ctx, item) {
  const current = components(ctx.store);
  if (current.items.length >= LIMITS.items) {
    ctx.notify({ level: 'warning', title: 'Component limit reached', message: `A project can hold up to ${LIMITS.items} components.` });
    return false;
  }
  setComponents(ctx.store, { ...current, items: [...current.items, item] }, `Add ${item.name}`);
  return true;
}

/** Dialog: add a custom component of a chosen type. */
export async function customComponentDialog(ctx) {
  const typeId = nextId('cc');
  const nameId = nextId('cc');
  const typeSelect = selectControl({ id: typeId, options: COMPONENT_TYPES.map((t) => ({ value: t.id, label: t.label })), value: 'sensor' });
  const name = h('input', { id: nameId, class: 'input', type: 'text', maxlength: LIMITS.name, placeholder: 'e.g. Pitot sensor (from datasheet rev. B)', autocomplete: 'off' });
  let created = null;
  await openDialog({
    title: 'Add your own component',
    description: 'Creates a component with neutral starting values. Then enter the numbers from its datasheet, and record the datasheet as the source.',
    body: [field({ id: typeId, label: 'Type', control: typeSelect }), field({ id: nameId, label: 'Name', control: name })],
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Add component', value: 'add', variant: 'primary' },
    ],
    onSubmit: () => {
      if (!name.value.trim()) {
        name.focus();
        throw new Error('Enter a name.');
      }
      created = createComponent({ type: typeSelect.value, name: name.value.trim(), provenance: 'datasheet' });
      return true;
    },
  });
  if (created && addComponent(ctx, created)) ctx.notify({ level: 'success', title: `Added ${created.name}`, message: 'Enter its datasheet values and source below.' });
  return created;
}

/** Dialog: pick an entry from the illustrative library. */
async function libraryDialog(ctx) {
  const listId = nextId('lib');
  const select = h(
    'select',
    { id: listId, class: 'select', size: 10 },
    COMPONENT_TYPES.map((t) => h('optgroup', { label: t.label }, CATALOGUE.filter((e) => e.type === t.id).map((e) => h('option', { value: e.catalogueId }, e.name)))),
  );
  select.value = CATALOGUE[0].catalogueId;
  const summary = h('p', { class: 'muted' });
  const show = () => (summary.textContent = CATALOGUE.find((e) => e.catalogueId === select.value)?.summary ?? '');
  select.addEventListener('change', show);
  show();
  let created = null;
  await openDialog({
    title: 'Add from the library',
    size: 'lg',
    description: 'Library entries are illustrative examples with typical values, not real products. Replace their values with your datasheet before relying on the results.',
    body: [field({ id: listId, label: 'Component', control: select }), summary],
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Add to project', value: 'add', variant: 'primary' },
    ],
    onSubmit: () => {
      const entry = CATALOGUE.find((e) => e.catalogueId === select.value);
      if (!entry) throw new Error('Choose a component.');
      created = createComponent({ catalogueEntry: entry });
      return true;
    },
  });
  if (created) addComponent(ctx, created);
}

// ---- Component editor ----------------------------------------------------------------------

function specControl(ctx, item, key) {
  const f = SPEC_FIELDS[key];
  const { store, prefs } = ctx;
  const id = nextId('sp');
  const commit = (value) => updateItem(store, item.id, (it) => ({ ...it, specs: { ...it.specs, [key]: value } }), `Set ${f.label}`);
  if (f.kind === 'enum') {
    const control = selectControl({ id, options: f.options.map((o) => ({ value: String(o), label: key === 'chemistry' ? CHEMISTRIES[o].label : `${o} V` })), value: String(item.specs[key]), onChange: (v) => commit(typeof f.options[0] === 'number' ? Number(v) : v) });
    return field({ id, label: f.label, control, hint: f.help });
  }
  if (f.kind === 'boolean') {
    const box = h('input', { id, type: 'checkbox', class: 'switch', checked: Boolean(item.specs[key]) });
    box.addEventListener('change', () => commit(box.checked));
    return h('div', { class: 'field' }, h('label', { class: 'switch-row', for: id }, box, h('span', null, f.label)), f.help ? h('p', { class: 'field__hint' }, f.help) : null);
  }
  const control = quantityInput({
    id,
    label: f.label,
    siUnit: f.unit,
    units: f.displayUnits,
    unit: prefs.displayUnit(`cmp.${key}`, f.displayUnits[0]),
    valueSI: item.specs[key] ?? null,
    validate: (si) => validateSpecValue(key, si),
    onCommit: (si) => commit(si),
    onUnitChange: (u) => prefs.setDisplayUnit(`cmp.${key}`, u),
  });
  return field({ id, label: f.optional ? `${f.label} (optional)` : f.label, control: control.element, hint: f.help });
}

function updateItem(store, id, mutate, label) {
  const current = components(store);
  const items = current.items.map((it) => (it.id === id ? mutate(it) : it));
  setComponents(store, { ...current, items }, label);
}

function componentEditor(ctx, item, severity) {
  const { store } = ctx;
  const t = componentType(item.type);
  const nameId = nextId('cn');
  const name = h('input', { id: nameId, class: 'input', type: 'text', maxlength: LIMITS.name, value: item.name });
  name.addEventListener('change', () => name.value.trim() && updateItem(store, item.id, (it) => ({ ...it, name: name.value.trim() }), 'Rename component'));
  const provId = nextId('cp');
  const provenance = selectControl({ id: provId, options: PROVENANCE_OPTIONS.map((p) => ({ value: p, label: provenanceInfo(p).label })), value: item.provenance, onChange: (v) => updateItem(store, item.id, (it) => ({ ...it, provenance: v }), 'Set data provenance') });
  const sourceId = nextId('cs');
  const source = h('input', { id: sourceId, class: 'input', type: 'text', maxlength: LIMITS.source, value: item.source, placeholder: 'Datasheet title, revision and page, or test reference' });
  source.addEventListener('change', () => updateItem(store, item.id, (it) => ({ ...it, source: source.value }), 'Set data source'));
  const rows = [field({ id: nameId, label: 'Name', control: name }), field({ id: provId, label: 'Data provenance', control: provenance, hint: provenanceInfo(item.provenance).description }), field({ id: sourceId, label: 'Source', control: source, hint: 'Required for datasheet and measured values.' })];
  if (t.quantity) {
    const qId = nextId('cq');
    const qty = h('input', { id: qId, class: 'input input--number', type: 'number', min: 1, max: LIMITS.quantity, step: 1, value: item.quantity });
    qty.addEventListener('change', () => {
      const n = Math.round(Number(qty.value));
      if (n >= 1 && n <= LIMITS.quantity) updateItem(store, item.id, (it) => ({ ...it, quantity: n }), 'Set quantity');
    });
    rows.push(field({ id: qId, label: 'Quantity', control: qty, hint: 'Identical units (for example one ESC per motor).' }));
  }
  const specs = t.fields.map((key) => specControl(ctx, item, key));
  const ports = t.interfaces.map((kind) => {
    const id = nextId('ip');
    const input = h('input', { id, class: 'input input--number', type: 'number', min: 0, max: LIMITS.ports, step: 1, value: item.interfaces[kind] ?? 0 });
    input.addEventListener('change', () => {
      const n = Math.round(Number(input.value));
      if (n >= 0 && n <= LIMITS.ports) updateItem(store, item.id, (it) => ({ ...it, interfaces: { ...it.interfaces, [kind]: n } }), 'Set port count');
    });
    return field({ id, label: INTERFACE_KINDS.find((k) => k.id === kind).label, control: input });
  });
  const remove = button({
    label: 'Remove',
    icon: 'trash',
    size: 'sm',
    variant: 'danger',
    onClick: async () => {
      const current = components(store);
      const linked = current.connections.filter((c) => c.from === item.id || c.to === item.id).length;
      if (linked && !(await confirmDialog({ title: `Remove ${item.name}?`, message: `Its ${linked} connection(s) will be removed too. You can undo this.`, confirmLabel: 'Remove', danger: true }))) return;
      setComponents(store, { items: current.items.filter((i) => i.id !== item.id), connections: current.connections.filter((c) => c.from !== item.id && c.to !== item.id) }, `Remove ${item.name}`);
    },
  });
  return h(
    'details',
    { class: ['component', severity ? `component--${severity}` : null], dataset: { component: item.id } },
    h('summary', { class: 'component__summary' }, h('span', { class: 'component__name' }, item.name), h('span', { class: 'muted' }, `${t.label}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`), provenanceBadge(item.provenance), severity && severity !== 'info' ? badge(severity === 'error' ? 'Problem' : 'Check', severity === 'error' ? 'danger' : 'warning') : null),
    h(
      'div',
      { class: 'component__body' },
      h('div', { class: 'requirement-list' }, rows),
      h('h4', { class: 'subheading' }, 'Specifications (SI units stored)'),
      h('div', { class: 'requirement-list' }, specs),
      ports.length ? h('h4', { class: 'subheading' }, 'Ports available') : null,
      ports.length ? h('div', { class: 'requirement-list requirement-list--compact' }, ports) : null,
      h('div', { class: 'component__actions' }, remove),
    ),
  );
}

// ---- Connections ---------------------------------------------------------------------------

function connectionsCard(ctx) {
  const { store } = ctx;
  const { items, connections } = components(store);
  const name = (id) => items.find((i) => i.id === id)?.name ?? '?';
  const kindId = nextId('ck');
  const fromId = nextId('cf');
  const toId = nextId('ct');
  const kind = selectControl({ id: kindId, options: CONNECTION_KINDS.map((k) => ({ value: k.id, label: k.label })), value: 'power' });
  const fromSel = h('select', { id: fromId, class: 'select' });
  const toSel = h('select', { id: toId, class: 'select' }, items.map((i) => h('option', { value: i.id }, i.name)));
  const fillFrom = () => {
    const supplyOnly = kind.value === 'power';
    const options = items.filter((i) => !supplyOnly || canSupply(i));
    fromSel.replaceChildren(...options.map((i) => h('option', { value: i.id }, i.name)));
  };
  kind.addEventListener('change', fillFrom);
  fillFrom();
  const error = h('p', { class: 'field__error', role: 'alert' });
  const add = button({
    label: 'Connect',
    icon: 'plus',
    variant: 'primary',
    onClick: () => {
      error.textContent = '';
      if (!fromSel.value || !toSel.value) return (error.textContent = kind.value === 'power' ? 'Add a battery, regulator or flight controller with an output first.' : 'Add at least two components first.');
      if (fromSel.value === toSel.value) return (error.textContent = 'Choose two different components.');
      const current = components(store);
      if (current.connections.some((c) => c.kind === kind.value && ((c.from === fromSel.value && c.to === toSel.value) || (c.kind !== 'power' && c.from === toSel.value && c.to === fromSel.value)))) return (error.textContent = 'These two are already connected this way.');
      if (current.connections.length >= LIMITS.connections) return (error.textContent = `At most ${LIMITS.connections} connections.`);
      setComponents(store, { ...current, connections: [...current.connections, createConnection({ kind: kind.value, from: fromSel.value, to: toSel.value })] }, `Connect ${name(fromSel.value)} → ${name(toSel.value)}`);
    },
  });
  const table = connections.length
    ? h(
        'table',
        { class: 'table table--compact' },
        h('thead', null, h('tr', null, h('th', null, 'Type'), h('th', null, 'From'), h('th', null, 'To'), h('th', null, h('span', { class: 'visually-hidden' }, 'Actions')))),
        h(
          'tbody',
          null,
          connections.map((c) =>
            h(
              'tr',
              { dataset: { connection: c.id } },
              h('td', null, h('span', { class: `link-swatch link-swatch--${c.kind}` }), LINK_STYLES[c.kind]?.label ?? c.kind),
              h('td', null, name(c.from)),
              h('td', null, name(c.to)),
              h('td', { class: 'table__actions' }, button({ label: 'Remove', size: 'sm', ariaLabel: `Remove connection ${name(c.from)} to ${name(c.to)}`, onClick: () => setComponents(store, { ...components(store), connections: components(store).connections.filter((x) => x.id !== c.id) }, 'Remove connection') })),
            ),
          ),
        ),
      )
    : h('p', { class: 'muted' }, 'No connections yet.');
  return card({
    title: 'Connections',
    icon: 'layers',
    class: 'span-2',
    description: 'Power runs from the supplying component to the consumer. Data links run from the flight controller (or companion computer) to the device.',
    body: h('div', { class: 'stack' }, h('div', { class: 'connect-form' }, field({ id: kindId, label: 'Connection', control: kind }), field({ id: fromId, label: 'From', control: fromSel }), field({ id: toId, label: 'To', control: toSel }), h('div', { class: 'connect-form__button' }, add)), error, table),
  });
}

// ---- Budget and review ------------------------------------------------------------------------

function budgetCard(ctx, analysis) {
  const { items } = components(ctx.store);
  const name = (id) => items.find((i) => i.id === id)?.name ?? '?';
  const rows = analysis.rails.filter((r) => r.rail);
  return card({
    title: 'Power budget',
    icon: 'battery',
    class: 'span-2',
    description: 'Worst case: every component at its maximum current at once. Converter input currents use the lowest input voltage.',
    body: h(
      'div',
      { class: 'stack' },
      rows.length
        ? h(
            'table',
            { class: 'table table--compact budget-table' },
            h('thead', null, h('tr', null, h('th', null, 'Supply'), h('th', null, 'Voltage'), h('th', null, 'Load'), h('th', null, 'Rating'), h('th', null, 'Use'), h('th', null, 'Feeds'))),
            h(
              'tbody',
              null,
              rows.map((r) =>
                h(
                  'tr',
                  null,
                  h('th', { scope: 'row' }, r.name),
                  h('td', { class: 'mono' }, r.rail.min === r.rail.max ? `${r.rail.min.toFixed(2)} V` : `${r.rail.min.toFixed(1)}–${r.rail.max.toFixed(1)} V`),
                  h('td', { class: 'mono' }, formatQuantity(r.load, 'A', r.load < 1 ? 'mA' : 'A')),
                  h('td', { class: 'mono' }, r.rating === null ? '—' : formatQuantity(r.rating, 'A', 'A')),
                  h('td', null, r.utilisation === null ? '—' : h('div', { class: ['budget-use', r.utilisation > 1 ? 'budget-use--over' : r.utilisation > 0.8 ? 'budget-use--high' : null] }, progressBar(Math.min(r.utilisation, 1) * 100, 100, { label: `${r.name} utilisation` }), h('span', { class: 'mono' }, `${Math.round(r.utilisation * 100)} %`))),
                  h('td', null, r.consumers.map(name).join(', ') || '—'),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'Add a battery and connect power to see the budget.'),
      derivedList(analysis.derived, ctx.prefs),
    ),
  });
}

function reviewCard(ctx, analysis) {
  return card({
    title: 'Compatibility checks',
    icon: 'checkCircle',
    class: 'span-2',
    description: 'Each finding names the rule, the numbers that triggered it and how to fix it.',
    body: analysis.checks.length ? h('div', { class: 'check-list' }, analysis.checks.map((check) => checkCard(check, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No compatibility problems found.'),
  });
}

export async function mount(container, ctx) {
  const { store } = ctx;
  let structureKey = null;
  let editors = null;
  let dynamic = null;
  const open = new Set();

  const header = () =>
    pageHeader({
      title: 'Avionics Laboratory',
      icon: 'chip',
      subtitle: 'Choose the electronics, connect power and data, and check voltages, currents, ports and logic levels.',
      badges: [badge('Build 3', 'neutral')],
    });

  const keyOf = () => components(store).items.map((i) => `${i.id}:${i.type}`).join('|');

  const renderEditors = () => {
    if (!editors) return;
    editors.querySelectorAll('details[open]').forEach((d) => open.add(d.dataset.component));
    const { items } = components(store);
    const analysis = ctx.engineering.electrical();
    const severity = severityMap(analysis);
    editors.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const el = componentEditor(ctx, item, severity.get(item.id));
            if (open.has(item.id)) el.open = true;
            el.addEventListener('toggle', () => (el.open ? open.add(item.id) : open.delete(item.id)));
            return el;
          })
        : [h('p', { class: 'muted' }, 'No components yet.')]),
    );
  };

  const renderDynamic = () => {
    if (!dynamic) return;
    const data = components(store);
    const analysis = ctx.engineering.electrical();
    const rails = new Map(analysis.rails.filter((r) => r.rail).map((r) => [r.id, r.rail]));
    dynamic.diagram.replaceChildren(
      data.items.length ? drawBlockDiagram(data, { severityById: severityMap(analysis), rails }) : h('p', { class: 'muted' }, 'The diagram appears when you add components.'),
      h('ul', { class: 'bd-legend' }, Object.entries(LINK_STYLES).map(([kind, style]) => h('li', null, h('span', { class: `link-swatch link-swatch--${kind}` }), style.label))),
    );
    dynamic.connections.replaceChildren(connectionsCard(ctx));
    dynamic.budget.replaceChildren(budgetCard(ctx, analysis));
    dynamic.review.replaceChildren(reviewCard(ctx, analysis));
  };

  const build = () => {
    const doc = store.doc;
    if (!doc) {
      editors = null;
      dynamic = null;
      container.replaceChildren(
        header(),
        flowBar(ctx, 'avionics'),
        emptyState({
          icon: 'chip',
          title: 'Open a project to design its avionics',
          message: 'Components and connections belong to a project.',
          actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() }), button({ label: 'All projects', onClick: () => ctx.router.navigate('projects') })],
        }),
      );
      return;
    }
    structureKey = keyOf();
    const data = components(store);
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      button({ label: 'Add from library', icon: 'component', variant: 'primary', onClick: () => libraryDialog(ctx) }),
      button({ label: 'Add your own component', icon: 'plus', onClick: () => customComponentDialog(ctx) }),
      data.items.length
        ? null
        : button({
            label: 'Add example quadcopter set',
            icon: 'multirotor',
            onClick: () => {
              const set = exampleQuadSet({ createComponent, createConnection });
              setComponents(store, set, 'Add example avionics set');
              ctx.notify({ level: 'info', title: 'Example set added', message: 'Seven illustrative components, already connected. Replace their values with your own datasheets.' });
            },
          }),
    );
    editors = h('div', { class: 'component-list' });
    dynamic = { diagram: h('div', { class: 'bd-wrap' }), connections: h('div', { class: 'span-2' }), budget: h('div', { class: 'span-2' }), review: h('div', { class: 'span-2' }) };
    container.replaceChildren(
      header(),
      flowBar(ctx, 'avionics'),
      h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'Library parts are illustrative examples with typical values, not real products. Enter datasheet values and their source for the parts you actually use.')),
      toolbar,
      h(
        'div',
        { class: 'page-grid avionics-grid' },
        card({ title: 'Block diagram', icon: 'layers', class: 'span-2', description: 'Generated from your components and connections. Red outline: a problem to fix.', body: dynamic.diagram }),
        card({ title: `Components (${data.items.length})`, icon: 'component', class: 'span-2', description: 'Open a component to edit its values, data source and ports.', body: editors }),
        dynamic.connections,
        dynamic.budget,
        dynamic.review,
      ),
    );
    renderEditors();
    renderDynamic();
  };

  const refresh = debounce(() => renderDynamic(), 60);
  build();
  const offs = [
    store.on('change', ({ undo, redo }) => {
      if (!store.doc) return build();
      if (keyOf() !== structureKey) return build();
      if (undo || redo) renderEditors();
      refresh();
    }),
    store.on('load', () => build()),
  ];
  return () => offs.forEach((off) => off());
}

function severityMap(analysis) {
  const rank = { error: 0, warning: 1, info: 2 };
  const map = new Map();
  for (const check of analysis.checks) {
    for (const id of check.components ?? []) {
      if (!map.has(id) || rank[check.severity] < rank[map.get(id)]) map.set(id, check.severity);
    }
  }
  return map;
}
