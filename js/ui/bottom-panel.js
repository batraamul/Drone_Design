/**
 * Bottom engineering console: application log, problems (engineering checks and
 * runtime errors) and the calculation register (what was computed, from which inputs).
 */
import { h, $, rafThrottle } from '../utils/dom.js';
import { icon } from './icons.js';
import { severityIcon, provenanceBadge, formatQuantity, preferredUnit } from './components.js';
import { formatTime } from '../utils/format.js';

const TABS = [
  { id: 'console', label: 'Console', icon: 'terminal' },
  { id: 'problems', label: 'Problems', icon: 'warning' },
  { id: 'calculations', label: 'Calculations', icon: 'lightning' },
];

export class BottomPanel {
  #ctx;
  #tab;
  #content = $('#bottom-content');
  #tabButtons = new Map();
  #toggle;
  #runtimeErrors = [];
  render = rafThrottle(() => this.#render());

  constructor(ctx) {
    this.#ctx = ctx;
    this.#tab = TABS.some((t) => t.id === ctx.prefs.get('bottomTab')) ? ctx.prefs.get('bottomTab') : 'console';
    const tablist = $('#bottom-tabs');
    for (const tab of TABS) {
      const buttonEl = h(
        'button',
        {
          type: 'button',
          class: 'tab',
          role: 'tab',
          id: `bottom-tab-${tab.id}`,
          'aria-controls': 'bottom-content',
          'aria-selected': String(tab.id === this.#tab),
          tabindex: tab.id === this.#tab ? '0' : '-1',
          onClick: () => this.setTab(tab.id, { reveal: true }),
        },
        icon(tab.icon, { size: 15 }),
        h('span', null, tab.label),
        h('span', { class: 'tab__count', hidden: true }),
      );
      this.#tabButtons.set(tab.id, buttonEl);
      tablist.append(buttonEl);
    }
    tablist.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const index = TABS.findIndex((t) => t.id === this.#tab);
      const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length];
      this.setTab(next.id);
      this.#tabButtons.get(next.id).focus();
    });
    this.#content.setAttribute('role', 'tabpanel');
    this.#content.setAttribute('aria-labelledby', `bottom-tab-${this.#tab}`);
    this.#content.tabIndex = 0;

    const clearButton = h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onClick: () => ctx.log.clear(), title: 'Clear console' }, 'Clear');
    this.#toggle = h('button', { type: 'button', class: 'icon-btn icon-btn--sm', 'aria-label': 'Hide console', onClick: () => ctx.shell.toggleBottom() }, icon('chevronDown', { size: 16 }));
    $('#bottom-tools').append(clearButton, this.#toggle);

    ctx.log.on('entry', (entry) => {
      if (entry.level === 'error') this.#runtimeErrors.push(entry);
      this.render();
    });
    ctx.log.on('clear', () => {
      this.#runtimeErrors = [];
      this.render();
    });
    ctx.store.on('change', () => this.render());
    ctx.store.on('load', () => this.render());
    this.render();
  }

  setTab(id, { reveal = false } = {}) {
    this.#tab = id;
    for (const [tabId, buttonEl] of this.#tabButtons) {
      buttonEl.setAttribute('aria-selected', String(tabId === id));
      buttonEl.tabIndex = tabId === id ? 0 : -1;
    }
    this.#content.setAttribute('aria-labelledby', `bottom-tab-${id}`);
    this.#ctx.prefs.set('bottomTab', id);
    if (reveal && document.getElementById('app').classList.contains('bottom-collapsed')) this.#ctx.shell.toggleBottom();
    this.#render();
  }

  updateToggle(expanded) {
    if (!this.#toggle) return;
    this.#toggle.replaceChildren(icon(expanded ? 'chevronDown' : 'chevronUp', { size: 16 }));
    this.#toggle.setAttribute('aria-label', expanded ? 'Hide console' : 'Show console');
    this.#toggle.title = `${expanded ? 'Hide' : 'Show'} console (Ctrl+J)`;
  }

  #setCount(tabId, count, tone) {
    const counter = this.#tabButtons.get(tabId)?.querySelector('.tab__count');
    if (!counter) return;
    counter.hidden = !count;
    counter.textContent = String(count);
    counter.dataset.tone = tone;
  }

  #render() {
    const evaluation = this.#ctx.store.doc ? this.#ctx.engineering.evaluate() : { checks: [], derived: [] };
    const problemCount = evaluation.checks.filter((c) => c.severity !== 'info').length + this.#runtimeErrors.length;
    this.#setCount('problems', problemCount, evaluation.checks.some((c) => c.severity === 'error') || this.#runtimeErrors.length ? 'danger' : 'warning');
    if (this.#tab === 'console') this.#renderConsole();
    else if (this.#tab === 'problems') this.#renderProblems(evaluation);
    else this.#renderCalculations(evaluation);
  }

  #renderConsole() {
    const entries = this.#ctx.log.entries.filter((entry) => entry.level !== 'debug' || this.#ctx.prefs.get('showDebug'));
    const nearBottom = this.#content.scrollHeight - this.#content.scrollTop - this.#content.clientHeight < 40;
    if (!entries.length) {
      this.#content.replaceChildren(h('p', { class: 'console__empty' }, 'Console is empty.'));
      return;
    }
    this.#content.replaceChildren(
      h(
        'ol',
        { class: 'console' },
        entries.map((entry) =>
          h(
            'li',
            { class: ['console__entry', `console__entry--${entry.level}`] },
            h('time', { class: 'console__time', datetime: entry.time }, formatTime(entry.time)),
            h('span', { class: 'console__level' }, entry.level.toUpperCase()),
            h('span', { class: 'console__category' }, entry.category),
            h('span', { class: 'console__message' }, entry.message),
          ),
        ),
      ),
    );
    if (nearBottom) this.#content.scrollTop = this.#content.scrollHeight;
  }

  #renderProblems(evaluation) {
    const rows = [
      ...evaluation.checks.map((check) =>
        h(
          'li',
          { class: 'problem' },
          severityIcon(check.severity, 16),
          h('span', { class: 'problem__title' }, check.title),
          h('span', { class: 'problem__source mono' }, check.id),
          h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onClick: () => this.#ctx.shell.revealInspector() }, 'Details'),
        ),
      ),
      ...this.#runtimeErrors.map((entry) =>
        h('li', { class: 'problem' }, severityIcon('error', 16), h('span', { class: 'problem__title' }, entry.message), h('span', { class: 'problem__source mono' }, `${entry.category} · ${formatTime(entry.time)}`)),
      ),
    ];
    this.#content.replaceChildren(
      rows.length
        ? h('ul', { class: 'problems' }, rows)
        : h('p', { class: 'console__empty' }, this.#ctx.store.doc ? 'No problems detected.' : 'No project open. Runtime problems will also appear here.'),
    );
  }

  #renderCalculations(evaluation) {
    const { store, prefs } = this.#ctx;
    const nodes = store.derivedInfo();
    const register = h(
      'table',
      { class: 'table table--compact' },
      h('caption', { class: 'visually-hidden' }, 'Calculation register'),
      h('thead', null, h('tr', null, ['Calculation', 'Model', 'Evaluations', 'Last evaluated'].map((label) => h('th', { scope: 'col' }, label)))),
      h(
        'tbody',
        null,
        nodes.map((node) =>
          h(
            'tr',
            null,
            h('td', null, node.meta.title ?? node.id),
            h('td', null, node.meta.model ?? '—'),
            h('td', { class: 'mono' }, String(node.evaluations)),
            h('td', { class: 'mono' }, node.lastEvaluatedAt ? formatTime(new Date(node.lastEvaluatedAt).toISOString()) : '—'),
          ),
        ),
      ),
    );
    const values = evaluation.derived.length
      ? h(
          'table',
          { class: 'table table--compact' },
          h('caption', { class: 'visually-hidden' }, 'Current derived values'),
          h('thead', null, h('tr', null, ['Quantity', 'Value', 'Equation', 'Provenance'].map((label) => h('th', { scope: 'col' }, label)))),
          h(
            'tbody',
            null,
            evaluation.derived.map((item) =>
              h(
                'tr',
                null,
                h('td', null, item.label),
                h('td', { class: 'mono' }, formatQuantity(item.value, item.unit, preferredUnit(item.unit, prefs))),
                h('td', null, h('code', null, item.equation)),
                h('td', null, provenanceBadge(item.provenance)),
              ),
            ),
          ),
        )
      : h('p', { class: 'console__empty' }, store.doc ? 'Set requirements to see derived values.' : 'No project open.');
    this.#content.replaceChildren(h('div', { class: 'calc-grid' }, h('div', null, h('h3', { class: 'console__heading' }, 'Calculation register'), register), h('div', null, h('h3', { class: 'console__heading' }, 'Current values'), values)));
  }
}
