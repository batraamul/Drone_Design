/**
 * Google Drive sync (same design as E-Diary's js/gdrive.js).
 *
 *  - Sign-in with Google Identity Services, using YOUR OAuth Client ID (Settings). The
 *    same Client ID as E-Diary works, because both apps are served from batraamul.github.io.
 *  - Scope drive.file: AEROLAB X can see only the files it created itself.
 *  - A folder "AEROLAB X sync" in your Drive holds one JSON file per device, e.g.
 *    "AEROLAB X — Office PC.json": a full copy of your projects, versions and learning progress.
 *  - Each device writes ONLY its own file, so devices can never overwrite each other.
 *    Each device reads the others' files and merges them in item by item (js/sync/merge.js),
 *    remembering what it last took from each device, so additions, edits and deletions all
 *    come through — the same way E-Diary merges.
 *  - The browser keeps a working copy so the app opens instantly and works offline; the
 *    JSON files in Google Drive are the shared copy that every device synchronises with.
 */
import { Emitter } from '../utils/events.js';
import { uid } from '../utils/id.js';
import { STORES } from '../database.js';
import { mergeSnapshots, fingerprint } from './merge.js';
import { APP_VERSION } from '../version.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'AEROLAB X sync';
const TOKEN_KEY = 'aerolab:gdrive-token';
const DEVICE_KEY = 'aerolab:device';
const CONFIG_KEY = 'aerolab:gdrive';
const qs = (s) => encodeURIComponent(s);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

/** This device's identity (kept in this browser only; never synced). */
export function thisDevice() {
  let device = readJson(localStorage, DEVICE_KEY);
  if (!device?.id) {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Linux/.test(ua) ? 'Linux PC' : 'Computer';
    device = { id: uid('dev'), name: `${os} ${Math.random().toString(36).slice(2, 5).toUpperCase()}` };
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    } catch {
      // private window: a new identity each visit
    }
  }
  return device;
}

export function renameDevice(name) {
  const device = { ...thisDevice(), name: String(name ?? '').trim().slice(0, 40) || thisDevice().name };
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  } catch {
    // ignore
  }
  return device;
}

export class DriveSync extends Emitter {
  #ctx;
  #token = null;
  #expires = 0;
  #client = null;
  #clientKey = '';
  #waiters = [];
  #busy = false;
  #again = false;
  #timer = null;
  #interval = null;
  #fails = 0;

  /** state: off | blocked | signin | syncing | ok | offline | error */
  state = 'off';
  error = '';
  peers = [];
  lastSync = 0;

  constructor(ctx) {
    super();
    this.#ctx = ctx;
    const cached = readJson(sessionStorage, TOKEN_KEY);
    if (cached?.t && cached.x > Date.now() + 60000 && cached.c === this.clientId) {
      this.#token = cached.t;
      this.#expires = cached.x;
    }
    this.lastSync = this.config.lastSync ?? 0;
  }

  // ---- configuration ----------------------------------------------------------------
  /** Sync settings live in localStorage (like E-Diary), separate from the project data. */
  get config() {
    return readJson(localStorage, CONFIG_KEY) ?? {};
  }

