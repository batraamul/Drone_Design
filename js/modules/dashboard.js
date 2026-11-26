/**
 * Dashboard: current project, requirements, design review, recent projects,
 * roadmap progress and data-safety status. Shows only real data.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, button, card, emptyState, formatQuantity, keyValueList, pageHeader, progressBar, severityIcon } from '../ui/components.js';
import { categoryInfo, applicationInfo, stageInfo } from '../project-schema.js';
import { REQUIREMENT_FIELDS, reviewSummary } from '../engineering/requirements.js';
import { FLOW_STEPS, flowOverview, stepStatus } from '../ui/design-flow.js';
import { installCard, isInstalled } from '../ui/install.js';
import { BUILDS, MODULES, buildStatus } from './module-registry.js';
import { storageStatus } from '../database.js';
import { formatBytes, formatRelative } from '../utils/format.js';
import { BUILD_NUMBER, TOTAL_BUILDS, APP_TAGLINE } from '../version.js';
import { FIDELITY_DISCLAIMER } from '../engineering/provenance.js';

/** Welcome hero shown when no project is open. */
function welcomeHero(ctx) {
  const { projects, actions, router } = ctx;
  const step = (n, title, text, ic) => h('li', { class: 'welcome__step' }, h('span', { class: 'welcome__stepicon' }, icon(ic, { size: 20 })), h('span', { class: 'welcome__stepnum' }, n), h('strong', null, title), h('span', { class: 'muted' }, text));
  return h(
    'section',
    { class: 'welcome span-2', 'aria-labelledby': 'welcome-title' },
    h('div', { class: 'welcome__text' }, h('p', { class: 'welcome__kicker' }, 'Drone design, analysis and learning'), h('h2', { id: 'welcome-title', class: 'welcome__title' }, 'Design a drone step by step — and see why every number is what it is.'), h('p', { class: 'welcome__lead' }, `${APP_TAGLINE}. Start from a working example or a blank project; the design flow walks you from mission targets to a printable build sheet.`)),
    projects
      ? h('div', { class: 'welcome__actions' }, button({ label: 'Start from an example', icon: 'copy', variant: 'primary', onClick: () => actions.newFromExample() }), button({ label: 'New project', icon: 'plus', onClick: () => actions.newProject() }), button({ label: 'Learn the basics', icon: 'book', onClick: () => router.navigate('learning') }), button({ label: 'Formula Library', icon: 'book', onClick: () => router.navigate('formulas') }))
      : h('p', { class: 'notice notice--warning' }, 'Local storage is unavailable, so projects cannot be created in this browser context.'),
    h('ol', { class: 'welcome__steps' }, step(1, 'Define', 'Mission targets: mass, payload, endurance, speed.', 'tag'), step(2, 'Design', 'Layout, avionics, propulsion, wing and structure.', 'cube'), step(3, 'Check', 'Every result shows its equation, inputs and a fix.', 'checkCircle'), step(4, 'Share', 'Build sheet, parts list, 3D export, paper notes.', 'report')),
  );
}

/** Design health: flow progress, open problems and headline numbers. */
function healthCard(ctx) {
  const doc = ctx.store.doc;
  if (!doc) return null;
  const review = ctx.engineering.evaluate();
  const statuses = FLOW_STEPS.map((s) => stepStatus(ctx, s));
  const counted = statuses.filter((s) => s !== 'na' && s !== 'skipped');
  const done = counted.filter((s) => s === 'done' || s === 'ready').length;
  const pct = counted.length ? Math.round((done / counted.length) * 100) : 0;
  const errors = review.checks.filter((c) => c.severity === 'error').length;
  const warnings = review.checks.filter((c) => c.severity === 'warning').length;
  const ring = h('div', { class: 'ring', role: 'img', 'aria-label': `Design flow ${pct} % complete` }, h('span', { class: 'ring__value' }, `${pct}%`), h('span', { class: 'ring__label' }, 'of the flow'));
  ring.style.setProperty('--pct', String(pct));
  const p = ctx.engineering.propulsion();
  const a = ctx.engineering.aerodynamics();
  const tile = (label, value, tone) => h('div', { class: ['health__tile', tone ? `health__tile--${tone}` : null] }, h('span', { class: 'health__label' }, label), h('span', { class: 'health__value mono' }, value));
  const tiles = [
    tile('Problems', String(errors), errors ? 'danger' : 'ok'),
    tile('Warnings', String(warnings), warnings ? 'warn' : 'ok'),
    p?.mass ? tile('Take-off mass', formatQuantity(p.mass.total, 'kg', p.mass.total < 1 ? 'g' : 'kg', { digits: 3 })) : null,
    p?.endurance ? tile(p.endurance.mode === 'cruise' ? 'Cruise endurance' : 'Hover endurance', formatQuantity(p.endurance.time, 's', 'min', { digits: 3 })) : null,
    p?.hover ? tile('Thrust / weight', p.hover.thrustToWeight.toFixed(2), p.hover.thrustToWeight < 1.5 ? 'warn' : null) : null,
    a?.performance ? tile('Cruise L/D', a.performance.cruise.ld.toFixed(1)) : null,
  ];
  return card({
    title: 'Design health',
    icon: 'checkCircle',
    class: 'span-2 health',
    description: errors ? 'Fix the problems first: open the review to see each calculation and how to resolve it.' : warnings ? 'No blocking problems. Review the warnings before you build.' : 'No problems or warnings in the current models.',
    actions: [button({ label: 'Open the review', size: 'sm', onClick: () => ctx.shell.revealInspector() }), button({ label: 'Summary', size: 'sm', variant: 'primary', onClick: () => ctx.router.navigate('summary') })],
    body: h('div', { class: 'health__body' }, ring, h('div', { class: 'health__tiles' }, tiles)),
  });
}

