/**
 * Flight Dynamics (Build 6): stability modes and responses for winged aircraft, and a
 * simulated hover scenario with a cascaded controller for rotorcraft. Simulation only.
 * Data: project.modules.dynamics (settings). Model: js/engineering/dynamics.js.
 */
import { h, s as svg, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, checkCard, derivedList, emptyState, field, formatQuantity, nextId, pageHeader, provenanceBadge, quantityInput } from '../ui/components.js';
import { DYNAMICS_FIELDS } from '../engineering/dynamics.js';
import { lineChart } from '../visualisation/plots.js';
import { flowBar } from '../ui/design-flow.js';

const PATH = ['modules', 'dynamics', 'settings'];
const DEG = 180 / Math.PI;

function settingsCard(ctx, winged, hovering) {
  const st = ctx.store.doc.modules.dynamics.settings;
  const keys = [...(hovering ? ['motorTimeConstant', 'attitudeBandwidth'] : []), 'gustSpeed', ...(winged ? ['elevatorStep'] : [])];
  const rows = keys.map((key) => {
    const f = DYNAMICS_FIELDS[key];
    const id = nextId('dy');
    const control = quantityInput({
      id,
      label: f.label,
      siUnit: f.unit,
      units: f.displayUnits,
      unit: ctx.prefs.displayUnit(`dyn.${key}`, f.displayUnits[0]),
      valueSI: st[key],
      validate: (si) => (si === null ? (f.optional ? null : 'A value is required') : si < f.min || si > f.max ? `Must be between ${f.min} and ${f.max} ${f.unit}` : null),
      onCommit: (si) => ctx.store.set([...PATH, key], si, { label: `Set ${f.label}` }),
      onUnitChange: (u) => ctx.prefs.setDisplayUnit(`dyn.${key}`, u),
    });
    return { key, control, element: h('div', { class: 'requirement', dataset: { field: key } }, field({ id, label: `${f.label} (${f.symbol})`, control: control.element, hint: f.help }), h('span', { class: 'requirement__badge' }, provenanceBadge('user-input'))) };
  });
  return {
    element: card({ title: 'Scenario and controller', icon: 'sliders', class: 'span-2', description: 'Inputs to the simulations. Everything else comes from the design: inertia and CG from Mass & Balance, aerodynamics, motors.', body: h('div', { class: 'requirement-list' }, rows.map((r) => r.element)) }),
    sync: (force) => rows.forEach((r) => r.control.update(ctx.store.doc.modules.dynamics.settings[r.key], { force })),
  };
}

function verdict(name, m) {
  if (!m) return { tone: null, text: 'Not found' };
  if (!m.stable && name === 'Spiral' && m.halfOrDouble >= 20) return { tone: 'good', text: 'Slow divergence — normal, easily corrected' };
  if (!m.stable && name === 'Spiral' && m.halfOrDouble >= 8) return { tone: 'warn', text: 'Diverges moderately' };
  if (!m.stable && name === 'Phugoid' && m.halfOrDouble >= 55) return { tone: 'warn', text: 'Very slow divergence' };
  if (!m.stable) return { tone: 'bad', text: m.oscillatory ? 'Oscillation grows' : 'Diverges' };
  if (name === 'Short period') return m.oscillatory ? (m.zeta < 0.3 ? { tone: 'warn', text: 'Lightly damped' } : m.zeta > 1.3 ? { tone: 'warn', text: 'Sluggish' } : { tone: 'good', text: 'Well damped' }) : { tone: 'good', text: 'Dead-beat (no overshoot)' };
  if (name === 'Dutch roll') return m.zeta < 0.08 ? { tone: 'warn', text: 'Lightly damped' } : { tone: 'good', text: 'Damped' };
  if (name === 'Phugoid') return m.oscillatory && m.zeta < 0.04 ? { tone: 'warn', text: 'Barely damped' } : { tone: 'good', text: 'Damped' };
  return { tone: 'good', text: 'Converges' };
}

function modeCard(name, m, explain) {
  const v = verdict(name, m);
  const values = !m ? '—' : m.oscillatory ? `ω_n ${m.wn.toFixed(2)} rad/s · ζ ${m.zeta.toFixed(2)} · period ${m.period.toFixed(1)} s` : `λ ${m.eigenvalue.re.toFixed(3)} s⁻¹ · ${m.stable ? 'halves' : 'doubles'} in ${m.halfOrDouble.toFixed(2)} s`;
  return h('div', { class: ['mode', v.tone ? `mode--${v.tone}` : null], dataset: { mode: name } }, h('span', { class: 'mode__name' }, name), h('span', { class: 'mode__values' }, values), h('span', { class: 'mode__verdict' }, v.text), h('span', { class: 'muted' }, explain));
}

