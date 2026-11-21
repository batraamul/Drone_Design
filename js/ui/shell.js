/**
 * Application shell: navigation, top bar, collapsible/resizable panels, theme and
 * keyboard shortcuts. The static skeleton lives in index.html; this module binds it.
 */
import { h, $, isEditable } from '../utils/dom.js';
import { icon, logoMark } from './icons.js';
import { NAV_GROUPS, modulesInGroup } from '../modules/module-registry.js';
import { APP_VERSION, BUILD_NUMBER } from '../version.js';
import { SAVE_STATUS } from '../project-manager.js';
import { formatRelative } from '../utils/format.js';
import { openDialog } from './dialog.js';

const STATUS_TEXT = {
  [SAVE_STATUS.none]: 'No project',
  [SAVE_STATUS.saved]: 'Saved',
  [SAVE_STATUS.dirty]: 'Unsaved changes',
  [SAVE_STATUS.saving]: 'Saving…',
  [SAVE_STATUS.error]: 'Save failed',
  [SAVE_STATUS.conflict]: 'Save conflict',
};

export const SHORTCUTS = Object.freeze([
  ['Ctrl/⌘ + K', 'Search modules, projects and commands'],
  ['Ctrl/⌘ + S', 'Save the open project now'],
  ['Ctrl/⌘ + Z', 'Undo (outside text fields)'],
  ['Ctrl/⌘ + Shift + Z  or  Ctrl + Y', 'Redo (outside text fields)'],
  ['Ctrl/⌘ + B', 'Show or hide the navigation'],
  ['Ctrl/⌘ + Alt + B', 'Show or hide the inspector'],
  ['Ctrl/⌘ + J', 'Show or hide the engineering console'],
  ['?', 'Show keyboard shortcuts'],
  ['Esc', 'Close menus, drawers and dialogs'],
]);

const MOBILE_QUERY = '(max-width: 899px)';

export class Shell {
  #ctx;
  #app = $('#app');
  #mobile = window.matchMedia(MOBILE_QUERY);
  #systemTheme = window.matchMedia('(prefers-color-scheme: light)');
  #popoverOpen = false;

  constructor(ctx) {
    this.#ctx = ctx;
  }

  get isMobile() {
    return this.#mobile.matches;
  }

  init() {
    $('#brand-mark').append(logoMark({ size: 30, idSuffix: 'topbar' }));
    $('#brand-build').textContent = `Build ${BUILD_NUMBER} · v${APP_VERSION}`;
    $('#nav-toggle').append(icon('menu'));
    $('#undo-btn').append(icon('undo'));
    $('#redo-btn').append(icon('redo'));
    $('#search-icon').append(icon('search', { size: 16 }));
    $('#bell-icon').append(icon('bell'));
    $('#inspector-toggle').append(icon('panelRight'));
    $('#settings-link').append(icon('sliders'));
    this.#renderNav();
    this.#bindTopbar();
    this.#bindPanels();
    this.#bindResizers();
    this.#bindShortcuts();
    this.applyAppearance();
    this.applyLayout();
    this.#mobile.addEventListener('change', () => this.applyLayout());
    this.#systemTheme.addEventListener('change', () => this.applyAppearance());
  }

  // ---- Navigation ------------------------------------------------------------------

