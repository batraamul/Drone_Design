/**
 * "Install AEROLAB X" help: one-click install where the browser offers it, plus
 * plain instructions for every system.
 */
import { h } from '../utils/dom.js';
import { button, card } from './components.js';

let deferredPrompt = null;
const listeners = new Set();

/** Call once at start-up: captures the browser's install offer. */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
}

function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}

const STEPS = {
  windows: 'Chrome or Edge: click the install icon at the right end of the address bar (or menu ⋮ → “Install AEROLAB X”). It appears in the Start menu; right-click it there to pin to the taskbar.',
  mac: 'Use Google Chrome or Edge: click the install icon in the address bar. Do not use Safari “Add to Dock”: Safari would mix AEROLAB X up with E-Diary, which lives on the same web address.',
  linux: 'Chrome or Chromium on Ubuntu or Kali: click the install icon in the address bar. It appears in the applications menu.',
  android: 'Chrome: menu ⋮ → “Install app” (or “Add to Home screen”).',
  ios: 'Safari: Share → “Add to Home Screen”.',
  other: 'Open this page in Chrome or Edge and use “Install app” from the browser menu.',
};

export function installCard() {
  const body = h('div');
  const render = () => {
    if (isInstalled()) {
      body.replaceChildren(h('p', null, 'AEROLAB X is installed and running in its own window. It updates itself whenever a new version is published.'));
      return;
    }
    const here = platform();
    body.replaceChildren(
      h('p', null, 'Install AEROLAB X like a normal program: it gets its own window and icon, works offline, and updates itself automatically. No download or administrator rights are needed.'),
      deferredPrompt
        ? button({
            label: 'Install AEROLAB X on this computer',
            icon: 'download',
            variant: 'primary',
            onClick: async () => {
              const prompt = deferredPrompt;
              deferredPrompt = null;
              await prompt.prompt();
              render();
            },
          })
        : h('p', { class: 'notice notice--info' }, STEPS[here]),
      h(
        'details',
        { class: 'install-more' },
        h('summary', null, 'Instructions for other systems'),
        h(
          'ul',
          { class: 'plain-list' },
          h('li', null, h('strong', null, 'Windows: '), STEPS.windows),
          h('li', null, h('strong', null, 'macOS: '), STEPS.mac),
          h('li', null, h('strong', null, 'Ubuntu / Kali Linux: '), STEPS.linux),
          h('li', null, h('strong', null, 'Android: '), STEPS.android),
          h('li', null, h('strong', null, 'iPhone / iPad: '), STEPS.ios),
        ),
      ),
    );
  };
  render();
  listeners.add(render);
  const element = card({ title: 'Install the app', icon: 'download', body });
  return { element, destroy: () => listeners.delete(render) };
}
