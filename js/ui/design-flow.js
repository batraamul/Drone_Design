/**
 * The design flow: one ordered path through AEROLAB X so each page leads to the next.
 *
 *   1 Mission & targets → 2 Layout & geometry → 3 Avionics → 4 Propulsion & energy
 *   → 5 3D review → 6 Balloon mission (optional) → 7 Summary & build sheet
 *
 * Each step has a plain-language goal, a "done when" rule evaluated from the project,
 * and the lesson that explains it. flowBar() is placed at the top of every design page.
 */
import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { button } from './components.js';

const errorsFrom = (result, prefix) => (result?.checks ?? []).filter((c) => c.severity === 'error' && (!prefix || c.id.startsWith(prefix))).length;

export const FLOW_STEPS = Object.freeze([
  {
    id: 'targets',
    title: 'Mission & targets',
    goal: 'Say what the aircraft must do: take-off mass, payload, endurance, speed, altitude.',
    route: (ctx) => (ctx.store.doc ? ['projects', [ctx.store.doc.id], { tab: 'requirements' }] : ['projects']),
    status: (ctx) => {
      const r = ctx.store.doc?.requirements ?? {};
      const set = Object.values(r).filter((v) => typeof v?.value === 'number').length;
      return set >= 3 && typeof r.maxTakeoffMass?.value === 'number' ? 'done' : set ? 'started' : 'todo';
    },
    lesson: 'data-provenance',
  },
  {
    id: 'architecture',
    title: 'Layout & geometry',
    goal: 'Choose the layout and its key dimensions; check propeller clearance and tail size.',
    route: () => ['architecture'],
    status: (ctx) => (errorsFrom(ctx.engineering.geometry()) ? 'problem' : 'done'),
    lesson: 'rotor-layout-hover',
  },
  {
    id: 'avionics',
    title: 'Avionics & electronics',
    goal: 'Pick battery, flight controller, ESCs, radios and sensors; wire power and data.',
    route: () => ['avionics'],
    status: (ctx) => {
      const items = ctx.store.doc?.modules?.components?.items ?? [];
      if (!items.length) return 'todo';
      if (errorsFrom(ctx.engineering.electrical())) return 'problem';
      return items.some((i) => i.type === 'battery') && items.some((i) => i.type === 'flight-controller') ? 'done' : 'started';
    },
    lesson: 'avionics-power-interfaces',
  },
  {
    id: 'propulsion',
    title: 'Propulsion & energy',
    goal: 'Match motor and propeller, check thrust and hover throttle, close the mass budget and endurance.',
    route: () => ['propulsion'],
    status: (ctx) => {
      const r = ctx.engineering.propulsion();
      if (!r || r.status === 'no-battery') return 'todo';
      return errorsFrom(r) ? 'problem' : 'done';
    },
    lesson: 'propulsion-energy',
  },
  {
    id: 'design-studio',
    title: '3D review',
    goal: 'Look at the aircraft in 3D; export it to FreeCAD, Blender or a 3D printer.',
    route: () => ['design-studio'],
    status: (ctx) => (ctx.engineering.geometry() ? 'done' : 'todo'),
    optional: true,
  },
  {
    id: 'sounding',
    title: 'Balloon mission',
    goal: 'Optional: carry the aircraft to 33 km on a balloon, release, glide and return.',
    route: () => ['sounding'],
    status: (ctx) => {
      if (!ctx.store.doc?.modules?.sounding?.enabled) return 'skipped';
      return errorsFrom(ctx.engineering.sounding()) ? 'problem' : 'done';
    },
    optional: true,
    lesson: 'balloon-glidesonde',
  },
  {
    id: 'summary',
    title: 'Summary & build sheet',
    goal: 'Review open problems, print the build sheet and parts list, prepare the paper or patent.',
    route: () => ['summary'],
    status: (ctx) => (ctx.store.doc ? 'ready' : 'todo'),
  },
]);

