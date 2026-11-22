/**
 * AEROLAB X application bootstrap.
 *
 * Wires the central services (log, store, preferences, database, project manager,
 * router, update manager) into one context object shared by every view, binds the
 * shell, and mounts the view for each route.
 */
import { Logger } from './utils/logger.js';
import { Store } from './state-manager.js';
import { Router } from './router.js';
import { openDatabase, requestPersistentStorage } from './database.js';
import { ProjectManager, SAVE_STATUS } from './project-manager.js';
import { Preferences } from './utils/preferences.js';
import { Notifications } from './ui/notifications.js';
import { Shell } from './ui/shell.js';
import { InspectorPanel } from './ui/inspector.js';
import { BottomPanel } from './ui/bottom-panel.js';
import { CommandPalette } from './ui/command-palette.js';
import { UpdateManager } from './utils/pwa.js';
import { DriveSync } from './sync/gdrive.js';
import { watchInstall } from './ui/install.js';
import { SYNC_LABELS } from './modules/sync-settings.js';
import { formatRelative } from './utils/format.js';
import { confirmDialog, openDialog, promptDialog } from './ui/dialog.js';
import { emptyState, button } from './ui/components.js';
import { h, $ } from './utils/dom.js';
import { evaluateRequirements, SEVERITY_ORDER } from './engineering/requirements.js';
import { computeGeometry } from './engineering/geometry.js';
import { analyseElectrical } from './engineering/electrical.js';
import { REQUIREMENT_KEYS } from './engineering/requirements.js';
import { getModule } from './modules/module-registry.js';
import * as dashboardView from './modules/dashboard.js';
import * as projectsView from './modules/projects.js';
import * as settingsView from './modules/settings.js';
import * as learningView from './modules/learning/index.js';
import * as plannedView from './modules/planned-module.js';
import * as architectureView from './modules/architecture.js';
import * as designStudioView from './modules/design-studio.js';
import * as avionicsView from './modules/avionics.js';
import * as componentLibraryView from './modules/component-library.js';
import { downloadJSON, pickFile, readFileText, timestampForFile } from './utils/file.js';
import { slugify } from './utils/format.js';
import { APP_NAME, APP_VERSION, BUILD_NUMBER } from './version.js';

const VIEWS = { dashboard: dashboardView, projects: projectsView, settings: settingsView, learning: learningView, architecture: architectureView, 'design-studio': designStudioView, avionics: avionicsView, components: componentLibraryView };

const EMPTY_EVALUATION = Object.freeze({ checks: [], derived: [], completeness: { set: 0, total: REQUIREMENT_KEYS.length } });

/** One design review from the requirement checks and the geometry checks. */
function combineReview(requirements, geometry, electrical) {
  const parts = [geometry, electrical].filter(Boolean);
  const checks = [...requirements.checks, ...parts.flatMap((p) => p.checks)].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return { ...requirements, checks, derived: [...requirements.derived, ...parts.flatMap((p) => p.derived)], geometry, electrical };
}

