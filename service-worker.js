/*
 * AEROLAB X service worker — offline application shell with versioned caches.
 *
 * Update model
 *  - Each deployment stamps BUILD_ID (scripts/build-site.mjs), so the browser sees a
 *    changed worker and installs the new version in the background.
 *  - The new worker does NOT take over automatically. The page shows "Update
 *    available"; when the user accepts, the page saves pending edits and sends
 *    SKIP_WAITING, the worker activates, old caches are deleted, and the page reloads.
 *  - The whole application is served from one versioned cache, so a page never mixes
 *    files from two releases.
 *  - The worker never touches IndexedDB: user projects survive every update.
 */
const APP_PREFIX = 'aerolab-x';
const VERSION = '0.3.0';
const BUILD_ID = 'dev';
const CACHE_NAME = `${APP_PREFIX}-v${VERSION}-${BUILD_ID}`;

// PRECACHE-START — kept in sync with the files on disk by scripts/check-structure.mjs
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './version.json',
  './assets/icons/favicon.svg',
  './assets/icons/icon.svg',
  './assets/icons/maskable.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './css/main.css',
  './css/dashboard.css',
  './css/engineering.css',
  './css/responsive.css',
  './js/app.js',
  './js/database.js',
  './js/project-manager.js',
  './js/project-schema.js',
  './js/router.js',
  './js/state-manager.js',
  './js/theme-boot.js',
  './js/version.js',
  './js/engineering/atmosphere.js',
  './js/engineering/configuration.js',
  './js/engineering/geometry.js',
  './js/engineering/provenance.js',
  './js/engineering/requirements.js',
  './js/engineering/units.js',
  './js/modules/architecture.js',
  './js/modules/dashboard.js',
  './js/modules/design-studio.js',
  './js/modules/module-registry.js',
  './js/modules/planned-module.js',
  './js/modules/projects.js',
  './js/modules/settings.js',
  './js/modules/sync-settings.js',
  './js/modules/learning/glossary.js',
  './js/modules/learning/index.js',
  './js/modules/learning/lessons.js',
  './js/modules/learning/widgets.js',
  './js/ui/bottom-panel.js',
  './js/ui/command-palette.js',
  './js/ui/components.js',
  './js/ui/dialog.js',
  './js/ui/icons.js',
  './js/ui/inspector.js',
  './js/ui/install.js',
  './js/ui/notifications.js',
  './js/ui/shell.js',
  './js/sync/gdrive.js',
  './js/sync/merge.js',
  './js/utils/diff.js',
  './js/utils/dom.js',
  './js/utils/events.js',
  './js/utils/file.js',
  './js/utils/format.js',
  './js/utils/id.js',
  './js/utils/immutable.js',
  './js/utils/logger.js',
  './js/utils/preferences.js',
  './js/utils/pwa.js',
  './js/visualisation/plots.js',
  './js/visualisation/view3d.js',
  './js/visualisation/views2d.js',
  './vendor/three/OrbitControls.js',
  './vendor/three/three.module.min.js',
];
// PRECACHE-END

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(`${APP_PREFIX}-`) && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

async function appShell(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = (await cache.match('./index.html')) || (await cache.match('./'));
  return cached || fetch(request);
}

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fromNetworkFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(appShell(request));
  } else {
    event.respondWith(fromCacheFirst(request));
  }
});
