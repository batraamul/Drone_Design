/**
 * User preferences. Persisted in IndexedDB (preferences store); a few values that
 * must be known before first paint (theme, density) are mirrored to localStorage.
 * Works in memory only if the database is unavailable.
 */
import { Emitter } from './events.js';

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'dark', // 'dark' | 'light' | 'system'
  density: 'comfortable', // 'comfortable' | 'compact'
  reducedMotion: 'system', // 'system' | 'reduce'
  navCollapsed: false,
  inspectorCollapsed: false,
  bottomCollapsed: false,
  inspectorWidth: 320,
  bottomHeight: 180,
  bottomTab: 'console',
  autosave: true,
  autosaveDelay: 1200,
  displayUnits: {},
  lastProjectId: null,
  lastBackupAt: null,
});

const MIRRORED = { theme: 'aerolab:theme', density: 'aerolab:density' };

export class Preferences extends Emitter {
  #values = { ...DEFAULT_PREFERENCES };
  #db = null;

  async load(db) {
    this.#db = db;
    if (db) {
      try {
        const stored = await db.getAllPreferences();
        this.#values = { ...DEFAULT_PREFERENCES, ...stored };
      } catch {
        // keep defaults
      }
    } else {
      for (const [key, storageKey] of Object.entries(MIRRORED)) {
        try {
          const value = localStorage.getItem(storageKey);
          if (value) this.#values[key] = value;
        } catch {
          // storage blocked
        }
      }
    }
    return this;
  }

  get(key) {
    return this.#values[key] ?? DEFAULT_PREFERENCES[key];
  }

  get all() {
    return { ...this.#values };
  }

  async set(key, value) {
    if (this.#values[key] === value) return;
    this.#values[key] = value;
    if (MIRRORED[key]) {
      try {
        localStorage.setItem(MIRRORED[key], String(value));
      } catch {
        // storage blocked; IndexedDB copy still applies after load
      }
    }
    this.emit('change', { key, value });
    if (this.#db) {
      try {
        await this.#db.setPreference(key, value);
      } catch {
        // preference persistence is best-effort
      }
    }
  }

  /** Display unit chosen for a quantity key, falling back to `fallback`. */
  displayUnit(key, fallback) {
    return this.#values.displayUnits?.[key] ?? fallback;
  }

  setDisplayUnit(key, unit) {
    return this.set('displayUnits', { ...(this.#values.displayUnits ?? {}), [key]: unit });
  }
}
