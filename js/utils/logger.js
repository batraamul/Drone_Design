/**
 * Engineering console log. Keeps a bounded in-memory history that the bottom
 * panel displays, and mirrors entries to the browser console for developers.
 *
 * Convention: handled, user-facing problems (an invalid import file, a save
 * conflict) are logged as warnings; `error` is reserved for genuine faults.
 */
import { Emitter } from './events.js';

const LEVELS = ['debug', 'info', 'warn', 'error'];

export class Logger extends Emitter {
  #entries = [];
  #limit;
  #mirror;
  #sequence = 0;

  constructor({ limit = 500, mirror = true } = {}) {
    super();
    this.#limit = limit;
    this.#mirror = mirror;
  }

  get entries() {
    return this.#entries.slice();
  }

  log(level, category, message, data) {
    const entry = {
      id: ++this.#sequence,
      level: LEVELS.includes(level) ? level : 'info',
      category: String(category ?? 'app'),
      message: String(message ?? ''),
      data,
      time: new Date().toISOString(),
    };
    this.#entries.push(entry);
    if (this.#entries.length > this.#limit) this.#entries.splice(0, this.#entries.length - this.#limit);
    if (this.#mirror && typeof console !== 'undefined') {
      const method = entry.level === 'warn' ? 'warn' : entry.level === 'error' ? 'error' : entry.level === 'debug' ? 'debug' : 'info';
      // eslint-disable-next-line no-console
      console[method](`[AEROLAB X] [${entry.category}] ${entry.message}`);
    }
    this.emit('entry', entry);
    return entry;
  }

  debug(category, message, data) {
    return this.log('debug', category, message, data);
  }

  info(category, message, data) {
    return this.log('info', category, message, data);
  }

  warn(category, message, data) {
    return this.log('warn', category, message, data);
  }

  error(category, message, data) {
    return this.log('error', category, message, data);
  }

  clear() {
    this.#entries = [];
    this.emit('clear');
  }
}
