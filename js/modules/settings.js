/**
 * Settings: appearance, display units, autosave, storage and backups, application
 * version and updates, scope and responsible use.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, field, keyValueList, linkButton, nextId, pageHeader, selectControl } from '../ui/components.js';
import { REQUIREMENT_FIELDS } from '../engineering/requirements.js';
import { PROVENANCE, FIDELITY_DISCLAIMER } from '../engineering/provenance.js';
import { DB_NAME, storageStatus } from '../database.js';
import { formatBytes, formatDateTime, formatRelative } from '../utils/format.js';
import { APP_VERSION, BUILD_NAME, BUILD_NUMBER, CANONICAL_URL, REPOSITORY_URL } from '../version.js';
import { UpdateManager } from '../utils/pwa.js';
import { SHORTCUTS } from '../ui/shell.js';
import { syncCard } from './sync-settings.js';
import { installCard } from '../ui/install.js';

function radioGroup({ name, legend, options, value, onChange }) {
  const group = h(
    'fieldset',
    { class: 'segmented' },
    h('legend', { class: 'field__label' }, legend),
    h(
      'div',
      { class: 'segmented__options' },
      options.map((option) =>
        h('label', { class: 'segmented__option' }, h('input', { type: 'radio', name, value: option.value, checked: option.value === value }), h('span', null, option.label)),
      ),
    ),
  );
  group.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === name) onChange(event.target.value);
  });
  return group;
}

function appearanceCard(ctx) {
  const { prefs } = ctx;
  return card({
    title: 'Appearance',
    icon: 'sun',
    body: [
      radioGroup({
        name: 'pref-theme',
        legend: 'Theme',
        value: prefs.get('theme'),
        options: [
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'Match system' },
        ],
        onChange: (v) => prefs.set('theme', v),
      }),
      radioGroup({
        name: 'pref-density',
        legend: 'Density',
        value: prefs.get('density'),
        options: [
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ],
        onChange: (v) => prefs.set('density', v),
      }),
      radioGroup({
        name: 'pref-motion',
        legend: 'Motion',
        value: prefs.get('reducedMotion'),
        options: [
          { value: 'system', label: 'Follow system' },
          { value: 'reduce', label: 'Reduce motion' },
        ],
        onChange: (v) => prefs.set('reducedMotion', v),
      }),
    ],
  });
}

function unitsCard(ctx) {
  const { prefs } = ctx;
  return card({
    title: 'Display units',
    icon: 'sliders',
    description: 'Values are always stored in SI units; these choices only change how they are shown.',
    body: h(
      'div',
      { class: 'form-grid' },
      REQUIREMENT_FIELDS.map((def) => {
        const id = nextId('un');
        return field({
          id,
          label: def.label,
          control: selectControl({ id, options: def.displayUnits.map((u) => ({ value: u, label: u })), value: prefs.displayUnit(def.key, def.displayUnits[0]), onChange: (unit) => prefs.setDisplayUnit(def.key, unit) }),
        });
      }),
    ),
  });
}

function autosaveCard(ctx) {
  const { prefs, projects } = ctx;
  const toggleId = nextId('as');
  const delayId = nextId('as');
  const toggle = h('input', { id: toggleId, type: 'checkbox', class: 'switch', checked: prefs.get('autosave') });
  toggle.addEventListener('change', () => {
    prefs.set('autosave', toggle.checked);
    projects?.setAutosave({ enabled: toggle.checked });
    ctx.notify({ level: 'info', title: toggle.checked ? 'Autosave on' : 'Autosave off', message: toggle.checked ? 'Edits are saved automatically.' : 'Save with Ctrl+S or the save indicator. Unsaved edits are still saved when you close or switch projects.' });
  });
  const delay = selectControl({
    id: delayId,
    options: [500, 1200, 3000, 10000].map((ms) => ({ value: String(ms), label: ms < 1000 ? `${ms} ms` : `${ms / 1000} s` })),
    value: String(prefs.get('autosaveDelay')),
    onChange: (value) => {
      prefs.set('autosaveDelay', Number(value));
      projects?.setAutosave({ delay: Number(value) });
    },
  });
  return card({
    title: 'Autosave',
    icon: 'save',
    body: [
      h('label', { class: 'switch-row', for: toggleId }, toggle, h('span', null, 'Save edits automatically')),
      field({ id: delayId, label: 'Delay after the last edit', control: delay, hint: 'Continuous editing is still saved at least every 10 seconds.' }),
    ],
  });
}

async function storageCard(ctx) {
  const { db, projects, actions, prefs } = ctx;
  const status = await storageStatus();
  const trash = projects ? await projects.listProjects({ onlyDeleted: true }).catch(() => []) : [];
  const migrations = db ? await db.getMeta('migrations').catch(() => []) : [];
  return card({
    title: 'Data and storage',
    icon: 'database',
    description: 'This browser keeps a working copy of your projects (IndexedDB). Turn on Google Drive sync above to keep the shared copy in your Drive. Application updates never delete projects.',
    body: [
      keyValueList([
        ['Database', db ? `${DB_NAME} · schema version ${db.version}` : 'Unavailable'],
        ['Migrations applied', migrations?.length ? migrations.map((m) => `v${m.version} (${formatDateTime(m.appliedAt)})`).join(', ') : '—'],
        ['Persistent storage', status.persisted === null ? 'Not supported by this browser' : status.persisted ? 'Granted' : 'Not granted'],
        ['Storage used', status.usage === null ? '—' : `${formatBytes(status.usage)}${status.quota ? ` of ${formatBytes(status.quota)}` : ''}`],
        ['Last full backup', prefs.get('lastBackupAt') ? `${formatRelative(prefs.get('lastBackupAt'))} (${formatDateTime(prefs.get('lastBackupAt'))})` : 'Never'],
        ['Projects in Trash', h('a', { href: '#/projects/trash' }, String(trash.length))],
      ]),
      projects
        ? h(
            'div',
            { class: 'button-row' },
            button({ label: 'Export full backup', icon: 'download', variant: 'primary', size: 'sm', onClick: () => actions.exportBackup() }),
            button({ label: 'Restore from backup…', icon: 'upload', size: 'sm', onClick: () => actions.restoreBackup() }),
            status.persisted === false ? button({ label: 'Request persistent storage', icon: 'shield', size: 'sm', onClick: () => actions.requestPersistence() }) : null,
          )
        : null,
      h('p', { class: 'muted' }, 'Restoring a backup only adds data: projects that already exist are kept, identical ones are skipped and changed ones are added as copies.'),
    ],
  });
}

async function applicationCard(ctx) {
  const { pwa } = ctx;
  let version = null;
  try {
    version = await UpdateManager.fetchVersion();
  } catch {
    version = null;
  }
  const isCanonical = location.href.startsWith(CANONICAL_URL);
  const stateLabels = {
    unsupported: 'Not active',
    registering: 'Starting…',
    installing: 'Caching application for offline use…',
    active: 'Active — works offline',
    'update-ready': 'Update downloaded — reload to apply',
    error: 'Error',
    idle: 'Not started',
  };
  const status = h('span', null, stateLabels[pwa.state] ?? pwa.state);
  const reason = UpdateManager.unsupportedReason();
  return card({
    title: 'Application and updates',
    icon: 'layers',
    body: [
      keyValueList([
        ['Version', `${APP_VERSION} · Build ${BUILD_NUMBER} (${BUILD_NAME})`],
        ['Deployed commit', version?.commit ? h('code', null, version.commit) : '—'],
        ['Built', version?.builtAt ? formatDateTime(version.builtAt) : version?.commit === 'dev' ? 'Development copy' : '—'],
        ['Offline mode', h('span', null, status, reason ? h('span', { class: 'muted' }, ` — ${reason}`) : null)],
        ['Hosted application', h('a', { href: CANONICAL_URL, target: '_blank', rel: 'noopener noreferrer' }, CANONICAL_URL)],
        ['Source repository', h('a', { href: REPOSITORY_URL, target: '_blank', rel: 'noopener noreferrer' }, REPOSITORY_URL)],
      ]),
      h(
        'div',
        { class: 'button-row' },
        pwa.registration ? button({ label: 'Check for updates', icon: 'restore', size: 'sm', onClick: () => ctx.actions.checkForUpdates() }) : null,
        pwa.state === 'update-ready' ? button({ label: 'Install update and reload', icon: 'download', size: 'sm', variant: 'primary', onClick: () => ctx.actions.applyUpdate() }) : null,
      ),
      isCanonical
        ? h('p', { class: 'muted' }, 'This is the hosted application. New releases download in the background; you choose when to reload. Your projects stay in this browser across updates.')
        : h('p', { class: 'muted' }, 'This is a local or alternative copy. It does not update itself: pull the latest repository (or download a new copy) and reload. Projects are tied to the address you open the app from, so export a backup before switching addresses.'),
    ],
  });
}

function scopeCard() {
  return card({
    title: 'Scope, fidelity and responsible use',
    icon: 'shield',
    class: 'span-2',
    body: [
      h('p', null, 'AEROLAB X supports civilian, scientific, educational, inspection, mapping, environmental-monitoring and search-and-rescue research aircraft. It does not implement weapon design or integration, targeting, weapon release or delivery, autonomous attack or harmful payloads. Payload work is limited to cameras, mapping sensors, scientific instruments, communication relay and other benign equipment. AI and autonomy experiments run only in simulation and are never connected to physical flight controls.'),
      h('p', null, FIDELITY_DISCLAIMER),
      h('h3', { class: 'subheading' }, 'Provenance labels used throughout the application'),
      h(
        'table',
        { class: 'table table--compact' },
        h('caption', { class: 'visually-hidden' }, 'Provenance labels'),
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Label'), h('th', { scope: 'col' }, 'Meaning'))),
        h(
          'tbody',
          null,
          Object.values(PROVENANCE).map((info) => h('tr', null, h('td', null, h('span', { class: ['provenance', `provenance--${info.tone}`] }, info.short), ' ', info.label), h('td', null, info.description))),
        ),
      ),
    ],
  });
}

function shortcutsCard() {
  return card({
    title: 'Keyboard shortcuts',
    icon: 'keyboard',
    body: h('table', { class: 'table table--compact' }, h('tbody', null, SHORTCUTS.map(([keys, action]) => h('tr', null, h('td', null, h('kbd', null, keys)), h('td', null, action))))),
  });
}

export async function mount(container, ctx) {
  const [storage, application] = await Promise.all([storageCard(ctx), applicationCard(ctx)]);
  const sync = syncCard(ctx);
  const install = installCard();
  container.replaceChildren(
    pageHeader({ title: 'Settings', icon: 'sliders', subtitle: 'Google Drive sync, installation, appearance, units, saving and updates.', badges: [badge(`v${APP_VERSION}`, 'neutral')] }),
    h('div', { class: 'page-grid' }, sync.element, install.element, appearanceCard(ctx), unitsCard(ctx), autosaveCard(ctx), storage, application, shortcutsCard(), scopeCard()),
    h('p', { class: 'page-footnote' }, icon('info', { size: 14 }), ` Open source repository: `, linkButton({ href: REPOSITORY_URL, label: 'batraamul/Drone_Design', external: true, size: 'sm', variant: 'ghost' })),
  );
  const off = ctx.pwa.on('state', () => ctx.router.resolve());
  return () => {
    off();
    sync.destroy();
    install.destroy();
  };
}