function currentProjectCard(ctx, versionCount) {
  const { store, projects, actions, router } = ctx;
  const doc = store.doc;
  if (!doc) {
    if (projects) return null;
    return card({
      title: 'Start a design',
      icon: 'folder',
      class: 'span-2 card--hero',
      body: [
        h('p', { class: 'hero__lead' }, `${APP_TAGLINE}. Create a project to capture requirements, design notes and versions; every later module builds on the same project model.`),
        projects
          ? h('div', { class: 'button-row' }, button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => actions.newProject() }), button({ label: 'Import project', icon: 'upload', onClick: () => actions.importProject() }), button({ label: 'All projects', icon: 'folder', onClick: () => router.navigate('projects') }))
          : h('p', { class: 'notice notice--warning' }, 'Local storage is unavailable, so projects cannot be created in this browser context.'),
      ],
    });
  }
  return card({
    title: doc.name,
    icon: categoryInfo(doc.category)?.icon ?? 'multirotor',
    class: 'span-2 card--hero',
    description: `${categoryInfo(doc.category)?.label} · ${applicationInfo(doc.application)?.label} · ${stageInfo(doc.stage)?.label}`,
    actions: [button({ label: 'Open workspace', icon: 'chevronRight', variant: 'primary', size: 'sm', onClick: () => router.navigate('projects', [doc.id]) })],
    body: [
      doc.description ? h('p', { class: 'hero__lead' }, doc.description) : h('p', { class: 'muted' }, 'No description yet. Add one in the project workspace.'),
      keyValueList(
        [
          ['Revision', String(projects.current?.baseRevision ?? doc.revision)],
          ['Last saved', formatRelative(projects.current?.lastSavedAt)],
          ['Versions', String(versionCount)],
          ['Notes', String(doc.notes.length)],
          ['Created', formatRelative(doc.createdAt)],
        ],
        { class: 'kv--inline' },
      ),
      h('div', { class: 'button-row' }, button({ label: 'Save version', icon: 'history', size: 'sm', onClick: () => actions.saveVersion() }), button({ label: 'Export', icon: 'download', size: 'sm', onClick: () => actions.exportProject(doc.id) })),
    ],
  });
}

function requirementsCard(ctx) {
  const { store, prefs, router } = ctx;
  const doc = store.doc;
  if (!doc) return null;
  const evaluation = ctx.engineering.evaluate();
  return card({
    title: 'Design requirements',
    icon: 'tag',
    description: `${evaluation.completeness.set} of ${evaluation.completeness.total} set`,
    actions: [button({ label: 'Edit', size: 'sm', onClick: () => router.navigate('projects', [doc.id], { tab: 'requirements' }) })],
    body: [
      progressBar(evaluation.completeness.set, evaluation.completeness.total, { label: 'Requirements set' }),
      h(
        'table',
        { class: 'table table--compact' },
        h('caption', { class: 'visually-hidden' }, 'Requirement targets'),
        h(
          'tbody',
          null,
          REQUIREMENT_FIELDS.map((field) => {
            const value = doc.requirements[field.key]?.value ?? null;
            return h(
              'tr',
              null,
              h('th', { scope: 'row' }, field.label),
              h('td', { class: value === null ? 'muted' : 'mono' }, formatQuantity(value, field.unit, prefs.displayUnit(field.key, field.displayUnits[0]))),
            );
          }),
        ),
      ),
    ],
  });
}