const STATUS = {
  done: { label: 'Done', icon: 'checkCircle', tone: 'ok' },
  ready: { label: 'Ready', icon: 'checkCircle', tone: 'ok' },
  started: { label: 'In progress', icon: 'history', tone: 'warn' },
  problem: { label: 'Needs attention', icon: 'warning', tone: 'danger' },
  todo: { label: 'To do', icon: 'info', tone: 'neutral' },
  skipped: { label: 'Optional', icon: 'info', tone: 'neutral' },
};

export function stepStatus(ctx, step) {
  try {
    return step.status(ctx);
  } catch {
    return 'todo';
  }
}

const go = (ctx, step) => {
  const [route, segments, params] = step.route(ctx);
  ctx.router.navigate(route, segments, params);
};

/**
 * Progress bar for the top of a design page.
 * Keeps itself up to date while it is on the page.
 */
export function flowBar(ctx, currentId) {
  const element = h('nav', { class: 'flow', 'aria-label': 'Design flow' });
  const render = () => {
    const index = FLOW_STEPS.findIndex((s) => s.id === currentId);
    const prev = FLOW_STEPS[index - 1];
    const next = FLOW_STEPS[index + 1];
    const current = FLOW_STEPS[index];
    element.replaceChildren(
      h(
        'ol',
        { class: 'flow__steps' },
        FLOW_STEPS.map((step, i) => {
          const st = STATUS[stepStatus(ctx, step)];
          return h(
            'li',
            { class: ['flow__step', `flow__step--${st.tone}`, step.id === currentId ? 'flow__step--current' : null] },
            h(
              'a',
              { href: '#', 'aria-current': step.id === currentId ? 'step' : undefined, title: `${step.title}: ${st.label}`, onClick: (e) => (e.preventDefault(), go(ctx, step)) },
              h('span', { class: 'flow__num' }, String(i + 1)),
              h('span', { class: 'flow__title' }, step.title),
              h('span', { class: 'visually-hidden' }, ` (${st.label})`),
            ),
          );
        }),
      ),
      current
        ? h(
            'div',
            { class: 'flow__bar' },
            h('p', { class: 'flow__goal' }, h('strong', null, `Step ${index + 1} of ${FLOW_STEPS.length}: `), current.goal),
            h(
              'div',
              { class: 'flow__nav' },
              prev ? button({ label: `Back: ${prev.title}`, icon: 'chevronLeft', size: 'sm', onClick: () => go(ctx, prev) }) : null,
              current.lesson ? button({ label: 'Learn this step', icon: 'book', size: 'sm', onClick: () => ctx.router.navigate('learning', [current.lesson]) }) : null,
              next ? button({ label: `Next: ${next.title}`, icon: 'chevronRight', size: 'sm', variant: 'primary', onClick: () => go(ctx, next) }) : null,
            ),
          )
        : null,
    );
  };
  render();
  let timer = 0;
  const off = ctx.store.on('change', () => {
    if (!element.isConnected) return off();
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  });
  return element;
}

/** Dashboard card: the whole flow with each step's status and goal. */
export function flowOverview(ctx) {
  return h(
    'ol',
    { class: 'flow-list' },
    FLOW_STEPS.map((step, i) => {
      const key = stepStatus(ctx, step);
      const st = STATUS[key];
      return h(
        'li',
        { class: ['flow-list__item', `flow-list__item--${st.tone}`], dataset: { step: step.id } },
        h('span', { class: 'flow-list__num' }, String(i + 1)),
        h('div', { class: 'flow-list__text' }, h('strong', null, step.title, step.optional ? h('span', { class: 'muted' }, ' (optional)') : null), h('span', { class: 'muted' }, step.goal)),
        h('span', { class: `flow-list__status flow-list__status--${st.tone}` }, icon(st.icon, { size: 14 }), st.label),
        button({ label: 'Open', size: 'sm', onClick: () => go(ctx, step) }),
      );
    }),
  );
}