function createActions(ctx) {
  const { store, notify, router, log, prefs } = ctx;
  const projects = () => ctx.projects;
  const needStorage = () => {
    if (projects()) return true;
    notify({ level: 'warning', title: 'Local storage unavailable', message: 'This action needs browser storage (IndexedDB), which is not available here.' });
    return false;
  };
  const failed = (title, error) => {
    log.warn('action', `${title}: ${error.message}`);
    notify({ level: 'error', title, message: error.message });
  };

  const actions = {
    newProject: () => (needStorage() ? projectsView.newProjectDialog(ctx) : null),

    async importProject() {
      if (!needStorage()) return;
      const file = await pickFile();
      if (!file) return;
      try {
        const result = await projects().importProject(await readFileText(file));
        notify({
          level: result.warnings.length ? 'warning' : 'success',
          title: `Imported “${result.doc.name}”`,
          message: [result.idChanged ? 'A project with the same ID exists, so this was added as a copy.' : null, result.versions ? `${result.versions} version(s) included.` : null, result.warnings.length ? `${result.warnings.length} value(s) were repaired: ${result.warnings.slice(0, 2).join(' ')}` : null]
            .filter(Boolean)
            .join(' '),
        });
        router.navigate('projects', [result.doc.id]);
      } catch (error) {
        failed('Import failed', error);
      }
    },

    async exportProject(id = projects()?.currentId) {
      if (!needStorage() || !id) return;
      try {
        const envelope = await projects().exportProject(id);
        downloadJSON(`${slugify(envelope.project.name)}-${timestampForFile()}.aerolab.json`, envelope);
        notify({ level: 'success', title: 'Project exported', message: `“${envelope.project.name}” with ${envelope.versions?.length ?? 0} version(s).` });
      } catch (error) {
        failed('Export failed', error);
      }
    },

    async saveVersion({ label, note = '' } = {}) {
      if (!needStorage() || !projects().currentId) return;
      let versionLabel = label;
      if (versionLabel === undefined) {
        versionLabel = await promptDialog({ title: 'Save version', label: 'Version label', placeholder: 'e.g. Baseline requirements', confirmLabel: 'Save version', validate: () => null, hint: 'Leave empty for an automatic label.' });
        if (versionLabel === null) return;
      }
      try {
        const record = await projects().createVersion({ label: versionLabel, note });
        notify({ level: 'success', title: `Saved version ${record.number}`, message: record.label });
      } catch (error) {
        failed('Could not save version', error);
      }
    },

    async restoreVersion(version) {
      const ok = await confirmDialog({
        title: `Restore version ${version.number}?`,
        message: `The design content will be replaced by “${version.label}”.`,
        details: 'The current design is saved as a safety snapshot first, and you can undo the restore with Ctrl+Z.',
        confirmLabel: 'Restore',
      });
      if (!ok) return;
      try {
        await projects().restoreVersion(version.id);
        notify({ level: 'success', title: `Restored version ${version.number}`, message: 'A safety snapshot of the previous state was saved.' });
      } catch (error) {
        failed('Restore failed', error);
      }
    },

    async duplicateProject(id) {
      try {
        const copy = await projects().duplicateProject(id);
        notify({ level: 'success', title: 'Project duplicated', message: `Created “${copy.name}”.`, actions: [{ label: 'Open copy', run: () => router.navigate('projects', [copy.id]) }] });
      } catch (error) {
        failed('Duplicate failed', error);
      }
    },

    async trashProject(id) {
      const stored = await projects().getStoredProject(id);
      if (!stored) return;
      const ok = await confirmDialog({ title: 'Move to Trash?', message: `“${stored.name}” will be moved to the Trash. You can restore it from there.`, confirmLabel: 'Move to Trash' });
      if (!ok) return;
      try {
        await projects().trashProject(id);
        notify({ level: 'info', title: 'Moved to Trash', message: `“${stored.name}”`, actions: [{ label: 'Undo', run: () => actions.restoreProject(id) }] });
      } catch (error) {
        failed('Could not move to Trash', error);
      }
    },

    async restoreProject(id) {
      try {
        const doc = await projects().restoreProject(id);
        notify({ level: 'success', title: 'Project restored', message: `“${doc.name}” is back in My Projects.` });
      } catch (error) {
        failed('Restore failed', error);
      }
    },

    async deletePermanently(project) {
      const ok = await confirmDialog({
        title: 'Delete permanently?',
        message: `“${project.name}” and its ${project.versionCount} version(s) will be deleted from this browser. This cannot be undone.`,
        details: 'Export the project first if you might need it again.',
        confirmLabel: 'Delete permanently',
        danger: true,
      });
      if (!ok) return;
      try {
        await projects().deleteProjectPermanently(project.id);
        notify({ level: 'info', title: 'Project deleted', message: `“${project.name}” was permanently deleted.` });
      } catch (error) {
        failed('Delete failed', error);
      }
    },

    async closeProject() {
      if (!projects()?.currentId) return;
      try {
        await projects().closeProject();
        router.navigate('projects');
      } catch (error) {
        const discard = await confirmDialog({
          title: 'Unsaved changes could not be saved',
          message: `Saving failed: ${error.message}`,
          details: 'Export the project first if you want to keep these edits. Close anyway and discard them?',
          confirmLabel: 'Discard and close',
          danger: true,
        });
        if (discard) {
          await projects().closeProject({ discard: true });
          router.navigate('projects');
        }
      }
    },

    async saveNow() {
      const manager = projects();
      if (!manager?.currentId) {
        notify({ level: 'info', title: 'No project open', message: 'Open or create a project first.', timeout: 3000 });
        return;
      }
      if (manager.status === SAVE_STATUS.conflict) {
        await actions.resolveConflict();
        return;
      }
      try {
        await manager.save({ reason: 'manual' });
      } catch (error) {
        if (manager.status !== SAVE_STATUS.conflict) failed('Save failed', error);
      }
    },

    async resolveConflict() {
      const manager = projects();
      const choice = await openDialog({
        title: 'Resolve save conflict',
        description: 'This project was saved in another tab or window after you opened it here, so your latest edits are not saved yet.',
        body: h(
          'ul',
          { class: 'option-list' },
          h('li', null, h('strong', null, 'Keep both: '), 'save your edits as a new project and keep the other version unchanged (safest).'),
          h('li', null, h('strong', null, 'Use the other version: '), 'discard the edits made in this tab.'),
          h('li', null, h('strong', null, 'Overwrite: '), 'replace the other version with your edits.'),
        ),
        actions: [
          { label: 'Use the other version', value: 'reload' },
          { label: 'Overwrite', value: 'overwrite', variant: 'danger' },
          { label: 'Keep both', value: 'copy', variant: 'primary', autofocus: true },
        ],
      });
      try {
        if (choice === 'copy') {
          const copy = await manager.saveAsCopy();
          router.navigate('projects', [copy.id]);
          notify({ level: 'success', title: 'Saved as a copy', message: `Your edits are in “${copy.name}”.` });
        } else if (choice === 'reload') {
          await manager.reloadFromStorage();
          notify({ level: 'info', title: 'Loaded the other version' });
        } else if (choice === 'overwrite') {
          await manager.overwriteStored();
          notify({ level: 'success', title: 'Overwritten with your edits' });
        }
      } catch (error) {
        failed('Could not resolve the conflict', error);
      }
    },

    async exportBackup() {
      if (!needStorage()) return;
      try {
        const backup = await projects().exportBackup();
        downloadJSON(`aerolab-x-backup-${timestampForFile()}.json`, backup);
        await prefs.set('lastBackupAt', backup.exportedAt);
        notify({ level: 'success', title: 'Backup exported', message: `${backup.projects.length} project(s) and ${backup.versions.length} version(s). Keep the file somewhere safe.` });
      } catch (error) {
        failed('Backup failed', error);
      }
    },

    async restoreBackup() {
      if (!needStorage()) return;
      const file = await pickFile();
      if (!file) return;
      try {
        const report = await projects().restoreBackup(await readFileText(file));
        notify({
          level: report.failed || report.warnings.length ? 'warning' : 'success',
          title: 'Backup restored',
          message: `${report.added} added, ${report.copied} added as copies, ${report.skipped} already present${report.failed ? `, ${report.failed} failed` : ''}. Nothing was overwritten.`,
        });
        router.resolve();
      } catch (error) {
        failed('Restore failed', error);
      }
    },

    async requestPersistence({ quiet = false } = {}) {
      try {
        const result = await requestPersistentStorage();
        log.info('storage', result.persisted ? 'Persistent storage granted' : 'Persistent storage not granted by the browser');
        if (!quiet) {
          notify(
            result.persisted
              ? { level: 'success', title: 'Persistent storage granted', message: 'The browser will not clear AEROLAB X data automatically.' }
              : { level: 'warning', title: 'Persistent storage not granted', message: 'The browser decides this. Installing the app or bookmarking it can help. Keep exporting backups.' },
          );
        }
        if (!quiet) router.resolve();
      } catch (error) {
        if (!quiet) failed('Could not request persistent storage', error);
      }
    },

    async checkForUpdates() {
      const found = await ctx.pwa.checkForUpdate();
      if (!found) notify({ level: 'info', title: 'No update available', message: `You are running AEROLAB X ${APP_VERSION}.`, timeout: 4000 });
    },

    async applyUpdate() {
      const applied = await ctx.pwa.applyUpdate(async () => {
        await projects()?.flush().catch(() => {});
      });
      if (!applied) notify({ level: 'info', title: 'No update is waiting', timeout: 3000 });
    },

    commands() {
      const open = Boolean(store.doc);
      const storage = Boolean(projects());
      return [
        storage && { label: 'New project…', icon: 'plus', hint: 'Create a design project', projectScope: true, run: () => actions.newProject() },
        storage && { label: 'Import project from file…', icon: 'upload', projectScope: true, run: () => actions.importProject() },
        open && { label: 'Save now', icon: 'save', hint: 'Ctrl+S', run: () => actions.saveNow() },
        open && { label: 'Save version of the current project…', icon: 'history', run: () => actions.saveVersion() },
        open && { label: 'Export the current project', icon: 'download', run: () => actions.exportProject() },
        open && { label: 'Close the current project', icon: 'close', run: () => actions.closeProject() },
        storage && { label: 'Export full backup', icon: 'database', run: () => actions.exportBackup() },
        storage && { label: 'Restore from backup…', icon: 'upload', run: () => actions.restoreBackup() },
        { label: 'Switch between light and dark theme', icon: 'sun', run: () => prefs.set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
        { label: 'Show or hide the navigation', icon: 'panelLeft', hint: 'Ctrl+B', run: () => ctx.shell.toggleNav() },
        { label: 'Show or hide the inspector', icon: 'panelRight', hint: 'Ctrl+Alt+B', run: () => ctx.shell.toggleInspector() },
        { label: 'Show or hide the console', icon: 'panelBottom', hint: 'Ctrl+J', run: () => ctx.shell.toggleBottom() },
        { label: 'Keyboard shortcuts', icon: 'keyboard', hint: '?', run: () => ctx.shell.showShortcuts() },
        ctx.pwa.registration && { label: 'Check for updates', icon: 'restore', run: () => actions.checkForUpdates() },
      ].filter(Boolean);
    },
  };
  return actions;
}

function notFound(route, ctx) {
  return emptyState({
    icon: 'search',
    title: 'Page not found',
    message: `There is no module called “${route.module}”.`,
    actions: [button({ label: 'Go to dashboard', variant: 'primary', onClick: () => ctx.router.navigate('dashboard') })],
  });
}

async function boot() {
  // Inside another app's Safari window (see theme-boot.js): don't start, the window is being handed back.
  if (window.__aerolabForeignWindow) return;
  const log = new Logger();
  const store = new Store();
  const prefs = new Preferences();
  const notifications = new Notifications({ toastRoot: $('#toasts') });
  const notify = (options) => notifications.notify(options);
  const router = new Router();
  const pwa = new UpdateManager({ log });

  watchInstall();
  window.addEventListener('error', (event) => log.error('runtime', event.message || 'Unexpected error'));
  window.addEventListener('unhandledrejection', (event) => log.error('runtime', event.reason?.message ?? String(event.reason)));

  const ctx = { log, store, prefs, notifications, notify, router, pwa, db: null, projects: null, storageError: null };

  try {
    ctx.db = await openDatabase({
      appVersion: APP_VERSION,
      onBlocked: () =>
        notify({ level: 'warning', title: 'Close other AEROLAB X tabs', message: 'Local storage is being upgraded and another open tab is using the old version.', persistent: true }),
      onVersionChange: () => {
        openDialog({
          title: 'AEROLAB X was updated in another tab',
          description: 'This tab must reload to use the updated local storage. Your saved projects are safe.',
          dismissible: false,
          actions: [
            ...(ctx.projects?.isDirty ? [{ label: 'Download unsaved edits', value: 'download' }] : []),
            { label: 'Reload now', value: 'reload', variant: 'primary', autofocus: true },
          ],
          onSubmit: (value) => {
            if (value === 'download' && store.doc) {
              downloadJSON(`${slugify(store.doc.name)}-unsaved-${timestampForFile()}.aerolab.json`, store.doc);
              return false;
            }
            return true;
          },
        }).then(() => window.location.reload());
      },
    });
    if (ctx.db.appliedMigrations.length) log.info('migration', `Local database prepared (schema ${ctx.db.version})`);
  } catch (error) {
    ctx.storageError = error.message;
    log.warn('storage', `Local storage unavailable: ${error.message}`);
  }

  await prefs.load(ctx.db);
  if (ctx.db) {
    ctx.projects = new ProjectManager({ db: ctx.db, store, log, autosaveDelay: prefs.get('autosaveDelay') });
    ctx.projects.setAutosave({ enabled: prefs.get('autosave'), delay: prefs.get('autosaveDelay') });
  }

  ctx.drive = new DriveSync(ctx);

  store.define('requirements', {
    deps: ['requirements'],
    compute: (requirements) => evaluateRequirements(requirements),
    meta: { title: 'Requirement consistency and air properties', model: 'Exact kinematics; ISA (U.S. Standard Atmosphere 1976)' },
  });
  store.define('geometry', {
    deps: [['modules', 'configuration'], 'requirements'],
    compute: (configuration, requirements) => computeGeometry(configuration, requirements),
    meta: { title: 'Conceptual geometry', model: 'Plan-form geometry; ideal momentum theory for hover (docs/engineering-models.md §5)' },
  });
  store.define('electrical', {
    deps: [['modules', 'components']],
    compute: (components) => analyseElectrical(components),
    meta: { title: 'Electrical architecture', model: 'Rail voltages, worst-case power budget, interface checks (docs/engineering-models.md §6)' },
  });
  store.define('review', {
    deps: [{ node: 'requirements' }, { node: 'geometry' }, { node: 'electrical' }],
    compute: (requirements, geometry, electrical) => combineReview(requirements, geometry, electrical),
    meta: { title: 'Design review', model: 'Requirement, geometry and electrical checks' },
  });
  ctx.engineering = {
    evaluate: () => (store.hasDocument ? store.derive('review') : EMPTY_EVALUATION),
    geometry: () => (store.hasDocument ? store.derive('geometry') : null),
    electrical: () => (store.hasDocument ? store.derive('electrical') : analyseElectrical(null)),
  };

  ctx.actions = createActions(ctx);
  ctx.palette = new CommandPalette(ctx);
  ctx.shell = new Shell(ctx);
  ctx.shell.init();
  ctx.inspector = new InspectorPanel(ctx);
  ctx.bottomPanel = new BottomPanel(ctx);
  ctx.shell.applyLayout();
  ctx.inspector.render();

  // ---- Google Drive sync chip in the top bar ----------------------------------------
  const chip = $('#sync-status');
  const paintChip = () => {
    const { drive } = ctx;
    const state = drive.enabled ? drive.state : 'off';
    chip.dataset.state = state;
    const label = state === 'ok' && drive.lastSync ? `synced ${formatRelative(new Date(drive.lastSync).toISOString())}` : SYNC_LABELS[state]?.[0].toLowerCase() ?? state;
    $('#sync-status-text').textContent = `Drive: ${label}`;
    chip.title = state === 'off' ? 'Google Drive sync is off. Click to set it up.' : drive.error || `Google Drive sync: ${label}. Click to sync now.`;
  };
  chip.addEventListener('click', () => {
    if (!ctx.drive.enabled) ctx.router.navigate('settings');
    else ctx.drive.sync('manual');
  });
  ctx.drive.on('state', paintChip);
  ctx.drive.on('config', paintChip);
  setInterval(paintChip, 60000);
  paintChip();

  const { projects } = ctx;
  if (projects) {
    let lastStatus = projects.status;
    projects.on('status', ({ status, error }) => {
      if (status === SAVE_STATUS.error && lastStatus !== SAVE_STATUS.error) {
        notify({ level: 'error', title: 'Saving failed', message: `${error?.message ?? 'Unknown error'}. AEROLAB X will retry; export the project if this persists.` });
      }
      lastStatus = status;
    });
    projects.on('conflict', () =>
      notify({
        level: 'warning',
        title: 'Save conflict',
        message: 'This project was saved in another tab after you opened it here.',
        actions: [{ label: 'Resolve…', run: () => ctx.actions.resolveConflict() }],
        persistent: true,
      }),
    );
    projects.on('remote-update', ({ reloaded }) =>
      notify(
        reloaded
          ? { level: 'info', title: 'Updated from another tab', message: 'The open project was changed elsewhere and has been reloaded.' }
          : { level: 'warning', title: 'Changed in another tab', message: 'Your unsaved edits here will conflict when saved.', actions: [{ label: 'Resolve now', run: () => ctx.actions.resolveConflict() }] },
      ),
    );
    projects.on('remote-removed', () => notify({ level: 'warning', title: 'Project removed in another tab', message: 'Export it now if you want to keep the copy open here.', persistent: true }));
  }

  // ---- Routing ----------------------------------------------------------------------
  let cleanup = null;
  let token = 0;
  router.on('route', async ({ route, previous }) => {
    const current = ++token;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        log.warn('view', `Cleanup failed: ${error.message}`);
      }
      cleanup = null;
    }
    const workspace = $('#workspace');
    const module = getModule(route.module);
    if (!module) {
      ctx.shell.setActiveModule(null);
      document.title = `Not found — ${APP_NAME}`;
      workspace.replaceChildren(h('div', { class: 'view' }, notFound(route, ctx)));
      return;
    }
    ctx.shell.setActiveModule(module.id);
    document.title = `${module.title} — ${APP_NAME}`;
    const view = module.status === 'planned' ? plannedView : VIEWS[module.id];
    const container = h('div', { class: 'view', dataset: { view: module.id } });
    workspace.replaceChildren(container);
    try {
      const result = await view.mount(container, ctx, route);
      if (current !== token) {
        if (typeof result === 'function') result();
        return;
      }
      cleanup = typeof result === 'function' ? result : null;
    } catch (error) {
      log.error('view', `Could not display ${module.title}: ${error.message}`);
      container.replaceChildren(emptyState({ icon: 'error', title: `${module.title} could not be displayed`, message: error.message }));
    }
    if (previous) {
      const sameModule = previous.module === route.module && previous.segments[0] === route.segments[0];
      const target = (sameModule && container.querySelector('[role="tab"][aria-selected="true"]')) || container.querySelector('[data-page-heading]');
      target?.focus({ preventScroll: true });
      if (!sameModule) workspace.scrollTop = 0;
    }
  });

  // ---- Save on leave ------------------------------------------------------------------------
  window.addEventListener('beforeunload', (event) => {
    if (projects && (projects.isDirty || projects.status === SAVE_STATUS.saving)) {
      projects.flush().catch(() => {});
      event.preventDefault();
      event.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') projects?.flush().catch(() => {});
  });
  window.addEventListener('pagehide', () => projects?.flush().catch(() => {}));

  // ---- Offline mode and updates -----------------------------------------------------------
  pwa.on('state', ({ state }) => {
    if (state === 'update-ready') {
      notify({
        level: 'info',
        title: 'Update available',
        message: 'A new version of AEROLAB X has been downloaded. Your projects are kept when you reload.',
        actions: [{ label: 'Reload to update', run: () => ctx.actions.applyUpdate() }],
        persistent: true,
      });
    }
  });
  pwa.register();

  // ---- Restore the last session ---------------------------------------------------------------
  if (projects) {
    const lastId = prefs.get('lastProjectId');
    if (lastId) {
      try {
        const stored = await projects.getStoredProject(lastId);
        if (stored && !stored.deletedAt) await projects.openProject(lastId);
      } catch (error) {
        log.warn('project', `Could not reopen the last project: ${error.message}`);
      }
    }
  }

  router.start();
  ctx.drive.start();
  $('#app').setAttribute('aria-busy', 'false');
  document.body.dataset.appReady = 'true';
  log.info('app', `${APP_NAME} ${APP_VERSION} (Build ${BUILD_NUMBER}) ready`);
  if (ctx.storageError) {
    notify({ level: 'warning', title: 'Local storage unavailable', message: `Projects cannot be saved in this browser context (${ctx.storageError}). The Learning Centre still works.`, persistent: true });
  }
  return ctx;
}

boot().catch((error) => {
  const bootScreen = document.getElementById('boot');
  if (bootScreen) {
    bootScreen.replaceChildren(
      h('p', { class: 'boot__error' }, 'AEROLAB X could not start.'),
      h('p', null, error?.message ?? String(error)),
      h('p', null, 'Reload the page. If the problem continues, open the browser console and report the message.'),
    );
  }
  document.body.dataset.appReady = 'error';
  throw error;
});