/** Eigenvalues on the complex plane (stable half shaded). */
function polePlot(modes) {
  const W = 420;
  const H = 260;
  const pts = Object.entries(modes).filter(([, m]) => m?.eigenvalue).flatMap(([k, m]) => (m.oscillatory ? [[k, m.eigenvalue.re, m.eigenvalue.im], [k, m.eigenvalue.re, -m.eigenvalue.im]] : [[k, m.eigenvalue.re, 0]]));
  // Symmetric-log scale so slow and fast modes are both visible.
  const f = (v) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 0.05);
  const xr = Math.max(1, ...pts.map((p) => Math.abs(f(p[1]))));
  const yr = Math.max(1, ...pts.map((p) => Math.abs(f(p[2]))));
  const X = (v) => W / 2 + (f(v) / xr) * (W / 2 - 24);
  const Y = (v) => H / 2 - (f(v) / yr) * (H / 2 - 20);
  const names = { shortPeriod: 'SP', phugoid: 'PH', dutchRoll: 'DR', roll: 'R', spiral: 'S' };
  return svg(
    'svg',
    { class: 'root-plot', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Eigenvalues of the aircraft on the complex plane; left half is stable' },
    svg('rect', { class: 'root-plot__stable', x: 0, y: 0, width: W / 2, height: H }),
    svg('path', { class: 'root-plot__axis', d: `M0 ${H / 2}H${W}M${W / 2} 0V${H}` }),
    svg('text', { class: 'root-plot__label', x: 6, y: 14 }, 'stable'),
    svg('text', { class: 'root-plot__label', x: W - 6, y: 14, 'text-anchor': 'end' }, 'unstable'),
    ...pts.map(([k, re, im]) => {
      const x = X(re);
      const y = Y(im);
      return svg('g', null, svg('path', { class: 'root-plot__pt', d: `M${x - 5} ${y - 5}l10 10M${x + 5} ${y - 5}l-10 10`, stroke: re < 0 ? 'var(--accent)' : 'var(--danger)' }), im >= 0 ? svg('text', { class: 'root-plot__label', x: x + 7, y: y - 6 }, names[k] ?? k) : null);
    }),
  );
}

function wingedBlocks(w) {
  const m = w.modes;
  const el = w.responses.elevator;
  const gu = w.responses.gust;
  const ru = w.responses.rudder;
  const V = w.V;
  const charts = [
    lineChart({ points: el.map((p) => [p.t, p.x[3] * DEG]), extra: [{ points: el.map((p) => [p.t, (p.x[1] / V) * DEG]), label: 'α' }], label: 'θ', title: 'Elevator step: pitch θ and angle of attack α', description: 'Response to a small elevator step at 1 s: the short period settles in about a second, the phugoid over tens of seconds.', xLabel: 'Time (s)', yLabel: 'deg' }),
    lineChart({ points: el.map((p) => [p.t, p.x[0]]), title: 'Elevator step: airspeed change', description: 'The phugoid: speed and height trade slowly.', xLabel: 'Time (s)', yLabel: 'Δu (m/s)', tone: 'secondary' }),
    lineChart({ points: gu.map((p) => [p.t, (p.x[1] / V) * DEG]), extra: [{ points: gu.map((p) => [p.t, p.x[3] * DEG]), label: 'θ' }], label: 'α', title: 'Vertical gust: angle of attack and pitch', description: 'A 2-second up-gust; a well-damped aircraft returns smoothly.', xLabel: 'Time (s)', yLabel: 'deg' }),
    lineChart({ points: ru.map((p) => [p.t, p.x[0] * DEG]), extra: [{ points: ru.map((p) => [p.t, p.x[3] * DEG]), label: 'φ' }], label: 'β', title: 'Rudder pulse: sideslip β and bank φ', description: 'A 1-second, 5° rudder pulse excites the Dutch roll; bank then drifts with the spiral mode.', xLabel: 'Time (s)', yLabel: 'deg' }),
  ];
  return [
    card({
      title: 'Stability modes',
      icon: 'attitude',
      class: 'span-2',
      description: `Linearised about level flight at ${V.toFixed(1)} m/s. Crosses on the left half of the plane are stable.`,
      body: h(
        'div',
        { class: 'stack' },
        h('div', { class: 'modes' }, modeCard('Short period', m.shortPeriod, 'Quick pitch response to elevator and gusts.'), modeCard('Phugoid', m.phugoid, 'Slow height–speed exchange.'), modeCard('Roll', m.roll, 'How fast roll rate builds up and stops.'), modeCard('Spiral', m.spiral, 'Slow tightening or widening of a turn.'), modeCard('Dutch roll', m.dutchRoll, 'Yaw–roll wobble.')),
        polePlot(m),
      ),
    }),
    card({ title: 'Responses', icon: 'simulator', class: 'span-2', body: h('div', { class: 'chart-row' }, charts) }),
  ];
}

