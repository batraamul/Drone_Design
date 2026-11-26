/**
 * Design Summary: one page that pulls the whole design together.
 *  - status of every design-flow step and the open problems;
 *  - a printable build sheet (targets, layout, parts list, propulsion, mass, endurance, mission);
 *  - key results with provenance, and guidance for a journal paper or patent filing.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, emptyState, formatQuantity, pageHeader, provenanceBadge } from '../ui/components.js';
import { REQUIREMENT_FIELDS } from '../engineering/requirements.js';
import { layoutInfo, paramsFor } from '../engineering/configuration.js';
import { componentType } from '../engineering/components.js';
import { drawView } from '../visualisation/views2d.js';
import { flowOverview } from '../ui/design-flow.js';
import { downloadText } from '../utils/file.js';

const fmt = (value, unit, display, digits = 4) => (value === null || value === undefined ? '—' : formatQuantity(value, unit, display, { digits }));

/** Parts list rows: components, motors, propellers. */
export function partsList(doc, geometry) {
  const rows = (doc.modules.components?.items ?? []).map((i) => ({ item: i.name, type: componentType(i.type)?.label ?? i.type, quantity: i.quantity ?? 1, unitMass: i.specs.mass ?? 0, provenance: i.provenance, source: i.source }));
  const n = geometry?.rotors?.length ?? 0;
  const p = doc.modules.propulsion;
  if (n && p) {
    rows.push({ item: p.motor.name, type: 'Motor', quantity: n, unitMass: p.motor.specs.mass, provenance: p.motor.provenance, source: p.motor.source });
    rows.push({ item: p.propeller.name, type: 'Propeller', quantity: n, unitMass: p.propeller.specs.mass, provenance: p.propeller.provenance, source: p.propeller.source });
  }
  return rows;
}

function partsCsv(rows) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ['Item,Type,Quantity,Unit mass (g),Total mass (g),Data provenance,Source', ...rows.map((r) => [r.item, r.type, r.quantity, (r.unitMass * 1000).toFixed(1), (r.unitMass * r.quantity * 1000).toFixed(1), r.provenance, r.source].map(esc).join(','))].join('\r\n');
}

function table(head, body, cls = 'table table--compact') {
  return h('table', { class: cls }, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, body));
}

