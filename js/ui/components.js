/**
 * Reusable UI components: buttons, badges, cards, form fields, quantity inputs
 * with explicit unit conversion, and engineering check / derived-value displays.
 */
import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { convert, dimensionOf, isKnownUnit, unitsFor, fromSI, toSI } from '../engineering/units.js';
import { provenanceInfo } from '../engineering/provenance.js';
import { formatNumber } from '../utils/format.js';

let idCounter = 0;
export const nextId = (prefix = 'ax') => `${prefix}-${++idCounter}`;

export function button({ label, icon: iconName, variant, size, onClick, title, ariaLabel, type = 'button', disabled, dataset, class: className }) {
  return h(
    'button',
    {
      type,
      class: ['btn', variant ? `btn--${variant}` : null, size ? `btn--${size}` : null, className],
      onClick,
      title,
      'aria-label': ariaLabel,
      disabled,
      dataset,
    },
    iconName ? icon(iconName, { size: size === 'sm' ? 16 : 18 }) : null,
    label ? h('span', null, label) : null,
  );
}

export function iconButton({ icon: iconName, label, onClick, size, pressed, dataset, disabled, class: className }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['icon-btn', size ? `icon-btn--${size}` : null, className],
      'aria-label': label,
      title: label,
      'aria-pressed': pressed === undefined ? undefined : String(Boolean(pressed)),
      onClick,
      dataset,
      disabled,
    },
    icon(iconName, { size: size === 'sm' ? 16 : 18 }),
  );
}

export function linkButton({ href, label, icon: iconName, variant, size, external = false }) {
  return h(
    'a',
    {
      href,
      class: ['btn', variant ? `btn--${variant}` : null, size ? `btn--${size}` : null],
      target: external ? '_blank' : undefined,
      rel: external ? 'noopener noreferrer' : undefined,
    },
    iconName ? icon(iconName, { size: size === 'sm' ? 16 : 18 }) : null,
    h('span', null, label),
    external ? icon('external', { size: 14 }) : null,
  );
}

export function badge(text, tone = 'neutral', { title } = {}) {
  return h('span', { class: ['badge', `badge--${tone}`], title }, text);
}

export function provenanceBadge(kind) {
  const info = provenanceInfo(kind);
  return h('span', { class: ['provenance', `provenance--${info.tone}`], title: `${info.label}: ${info.description}` }, info.short, h('span', { class: 'visually-hidden' }, ` (${info.label})`));
}

const SEVERITY = {
  error: { icon: 'error', label: 'Error', tone: 'danger' },
  warning: { icon: 'warning', label: 'Warning', tone: 'warning' },
  info: { icon: 'info', label: 'Information', tone: 'info' },
};

export function severityIcon(severity, size = 18) {
  const info = SEVERITY[severity] ?? SEVERITY.info;
  return h('span', { class: ['severity', `severity--${severity}`] }, icon(info.icon, { size, label: info.label }));
}

export function card({ title, icon: iconName, actions, body, class: className, headingLevel = 2, id, description }) {
  const heading = h(`h${headingLevel}`, { class: 'card__title', id }, iconName ? icon(iconName, { size: 18 }) : null, h('span', null, title));
  return h(
    'section',
    { class: ['card', className], 'aria-labelledby': id },
    h('header', { class: 'card__header' }, h('div', null, heading, description ? h('p', { class: 'card__description' }, description) : null), actions ? h('div', { class: 'card__actions' }, actions) : null),
    h('div', { class: 'card__body' }, body),
  );
}

export function emptyState({ icon: iconName = 'info', title, message, actions }) {
  return h(
    'div',
    { class: 'empty-state' },
    h('span', { class: 'empty-state__icon' }, icon(iconName, { size: 28 })),
    h('p', { class: 'empty-state__title' }, title),
    message ? h('p', { class: 'empty-state__message' }, message) : null,
    actions ? h('div', { class: 'empty-state__actions' }, actions) : null,
  );
}

export function pageHeader({ title, icon: iconName, subtitle, actions, badges }) {
  return h(
    'header',
    { class: 'page-header' },
    h(
      'div',
      { class: 'page-header__main' },
      iconName ? h('span', { class: 'page-header__icon' }, icon(iconName, { size: 22 })) : null,
      h(
        'div',
        null,
        h('h1', { class: 'page-header__title', tabindex: '-1', dataset: { pageHeading: 'true' } }, title, badges ? h('span', { class: 'page-header__badges' }, badges) : null),
        subtitle ? h('p', { class: 'page-header__subtitle' }, subtitle) : null,
      ),
    ),
    actions ? h('div', { class: 'page-header__actions' }, actions) : null,
  );
}

