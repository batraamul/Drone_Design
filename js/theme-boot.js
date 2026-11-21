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
