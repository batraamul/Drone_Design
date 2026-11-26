/**
 * Mass & Balance (Build 6): place every part, see the CG and inertia, balance the aircraft.
 * Data: project.modules.massProperties. Model: js/engineering/mass-properties.js.
 *
 * Parts can be dragged on the top and side views or typed in the table. Structure, motors
 * and propellers follow the layout and are not movable here.
 */
import { h, s as svg, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, formatQuantity, pageHeader } from '../ui/components.js';
import { drawView, viewTransform } from '../visualisation/views2d.js';
import { balancedX } from '../engineering/mass-properties.js';
import { flowBar } from '../ui/design-flow.js';

const PATH = ['modules', 'massProperties'];
let refocus = null;
const PLANE = {
  top: { u: (p) => p.y, v: (p) => p.x, set: (p, u, v) => ({ ...p, y: u, x: v }) },
  side: { u: (p) => -p.x, v: (p) => p.z, set: (p, u, v) => ({ ...p, x: -u, z: v }) },
};

function setPlacement(ctx, item, position, label) {
  const round = (v) => Math.round(v * 1000) / 1000;
  const p = { x: round(position.x), y: round(position.y), z: round(position.z) };
  if (item.id === 'payload-target') ctx.store.set([...PATH, 'payload'], p, { label, coalesce: false });
  else ctx.store.set([...PATH, 'placements', item.componentId], p, { label, coalesce: false });
}

/** One draggable view (top or side). */
function balanceView(ctx, mp, geo, view, aero) {
  const markers = [mp.cg, ...mp.items.map((i) => i.position)];
  const t = viewTransform(geo, view, markers);
  const maxMass = Math.max(...mp.items.map((i) => i.mass), 1e-6);
  let drag = null;
  const overlay = ({ project }) => {
    const out = [];
    for (const it of mp.items) {
      if (!it.movable && it.group !== 'Propulsion') continue;
      const [x, y] = project(it.position);
      const r = 3 + 7 * Math.sqrt(it.mass / maxMass);
      const dot = svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(1), class: ['bal__dot', it.movable ? 'bal__dot--movable' : null, it.auto ? 'bal__dot--auto' : null], dataset: { item: it.id }, tabindex: it.movable ? '0' : null, role: it.movable ? 'button' : null, 'aria-label': `${it.label}, ${formatQuantity(it.mass, 'kg', 'g', { digits: 3 })}${it.movable ? ' — drag to move' : ''}` }, svg('title', null, `${it.label} — ${formatQuantity(it.mass, 'kg', it.mass < 1 ? 'g' : 'kg', { digits: 3 })}`));
      out.push(dot);
    }
    const ref = mp.thrustCentre ?? (aero?.model ? { x: -aero.model.stability.xNp, y: 0, z: mp.cg.z } : null);
    if (ref) {
      const [x, y] = project(ref);
      out.push(svg('g', { class: 'bal__ref' }, svg('path', { d: `M${x - 7} ${y}h14M${x} ${y - 7}v14` }), svg('text', { x: x + 8, y: y - 6 }, mp.thrustCentre ? 'thrust centre' : 'NP')));
    }
    const [cx, cy] = project(mp.cg);
    out.push(svg('g', { class: 'bal__cg', 'aria-label': 'Centre of gravity' }, svg('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 8 }), svg('path', { d: `M${cx - 8} ${cy}h16M${cx} ${cy - 8}v16` }), svg('text', { x: cx + 10, y: cy + 14 }, 'CG')));
    return out;
  };
  const el = drawView(geo, view, { overlay, extra: markers });
  el.classList.add('bal__view');
  const toSvg = (e) => {
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = el.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  };
  el.addEventListener('pointerdown', (e) => {
    const target = e.target.closest?.('.bal__dot--movable');
    if (!target) return;
    const item = mp.items.find((i) => i.id === target.dataset.item);
    if (!item) return;
    drag = { item, target, pos: { ...item.position } };
    target.setPointerCapture(e.pointerId);
    target.classList.add('bal__dot--drag');
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toSvg(e);
    const [u, v] = t.unmap([p.x, p.y]);
    drag.pos = PLANE[view].set(drag.pos, u, v);
    const [x, y] = t.project(drag.pos);
    drag.target.setAttribute('cx', x.toFixed(1));
    drag.target.setAttribute('cy', y.toFixed(1));
  });
  const end = () => {
    if (!drag) return;
    const { item, pos } = drag;
    drag = null;
    setPlacement(ctx, item, pos, `Move ${item.label}`);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const target = e.target.closest?.('.bal__dot--movable');
    if (!target) return;
    const item = mp.items.find((i) => i.id === target.dataset.item);
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!item || !d) return;
    e.preventDefault();
    refocus = { view, item: item.id };
    const P = PLANE[view];
    setPlacement(ctx, item, P.set(item.position, P.u(item.position) + d[0], P.v(item.position) + d[1]), `Nudge ${item.label}`);
  });
  return h('figure', { class: 'bal__figure' }, el, h('figcaption', { class: 'muted' }, view === 'top' ? 'Top view (nose up the page)' : 'Side view (nose to the left)'));
}