export function selectControl({ id, options, value, onChange, ariaLabel, class: className, name }) {
  const select = h(
    'select',
    { id, name, class: ['select', className], 'aria-label': ariaLabel, onChange: (event) => onChange?.(event.target.value, event) },
    options.map((option) => h('option', { value: option.value, selected: option.value === value }, option.label)),
  );
  return select;
}

export function field({ label, hint, control, error, id = control?.id, wide = false }) {
  const errorEl = h('span', { class: 'field__error', id: id ? `${id}-error` : undefined, role: 'status', 'aria-live': 'polite' }, error ?? '');
  return h(
    'div',
    { class: ['field', wide ? 'field--wide' : null] },
    h('label', { class: 'field__label', for: id }, label),
    control,
    hint ? h('span', { class: 'field__hint', id: id ? `${id}-hint` : undefined }, hint) : null,
    errorEl,
  );
}

export function keyValueList(rows, { class: className } = {}) {
  return h(
    'dl',
    { class: ['kv', className] },
    rows.filter(Boolean).map(([key, value]) => h('div', { class: 'kv__row' }, h('dt', null, key), h('dd', null, value))),
  );
}

// ---- Quantities -----------------------------------------------------------------------

/** Format a number for an input field: up to 6 significant digits, no exponent for ordinary values. */
export function formatForInput(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const rounded = Number(value.toPrecision(6));
  return String(rounded);
}

/** Parse user text into a number. Returns { value } or { error }. Empty input means "not set". */
export function parseNumber(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return { value: null };
  if (trimmed.includes(',')) return { error: 'Use a dot as the decimal separator (no thousands separators)' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)) return { error: 'Enter a number' };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: 'Number is out of range' };
  return { value };
}

/** Choose the display unit for an SI unit, following the user's preferences for related fields. */
export function preferredUnit(siUnit, prefs) {
  if (!isKnownUnit(siUnit)) return siUnit;
  const dimension = dimensionOf(siUnit);
  if (dimension === 'angle') return 'deg';
  const map = { time: ['endurance', 'min'], length: ['range', 'km'], speed: ['cruiseSpeed', 'm/s'], mass: ['maxTakeoffMass', 'kg'] };
  if (map[dimension] && prefs) return prefs.displayUnit(...map[dimension]);
  return siUnit;
}

/** Human-readable value with unit, converting from SI. */
export function formatQuantity(valueSI, siUnit, displayUnit = siUnit, { digits = 4 } = {}) {
  if (valueSI === null || valueSI === undefined || !Number.isFinite(valueSI)) return 'Not set';
  if (siUnit === '1' && displayUnit === '1') return formatNumber(valueSI, { digits });
  if (siUnit === 'K') {
    return `${formatNumber(valueSI, { digits: 5, maxFraction: 2 })} K (${formatNumber(valueSI - 273.15, { digits: 4, maxFraction: 1 })} °C)`;
  }
  let unit = displayUnit;
  let value = valueSI;
  try {
    value = isKnownUnit(siUnit) && isKnownUnit(displayUnit) ? convert(valueSI, siUnit, displayUnit) : valueSI;
  } catch {
    unit = siUnit;
  }
  return `${formatNumber(value, { digits })} ${unit}`;
}

/**
 * Number input with a unit selector. The stored value is always SI; the displayed
 * value is converted explicitly with the selected unit.
 */
