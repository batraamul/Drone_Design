/**
 * Settings card: Google Drive sync (set-up steps, status, devices, erase local copy).
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, field, nextId } from '../ui/components.js';
import { confirmDialog } from '../ui/dialog.js';
import { thisDevice, renameDevice, CLIENT_ID_PATTERN } from '../sync/gdrive.js';
import { formatRelative, formatBytes } from '../utils/format.js';

export const SYNC_LABELS = {
  off: ['Off', 'neutral'],
  blocked: ['Needs set-up', 'warning'],
  signin: ['Sign in needed', 'warning'],
  syncing: ['Syncing…', 'info'],
  ok: ['Synced', 'success'],
  offline: ['Offline', 'warning'],
  error: ['Problem', 'danger'],
};

export function syncCard(ctx) {
  const { drive } = ctx;
  const clientId = nextId('gd');
  const deviceId = nextId('gd');
  const clientInput = h('input', { id: clientId, class: 'input', type: 'text', value: drive.clientId, placeholder: '123456789-abc….apps.googleusercontent.com', autocomplete: 'off', spellcheck: 'false' });
  const deviceInput = h('input', { id: deviceId, class: 'input', type: 'text', value: thisDevice().name, maxlength: 40, autocomplete: 'off' });
  const clientField = field({
    id: clientId,
    label: '1. Your Google OAuth Client ID',
    control: clientInput,
    hint: 'Use the same Client ID as E-Diary. It must list https://batraamul.github.io under “Authorized JavaScript origins”, with the Google Drive API turned on.',
  });
  clientInput.addEventListener('change', () => {
    const value = clientInput.value.trim();
    const error = clientField.querySelector('.field__error');
    if (value && !CLIENT_ID_PATTERN.test(value)) {
      error.textContent = 'This does not look like a Client ID. It ends with .apps.googleusercontent.com.';
      return;
    }
    error.textContent = '';
    drive.setClientId(value);
  });
  deviceInput.addEventListener('change', () => {
    deviceInput.value = renameDevice(deviceInput.value).name;
    if (drive.enabled) drive.sync('rename');
  });

  const status = h('div', { class: 'sync-status-panel', 'aria-live': 'polite' });
  const render = () => {
    const [label, tone] = SYNC_LABELS[drive.state] ?? [drive.state, 'neutral'];
    const actions = [];
    if (!drive.enabled) actions.push(button({ label: 'Connect Google Drive and sync', icon: 'upload', variant: 'primary', onClick: () => drive.connect() }));
    else {
      actions.push(button({ label: drive.state === 'signin' ? 'Sign in to Google' : 'Sync now', icon: 'restore', variant: 'primary', onClick: () => drive.sync('manual') }));
      actions.push(button({ label: 'Turn off on this device', variant: 'ghost', onClick: () => drive.turnOff() }));
    }
    status.replaceChildren(
      h('p', { class: 'sync-status-panel__line' }, h('strong', null, '3. Status: '), badge(label, tone), drive.enabled && drive.lastSync ? h('span', { class: 'muted' }, ` last synced ${formatRelative(new Date(drive.lastSync).toISOString())}`) : null),
      drive.error ? h('p', { class: 'notice notice--warning' }, icon('warning', { size: 16 }), drive.error) : null,
      h('div', { class: 'button-row' }, actions),
      drive.peers.length
        ? h(
            'div',
            null,
            h('p', { class: 'muted' }, 'Other devices syncing with this one:'),
            h('ul', { class: 'chip-list' }, drive.peers.map((p) => h('li', null, h('span', { class: 'chip', title: `${formatBytes(p.size)}, updated ${formatRelative(p.modified)}` }, `${p.name} · ${formatRelative(p.modified)}`)))),
          )
        : null,
      drive.enabled && drive.state === 'ok'
        ? h(
            'details',
            { class: 'sync-erase' },
            h('summary', null, 'Use this browser without keeping a copy here'),
            h('p', { class: 'muted' }, 'Removes the projects stored in this browser. Everything is already in your Google Drive and comes back the next time you sign in here. Useful on a shared or office computer.'),
            button({
              label: 'Erase this browser’s copy',
              icon: 'trash',
              variant: 'danger',
              size: 'sm',
              onClick: async () => {
                const ok = await confirmDialog({ title: 'Erase this browser’s copy?', message: 'Your projects stay in Google Drive. This browser will keep nothing until you sign in again.', confirmLabel: 'Erase', danger: true });
                if (!ok) return;
                try {
                  await drive.eraseLocalCopy();
                } catch (error) {
                  ctx.notify({ level: 'warning', title: 'Not erased', message: error.message });
                }
              },
            }),
          )
        : null,
    );
  };
  render();
  const offs = [drive.on('state', render), drive.on('config', render)];

  const element = card({
    title: 'Google Drive sync',
    icon: 'database',
    class: 'span-2',
    description: 'Keep your projects in a JSON file in your own Google Drive and use them on every computer — the same way E-Diary syncs.',
    body: [
      h(
        'ul',
        { class: 'plain-list' },
        h('li', null, 'Each device saves its copy as “AEROLAB X — ', h('em', null, 'device name'), '.json” in the folder “AEROLAB X sync” in your Drive. AEROLAB X can see only the files it created.'),
        h('li', null, 'Changes made on different computers are merged item by item: nothing is lost, and deleted items stay deleted.'),
        h('li', null, 'This browser keeps a working copy so the app opens instantly and works offline; it is sent to Google Drive automatically a few seconds after each change.'),
      ),
      h('div', { class: 'form-row' }, clientField, field({ id: deviceId, label: '2. Name of this device', control: deviceInput, hint: 'Shown on your other devices, e.g. “Office PC” or “Home Mac”.' })),
      status,
    ],
  });
  return { element, destroy: () => offs.forEach((off) => off()) };
}
