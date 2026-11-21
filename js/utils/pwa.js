/**
 * Service-worker registration and update flow.
 *
 * A new deployment changes service-worker.js (its BUILD_ID), so the browser
 * installs the new worker in the background. It then waits; it does not take over
 * the open page. The app shows "Update available"; when the user accepts, pending
 * project edits are saved, the new worker activates, and the page reloads once.
 * IndexedDB data is never touched by the service worker, so projects survive updates.
 */
import { Emitter } from './events.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class UpdateManager extends Emitter {
  #log;
  #registration = null;
  #state = 'idle';
  #reloading = false;
  #interval = null;

  constructor({ log } = {}) {
    super();
    this.#log = log;
  }

  get state() {
    return this.#state;
  }

  get registration() {
    return this.#registration;
  }

  #setState(state, detail = {}) {
    this.#state = state;
    this.emit('state', { state, ...detail });
  }

  /** Why the service worker is not used in this context, or null when it can be. */
  static unsupportedReason(win = globalThis.window) {
    if (!win || !('serviceWorker' in win.navigator)) return 'This browser does not support service workers.';
    const { protocol, hostname, search } = win.location;
    if (protocol === 'file:') return 'Opened from a local file; offline mode needs an http(s) server.';
    if (protocol !== 'https:' && !LOCAL_HOSTS.has(hostname)) return 'Offline mode needs HTTPS (or localhost).';
    if (new URLSearchParams(search).has('nosw')) return 'Disabled for this session (?nosw).';
    try {
      if (win.localStorage.getItem('aerolab:sw') === 'off') return 'Disabled in this browser (developer setting).';
    } catch {
      // ignore
    }
    return null;
  }

  async register(url = './service-worker.js') {
    const reason = UpdateManager.unsupportedReason();
    if (reason) {
      this.#setState('unsupported', { reason });
      return null;
    }
    this.#setState('registering');
    try {
      const registration = await navigator.serviceWorker.register(url, { scope: './', updateViaCache: 'none' });
      this.#registration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) this.#setState('update-ready');
      else this.#setState(navigator.serviceWorker.controller ? 'active' : 'installing');

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              this.#log?.info('update', 'A new version has been downloaded and is ready to install');
              this.#setState('update-ready');
            } else {
              this.#log?.info('update', 'Offline mode ready: the application is cached on this device');
              this.#setState('active', { offlineReady: true });
            }
          }
          if (worker.state === 'redundant' && this.#state === 'registering') this.#setState('error', { reason: 'Installation failed' });
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (this.#reloading) window.location.reload();
        else if (this.#state !== 'update-ready') this.#setState('active');
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.checkForUpdate({ quiet: true });
      });
      this.#interval = setInterval(() => this.checkForUpdate({ quiet: true }), 30 * 60 * 1000);
      return registration;
    } catch (error) {
      this.#log?.warn('update', `Offline mode unavailable: ${error.message}`);
      this.#setState('error', { reason: error.message });
      return null;
    }
  }

  async checkForUpdate({ quiet = false } = {}) {
    if (!this.#registration) return false;
    try {
      await this.#registration.update();
      if (this.#registration.waiting && navigator.serviceWorker.controller) {
        this.#setState('update-ready');
        return true;
      }
      if (!quiet) this.#log?.info('update', 'Update check complete: you have the latest version');
      return false;
    } catch (error) {
      if (!quiet) this.#log?.warn('update', `Update check failed: ${error.message}`);
      return false;
    }
  }

  /** Activate the waiting worker and reload. `beforeReload` should flush unsaved work. */
  async applyUpdate(beforeReload) {
    const waiting = this.#registration?.waiting;
    if (!waiting) return false;
    if (beforeReload) await beforeReload();
    this.#reloading = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  }

  /** Version information of the files this page was loaded from. */
  static async fetchVersion(url = './version.json') {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  dispose() {
    clearInterval(this.#interval);
  }
}