export function quantityInput({ id = nextId('q'), siUnit, units = unitsFor(dimensionOf(siUnit)), unit, valueSI, onCommit, onUnitChange, validate, label }) {
  let currentUnit = units.includes(unit) ? unit : units[0];
  let currentSI = valueSI ?? null;
  const input = h('input', {
    id,
    class: 'input input--number',
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    value: currentSI === null ? '' : formatForInput(fromSI(currentSI, currentUnit)),
    placeholder: 'Not set',
    'aria-describedby': `${id}-hint ${id}-error`,
  });
  const unitSelect = h(
    'select',
    { class: 'select select--unit', 'aria-label': `${label ?? 'Value'} unit` },
    units.map((u) => h('option', { value: u, selected: u === currentUnit }, u)),
  );
  const wrapper = h('div', { class: 'quantity' }, input, unitSelect);
  const errorTarget = () => wrapper.closest('.field')?.querySelector('.field__error');
  const setError = (message) => {
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    wrapper.classList.toggle('quantity--invalid', Boolean(message));
    const target = errorTarget();
    if (target) target.textContent = message ?? '';
  };

  const commitFromText = () => {
    const parsed = parseNumber(input.value);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const si = parsed.value === null ? null : toSI(parsed.value, currentUnit);
    const message = validate ? validate(si) : null;
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    currentSI = si;
    onCommit?.(si);
  };

  input.addEventListener('input', commitFromText);
  input.addEventListener('blur', () => {
    if (input.getAttribute('aria-invalid') !== 'true') input.value = currentSI === null ? '' : formatForInput(fromSI(currentSI, currentUnit));
  });
  unitSelect.addEventListener('change', () => {
    currentUnit = unitSelect.value;
    if (input.getAttribute('aria-invalid') !== 'true') input.value = currentSI === null ? '' : formatForInput(fromSI(currentSI, currentUnit));
    onUnitChange?.(currentUnit);
  });

  return {
    element: wrapper,
    input,
    /** Update from the model (e.g. after undo). Leaves the field alone while the user is typing a matching value. */
    update(newSI, { force = false } = {}) {
      const same = newSI === currentSI;
      currentSI = newSI ?? null;
      if (!force && same && document.activeElement === input) return;
      setError(null);
      input.value = currentSI === null ? '' : formatForInput(fromSI(currentSI, currentUnit));
    },
  };
}

// ---- Engineering checks and derived values -----------------------------------------------

function inputsLine(inputs, prefs) {
  return h(
    'ul',
    { class: 'check__inputs' },
    inputs.map((item) =>
      h('li', null, h('span', { class: 'symbol' }, item.symbol), ' = ', h('span', { class: 'mono' }, formatQuantity(item.value, item.unit, item.displayUnit ?? preferredUnit(item.unit, prefs) ?? item.unit))),
    ),
  );
}

export function checkCard(check, prefs, { compact = false } = {}) {
  const details = [
    h('p', { class: 'check__message' }, check.message),
    check.equation ? h('p', { class: 'check__equation' }, h('span', { class: 'check__label' }, 'Equation'), h('code', null, check.equation)) : null,
    check.inputs?.length ? h('div', null, h('span', { class: 'check__label' }, 'Inputs'), inputsLine(check.inputs, prefs)) : null,
    check.result
      ? h(
          'p',
          null,
          h('span', { class: 'check__label' }, 'Result'),
          h('span', { class: 'symbol' }, check.result.symbol),
          ' = ',
          h('span', { class: 'mono' }, formatQuantity(check.result.value, check.result.unit, check.result.displayUnit ?? preferredUnit(check.result.unit, prefs))),
        )
      : null,
    check.assumptions?.length
      ? h('div', null, h('span', { class: 'check__label' }, 'Assumptions'), h('ul', { class: 'check__assumptions' }, check.assumptions.map((a) => h('li', null, a))))
      : null,
    h('p', { class: 'check__provenance' }, provenanceBadge(check.provenance), h('span', null, provenanceInfo(check.provenance).label), h('span', { class: 'check__id mono' }, check.id)),
  ];
  const summary = h('summary', { class: 'check__summary' }, severityIcon(check.severity), h('span', { class: 'check__title' }, check.title));
  return h('details', { class: ['check', `check--${check.severity}`], open: compact ? undefined : true }, summary, h('div', { class: 'check__details' }, details));
}

export function derivedList(derived, prefs) {
  if (!derived.length) return null;
  return h(
    'ul',
    { class: 'derived-list' },
    derived.map((item) =>
      h(
        'li',
        { class: 'derived' },
        h(
          'div',
          { class: 'derived__head' },
          h('span', { class: 'derived__label' }, item.label),
          h('span', { class: 'derived__value mono' }, h('span', { class: 'symbol' }, item.symbol), ' = ', formatQuantity(item.value, item.unit, item.displayUnit ?? preferredUnit(item.unit, prefs))),
        ),
        h('div', { class: 'derived__meta' }, provenanceBadge(item.provenance), h('code', null, item.equation)),
        item.note ? h('p', { class: 'derived__note' }, item.note) : null,
        item.assumptions?.length ? h('p', { class: 'derived__note' }, `Assumes: ${item.assumptions.join(' ')}`) : null,
      ),
    ),
  );
}

export function progressBar(value, max, { label } = {}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return h(
    'div',
    { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value), 'aria-label': label },
    h('div', { class: 'progress__bar', style: { width: `${(ratio * 100).toFixed(1)}%` } }),
  );
}
