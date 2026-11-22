/*
 * Window guard (Safari on macOS).
 * A Safari "Add to Dock" web app claims its whole host, not just its folder. E-Diary
 * (batraamul.github.io/e-diary/) shares this host, so links to AEROLAB X could open
 * inside the E-Diary window. When AEROLAB X finds itself in a standalone Safari window
 * that was not launched as AEROLAB X, it hands the window back to E-Diary.
 * AEROLAB X's own window is recognised by ?app=aerolab in its launch address, which
 * the manifest start_url and the normal-tab address both carry.
 */
(function windowGuard() {
  try {
    var params = new URLSearchParams(location.search);
    var standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      navigator.standalone === true;
    if (!standalone) {
      // Normal browser tab: tag the address so "Add to Dock" saves an AEROLAB X launch URL.
      if (params.get('app') !== 'aerolab' && window.history && history.replaceState) {
        params.set('app', 'aerolab');
        history.replaceState(history.state, '', location.pathname + '?' + params.toString() + location.hash);
      }
      return;
    }
    var ua = navigator.userAgent || '';
    var macSafari =
      /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\/|OPR\/|Firefox/.test(ua) &&
      !(navigator.maxTouchPoints > 1);
    if (!macSafari) return; // Chrome, Edge, iOS and Android keep each app in its own scope.
    if (params.get('app') === 'aerolab') {
      sessionStorage.setItem('aerolab:own-window', '1');
      return;
    }
    if (sessionStorage.getItem('aerolab:own-window') === '1' || localStorage.getItem('aerolab:own-window') === '1') return;

    var target = location.origin + '/e-diary/';
    window.__aerolabForeignWindow = true;
    var go = window.setTimeout(function () { location.replace(target); }, 1500);
    document.addEventListener('DOMContentLoaded', function () {
      var box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px',
        background: '#5c2618', color: '#fff8ee', font: '16px/1.5 -apple-system, system-ui, sans-serif', textAlign: 'center'
      });
      var title = document.createElement('p');
      title.textContent = 'This window is your E-Diary. Returning to E-Diary…';
      Object.assign(title.style, { fontSize: '20px', fontWeight: '600', margin: '0' });
      var note = document.createElement('p');
      note.textContent = 'AEROLAB X opened here by mistake. Open AEROLAB X in a normal Safari tab or in Chrome instead.';
      Object.assign(note.style, { margin: '0', maxWidth: '34em', opacity: '0.85' });
      var stay = document.createElement('button');
      stay.type = 'button';
      stay.textContent = 'No, this window is my AEROLAB X app';
      Object.assign(stay.style, {
        marginTop: '10px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #fff8ee',
        background: 'transparent', color: '#fff8ee', font: 'inherit', cursor: 'pointer'
      });
      stay.addEventListener('click', function () {
        window.clearTimeout(go);
        localStorage.setItem('aerolab:own-window', '1');
        location.reload();
      });
      box.append(title, note, stay);
      document.body.appendChild(box);
    });
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