  #renderNav() {
    const list = $('#sidenav-list');
    list.replaceChildren(
      ...NAV_GROUPS.map((group) =>
        h(
          'div',
          { class: 'nav-group' },
          h('p', { class: 'nav-group__label', id: `nav-group-${group.id}` }, group.label),
          h(
            'ul',
            { class: 'nav-group__list', 'aria-labelledby': `nav-group-${group.id}` },
            modulesInGroup(group.id).map((module) =>
              h(
                'li',
                null,
                h(
                  'a',
                  { class: ['nav-item', `nav-item--${module.status}`], href: `#/${module.id}`, dataset: { module: module.id }, title: module.title },
                  h('span', { class: 'nav-item__icon' }, icon(module.icon, { size: 18 })),
                  h('span', { class: 'nav-item__label' }, module.title),
                  module.status === 'planned'
                    ? h('span', { class: 'nav-item__badge', title: `Planned for Build ${module.builds.join(' & ')}` }, `B${module.builds[0]}`)
                    : module.status === 'partial'
                      ? h('span', { class: 'nav-item__badge nav-item__badge--partial', title: 'Partially available' }, 'Part')
                      : null,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    list.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.nav-item') && this.isMobile) this.setNavOpen(false);
    });
    $('#nav-collapse').append(icon('chevronLeft', { size: 16 }), h('span', { class: 'sidenav__collapse-label' }, 'Collapse'));
    $('#nav-collapse').addEventListener('click', () => this.toggleNav());
    $('#sidenav-backdrop').addEventListener('click', () => {
      this.setNavOpen(false);
      this.setInspectorOpen(false);
    });
  }

  setActiveModule(moduleId) {
    for (const link of document.querySelectorAll('.nav-item')) {
      if (link.dataset.module === moduleId) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  // ---- Top bar ---------------------------------------------------------------------

  #bindTopbar() {
    const { store, projects, palette, notifications } = this.#ctx;
    $('#nav-toggle').addEventListener('click', () => (this.isMobile ? this.setNavOpen(!this.#app.classList.contains('nav-open')) : this.toggleNav()));
    $('#inspector-toggle').addEventListener('click', () =>
      this.isMobile ? this.setInspectorOpen(!this.#app.classList.contains('inspector-open')) : this.toggleInspector(),
    );
    $('#undo-btn').addEventListener('click', () => store.undo());
    $('#redo-btn').addEventListener('click', () => store.redo());
    $('#search-btn').addEventListener('click', () => palette.open());
    $('#project-switcher').addEventListener('click', () => palette.open({ scope: 'projects' }));
    $('#theme-btn').addEventListener('click', () => {
      const resolved = document.documentElement.dataset.theme;
      this.#ctx.prefs.set('theme', resolved === 'dark' ? 'light' : 'dark');
    });
    $('#save-state').addEventListener('click', () => this.#ctx.actions.saveNow());

    const bell = $('#notifications-btn');
    const popover = $('#notifications-popover');
    bell.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setPopover(!this.#popoverOpen);
    });
    document.addEventListener('click', (event) => {
      if (this.#popoverOpen && event.target instanceof Node && !popover.contains(event.target)) this.setPopover(false);
    });
    notifications.on('change', ({ unread }) => {
      const badge = $('#notifications-count');
      badge.hidden = unread === 0;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      bell.setAttribute('aria-label', unread ? `Notifications (${unread} unread)` : 'Notifications');
      if (this.#popoverOpen) this.#renderPopover();
    });

    store.on('history', () => this.updateHistory());
    projects?.on('status', () => this.updateProject());
    store.on('change', () => this.updateProject());
    store.on('load', () => this.updateProject());
    this.updateHistory();
    this.updateProject();
  }

  setPopover(open) {
    const popover = $('#notifications-popover');
    this.#popoverOpen = open;
    popover.hidden = !open;
    $('#notifications-btn').setAttribute('aria-expanded', String(open));
    if (open) {
      this.#renderPopover();
      this.#ctx.notifications.markAllRead();
    }
  }

  #renderPopover() {
    $('#notifications-popover').replaceChildren(this.#ctx.notifications.renderPanel({ onClose: () => this.setPopover(false) }));
  }

  updateHistory() {
    const { store } = this.#ctx;
    const undo = $('#undo-btn');
    const redo = $('#redo-btn');
    undo.disabled = !store.canUndo;
    redo.disabled = !store.canRedo;
    undo.title = store.canUndo ? `Undo: ${store.undoLabel} (Ctrl+Z)` : 'Nothing to undo';
    redo.title = store.canRedo ? `Redo: ${store.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo';
  }

  updateProject() {
    const { store, projects } = this.#ctx;
    const doc = store.doc;
    $('#project-name').textContent = doc ? doc.name : 'No project open';
    $('#project-switcher').title = doc ? `Switch project (current: ${doc.name})` : 'Open or create a project';
    const status = projects?.status ?? SAVE_STATUS.none;
    const button = $('#save-state');
    button.dataset.status = status;
    $('#save-state-text').textContent = STATUS_TEXT[status] ?? status;
    const savedAt = projects?.current?.lastSavedAt;
    button.title =
      status === SAVE_STATUS.saved && savedAt
        ? `All changes saved locally (${formatRelative(savedAt)}). Click to save now.`
        : status === SAVE_STATUS.conflict
          ? 'Another tab saved a newer revision. Click to resolve.'
          : status === SAVE_STATUS.error
            ? `Saving failed: ${projects?.lastError?.message ?? 'unknown error'}. Click to retry.`
            : 'Click to save now (Ctrl+S)';
  }

  // ---- Panels ----------------------------------------------------------------------

  #bindPanels() {
    this.#ctx.prefs.on('change', ({ key }) => {
      if (['theme', 'density', 'reducedMotion'].includes(key)) this.applyAppearance();
      if (['navCollapsed', 'inspectorCollapsed', 'bottomCollapsed', 'inspectorWidth', 'bottomHeight'].includes(key)) this.applyLayout();
    });
  }

  applyAppearance() {
    const { prefs } = this.#ctx;
    const root = document.documentElement;
    const theme = prefs.get('theme');
    const resolved = theme === 'system' ? (this.#systemTheme.matches ? 'light' : 'dark') : theme;
    root.dataset.theme = resolved;
    if (prefs.get('density') === 'compact') root.dataset.density = 'compact';
    else delete root.dataset.density;
    if (prefs.get('reducedMotion') === 'reduce') root.dataset.motion = 'reduce';
    else delete root.dataset.motion;
    const themeButton = $('#theme-btn');
    themeButton.replaceChildren(icon(resolved === 'dark' ? 'sun' : 'moon'));
    themeButton.setAttribute('aria-label', resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.title = themeButton.getAttribute('aria-label');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b1220' : '#f4f7fb');
  }

  applyLayout() {
    const { prefs } = this.#ctx;
    const app = this.#app;
    const mobile = this.isMobile;
    app.classList.toggle('is-mobile', mobile);
    app.classList.toggle('nav-collapsed', !mobile && prefs.get('navCollapsed'));
    app.classList.toggle('inspector-collapsed', !mobile && prefs.get('inspectorCollapsed'));
    app.classList.toggle('bottom-collapsed', mobile ? !this.#bottomOpenedOnMobile : prefs.get('bottomCollapsed'));
    if (!mobile) {
      app.classList.remove('nav-open', 'inspector-open');
      $('#sidenav-backdrop').hidden = true;
    }
    app.style.setProperty('--inspector-w', `${prefs.get('inspectorWidth')}px`);
    app.style.setProperty('--bottom-h', `${prefs.get('bottomHeight')}px`);
    const navExpanded = mobile ? app.classList.contains('nav-open') : !app.classList.contains('nav-collapsed');
    $('#nav-toggle').setAttribute('aria-expanded', String(navExpanded));
    const inspectorExpanded = mobile ? app.classList.contains('inspector-open') : !app.classList.contains('inspector-collapsed');
    $('#inspector-toggle').setAttribute('aria-expanded', String(inspectorExpanded));
    const collapse = $('#nav-collapse');
    collapse.setAttribute('aria-label', app.classList.contains('nav-collapsed') ? 'Expand navigation' : 'Collapse navigation');
    this.#ctx.bottomPanel?.updateToggle(!app.classList.contains('bottom-collapsed'));
  }

  #bottomOpenedOnMobile = false;

  toggleNav() {
    if (this.isMobile) return this.setNavOpen(!this.#app.classList.contains('nav-open'));
    return this.#ctx.prefs.set('navCollapsed', !this.#ctx.prefs.get('navCollapsed'));
  }

  toggleInspector() {
    if (this.isMobile) return this.setInspectorOpen(!this.#app.classList.contains('inspector-open'));
    return this.#ctx.prefs.set('inspectorCollapsed', !this.#ctx.prefs.get('inspectorCollapsed'));
  }

  /** On small screens the console starts hidden each session; on desktop its state is a saved preference. */
  toggleBottom() {
    if (this.isMobile) {
      this.#bottomOpenedOnMobile = !this.#bottomOpenedOnMobile;
      return this.applyLayout();
    }
    return this.#ctx.prefs.set('bottomCollapsed', !this.#ctx.prefs.get('bottomCollapsed'));
  }

  setNavOpen(open) {
    this.#app.classList.toggle('nav-open', open);
    if (open) this.#app.classList.remove('inspector-open');
    $('#sidenav-backdrop').hidden = !open && !this.#app.classList.contains('inspector-open');
    this.applyLayout();
  }

  setInspectorOpen(open) {
    this.#app.classList.toggle('inspector-open', open);
    if (open) this.#app.classList.remove('nav-open');
    $('#sidenav-backdrop').hidden = !open && !this.#app.classList.contains('nav-open');
    this.applyLayout();
  }

  /** Show the inspector (used by "Show details" links). */
  revealInspector() {
    if (this.isMobile) this.setInspectorOpen(true);
    else if (this.#ctx.prefs.get('inspectorCollapsed')) this.#ctx.prefs.set('inspectorCollapsed', false);
  }

  revealBottom(tab) {
    if (tab) this.#ctx.bottomPanel?.setTab(tab);
    if (this.#app.classList.contains('bottom-collapsed')) this.toggleBottom();
  }

  #bindResizers() {
    const { prefs } = this.#ctx;
    const clampInspector = (value) => Math.round(Math.min(Math.max(value, 260), Math.max(300, Math.min(640, window.innerWidth * 0.5))));
    const clampBottom = (value) => Math.round(Math.min(Math.max(value, 120), Math.max(160, window.innerHeight * 0.6)));
    const setup = (element, { axis, get, set, clamp, step }) => {
      let dragging = false;
      element.addEventListener('pointerdown', (event) => {
        dragging = true;
        element.setPointerCapture(event.pointerId);
        element.classList.add('resizer--active');
        event.preventDefault();
      });
      element.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const value = axis === 'x' ? window.innerWidth - event.clientX : window.innerHeight - event.clientY;
        this.#app.style.setProperty(axis === 'x' ? '--inspector-w' : '--bottom-h', `${clamp(value)}px`);
      });
      const end = (event) => {
        if (!dragging) return;
        dragging = false;
        element.classList.remove('resizer--active');
        if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
        const value = axis === 'x' ? window.innerWidth - event.clientX : window.innerHeight - event.clientY;
        set(clamp(value));
      };
      element.addEventListener('pointerup', end);
      element.addEventListener('pointercancel', end);
      element.addEventListener('dblclick', () => set(axis === 'x' ? 320 : 180));
      element.addEventListener('keydown', (event) => {
        const keys = axis === 'x' ? { ArrowLeft: step, ArrowRight: -step } : { ArrowUp: step, ArrowDown: -step };
        if (!(event.key in keys)) return;
        event.preventDefault();
        set(clamp(get() + keys[event.key]));
      });
    };
    setup($('#inspector-resizer'), {
      axis: 'x',
      get: () => prefs.get('inspectorWidth'),
      set: (v) => prefs.set('inspectorWidth', v),
      clamp: clampInspector,
      step: 16,
    });
    setup($('#bottom-resizer'), {
      axis: 'y',
      get: () => prefs.get('bottomHeight'),
      set: (v) => prefs.set('bottomHeight', v),
      clamp: clampBottom,
      step: 16,
    });
  }

  // ---- Keyboard --------------------------------------------------------------------

  #bindShortcuts() {
    document.addEventListener('keydown', (event) => {
      const { store, palette } = this.#ctx;
      const mod = event.ctrlKey || event.metaKey;
      const editable = isEditable(event.target);
      if (document.querySelector('dialog[open]') && !(mod && event.code === 'KeyS')) return;
      if (mod && event.code === 'KeyK') {
        event.preventDefault();
        palette.open();
      } else if (mod && event.code === 'KeyS') {
        event.preventDefault();
        this.#ctx.actions.saveNow();
      } else if (mod && event.code === 'KeyZ' && !event.shiftKey && !editable) {
        event.preventDefault();
        store.undo();
      } else if (((mod && event.code === 'KeyZ' && event.shiftKey) || (mod && event.code === 'KeyY')) && !editable) {
        event.preventDefault();
        store.redo();
      } else if (mod && event.code === 'KeyB') {
        event.preventDefault();
        if (event.altKey) this.toggleInspector();
        else this.toggleNav();
      } else if (mod && event.code === 'KeyJ') {
        event.preventDefault();
        this.toggleBottom();
      } else if (event.key === '?' && !editable && !mod) {
        event.preventDefault();
        this.showShortcuts();
      } else if (event.key === 'Escape') {
        if (this.#popoverOpen) this.setPopover(false);
        if (this.isMobile) {
          this.setNavOpen(false);
          this.setInspectorOpen(false);
        }
      }
    });
  }

  showShortcuts() {
    return openDialog({
      title: 'Keyboard shortcuts',
      body: h(
        'table',
        { class: 'table table--compact' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Keys'), h('th', { scope: 'col' }, 'Action'))),
        h('tbody', null, SHORTCUTS.map(([keys, action]) => h('tr', null, h('td', null, h('kbd', null, keys)), h('td', null, action)))),
      ),
    });
  }
}
