/**
 * Component Library (Build 3): browse the illustrative catalogue and the components
 * used in the open project, and add parts to the project.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, formatQuantity, nextId, pageHeader, provenanceBadge, selectControl } from '../ui/components.js';
import { CHEMISTRIES, COMPONENT_TYPES, INTERFACE_KINDS, SPEC_FIELDS, componentType, createComponent } from '../engineering/components.js';
import { CATALOGUE } from '../engineering/catalogue.js';
import { addComponent, customComponentDialog } from './avionics.js';

function specSummary(entry) {
  const t = componentType(entry.type);
  const rows = [];
  for (const key of t.fields) {
    const f = SPEC_FIELDS[key];
    const v = entry.specs?.[key];
    if (v === null || v === undefined) continue;
    let text;
    if (f.kind === 'enum') text = key === 'logicLevel' ? `${v} V` : CHEMISTRIES[v]?.label ?? String(v);
    else if (f.kind === 'boolean') text = v ? 'Yes' : 'No';
    else text = formatQuantity(v, f.unit, f.displayUnits[0], { digits: 4 });
    rows.push([f.label, text]);
  }
  const ports = INTERFACE_KINDS.filter((k) => (entry.interfaces?.[k.id] ?? 0) > 0).map((k) => `${entry.interfaces[k.id]} × ${k.id.toUpperCase()}`);
  if (ports.length) rows.push(['Ports', ports.join(', ')]);
  return h('dl', { class: 'kv kv--compact' }, rows.map(([k, v]) => h('div', { class: 'kv__row' }, h('dt', null, k), h('dd', { class: 'mono' }, v))));
}

export async function mount(container, ctx) {
  const { store } = ctx;
  const state = { type: 'all', query: '' };
  const grid = h('div', { class: 'library-grid' });
  const searchId = nextId('ls');
  const typeId = nextId('lt');
  const search = h('input', { id: searchId, class: 'input', type: 'search', placeholder: 'Search by name or description', autocomplete: 'off' });
  const typeSelect = selectControl({ id: typeId, options: [{ value: 'all', label: 'All types' }, ...COMPONENT_TYPES.map((t) => ({ value: t.id, label: t.label }))], value: 'all', onChange: (v) => { state.type = v; render(); } });
  search.addEventListener('input', () => { state.query = search.value.trim().toLowerCase(); render(); });

  const render = () => {
    const hasProject = Boolean(store.doc);
    const used = new Set((store.doc?.modules?.components?.items ?? []).map((i) => i.catalogueId).filter(Boolean));
    const entries = CATALOGUE.filter((e) => (state.type === 'all' || e.type === state.type) && (!state.query || `${e.name} ${e.summary}`.toLowerCase().includes(state.query)));
    grid.replaceChildren(
      ...(entries.length
        ? entries.map((entry) =>
            card({
              title: entry.name,
              icon: 'component',
              headingLevel: 3,
              class: 'library-card',
              description: entry.summary,
              actions: [provenanceBadge('illustrative')],
              body: h(
                'div',
                { class: 'stack' },
                h('p', { class: 'muted' }, componentType(entry.type).label, used.has(entry.catalogueId) ? ' · ' : null, used.has(entry.catalogueId) ? badge('In this project', 'info') : null),
                specSummary(entry),
                button({
                  label: hasProject ? 'Add to project' : 'Open a project to add',
                  icon: 'plus',
                  size: 'sm',
                  variant: hasProject ? 'primary' : undefined,
                  disabled: !hasProject,
                  dataset: { add: entry.catalogueId },
                  onClick: () => {
                    if (addComponent(ctx, createComponent({ catalogueEntry: entry }))) ctx.notify({ level: 'success', title: `Added ${entry.name}`, message: 'Connect it in the Avionics Laboratory.' });
                  },
                }),
              ),
            }),
          )
        : [h('p', { class: 'muted' }, 'Nothing matches the search.')]),
    );
  };

  container.replaceChildren(
    pageHeader({ title: 'Component Library', icon: 'component', subtitle: 'Parts you can add to a project. Every entry shows where its numbers come from.', badges: [badge('Build 3', 'neutral')] }),
    h(
      'div',
      { class: 'notice notice--warning', role: 'note' },
      icon('warning', { size: 18 }),
      h('p', null, h('strong', null, 'Illustrative examples, not products. '), 'These entries use typical, rounded values so you can learn the tools. AEROLAB X does not invent manufacturer data: for a real design, add your own components with datasheet values and record the datasheet as the source.'),
    ),
    h('div', { class: 'toolbar' }, h('div', { class: 'toolbar__fields' }, h('label', { class: 'visually-hidden', for: searchId }, 'Search components'), search, h('label', { class: 'visually-hidden', for: typeId }, 'Component type'), typeSelect), button({ label: 'Add your own component', icon: 'plus', onClick: () => (store.doc ? customComponentDialog(ctx) : ctx.actions.newProject()) }), button({ label: 'Open Avionics Laboratory', icon: 'chip', onClick: () => ctx.router.navigate('avionics') })),
    grid,
  );
  render();
  const offs = [store.on('load', render), store.on('change', ({ record }) => record && render())];
  return () => offs.forEach((off) => off());
}