function hoverBlocks(hv) {
  const S = hv.series;
  const mt = hv.metrics;
  const tile = (label, value, tone) => h('div', { class: ['stat', tone ? `stat--${tone}` : null] }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value mono' }, value));
  const sec = (v) => (v === null || v === undefined ? '> window' : `${v.toFixed(2)} s`);
  const stats = hv.stable
    ? h(
        'div',
        { class: 'stat-grid' },
        tile('1 m climb: settles in', sec(mt.climb.settlingTime), 'accent'),
        tile('1 m climb: overshoot', `${(mt.climb.overshoot * 100).toFixed(0)} %`),
        tile('2 m move: settles in', sec(mt.move.settlingTime)),
        tile('Side-gust drift', formatQuantity(mt.gustDeviation, 'm', 'cm', { digits: 3 })),
        tile('45° yaw: settles in', sec(mt.yaw?.settlingTime)),
        tile('Steepest tilt', `${(mt.maxTilt * DEG).toFixed(0)}°`),
        tile('Motor at a limit', `${(mt.saturatedFraction * 100).toFixed(1)} %`, mt.saturatedFraction > 0.05 ? 'warn' : null),
        tile('Peak motor thrust', `${(mt.peakThrustRatio * 100).toFixed(0)} % of max`, mt.peakThrustRatio > 0.95 ? 'warn' : null),
      )
    : h('p', { class: 'notice notice--warning' }, icon('warning', { size: 18 }), 'The simulated aircraft lost control. See the checks below.');
  const charts = [
    lineChart({ points: S.map((p) => [p.t, p.z]), extra: [{ points: S.map((p) => [p.t, p.t >= 1 ? 1 : 0]), label: 'command', dashed: true }], label: 'height', title: 'Height', description: '1 m climb commanded at 1 s.', xLabel: 'Time (s)', yLabel: 'm' }),
    lineChart({ points: S.map((p) => [p.t, p.x]), extra: [{ points: S.map((p) => [p.t, p.y]), label: 'sideways' }], label: 'forward', title: 'Position', description: '2 m forward step at 5 s; side gust at 10–12 s.', xLabel: 'Time (s)', yLabel: 'm', tone: 'secondary' }),
    lineChart({ points: S.map((p) => [p.t, p.theta * DEG]), extra: [{ points: S.map((p) => [p.t, p.phi * DEG]), label: 'roll' }, { points: S.map((p) => [p.t, p.psi * DEG]), label: 'yaw', dashed: true }], label: 'pitch', title: 'Attitude', description: 'Pitch to move forward, roll to fight the gust, then a 45° yaw turn at 14 s.', xLabel: 'Time (s)', yLabel: 'deg' }),
    lineChart({ points: S.map((p) => [p.t, p.tmax]), extra: [{ points: S.map((p) => [p.t, p.tmin]), label: 'lowest' }], label: 'highest', title: 'Motor thrust (highest and lowest rotor)', description: 'How hard the motors work; flat tops mean a motor is at its limit.', xLabel: 'Time (s)', yLabel: 'N', tone: 'secondary' }),
  ];
  const g = hv.gains;
  return [
    card({ title: 'Hover simulation', icon: 'multirotor', class: 'span-2', description: 'Nonlinear 6-DoF model with motor lag and thrust limits. Scenario: climb 1 m at 1 s, move 2 m forward at 5 s, side gust at 10 s, turn 45° at 14 s.', body: h('div', { class: 'stack' }, stats, h('div', { class: 'chart-row' }, charts)) }),
    card({
      title: 'Controller',
      icon: 'sliders',
      class: 'span-2',
      description: 'Cascaded PID with gains placed from the inertia: K_p = I ω², K_d = 2 ζ I ω, ζ = 0.8. Position → tilt → attitude → rotor thrusts (minimum-norm allocation).',
      body: h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table table--compact' },
          h('thead', null, h('tr', null, ['Loop', 'Bandwidth ω', 'What it does'].map((t) => h('th', { scope: 'col' }, t)))),
          h(
            'tbody',
            null,
            [
              ['Attitude (roll, pitch)', g.wAtt, 'Holds the commanded tilt; limited by the motor response time.'],
              ['Yaw', g.wYaw, 'Slowest: yaw comes only from rotor drag torque.'],
              ['Height', g.wZ, 'Collective thrust, with a small integral term.'],
              ['Position', g.wPos, 'Tilts the aircraft (max 25°) to move or resist wind.'],
            ].map(([a, b, c]) => h('tr', null, h('th', { scope: 'row' }, a), h('td', { class: 'mono num' }, `${b.toFixed(2)} rad/s`), h('td', null, c))),
          ),
        ),
      ),
    }),
  ];
}

