/**
 * DOM construction helpers. All text goes through textContent / text nodes, never
 * innerHTML, so names and notes from imported files cannot inject markup.
 * Inline styles are applied through the CSSOM, which the Content-Security-Policy permits.
 */
const PROPERTY_KEYS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'indeterminate', 'open', 'multiple', 'readOnly', 'required']);

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class' || key === 'className') {
      const classes = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      if (el instanceof SVGElement) el.setAttribute('class', classes);
      else el.className = classes;
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) if (v !== undefined && v !== null) el.dataset[k] = String(v);
    } else if (key === 'style') {
      for (const [k, v] of Object.entries(value)) {
        if (k.startsWith('--')) el.style.setProperty(k, v);
        else el.style[k] = v;
      }
    } else if (key === 'text') {
      el.textContent = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (PROPERTY_KEYS.has(key)) {
      el[key] = value;
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Create an HTML element: h('button', { class: 'btn', onClick }, 'Label'). */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  return append(el, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element. */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  return append(el, children);
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** True when keyboard focus is in an editable control (native undo should win there). */
export function isEditable(target) {
  if (!(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type);
  }
  return target instanceof HTMLSelectElement;
}

/** Run `fn` at most once per animation frame. */
export function rafThrottle(fn) {
  let frame = null;
  let lastArgs = [];
  return (...args) => {
    lastArgs = args;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      fn(...lastArgs);
    });
  };
}

export function debounce(fn, delay) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