function reviewCard(ctx) {
  const doc = ctx.store.doc;
  if (!doc) return null;
  const evaluation = ctx.engineering.evaluate();
  const counts = { error: 0, warning: 0, info: 0 };
  for (const check of evaluation.checks) counts[check.severity] += 1;
  return card({
    title: 'Design review',
    icon: 'checkCircle',
    description: 'Requirement consistency (analytical checks)',
    actions: [button({ label: 'Details', size: 'sm', onClick: () => ctx.shell.revealInspector() })],
    body: [
      h(
        'div',
        { class: 'review-counts' },
        [
          ['error', 'Errors'],
          ['warning', 'Warnings'],
          ['info', 'Notes'],
        ].map(([severity, label]) => h('div', { class: ['review-count', `review-count--${severity}`] }, severityIcon(severity, 16), h('span', { class: 'review-count__value' }, String(counts[severity])), h('span', { class: 'review-count__label' }, label))),
      ),
      h('p', { class: 'summary-sentence' }, reviewSummary(evaluation)),
      evaluation.checks.length
        ? h('ul', { class: 'review-list' }, evaluation.checks.slice(0, 4).map((check) => h('li', null, severityIcon(check.severity, 14), h('span', null, check.title))))
        : h('p', { class: 'muted' }, evaluation.completeness.set ? 'No conflicts between the requirements set so far.' : 'Set requirements to start the review.'),
    ],
  });
}

function recentCard(ctx, list) {
  const { router, actions } = ctx;
  return card({
    title: 'Recent projects',
    icon: 'history',
    actions: [button({ label: 'All', size: 'sm', onClick: () => router.navigate('projects') })],
    body: list.length
      ? h(
          'ul',
          { class: 'recent-list' },
          list.slice(0, 5).map((project) =>
            h(
              'li',
              { class: 'recent-list__item' },
              h('span', { class: 'recent-list__icon' }, icon(categoryInfo(project.category)?.icon ?? 'folder', { size: 16 })),
              h('a', { href: `#/projects/${project.id}`, class: 'recent-list__name' }, project.name),
              h('span', { class: 'recent-list__meta' }, formatRelative(project.updatedAt)),
            ),
          ),
        )
      : emptyState({ icon: 'folder', title: 'No projects yet', actions: [button({ label: 'New project', icon: 'plus', size: 'sm', variant: 'primary', onClick: () => actions.newProject() })] }),
  });
}

function roadmapCard() {
  const available = MODULES.filter((m) => m.status !== 'planned');
  const next = BUILDS.filter((b) => b.number > BUILD_NUMBER).slice(0, 3);
  return card({
    title: 'Build roadmap',
    icon: 'roadmap',
    description: `Build ${BUILD_NUMBER} of ${TOTAL_BUILDS}`,
    body: [
      progressBar(BUILD_NUMBER, TOTAL_BUILDS, { label: 'Builds delivered' }),
      h('p', { class: 'muted' }, 'Available now'),
      h('ul', { class: 'chip-list' }, available.map((m) => h('li', null, h('a', { class: 'chip', href: `#/${m.id}` }, m.title, m.status === 'partial' ? ' (partial)' : '')))),
      h('p', { class: 'muted' }, 'Next'),
      h(
        'ol',
        { class: 'build-list' },
        next.map((b) => h('li', null, h('span', { class: 'build-list__number' }, `B${b.number}`), h('span', null, b.name), badge(buildStatus(b.number) === 'planned' ? 'Planned' : 'Current', 'neutral'))),
      ),
    ],
  });
}

function dataSafetyCard(ctx, status) {
  const { prefs, actions, projects } = ctx;
  const lastBackup = prefs.get('lastBackupAt');
  const stale = !lastBackup || Date.now() - Date.parse(lastBackup) > 7 * 24 * 3600 * 1000;
  return card({
    title: 'Data safety',
    icon: 'database',
    description: ctx.drive.enabled ? 'Projects are synced to the JSON files in your Google Drive.' : 'Projects are only in this browser. Turn on Google Drive sync to keep them in your Drive.',
    body: [
      keyValueList([
        ['Storage', projects ? 'This browser (working copy)' : 'Unavailable'],
        ['Google Drive sync', ctx.drive.enabled ? `${ctx.drive.state === 'ok' ? 'On' : 'On — needs attention'}${ctx.drive.lastSync ? `, last synced ${formatRelative(new Date(ctx.drive.lastSync).toISOString())}` : ''}` : 'Off'],
        ['Persistent', status.persisted === null ? 'Unknown' : status.persisted ? 'Yes — protected from automatic eviction' : 'Not granted — the browser may clear data under storage pressure'],
        ['Used', status.usage === null ? '—' : `${formatBytes(status.usage)}${status.quota ? ` of ${formatBytes(status.quota)} available` : ''}`],
        ['Last full backup', lastBackup ? formatRelative(lastBackup) : 'Never'],
      ]),
      stale && projects ? h('p', { class: 'notice notice--warning' }, icon('warning', { size: 16 }), 'Export a full backup regularly; clearing browser data deletes local projects.') : null,
      projects
        ? h(
            'div',
            { class: 'button-row' },
            button({ label: 'Export full backup', icon: 'download', size: 'sm', onClick: () => actions.exportBackup() }),
            status.persisted === false ? button({ label: 'Request persistent storage', icon: 'shield', size: 'sm', onClick: () => actions.requestPersistence() }) : null,
          )
        : null,
    ],
  });
}