export async function mount(container, ctx) {
  const { store } = ctx;
  let editors = [];
  let out = null;
  let key = null;
  const structure = () => (store.doc ? [store.doc.modules.configuration?.layout, Boolean(ctx.engineering.geometry()?.wing)].join('|') : 'none');
  const header = () => pageHeader({ title: 'Flight Dynamics', icon: 'attitude', subtitle: 'How the design behaves in the air: stability modes for wings, a simulated hover for rotors.', badges: [badge('Build 6', 'neutral'), badge('Simulation only', 'info')] });
  const render = () => {
    if (!out) return;
    const d = ctx.engineering.dynamics();
    if (!d || d.status !== 'ok') {
      out.replaceChildren(h('div', { class: 'notice notice--info span-2', role: 'status' }, icon('info', { size: 18 }), h('p', null, d?.status === 'unsupported' ? 'This layout has neither a wing model nor at least three lift rotors, so there is nothing to simulate yet.' : 'Flight dynamics need the mass and inertia: add parts in the Avionics Laboratory and a motor in Propulsion & Energy. ', button({ label: 'Open Mass & Balance', size: 'sm', onClick: () => ctx.router.navigate('balance') }))));
      return;
    }
    out.replaceChildren(
      ...(d.winged ? wingedBlocks(d.winged) : []),
      ...(d.hover ? hoverBlocks(d.hover) : []),
      card({
        title: 'Checks and calculations',
        icon: 'checkCircle',
        class: 'span-2',
        body: h(
          'div',
          { class: 'stack' },
          d.checks.length ? h('div', { class: 'check-list' }, d.checks.map((c) => checkCard(c, ctx.prefs))) : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), 'No dynamic problems found at this level of modelling.'),
          d.notes.length ? h('ul', { class: 'scope-list' }, d.notes.map((n) => h('li', null, n))) : null,
          derivedList(d.derived, ctx.prefs),
        ),
      }),
    );
  };
  const build = () => {
    key = structure();
    editors = [];
    out = null;
    if (!store.doc) {
      container.replaceChildren(header(), flowBar(ctx, 'flight-dynamics'), emptyState({ icon: 'attitude', title: 'Open a project first', message: 'The simulations use a project’s mass, inertia, aerodynamics and motors.', actions: [button({ label: 'Start from an example', icon: 'copy', variant: 'primary', onClick: () => ctx.actions.newFromExample() })] }));
      return;
    }
    const geo = ctx.engineering.geometry();
    const winged = Boolean(geo?.wing);
    const hovering = (geo?.rotors ?? []).filter((r) => r.axis === 'z' && r.role !== 'cruise').length >= 3;
    const st = settingsCard(ctx, winged, hovering);
    editors = [st];
    out = h('div', { class: 'page-grid span-2 results-grid' });
    container.replaceChildren(
      header(),
      flowBar(ctx, 'flight-dynamics'),
      h('div', { class: 'notice notice--info', role: 'note' }, icon('info', { size: 18 }), h('p', null, 'Simulation only: these models are never connected to a real aircraft or flight controller. Derivatives are concept-level estimates; confirm with XFLR5 or OpenVSP stability analysis and with flight tests in a safe, legal place.')),
      h('div', { class: 'page-grid' }, st.element, out),
    );
    render();
  };
  const refresh = debounce(render, 120);
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