  #setConfig(patch) {
    const next = { ...this.config, ...patch };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      // storage blocked
    }
    this.emit('config', next);
    return next;
  }

  get clientId() {
    return String(this.config.clientId ?? '').trim();
  }

  get enabled() {
    return Boolean(this.config.on);
  }

  setClientId(value) {
    this.#setConfig({ clientId: String(value ?? '').trim() });
    this.#client = null;
  }

  /** Why sync cannot run here, or '' when it can. */
  blocked() {
    if (!this.#ctx.projects) return 'Local storage is not available in this browser window.';
    if (location.protocol === 'file:') return 'Open AEROLAB X from its web address (not as a file) to use Google sign-in.';
    if (!CLIENT_ID_PATTERN.test(this.clientId)) return 'noclient';
    return '';
  }

  #setState(state, error = this.error) {
    this.state = state;
    this.error = error;
    this.emit('state', { state, error });
  }

  get connected() {
    return Boolean(this.#token && Date.now() < this.#expires - 60000);
  }

  // ---- Google sign-in -----------------------------------------------------------------
  #loadGis() {
    if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
    if (this.#loadGis.promise) return this.#loadGis.promise;
    this.#loadGis.promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.#loadGis.promise = null;
        reject(new Error('Could not reach Google. Check the internet connection.'));
      };
      document.head.append(script);
    });
    return this.#loadGis.promise;
  }

  #tokenClient() {
    const key = this.clientId;
    if (this.#client && this.#clientKey === key) return this.#client;
    this.#clientKey = key;
    this.#client = google.accounts.oauth2.initTokenClient({
      client_id: key,
      scope: SCOPE,
      include_granted_scopes: true,
      hint: this.config.email || undefined,
      callback: (response) => {
        if (!response || response.error) return this.#finish(false, response?.error_description ?? response?.error ?? 'Sign-in failed');
        if (response.scope && !response.scope.includes(SCOPE)) return this.#finish(false, 'scope');
        this.#token = response.access_token;
        this.#expires = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ t: this.#token, x: this.#expires, c: key }));
        } catch {
          // private window
        }
        return this.#finish(true);
      },
      error_callback: (err) =>
        this.#finish(false, err?.type === 'popup_failed_to_open' ? 'popup' : err?.type === 'popup_closed' ? 'closed' : err?.message ?? 'Sign-in failed'),
    });
    return this.#client;
  }

  #finish(ok, why) {
    const waiters = this.#waiters;
    this.#waiters = [];
    waiters.forEach((fn) => fn(ok, why));
  }

  /** Ask Google for a one-hour pass (opens a Google window; must follow a click). */
  signIn(prompt = '') {
    return new Promise((resolve) => {
      this.#loadGis()
        .then(() => {
          this.#waiters.push((ok, why) => resolve({ ok, why }));
          this.#tokenClient().requestAccessToken({ prompt });
        })
        .catch((error) => resolve({ ok: false, why: error.message }));
    });
  }

  #signInMessage(why) {
    if (why === 'popup') return 'The browser blocked Google’s sign-in window. Allow pop-ups for this address and click “Sign in” again.';
    if (why === 'closed') return 'The Google window was closed before sign-in finished.';
    if (why === 'scope') return 'Google did not give AEROLAB X access to Google Drive. Sign in again and tick the Google Drive box.';
    return why || 'Sign-in did not finish.';
  }

  // ---- Drive REST -----------------------------------------------------------------------
  async #api(method, url, options = {}, tries = 0) {
    if (!this.connected) throw Object.assign(new Error('signin'), { code: 401 });
    let response;
    try {
      response = await fetch(url, { method, headers: { Authorization: `Bearer ${this.#token}`, ...(options.headers ?? {}) }, body: options.body });
    } catch {
      throw Object.assign(new Error('offline'), { code: 0 });
    }
    if (response.status === 401) {
      this.#token = null;
      this.#expires = 0;
      throw Object.assign(new Error('signin'), { code: 401 });
    }
    if ((response.status === 429 || response.status >= 500) && tries < 3) {
      await sleep(700 * 2 ** tries + Math.random() * 300);
      return this.#api(method, url, options, tries + 1);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (/has not been used in project|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(text)) throw new Error('apidisabled');
      if (response.status === 403 && /insufficient|scope/i.test(text)) throw new Error('scope');
      let message = text;
      try {
        message = JSON.parse(text).error.message;
      } catch {
        // not JSON
      }
      throw Object.assign(new Error(`Google Drive answered: ${String(message || response.status).slice(0, 200)}`), { code: response.status });
    }
    if (options.raw) return response;
    return response.status === 204 ? null : response.json();
  }

  async #folder() {
    if (this.config.folder) return this.config.folder;
    const found = await this.#api('GET', `${API}/files?q=${qs("appProperties has { key='aerolab' and value='folder' } and trashed = false")}&fields=${qs('files(id,createdTime)')}&orderBy=createdTime&pageSize=10&spaces=drive`);
    let id = found?.files?.[0]?.id;
    if (!id) {
      const created = await this.#api('POST', `${API}/files?fields=id`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', appProperties: { aerolab: 'folder' } }),
      });
      id = created.id;
    }
    this.#setConfig({ folder: id });
    return id;
  }

  async #listCopies() {
    const result = await this.#api('GET', `${API}/files?q=${qs("appProperties has { key='aerolab' and value='device' } and trashed = false")}&fields=${qs('files(id,name,modifiedTime,version,size,appProperties)')}&pageSize=100&spaces=drive`);
    return (result?.files ?? []).map((f) => ({
      id: f.id,
      modified: f.modifiedTime,
      version: String(f.version ?? f.modifiedTime ?? ''),
      size: Number(f.size) || 0,
      device: f.appProperties?.dev ?? '',
      deviceName: f.appProperties?.name ?? String(f.name).replace(/^AEROLAB X — |\.json$/g, ''),
    }));
  }

  async #download(id) {
    const response = await this.#api('GET', `${API}/files/${id}?alt=media`, { raw: true });
    return JSON.parse(await response.text());
  }

  async #upload(text, meta, fileId) {
    const boundary = `aerolab-${Math.random().toString(36).slice(2)}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--\r\n`;
    return this.#api(fileId ? 'PATCH' : 'POST', `${UPLOAD}/files${fileId ? `/${fileId}` : ''}?uploadType=multipart&fields=${qs('id,version')}`, {
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  // ---- one sync round -------------------------------------------------------------------
  async #round() {
    const { projects, db, log } = this.#ctx;
    const me = thisDevice();
    await this.#folder();
    const files = await this.#listCopies();
    const mine = files.find((f) => f.device === me.id) ?? null;
    const peers = files.filter((f) => f.device && f.device !== me.id);
    const seen = { ...(this.config.seen ?? {}) };
    // Includes this device's own copy when it is not the version uploaded from here
    // (e.g. after erasing the browser's copy), so it is read back before being replaced.
    const changed = files.filter((f) => f.device && seen[f.id] !== f.version);

    let snapshot = await projects.snapshot();
    const startPrint = fingerprint(snapshot);
    const bases = [];
    for (const file of changed) {
      const copy = await this.#download(file.id);
      if (copy?.app !== 'AEROLAB X' || copy.kind !== 'device-copy' || !copy.data) continue;
      const base = await db.getMeta(`gd-base:${file.device}`);
      snapshot = mergeSnapshots(base ?? null, snapshot, copy.data);
      bases.push([file, copy.data]);
    }
    if (changed.length) {
      // Edits typed while the copies were downloading would be overwritten: try again shortly.
      if (projects.busyEditing) return 'deferred';
      const applied = await projects.applySnapshot(snapshot);
      for (const [file, data] of bases) {
        await db.put(STORES.meta, { key: `gd-base:${file.device}`, value: data });
        seen[file.id] = file.version;
      }
      this.#setConfig({ seen });
      if (applied) {
        log.info('sync', `Merged changes from ${bases.map(([f]) => f.deviceName).join(', ')} (${applied} project${applied === 1 ? '' : 's'} updated)`);
        this.#ctx.notify({ level: 'info', title: 'Synced from Google Drive', message: `${applied} project${applied === 1 ? '' : 's'} updated with changes from your other devices.`, timeout: 4000 });
      }
    }
    const print = fingerprint(snapshot);
    if (!mine || this.config.upPrint !== print || mine.deviceName !== me.name || startPrint !== print) {
      const meta = { name: `AEROLAB X — ${me.name}.json`, mimeType: 'application/json', appProperties: { aerolab: 'device', dev: me.id, name: me.name.slice(0, 60) } };
      if (!mine) meta.parents = [this.config.folder];
      const payload = { app: 'AEROLAB X', kind: 'device-copy', format: 1, appVersion: APP_VERSION, device: me, savedAt: new Date().toISOString(), data: snapshot };
      const result = await this.#upload(JSON.stringify(payload), meta, mine?.id);
      this.#setConfig({ upPrint: print, myFile: result.id, seen: { ...(this.config.seen ?? {}), [result.id]: String(result.version) } });
    }
    this.peers = peers.map((f) => ({ id: f.id, name: f.deviceName, modified: f.modified, size: f.size }));
    return 'ok';
  }

  /** Run a sync round. `why`: 'manual' and 'connect' may open Google's sign-in window. */
  async sync(why = 'auto') {
    if (!this.enabled) return;
    if (this.#busy) {
      this.#again = true;
      return;
    }
    const blocked = this.blocked();
    if (blocked) {
      this.#setState('blocked', blocked === 'noclient' ? 'Paste your OAuth Client ID in Settings → Google Drive sync.' : blocked);
      return;
    }
    if (!this.connected) {
      if (why === 'manual' || why === 'connect') {
        const { ok, why: reason } = await this.signIn(why === 'connect' ? 'consent' : '');
        if (!ok) {
          this.#setState('signin', this.#signInMessage(reason));
          return;
        }
      } else {
        this.#setState('signin', 'Sign in to Google to sync (Google passes last one hour).');
        return;
      }
    }
    const run = async () => {
      this.#busy = true;
      this.#setState('syncing', '');
      try {
        const result = await this.#round();
        if (result === 'deferred') {
          setTimeout(() => this.sync('deferred'), 4000);
          this.#setState('ok', '');
        } else {
          this.#fails = 0;
          this.lastSync = Date.now();
          this.#setConfig({ lastSync: this.lastSync });
          this.#setState('ok', '');
        }
      } catch (error) {
        this.#fail(error);
      } finally {
        this.#busy = false;
      }
    };
    if (navigator.locks?.request) await navigator.locks.request('aerolab-gdrive', run);
    else await run();
    if (this.#again) {
      this.#again = false;
      setTimeout(() => this.sync('again'), 300);
    }
  }

  #fail(error) {
    const message = error?.message;
    this.#fails += 1;
    if (message === 'signin') this.#setState('signin', 'Google sign-in expired. Click “Sign in” to continue syncing.');
    else if (message === 'offline') {
      this.#setState('offline', 'No internet connection. Changes are kept here and go to Google Drive when you are back online.');
      setTimeout(() => this.sync('retry'), Math.min(300000, 15000 * this.#fails));
    } else if (message === 'apidisabled') this.#setState('error', 'The Google Drive API is turned off in your Google Cloud project. Turn it on (APIs & Services → Library → Google Drive API) and sync again.');
    else if (message === 'scope') this.#setState('signin', this.#signInMessage('scope'));
    else {
      this.#setState('error', message || 'Google Drive did not answer.');
      setTimeout(() => this.sync('retry'), Math.min(300000, 20000 * this.#fails));
    }
    this.#ctx.log.warn('sync', `Google Drive sync: ${this.error}`);
  }

  // ---- lifecycle -----------------------------------------------------------------------
  /** Sync soon after local changes, every two minutes, and when the tab comes back. */
  start() {
    const { projects } = this.#ctx;
    if (!projects) return;
    const soon = () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.sync('change'), 5000);
    };
    projects.on('saved', soon);
    projects.on('projects-changed', ({ remote }) => !remote && soon());
    projects.on('versions-changed', soon);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.sync('visible'));
    window.addEventListener('online', () => this.sync('online'));
    this.#interval = setInterval(() => document.visibilityState === 'visible' && this.sync('interval'), 120000);
    if (this.enabled) {
      if (this.connected) this.sync('start');
      else this.#setState('signin', 'Sign in to Google to sync your projects.');
    }
  }

  async connect() {
    const blocked = this.blocked();
    if (blocked) {
      this.#setState('blocked', blocked === 'noclient' ? 'Paste a valid OAuth Client ID first (it ends with .apps.googleusercontent.com).' : blocked);
      return false;
    }
    this.#setConfig({ on: true });
    await this.sync('connect');
    if (this.state === 'ok') {
      this.#ctx.notify({ level: 'success', title: 'Google Drive sync is on', message: `This device keeps its copy in “${FOLDER_NAME}” in your Google Drive and merges your other devices' changes.` });
      return true;
    }
    return false;
  }

  /** True when this device's latest data is safely in Google Drive. */
  async isFullySynced() {
    if (!this.enabled || this.state !== 'ok' || !this.#ctx.projects) return false;
    const snapshot = await this.#ctx.projects.snapshot();
    return fingerprint(snapshot) === this.config.upPrint;
  }

  /**
   * Remove this browser's working copy (projects, versions, progress, preferences). Sync
   * settings are kept, so the next sign-in downloads everything again from Google Drive.
   * Allowed only when everything is already in Google Drive.
   */
  async eraseLocalCopy() {
    if (!(await this.isFullySynced())) throw new Error('Sync first: some changes on this device are not in Google Drive yet.');
    this.#setConfig({ seen: {}, upPrint: '' });
    this.#ctx.db.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.#ctx.db.name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close the other AEROLAB X tabs, then try again.'));
    });
    for (const key of ['aerolab:theme', 'aerolab:density']) localStorage.removeItem(key);
    location.reload();
  }

  turnOff() {
    this.#setConfig({ on: false });
    this.#setState('off', '');
    this.#ctx.notify({ level: 'info', title: 'Google Drive sync is off on this device', message: 'The copies in Google Drive are kept.' });
  }
}