export async function mount(container, ctx) {
  const { store } = ctx;
  const render = () => {
    const doc = store.doc;
    if (!doc) {
      container.replaceChildren(pageHeader({ title: 'Design Summary', icon: 'report', subtitle: 'Open a project to see its summary and build sheet.' }), emptyState({ icon: 'report', title: 'No project open', message: 'Create or open a project.', actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => ctx.actions.newProject() })] }));
      return;
    }
    const review = ctx.engineering.evaluate();
    const geo = ctx.engineering.geometry();
    const prop = ctx.engineering.propulsion();
    const sounding = ctx.engineering.sounding();
    const layout = layoutInfo(doc.modules.configuration?.layout);
    const problems = review.checks.filter((c) => c.severity !== 'info');
    const parts = partsList(doc, geo);

    const actions = [
      button({ label: 'Print build sheet', icon: 'report', onClick: () => window.print() }),
      button({ label: 'Parts list (CSV)', icon: 'download', onClick: () => downloadText(`${doc.name.replace(/[^\w-]+/g, '_')}_parts.csv`, partsCsv(parts), 'text/csv') }),
      button({ label: 'Export project (JSON)', icon: 'download', onClick: () => ctx.actions.exportProject?.(doc.id) }),
    ];

    const targets = REQUIREMENT_FIELDS.filter((f) => typeof doc.requirements?.[f.key]?.value === 'number').map((f) => h('tr', null, h('th', { scope: 'row' }, f.label), h('td', { class: 'mono' }, fmt(doc.requirements[f.key].value, f.unit, f.displayUnits?.[0] ?? f.unit))));
    const params = layout && layout.family !== 'none' ? paramsFor(layout.id).map((p) => h('tr', null, h('th', { scope: 'row' }, p.label), h('td', { class: 'mono' }, fmt(doc.modules.configuration.params[p.key], p.unit, p.displayUnits[0])))) : [];
    const totalMass = parts.reduce((s, r) => s + r.unitMass * r.quantity, 0);

    const keyResults = [];
    const pushDerived = (list, ids) => list?.derived?.filter((d) => ids.includes(d.id)).forEach((d) => keyResults.push(d));
    pushDerived(prop, ['pr-mass', 'pr-h-power', 'pr-h-throttle', 'pr-h-tw', 'pr-c-power', 'pr-endurance', 'pr-range']);
    pushDerived(geo, ['geo-mr-wheelbase', 'geo-mr-loading', 'geo-fw-area', 'geo-fw-ar', 'geo-tail-vh']);
    pushDerived(ctx.engineering.aerodynamics(), ['ae-cd0', 'ae-ldmax', 'ae-ld-cruise', 'ae-vs', 'ae-sm']);
    pushDerived(ctx.engineering.structures(), ['st-spar-tube', 'st-spar-ms', 'st-spar-defl', 'st-arm-tube', 'st-arm-ms', 'st-arm-freq']);
    const own = (review.formulas?.derived ?? []);
    pushDerived(sounding, ['sd-burst', 'sd-ascenttime', 'sd-stall-loss', 'sd-maxmach', 'sd-re', 'sd-glide-range', 'sd-pow-range']);

    container.replaceChildren(
      pageHeader({ title: `Design Summary — ${doc.name}`, icon: 'report', subtitle: 'Where the design stands, what to fix, and a build sheet to print or share.', badges: [badge(`Version ${doc.revision}`, 'neutral')], actions }),
      h(
        'div',
        { class: 'page-grid summary-grid' },
        card({ title: 'Design flow', icon: 'roadmap', class: 'span-2 no-print', body: flowOverview(ctx) }),
        card({
          title: `Open problems (${problems.length})`,
          icon: problems.some((c) => c.severity === 'error') ? 'error' : 'checkCircle',
          class: 'span-2',
          body: problems.length
            ? h('ul', { class: 'problem-list' }, problems.map((c) => h('li', { class: `problem-list__item problem-list__item--${c.severity}` }, icon(c.severity === 'error' ? 'error' : 'warning', { size: 14 }), h('strong', null, c.title), h('span', { class: 'muted' }, ` — ${c.id}`))))
            : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No errors or warnings. Remaining notes are information only.'),
        }),
        card({ title: 'Mission and targets', icon: 'tag', body: targets.length ? table(['Target', 'Value'], targets) : h('p', { class: 'muted' }, 'No targets set yet.') }),
        card({
          title: `Layout: ${layout?.label ?? '—'}`,
          icon: 'multirotor',
          body: h('div', { class: 'stack' }, geo ? h('figure', { class: 'view2d-figure' }, drawView(geo, 'top'), h('figcaption', null, 'Top view, to scale')) : null, params.length ? table(['Dimension', 'Value'], params) : null),
        }),
        card({
          title: `Parts list (${parts.length} lines, ${fmt(totalMass, 'kg', totalMass < 1 ? 'g' : 'kg')})`,
          icon: 'component',
          class: 'span-2',
          body: parts.length
            ? table(['Item', 'Type', 'Qty', 'Unit mass', 'Data', 'Source'], parts.map((r) => h('tr', null, h('td', null, r.item), h('td', null, r.type), h('td', { class: 'mono num' }, String(r.quantity)), h('td', { class: 'mono num' }, fmt(r.unitMass, 'kg', 'g')), h('td', null, provenanceBadge(r.provenance)), h('td', { class: 'muted' }, r.source || '—'))))
            : h('p', { class: 'muted' }, 'No parts yet. Add them in the Avionics Laboratory.'),
        }),
        card({
          title: 'Key results (for reports, papers and patents)',
          icon: 'report',
          class: 'span-2',
          description: 'Each value carries the model that produced it and how far to trust it. Cite the model and its assumptions with the number.',
          body: keyResults.length
            ? table(['Quantity', 'Value', 'Model', 'Trust'], keyResults.map((d) => h('tr', null, h('td', null, d.label), h('td', { class: 'mono num' }, fmt(d.value, d.unit, d.displayUnit ?? d.unit)), h('td', null, h('code', null, d.equation)), h('td', null, provenanceBadge(d.provenance)))))
            : h('p', { class: 'muted' }, 'Results appear as you complete the design steps.'),
        }),
        own.length
          ? card({ title: `Your formulas (${own.length})`, icon: 'book', class: 'span-2', description: 'Results of the formulas you added in the Formula Library.', body: table(['Formula', 'Value', 'Expression'], own.map((d) => h('tr', null, h('td', null, d.label), h('td', { class: 'mono num' }, fmt(d.value, d.unit, d.unit)), h('td', null, h('code', null, d.equation))))) })
          : null,
        sounding
          ? card({ title: 'Balloon glide-sonde mission', icon: 'balloon', class: 'span-2', body: table(['Stage', 'Duration', 'Distance'], sounding.stages.map((st) => h('tr', null, h('td', null, st.name), h('td', { class: 'mono' }, fmt(st.duration, 's', st.duration > 3600 ? 'h' : 'min', 3)), h('td', { class: 'mono' }, fmt(st.range, 'm', 'km', 3))))) })
          : null,
        card({
          title: 'Taking it further: paper and patent',
          icon: 'book',
          class: 'span-2 no-print',
          body: h(
            'div',
            { class: 'stack' },
            h('p', null, 'A design becomes publishable when what is new is clear, the models are validated and the results can be reproduced. A patent additionally needs novelty, an inventive step and industrial application, and must be filed before any public disclosure (paper, talk or repository).'),
            h(
              'ol',
              { class: 'scope-list' },
              h('li', null, 'Prior-art search first: Indian patents in InPASS, worldwide in Google Patents and WIPO PATENTSCOPE (links in Learning Centre → Resources).'),
              h('li', null, 'Decide patent or paper first. If patenting, file (a provisional specification is possible in India) before publishing, and clear it with your organisation’s IPR cell.'),
              h('li', null, 'For a journal (for example the Defence Science Journal, IEEE Transactions or IEEE Access): state the problem, the novelty, the models with assumptions (this page’s key results), validation against measurements or published data, and limitations.'),
              h('li', null, 'Export the project JSON and the parts list with the manuscript so reviewers can reproduce the numbers; the Apache-2.0 licence and CITATION.cff make the software citable.'),
            ),
            button({ label: 'Open resources', icon: 'book', size: 'sm', onClick: () => ctx.router.navigate('learning', ['resources']) }),
          ),
        }),
      ),
    );
  };
  render();
  const offs = [store.on('change', ({ record }) => record !== false && render()), store.on('load', render)];
  return () => offs.forEach((off) => off());
}