function scopeCard() {
  return card({
    title: 'Scope and model fidelity',
    icon: 'shield',
    body: [
      h('p', null, 'AEROLAB X supports civilian, scientific, educational, inspection, mapping, environmental-monitoring and search-and-rescue aircraft, and non-weapon defence roles: logistics and resupply, surveillance and reconnaissance, meteorological support and high-altitude operations. It contains no weapon, targeting or harmful-payload functions, and AI experiments stay inside the simulation.'),
      h('p', { class: 'muted' }, FIDELITY_DISCLAIMER),
    ],
  });
}

function gettingStartedCard(ctx, list) {
  const { store, drive, router, actions } = ctx;
  const evaluation = ctx.engineering.evaluate();
  const steps = [
    { done: list.length > 0, title: 'Create a project', text: 'A project holds one aircraft design: its targets, notes and saved versions. The quickest start is a ready-made example.', action: () => actions.newFromExample(), label: 'Start from an example' },
    { done: Boolean(store.doc) && evaluation.completeness.set >= 3, title: 'Enter the design targets', text: 'Mass, payload, endurance, range, speed, altitude and wind. Use any units; they are converted for you.', action: () => (store.doc ? router.navigate('projects', [store.doc.id], { tab: 'requirements' }) : router.navigate('projects')), label: 'Open targets' },
    { done: Boolean(store.doc) && evaluation.completeness.set >= 3, title: 'Read the design review', text: 'Green means the targets fit together; amber or red items explain the calculation and how to fix it.', action: () => ctx.shell.revealInspector(), label: 'Show review' },
    { done: drive.enabled && drive.state === 'ok', title: 'Turn on Google Drive sync', text: 'Keeps your projects as a JSON file in your Drive and merges changes from every computer you use.', action: () => router.navigate('settings'), label: 'Set up sync' },
    { done: isInstalled(), title: 'Install the app (optional)', text: 'Gives AEROLAB X its own window and icon; it keeps working offline and updates itself.', action: () => router.navigate('settings'), label: 'How to install' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  return card({
    title: 'Getting started',
    icon: 'roadmap',
    class: 'span-2',
    description: `${doneCount} of ${steps.length} steps done. This guide disappears when all are done.`,
    body: h(
      'ol',
      { class: 'steps-guide' },
      steps.map((step) =>
        h(
          'li',
          { class: ['steps-guide__item', step.done ? 'steps-guide__item--done' : null] },
          h('span', { class: 'steps-guide__mark' }, icon(step.done ? 'checkCircle' : 'chevronRight', { size: 18 })),
          h('div', { class: 'steps-guide__text' }, h('p', { class: 'steps-guide__title' }, step.title), h('p', { class: 'muted' }, step.text)),
          step.done ? h('span', { class: 'badge badge--success' }, 'Done') : button({ label: step.label, size: 'sm', onClick: step.action }),
        ),
      ),
    ),
  });
}

export async function mount(container, ctx) {
  const { projects, store } = ctx;
  const [list, versions, status] = await Promise.all([
    projects ? projects.listProjects().catch(() => []) : [],
    projects && store.doc ? projects.listVersions().catch(() => []) : [],
    storageStatus(),
  ]);
  const install = isInstalled() ? null : installCard();
  const render = () =>
    container.replaceChildren(
      pageHeader({ title: 'Dashboard', icon: 'dashboard', subtitle: 'Your open project, its design review, and the state of your data at a glance.' }),
      h(
        'div',
        { class: 'page-grid dashboard-grid' },
        store.doc ? null : welcomeHero(ctx),
        healthCard(ctx),
        store.doc ? card({ title: 'Design flow', icon: 'roadmap', class: 'span-2', description: 'Follow the steps in order; each page links to the next. Status updates as you work.', body: flowOverview(ctx) }) : null,
        gettingStartedCard(ctx, list),
        currentProjectCard(ctx, versions.length),
        requirementsCard(ctx),
        reviewCard(ctx),
        recentCard(ctx, list),
        roadmapCard(),
        dataSafetyCard(ctx, status),
        install?.element,
        scopeCard(),
      ),
    );
  render();
  const offs = [store.on('change', ({ record }) => record && render()), store.on('load', () => ctx.router.resolve()), ctx.drive.on('state', () => render())];
  if (install) offs.push(install.destroy);
  if (projects) offs.push(projects.on('projects-changed', () => ctx.router.resolve()));
  return () => offs.forEach((off) => off());
}
