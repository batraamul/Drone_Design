/*
 * Window guard (Safari on macOS) — keeps AEROLAB X out of the E-Diary app window.
 * A Safari "Add to Dock" web app claims its whole host, and E-Diary
 * (batraamul.github.io/e-diary/) shares this host. So on a Mac, AEROLAB X never runs
 * inside a Safari Dock window: it hands the window straight back to E-Diary.
 * AEROLAB X on a Mac runs in a normal browser tab or as a Chrome/Edge app. (Lifted once AEROLAB X has its own host.)
 */
(function windowGuard() {
  try {
    try { localStorage.removeItem('aerolab:own-window'); sessionStorage.removeItem('aerolab:own-window'); } catch (e) { /* ignore */ }
    if (!/^(batraamul\.github\.io|localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    var mm = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
    var appWindow =
      navigator.standalone === true || mm('(display-mode: standalone)') || mm('(display-mode: minimal-ui)') ||
      mm('(display-mode: fullscreen)') || mm('(display-mode: window-controls-overlay)');
    var ua = navigator.userAgent || '';
    var macSafari = /Macintosh|Mac OS X/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR\/|Firefox|FxiOS/.test(ua) && !(navigator.maxTouchPoints > 1);
    if (!appWindow) return;
    // A genuine AEROLAB X app window is launched from the manifest start_url, which
    // carries launch=aerolab-x. Any other app window here (for example E-Diary's, whose
    // saved start address was overwritten while the two apps shared an id) goes back
    // to E-Diary, so the browser re-reads E-Diary's own manifest and restores it.
    var params = new URLSearchParams(location.search);
    if (!macSafari) {
      if (params.get('launch') === 'aerolab-x') { sessionStorage.setItem('aerolab:launched', '1'); return; }
      if (sessionStorage.getItem('aerolab:launched') === '1') return;
    }
    window.__aerolabForeignWindow = true;
    location.replace(location.origin + '/e-diary/index.html');
  } catch (error) {
    // Never block start-up because of the guard.
  }
})();

/*
 * Applies the stored theme and density before first paint to avoid a flash of the
 * wrong theme. Classic (non-module) script on purpose: it must run synchronously.
 */
(function applyStoredAppearance() {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('aerolab:theme');
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else if (theme === 'system' && window.matchMedia) {
      root.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }
    if (localStorage.getItem('aerolab:density') === 'compact') root.setAttribute('data-density', 'compact');
  } catch (error) {
    // Storage can be blocked (privacy settings); the dark default applies.
  }
})();

/*
 * Start-up watchdog: if the module bundle never finishes loading (for example an
 * outdated offline copy or a file opened from disk), explain what to do instead of
 * leaving a spinner on screen.
 */
window.setTimeout(function startupWatchdog() {
  if (document.body && document.body.getAttribute('data-app-ready')) return;
  var boot = document.getElementById('boot');
  if (!boot) return;
  var message = document.createElement('p');
  message.className = 'boot__error';
  message.textContent =
    location.protocol === 'file:'
      ? 'AEROLAB X cannot start from a file opened directly. Serve the folder over http (for example: python3 -m http.server) and open it in the browser.'
      : 'AEROLAB X is taking unusually long to start. Reload the page; if this persists, check the browser console.';
  boot.appendChild(message);
}, 15000);
