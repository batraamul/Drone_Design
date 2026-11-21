/**
 * Hash-based router. Hash routes work on GitHub Pages project sites, on any static
 * server and in local copies without server-side rewrites.
 *
 * Route format: #/<module>[/<segment>...][?key=value]
 */
import { Emitter } from './utils/events.js';

export const DEFAULT_ROUTE = 'dashboard';

/** Parse a location hash into { module, segments, params, path }. Pure; safe for any input. */
export function parseHash(hash) {
  let raw = String(hash ?? '');
  if (raw.startsWith('#')) raw = raw.slice(1);
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => /^[A-Za-z0-9_.~-]{1,120}$/.test(segment));
  const params = Object.fromEntries(new URLSearchParams(queryPart));
  const module = segments.shift() ?? DEFAULT_ROUTE;
  return { module, segments, params, path: [module, ...segments].join('/') };
}

export function buildHash(module, segments = [], params = {}) {
  const path = [module, ...segments].map((segment) => encodeURIComponent(segment)).join('/');
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return `#/${path}${query ? `?${query}` : ''}`;
}

export class Router extends Emitter {
  #window;
  #current = null;
  #guards = [];
  #handler = () => this.resolve();

  constructor({ window: win = globalThis.window } = {}) {
    super();
    this.#window = win;
  }

  get current() {
    return this.#current;
  }

  start() {
    this.#window.addEventListener('hashchange', this.#handler);
    this.resolve();
  }

  stop() {
    this.#window.removeEventListener('hashchange', this.#handler);
  }

  /** Register an async guard `(next, previous) => boolean`; returning false cancels navigation. */
  beforeEach(guard) {
    this.#guards.push(guard);
  }

  navigate(module, segments = [], params = {}, { replace = false } = {}) {
    const hash = buildHash(module, segments, params);
    if (this.#window.location.hash === hash) {
      this.resolve();
      return;
    }
    if (replace) this.#window.history.replaceState(null, '', hash);
    else this.#window.location.hash = hash;
    if (replace) this.resolve();
  }

  async resolve() {
    const next = parseHash(this.#window.location.hash);
    const previous = this.#current;
    for (const guard of this.#guards) {
      // eslint-disable-next-line no-await-in-loop
      const allowed = await guard(next, previous);
      if (allowed === false) return;
    }
    this.#current = next;
    this.emit('route', { route: next, previous });
  }
}