function numberCell(ctx, item, key, sign, label) {
  const v = sign * item.position[key] * 1000;
  const input = h('input', { class: 'input input--num mono bal__in', type: 'text', inputmode: 'decimal', value: v.toFixed(0), 'aria-label': `${item.label}: ${label} (mm)` });
  input.addEventListener('change', () => {
    const n = Number(input.value.replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) > 50000) {
      input.classList.add('is-invalid');
      return;
    }
    setPlacement(ctx, item, { ...item.position, [key]: (sign * n) / 1000 }, `Place ${item.label}`);
  });
  return h('td', null, input);
}

function itemsTable(ctx, mp, winged) {
  const xLabel = winged ? 'Behind nose' : 'Forward';
  const sx = winged ? -1 : 1;
  const rows = mp.items.map((it) =>
    h(
      'tr',
      { dataset: { item: it.id } },
      h('th', { scope: 'row' }, it.label, it.balanced ? h('span', { class: 'muted' }, ' · balancing') : it.movable && it.auto ? h('span', { class: 'muted' }, ' · default place') : null),
      h('td', { class: 'muted' }, it.group),
      h('td', { class: 'mono num' }, formatQuantity(it.mass, 'kg', 'g', { digits: 4 })),
      ...(it.movable
        ? [numberCell(ctx, it, 'x', sx, xLabel), numberCell(ctx, it, 'y', 1, 'Sideways'), numberCell(ctx, it, 'z', 1, 'Up')]
        : ['x', 'y', 'z'].map((k) => h('td', { class: 'mono num muted' }, ((k === 'x' ? sx : 1) * it.position[k] * 1000).toFixed(0)))),
    ),
  );
  return h('div', { class: 'table-scroll' }, h('table', { class: 'table table--compact bal__table' }, h('thead', null, h('tr', null, ['Part', 'Group', 'Mass', `${xLabel} (mm)`, 'Sideways (mm)', 'Up (mm)'].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', null, rows)));
}

function stat(label, value, unit, display, tone) {
  return h('div', { class: ['stat', tone ? `stat--${tone}` : null] }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value mono' }, value === null || value === undefined || !Number.isFinite(value) ? '—' : formatQuantity(value, unit, display, { digits: 3 })));
}

function balanceAction(ctx, mp, geo, aero) {
  const batteries = mp.items.filter((i) => i.type === 'battery');
  if (!batteries.length) return null;
  return button({
    label: 'Balance with the battery',
    icon: 'scale',
    variant: 'primary',
    onClick: () => {
      let target;
      if (geo.wing && aero?.model && geo.fuselage?.length > 0) {
        const tx = -(aero.model.stability.xNp - 0.1 * aero.model.mac);
        const x = balancedX(mp.items, batteries, tx, [-0.9 * geo.fuselage.length, -0.03 * geo.fuselage.length]);
        target = (b) => ({ ...b.position, x: x.value, y: 0 });
        if (!x.reached) ctx.notify({ level: 'warning', title: 'Battery at the end of its travel', message: 'The battery alone cannot reach a 10 % static margin; it is placed as far as the fuselage allows.' });
      } else if (mp.thrustCentre) {
        const total = mp.mass;
        const mb = batteries.reduce((sum, b) => sum + b.mass, 0);
        const others = (k) => mp.items.filter((i) => !batteries.includes(i)).reduce((sum, i) => sum + i.mass * i.position[k], 0);
        const x = (mp.thrustCentre.x * total - others('x')) / mb;
        const y = (mp.thrustCentre.y * total - others('y')) / mb;
        target = (b) => ({ ...b.position, x, y });
      } else return;
      ctx.store.transact('Balance with the battery', (set) => {
        for (const b of batteries) if (b.componentId) set([...PATH, 'placements', b.componentId], target(b));
      });
      ctx.notify({ level: 'success', title: 'Balanced', message: geo.wing ? 'The battery now gives a 10 % static margin.' : 'The CG is now over the centre of the rotors.' });
    },
  });
}

export async function mount(container, ctx) {
  const { store } = ctx;
  const header = () => pageHeader({ title: 'Mass & Balance', icon: 'scale', subtitle: 'Where every gram sits: the centre of gravity, the inertia, and how to balance the aircraft.', badges: [badge('Build 6', 'neutral'), badge('Concept estimate', 'info')] });
  const render = () => {
    if (!store.doc) {
      container.replaceChildren(header(), flowBar(ctx, 'balance'), emptyState({ icon: 'scale', title: 'Open a project first', message: 'Balance is worked out from a project’s parts, motors and structure.', actions: [button({ label: 'Start from an example', icon: 'copy', variant: 'primary', onClick: () => ctx.actions.newFromExample() })] }));
      return;
    }
    const geo = ctx.engineering.geometry();
    const mp = ctx.engineering.massProperties();
    const aero = ctx.engineering.aerodynamics();
    if (!geo || !mp || !(mp.mass > 0)) {
      container.replaceChildren(header(), flowBar(ctx, 'balance'), h('div', { class: 'notice notice--info', role: 'status' }, icon('info', { size: 18 }), h('p', null, 'Add a battery and parts in the Avionics Laboratory and choose a motor in Propulsion & Energy first.')));
      return;
    }
    const winged = Boolean(geo.wing);
    const sm = aero?.model?.stability;
    const stats = h(
      'div',
      { class: 'stat-grid' },
      stat('Total mass', mp.mass, 'kg', mp.mass < 1 ? 'g' : 'kg', 'accent'),
      stat(winged ? 'CG behind the nose' : 'CG forward of centre', winged ? -mp.cg.x : mp.cg.x, 'm', 'mm'),
      stat('CG sideways', mp.cg.y, 'm', 'mm', Math.abs(mp.cg.y) > 0.005 ? 'warn' : null),
      stat('CG height', mp.cg.z, 'm', 'mm'),
      sm ? stat('Static margin', sm.staticMargin, '1', '%', sm.staticMargin < 0.05 ? 'warn' : null) : null,
      mp.hover ? stat('Busiest rotor vs. mean', mp.hover.maxRatio, '1', '%', mp.hover.maxRatio > 1.1 ? 'warn' : null) : null,
      stat('Roll inertia I_xx', mp.inertia[0][0], 'kg·m²', 'kg·m²'),
      stat('Pitch inertia I_yy', mp.inertia[1][1], 'kg·m²', 'kg·m²'),
      stat('Yaw inertia I_zz', mp.inertia[2][2], 'kg·m²', 'kg·m²'),
    );
    const reset = button({ label: 'Reset all to default places', icon: 'history', disabled: !Object.keys(store.doc.modules.massProperties?.placements ?? {}).length && !store.doc.modules.massProperties?.payload, onClick: () => store.set(PATH, { placements: {}, payload: null }, { label: 'Reset part placements', coalesce: false }) });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'balance'),
      h(
        'div',
        { class: 'page-grid' },
        card({ title: 'Balance', icon: 'scale', class: 'span-2', description: winged ? 'Cross = neutral point (NP). Keep the CG ahead of it: 5–15 % of the mean chord.' : 'Cross = centre of the rotors. Keep the CG right over it so every motor works equally.', actions: [balanceAction(ctx, mp, geo, aero), reset].filter(Boolean), body: h('div', { class: 'stack' }, stats, h('div', { class: 'bal__views' }, balanceView(ctx, mp, geo, 'top', aero), balanceView(ctx, mp, geo, 'side', aero)), h('p', { class: 'muted bal__hint' }, icon('info', { size: 14 }), ' Drag a part (filled dots) to move it, or select it and use the arrow keys (Shift = 50 mm). Hollow dots are motors. Dot size shows mass.')) }),
        card({ title: 'Parts and positions', icon: 'layers', class: 'span-2', description: 'The same parts as the mass budget. Type positions in millimetres; structure, motors and propellers follow the layout.', body: itemsTable(ctx, mp, winged) }),
        card({
          title: 'Checks and calculations',
          icon: 'checkCircle',
          class: 'span-2',
          body: h(
            'div',
            { class: 'stack' },
            mp.checks.length ? h('div', { class: 'check-list' }, mp.checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'Balanced: no problems found.'),
            mp.notes.length ? h('ul', { class: 'scope-list' }, mp.notes.map((n) => h('li', null, n))) : null,
            derivedList(mp.derived, ctx.prefs),
          ),
        }),
      ),
    );
  };
  const renderKeepFocus = () => {
    render();
    if (refocus) {
      container.querySelector(`svg[data-view="${refocus.view}"] [data-item="${CSS.escape(refocus.item)}"]`)?.focus();
      refocus = null;
    }
  };
  const refresh = debounce(renderKeepFocus, 60);
  render();
  const offs = [store.on('change', refresh), store.on('load', render)];
  return () => offs.forEach((off) => off());
}
