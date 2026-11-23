/**
 * Drone Architecture (Build 2): choose the aircraft layout, set its key geometric
 * parameters, and see the top, front and side views and the geometry review update
 * as you type. Everything is stored in project.modules.configuration (SI units).
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, pageHeader, provenanceBadge, quantityInput, selectControl } from '../ui/components.js';
import { PROJECT_CATEGORIES, categoryInfo } from '../project-schema.js';
import { PROPULSION_OPTIONS, defaultConfiguration, layoutInfo, layoutsFor, paramsFor, switchLayout, validateConsistency, validateParamValue } from '../engineering/configuration.js';
import { VIEW_LABELS, drawView } from '../visualisation/views2d.js';
import { changeCategory } from './projects.js';
import { flowBar } from '../ui/design-flow.js';

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${(idCounter += 1)}`;

function noProject(ctx) {
  return emptyState({
    icon: 'multirotor',
    title: 'Open a project to design its architecture',
    message: 'The layout and geometry belong to a project. Create one, or open an existing project, then come back here.',
    actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() }), button({ label: 'All projects', onClick: () => ctx.router.navigate('projects') })],
  });
}

function layoutPicker(ctx, doc) {
  const { store } = ctx;
  const configuration = doc.modules.configuration;
  const group = nextId('layout');
  const list = h(
    'div',
    { class: 'choice-grid choice-grid--wide', role: 'radiogroup', 'aria-label': 'Aircraft layout' },
    layoutsFor(doc.category).map((layout) =>
      h(
        'label',
        { class: 'choice choice--plain', dataset: { layout: layout.id } },
        h('input', { type: 'radio', name: group, value: layout.id, checked: layout.id === configuration?.layout }),
        h('span', { class: 'choice__title' }, layout.label),
        h('span', { class: 'choice__text' }, layout.summary),
        layout.family === 'none' ? h('span', { class: 'choice__tag' }, 'Recorded only — no geometry model yet') : null,
      ),
    ),
  );
  list.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== group) return;
    store.set(['modules', 'configuration'], switchLayout(store.doc.modules.configuration, target.value), { label: `Choose layout: ${layoutInfo(target.value).label}`, coalesce: false });
  });
  const categorySelect = selectControl({
    id: nextId('cat'),
    options: PROJECT_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
    value: doc.category,
    onChange: (value) => changeCategory(store, value),
  });
  return card({
    title: '1. Aircraft type and layout',
    icon: 'multirotor',
    class: 'span-2',
    description: 'Pick the family, then the layout. Switching layout keeps every value that still applies.',
    body: h('div', { class: 'stack' }, field({ label: 'Aircraft category', control: categorySelect, hint: categoryInfo(doc.category)?.summary }), list),
  });
}

export function parameterForm(ctx, doc, { title = '2. Key parameters' } = {}) {
  const { store, prefs } = ctx;
  const configuration = doc.modules.configuration;
  const layout = layoutInfo(configuration.layout);
  const controls = new Map();
  const rows = [];
  if (layout.propulsion) {
    const sel = selectControl({
      id: nextId('prop'),
      options: PROPULSION_OPTIONS.map((o) => ({ value: o.id, label: o.label })),
      value: configuration.options?.propulsion ?? 'tractor',
      onChange: (value) => store.set(['modules', 'configuration', 'options', 'propulsion'], value, { label: 'Change propulsion arrangement' }),
    });
    rows.push(h('div', { class: 'requirement' }, field({ label: 'Cruise propulsion', control: sel, hint: 'Where the cruise propeller sits.' }), h('span', { class: 'requirement__badge' }, provenanceBadge('user-input'))));
  }
  for (const def of paramsFor(layout.id)) {
    const id = nextId('cfg');
    const control = quantityInput({
      id,
      label: def.label,
      siUnit: def.unit,
      units: def.displayUnits,
      unit: prefs.displayUnit(`cfg.${def.key}`, def.displayUnits[0]),
      valueSI: configuration.params[def.key] ?? null,
      validate: (si) => {
        if (si === null) return 'A value is needed for this layout';
        const message = validateParamValue(def.key, si);
        if (message) return message;
        const trial = { ...store.doc.modules.configuration, params: { ...store.doc.modules.configuration.params, [def.key]: si } };
        return validateConsistency(trial).find((e) => e.path === `params.${def.key}` || e.path === 'params.wingPosition')?.message ?? null;
      },
      onCommit: (si) => store.set(['modules', 'configuration', 'params', def.key], si, { label: `Set ${def.label}` }),
      onUnitChange: (unit) => prefs.setDisplayUnit(`cfg.${def.key}`, unit),
    });
    controls.set(def.key, control);
    rows.push(h('div', { class: 'requirement', dataset: { param: def.key } }, field({ id, label: `${def.label} (${def.symbol})`, control: control.element, hint: def.help }), h('span', { class: 'requirement__badge' }, provenanceBadge('user-input'))));
  }
  const reset = button({
    label: 'Reset to example values',
    icon: 'undo',
    size: 'sm',
    onClick: () => store.set(['modules', 'configuration'], { ...defaultConfiguration(layout.id) }, { label: 'Reset configuration', coalesce: false }),
  });
  const element = card({
    title,
    icon: 'sliders',
    class: 'span-2',
    actions: [reset],
    description: `${layout.label}. Enter values in any unit; they are stored in SI. The starting values are illustrative examples, not data about a real aircraft.`,
    body: h('div', { class: 'requirement-list' }, rows),
  });
  return {
    element,
    sync: ({ force } = {}) => {
      const params = store.doc.modules.configuration.params;
      for (const [key, control] of controls) control.update(params[key] ?? null, { force });
    },
  };
}

function viewsCard() {
  const holder = h('div', { class: 'views2d' });
  const element = card({ title: '3. Drawings', icon: 'layers', class: 'span-2', description: 'Top, front and side views drawn to scale from your parameters. They redraw as you type.', body: holder });
  return {
    element,
    render(geo) {
      holder.replaceChildren(...['top', 'front', 'side'].map((view) => h('figure', { class: 'view2d-figure' }, drawView(geo, view), h('figcaption', null, VIEW_LABELS[view]))));
    },
  };
}

function reviewCard(prefs) {
  const body = h('div', { class: 'stack' });
  const element = card({ title: '4. Geometry review', icon: 'checkCircle', class: 'span-2', description: 'Calculated from the drawing. Each value shows its equation and how much to trust it.', body });
  return {
    element,
    render(geo) {
      const problems = geo.checks;
      body.replaceChildren(
        ...[
        problems.length ? h('div', { class: 'check-list' }, problems.map((check) => checkCard(check, prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No geometry problems found.'),
        geo.notes?.length ? h('ul', { class: 'scope-list' }, geo.notes.map((note) => h('li', null, note))) : null,
        h('h3', { class: 'subheading' }, 'Derived geometry'),
        derivedList(geo.derived, prefs),
        ].filter(Boolean),
      );
    },
  };
}

export async function mount(container, ctx) {
  const { store, prefs } = ctx;
  let form = null;
  let views = null;
  let review = null;
  let renderedLayout = null;
  let renderedCategory = null;

  const header = () =>
    pageHeader({
      title: 'Drone Architecture',
      icon: 'multirotor',
      subtitle: 'Choose the layout and set the key dimensions. Drawings and geometry checks update as you type.',
      badges: [badge('Build 2', 'neutral')],
    });

  const build = () => {
    const doc = store.doc;
    if (!doc) {
      container.replaceChildren(header(), flowBar(ctx, 'architecture'), noProject(ctx));
      renderedLayout = null;
      return;
    }
    const configuration = doc.modules.configuration;
    const layout = layoutInfo(configuration?.layout);
    renderedLayout = configuration?.layout ?? null;
    renderedCategory = doc.category;
    form = null;
    views = null;
    review = null;
    const blocks = [layoutPicker(ctx, doc)];
    if (layout && layout.category !== doc.category) {
      blocks.push(
        h('div', { class: 'notice notice--warning span-2', role: 'status' }, icon('warning', { size: 18 }), h('p', null, `The saved layout (${layout.label}) belongs to another category. Choose a ${categoryInfo(doc.category)?.label ?? ''} layout above to continue.`)),
      );
    } else if (layout?.family === 'none') {
      blocks.push(h('div', { class: 'notice notice--info span-2', role: 'note' }, icon('info', { size: 18 }), h('p', null, `${layout.label}: the layout is recorded in the project, but AEROLAB X has no geometry model for it yet, so there are no drawings or calculations. ${layout.summary}`)));
    } else if (layout) {
      form = parameterForm(ctx, doc);
      views = viewsCard();
      review = reviewCard(prefs);
      blocks.push(form.element, views.element, review.element);
    }
    container.replaceChildren(header(), flowBar(ctx, 'architecture'), h('div', { class: 'page-grid architecture-grid' }, blocks));
    redraw();
  };

  const redraw = () => {
    if (!views) return;
    const geo = ctx.engineering.geometry();
    if (!geo) return;
    views.render(geo);
    review.render(geo);
  };

  build();
  const offs = [
    store.on('change', ({ undo, redo }) => {
      const doc = store.doc;
      if (!doc) return build();
      if (doc.modules.configuration?.layout !== renderedLayout || doc.category !== renderedCategory) return build();
      form?.sync({ force: undo || redo });
      redraw();
    }),
    store.on('load', () => build()),
  ];
  return () => offs.forEach((off) => off());
}
