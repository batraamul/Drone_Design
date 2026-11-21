/**
 * My Projects: project list, Trash, and the project workspace
 * (overview, requirements, notes, versions with compare/restore).
 */
import { h, debounce } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import {
  badge,
  button,
  card,
  checkCard,
  derivedList,
  emptyState,
  field,
  formatQuantity,
  keyValueList,
  nextId,
  pageHeader,
  provenanceBadge,
  quantityInput,
  selectControl,
} from '../ui/components.js';
import { confirmDialog, openDialog } from '../ui/dialog.js';
import {
  CIVILIAN_APPLICATIONS,
  DESIGN_STAGES,
  LIMITS,
  PROJECT_CATEGORIES,
  applicationInfo,
  categoryInfo,
  createNote,
  normaliseTags,
  stageInfo,
} from '../project-schema.js';
import { REQUIREMENT_FIELDS, requirementField, validateRequirementValue } from '../engineering/requirements.js';
import { FIDELITY_DISCLAIMER } from '../engineering/provenance.js';
import { formatDateTime, formatRelative } from '../utils/format.js';
import { formatPath } from '../utils/diff.js';

// ---- New project dialog ---------------------------------------------------------------------

function categoryChoices(name, selected) {
  return h(
    'fieldset',
    { class: 'choice-grid' },
    h('legend', { class: 'field__label' }, 'Aircraft category'),
    PROJECT_CATEGORIES.map((category) =>
      h(
        'label',
        { class: 'choice' },
        h('input', { type: 'radio', name, value: category.id, checked: category.id === selected }),
        h('span', { class: 'choice__icon' }, icon(category.icon, { size: 22 })),
        h('span', { class: 'choice__title' }, category.label),
        h('span', { class: 'choice__text' }, category.summary),
      ),
    ),
  );
}

export async function newProjectDialog(ctx) {
  const { projects } = ctx;
  if (!projects) {
    ctx.notify({ level: 'warning', title: 'Local storage unavailable', message: 'Projects cannot be created in this browser context.' });
    return null;
  }
  const nameId = nextId('np');
  const appId = nextId('np');
  const descId = nextId('np');
  const name = h('input', { id: nameId, class: 'input', type: 'text', maxlength: LIMITS.nameLength, placeholder: 'e.g. Survey Quad Mk 1', autocomplete: 'off', required: true, autofocus: true });
  const application = selectControl({ id: appId, options: CIVILIAN_APPLICATIONS.map((a) => ({ value: a.id, label: a.label })), value: 'aerial-mapping' });
  const description = h('textarea', { id: descId, class: 'textarea', rows: 3, maxlength: LIMITS.descriptionLength, placeholder: 'Purpose, operating environment, key constraints…' });
  let created = null;
  await openDialog({
    title: 'New project',
    size: 'lg',
    body: [
      field({ id: nameId, label: 'Project name', control: name }),
      categoryChoices('np-category', 'multirotor'),
      h('div', { class: 'form-row' }, field({ id: appId, label: 'Civilian application', control: application }), field({ id: descId, label: 'Description (optional)', control: description, wide: true })),
      h('p', { class: 'notice notice--info' }, icon('info', { size: 16 }), 'Detailed configuration (layout, geometry and components) arrives in Build 2. Design requirements can be set right after creating the project.'),
    ],
    actions: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Create project', value: 'create', variant: 'primary' },
    ],
    onSubmit: async (_, form) => {
      if (!name.value.trim()) {
        name.focus();
        throw new Error('Enter a project name.');
      }
      const category = form.querySelector('input[name="np-category"]:checked')?.value ?? 'multirotor';
      created = await projects.createProject({ name: name.value, category, application: application.value, description: description.value });
      return true;
    },
  });
  if (created) {
    ctx.notify({ level: 'success', title: 'Project created', message: `“${created.name}” is saved in this browser.` });
    ctx.actions.requestPersistence({ quiet: true });
    ctx.router.navigate('projects', [created.id], { tab: 'requirements' });
  }
  return created;
}

// ---- Project list ------------------------------------------------------------------------------

function projectCard(project, ctx) {
  const { actions, projects } = ctx;
  const isOpen = projects.currentId === project.id;
  const category = categoryInfo(project.category);
  return h(
    'article',
    { class: ['project-card', isOpen ? 'project-card--open' : null], dataset: { projectId: project.id } },
    h(
      'header',
      { class: 'project-card__header' },
      h('span', { class: 'project-card__icon' }, icon(category?.icon ?? 'folder', { size: 20 })),
      h('div', { class: 'project-card__titles' }, h('h3', { class: 'project-card__name' }, h('a', { href: `#/projects/${project.id}` }, project.name)), h('p', { class: 'project-card__sub' }, `${category?.label ?? project.category} · ${applicationInfo(project.application)?.label ?? project.application}`)),
      h('span', { class: 'project-card__badges' }, isOpen ? badge('Open', 'accent') : null, badge(stageInfo(project.stage)?.label ?? project.stage, 'neutral')),
    ),
    project.description ? h('p', { class: 'project-card__desc' }, project.description) : null,
    project.tags.length ? h('ul', { class: 'chip-list' }, project.tags.map((tag) => h('li', null, h('span', { class: 'chip' }, tag)))) : null,
    h('p', { class: 'project-card__meta' }, `Updated ${formatRelative(project.updatedAt)} · revision ${project.revision} · ${project.versionCount} version${project.versionCount === 1 ? '' : 's'}`),
    h(
      'footer',
      { class: 'project-card__actions' },
      button({ label: 'Open', variant: 'primary', size: 'sm', onClick: () => ctx.router.navigate('projects', [project.id]) }),
      button({ label: 'Duplicate', icon: 'copy', size: 'sm', onClick: () => actions.duplicateProject(project.id) }),
      button({ label: 'Export', icon: 'download', size: 'sm', onClick: () => actions.exportProject(project.id) }),
      button({ label: 'Trash', icon: 'trash', size: 'sm', variant: 'ghost', ariaLabel: `Move ${project.name} to the Trash`, onClick: () => actions.trashProject(project.id) }),
    ),
  );
}

async function renderList(container, ctx) {
  const { projects, actions } = ctx;
  const [list, trashed] = await Promise.all([projects.listProjects(), projects.listProjects({ onlyDeleted: true })]);
  const state = { query: '', sort: 'updated' };
  const grid = h('div', { class: 'project-grid' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  const searchId = nextId('pl');
  const sortId = nextId('pl');
  const update = () => {
    const q = state.query.trim().toLowerCase();
    const filtered = list
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => (state.sort === 'name' ? a.name.localeCompare(b.name) : state.sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
    count.textContent = q ? `${filtered.length} of ${list.length} projects` : `${list.length} project${list.length === 1 ? '' : 's'}`;
    grid.replaceChildren(
      ...(filtered.length
        ? filtered.map((p) => projectCard(p, ctx))
        : [
            list.length
              ? emptyState({ icon: 'search', title: 'No matching projects', message: 'Try another search term.' })
              : emptyState({
                  icon: 'folder',
                  title: 'No projects yet',
                  message: 'Create a project to record requirements, notes and versions. Everything is stored locally in this browser.',
                  actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => actions.newProject() }), button({ label: 'Import project', icon: 'upload', onClick: () => actions.importProject() })],
                }),
          ]),
    );
  };
  const search = h('input', { id: searchId, class: 'input', type: 'search', placeholder: 'Filter by name, description or tag', autocomplete: 'off', onInput: (e) => { state.query = e.target.value; update(); } });
  const sort = selectControl({
    id: sortId,
    options: [
      { value: 'updated', label: 'Last modified' },
      { value: 'name', label: 'Name' },
      { value: 'created', label: 'Date created' },
    ],
    value: state.sort,
    onChange: (value) => {
      state.sort = value;
      update();
    },
  });
  container.replaceChildren(
    pageHeader({
      title: 'My Projects',
      icon: 'folder',
      subtitle: 'Design projects stored in this browser. Export projects or full backups to keep copies elsewhere.',
      actions: [button({ label: 'New project', icon: 'plus', variant: 'primary', onClick: () => actions.newProject() }), button({ label: 'Import', icon: 'upload', onClick: () => actions.importProject() })],
    }),
    h(
      'div',
      { class: 'toolbar' },
      h('label', { class: 'toolbar__field', for: searchId }, h('span', { class: 'visually-hidden' }, 'Filter projects'), icon('search', { size: 16 }), search),
      h('label', { class: 'toolbar__field', for: sortId }, h('span', { class: 'toolbar__label' }, 'Sort'), sort),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#/projects/trash' }, icon('trash', { size: 16 }), h('span', null, `Trash (${trashed.length})`)),
    ),
    count,
    grid,
  );
  update();
  return projects.on('projects-changed', () => ctx.router.resolve());
}

async function renderTrash(container, ctx) {
  const { projects, actions } = ctx;
  const list = await projects.listProjects({ onlyDeleted: true });
  container.replaceChildren(
    pageHeader({
      title: 'Trash',
      icon: 'trash',
      subtitle: 'Projects in the Trash keep their versions until you delete them permanently.',
      actions: [button({ label: 'Back to projects', icon: 'chevronLeft', onClick: () => ctx.router.navigate('projects') })],
    }),
    list.length
      ? h(
          'table',
          { class: 'table' },
          h('caption', { class: 'visually-hidden' }, 'Projects in the Trash'),
          h('thead', null, h('tr', null, ['Project', 'Moved to Trash', 'Versions', ''].map((label) => h('th', { scope: 'col' }, label)))),
          h(
            'tbody',
            null,
            list.map((project) =>
              h(
                'tr',
                null,
                h('td', null, project.name),
                h('td', null, formatRelative(project.deletedAt)),
                h('td', { class: 'mono' }, String(project.versionCount)),
                h('td', { class: 'table__actions' }, button({ label: 'Restore', icon: 'restore', size: 'sm', onClick: () => actions.restoreProject(project.id) }), button({ label: 'Delete permanently', size: 'sm', variant: 'danger', onClick: () => actions.deletePermanently(project) })),
              ),
            ),
          ),
        )
      : emptyState({ icon: 'trash', title: 'The Trash is empty' }),
  );
  return projects.on('projects-changed', () => ctx.router.resolve());
}

// ---- Workspace tabs ------------------------------------------------------------------------------

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'folder' },
  { id: 'requirements', label: 'Requirements', icon: 'tag' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'versions', label: 'Versions', icon: 'history' },
];

function overviewTab(ctx) {
  const { store } = ctx;
  const doc = store.doc;
  const ids = { name: nextId('ov'), desc: nextId('ov'), app: nextId('ov'), stage: nextId('ov'), tags: nextId('ov') };
  const nameInput = h('input', { id: ids.name, class: 'input', type: 'text', value: doc.name, maxlength: LIMITS.nameLength, autocomplete: 'off' });
  const nameField = field({ id: ids.name, label: 'Project name', control: nameInput });
  nameInput.addEventListener('input', () => {
    const value = nameInput.value.trim();
    const error = nameField.querySelector('.field__error');
    if (!value) {
      error.textContent = 'A project needs a name.';
      nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    error.textContent = '';
    nameInput.setAttribute('aria-invalid', 'false');
    store.set('name', value, { label: 'Rename project' });
  });
  const descInput = h('textarea', { id: ids.desc, class: 'textarea', rows: 4, maxlength: LIMITS.descriptionLength, value: doc.description });
  descInput.addEventListener('input', () => store.set('description', descInput.value, { label: 'Edit description' }));
  const appSelect = selectControl({ id: ids.app, options: CIVILIAN_APPLICATIONS.map((a) => ({ value: a.id, label: a.label })), value: doc.application, onChange: (value) => store.set('application', value, { label: 'Change application' }) });
  const stageSelect = selectControl({ id: ids.stage, options: DESIGN_STAGES.map((s) => ({ value: s.id, label: s.label })), value: doc.stage, onChange: (value) => store.set('stage', value, { label: 'Change design stage' }) });
  const tagsInput = h('input', { id: ids.tags, class: 'input', type: 'text', value: doc.tags.join(', '), autocomplete: 'off', placeholder: 'comma-separated, e.g. mapping, prototype' });
  tagsInput.addEventListener('input', debounce(() => store.set('tags', normaliseTags(tagsInput.value.split(',')), { label: 'Edit tags' }), 300));
  const categories = categoryChoices('ov-category', doc.category);
  categories.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'ov-category') store.set('category', event.target.value, { label: 'Change category' });
  });
  const info = h('div');
  const renderInfo = () =>
    info.replaceChildren(
      keyValueList([
        ['Project ID', h('code', null, store.doc.id)],
        ['Created', formatDateTime(store.doc.createdAt)],
        ['Revision', String(ctx.projects.current?.baseRevision ?? store.doc.revision)],
        ['Schema version', String(store.doc.schemaVersion)],
        ['Last written by', `AEROLAB X ${store.doc.appVersion}`],
      ]),
    );
  renderInfo();
  const element = h(
    'div',
    { class: 'page-grid' },
    card({
      title: 'Project details',
      icon: 'folder',
      class: 'span-2',
      body: [
        nameField,
        field({ id: ids.desc, label: 'Description', control: descInput, hint: 'Purpose, operating environment and key constraints.' }),
        h('div', { class: 'form-row' }, field({ id: ids.app, label: 'Civilian application', control: appSelect }), field({ id: ids.stage, label: 'Design stage', control: stageSelect, hint: 'Self-declared maturity. There is deliberately no “flight-ready” stage.' })),
        field({ id: ids.tags, label: 'Tags', control: tagsInput }),
        categories,
      ],
    }),
    card({ title: 'Record', icon: 'database', body: info }),
  );
  const sync = ({ undo, redo, record } = {}) => {
    const d = store.doc;
    const force = undo || redo;
    if (force || document.activeElement !== nameInput) nameInput.value = d.name;
    if (force || document.activeElement !== descInput) descInput.value = d.description;
    if (force || document.activeElement !== tagsInput) tagsInput.value = d.tags.join(', ');
    appSelect.value = d.application;
    stageSelect.value = d.stage;
    const radio = categories.querySelector(`input[value="${d.category}"]`);
    if (radio) radio.checked = true;
    if (!record || force) renderInfo();
  };
  return { element, sync };
}

function requirementsTab(ctx) {
  const { store, prefs } = ctx;
  const inputs = new Map();
  const fields = REQUIREMENT_FIELDS.map((def) => {
    const id = nextId('rq');
    const control = quantityInput({
      id,
      label: def.label,
      siUnit: def.unit,
      units: def.displayUnits,
      unit: prefs.displayUnit(def.key, def.displayUnits[0]),
      valueSI: store.doc.requirements[def.key]?.value ?? null,
      validate: (si) => validateRequirementValue(def.key, si),
      onCommit: (si) => store.set(['requirements', def.key, 'value'], si, { label: `Set ${def.label}` }),
      onUnitChange: (unit) => prefs.setDisplayUnit(def.key, unit),
    });
    inputs.set(def.key, control);
    return h('div', { class: 'requirement' }, field({ id, label: def.label, control: control.element, hint: def.help }), h('span', { class: 'requirement__badge' }, provenanceBadge('requirement')));
  });
  const results = h('div', { class: 'requirement-results' });
  const renderResults = () => {
    const evaluation = ctx.engineering.evaluate();
    results.replaceChildren(
      h('p', { class: 'muted' }, `${evaluation.completeness.set} of ${evaluation.completeness.total} requirements set. Checks update as you type.`),
      evaluation.checks.length
        ? h('div', { class: 'check-list' }, evaluation.checks.map((check) => checkCard(check, prefs)))
        : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), evaluation.completeness.set ? 'No conflicts between the requirements set so far.' : 'No requirements set yet.'),
      evaluation.derived.length ? h('h3', { class: 'subheading' }, 'Derived values') : null,
      derivedList(evaluation.derived, prefs),
    );
  };
  renderResults();
  const element = h(
    'div',
    { class: 'page-grid' },
    card({
      title: 'Design requirements',
      icon: 'tag',
      description: 'Targets the design must meet, stored in SI units. Choose display units per field.',
      body: h('div', { class: 'requirement-list' }, fields),
    }),
    card({
      title: 'Consistency checks',
      icon: 'checkCircle',
      description: 'Analytical checks between targets. Whether a design meets them is assessed in later builds.',
      body: [results, h('p', { class: 'inspector__disclaimer' }, FIDELITY_DISCLAIMER)],
    }),
  );
  const sync = ({ undo, redo } = {}) => {
    for (const def of REQUIREMENT_FIELDS) inputs.get(def.key).update(store.doc.requirements[def.key]?.value ?? null, { force: undo || redo });
    renderResults();
  };
  return { element, sync };
}

function notesTab(ctx) {
  const { store } = ctx;
  let selectedId = store.doc.notes[0]?.id ?? null;
  const list = h('ul', { class: 'note-list', role: 'list' });
  const editor = h('div', { class: 'note-editor' });
  const titleId = nextId('nt');
  const bodyId = nextId('nt');

  const updateNote = (id, patch, label) => {
    const notes = store.doc.notes.map((note) => (note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note));
    store.set('notes', notes, { label });
  };
  const addNote = () => {
    const note = createNote({ title: 'New note' });
    store.set('notes', [note, ...store.doc.notes], { label: 'Add note', coalesce: false });
    selectedId = note.id;
    renderAll();
    editor.querySelector('input')?.select();
  };
  const deleteNote = async (note) => {
    const ok = await confirmDialog({ title: 'Delete note?', message: `Delete “${note.title}”? You can undo this with Ctrl+Z.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    store.set('notes', store.doc.notes.filter((n) => n.id !== note.id), { label: 'Delete note', coalesce: false });
    selectedId = store.doc.notes[0]?.id ?? null;
    renderAll();
  };

  const renderList = () => {
    const notes = store.doc.notes;
    list.replaceChildren(
      ...notes.map((note) =>
        h(
          'li',
          null,
          h(
            'button',
            { type: 'button', class: ['note-list__item', note.id === selectedId ? 'note-list__item--active' : null], 'aria-current': note.id === selectedId ? 'true' : undefined, onClick: () => { selectedId = note.id; renderAll(); } },
            h('span', { class: 'note-list__title' }, note.title),
            h('span', { class: 'note-list__meta' }, formatRelative(note.updatedAt)),
          ),
        ),
      ),
    );
  };
  let titleInput = null;
  let bodyInput = null;
  const renderEditor = () => {
    const note = store.doc.notes.find((n) => n.id === selectedId);
    if (!note) {
      titleInput = null;
      bodyInput = null;
      editor.replaceChildren(emptyState({ icon: 'note', title: store.doc.notes.length ? 'Select a note' : 'No notes yet', message: 'Use notes as a design log: decisions, assumptions, sources and test observations.', actions: [button({ label: 'New note', icon: 'plus', variant: 'primary', size: 'sm', onClick: addNote })] }));
      return;
    }
    titleInput = h('input', { id: titleId, class: 'input', type: 'text', value: note.title, maxlength: LIMITS.noteTitleLength, autocomplete: 'off' });
    bodyInput = h('textarea', { id: bodyId, class: 'textarea textarea--note', rows: 14, maxlength: LIMITS.noteBodyLength, value: note.body, placeholder: 'Write in plain text…' });
    titleInput.addEventListener('input', () => updateNote(note.id, { title: titleInput.value || 'Untitled note' }, 'Edit note'));
    bodyInput.addEventListener('input', () => updateNote(note.id, { body: bodyInput.value }, 'Edit note'));
    editor.replaceChildren(
      field({ id: titleId, label: 'Title', control: titleInput }),
      field({ id: bodyId, label: 'Note', control: bodyInput, hint: `Created ${formatDateTime(note.createdAt)} · plain text, saved automatically` }),
      h('div', { class: 'button-row' }, button({ label: 'Delete note', icon: 'trash', size: 'sm', variant: 'ghost', onClick: () => deleteNote(note) })),
    );
  };
  const renderAll = () => {
    renderList();
    renderEditor();
  };
  renderAll();
  const element = card({
    title: 'Design notes',
    icon: 'note',
    description: 'A running design log stored with the project and included in versions and exports.',
    actions: [button({ label: 'New note', icon: 'plus', size: 'sm', variant: 'primary', onClick: addNote })],
    body: h('div', { class: 'notes-layout' }, h('nav', { 'aria-label': 'Notes' }, list), editor),
  });
  const sync = ({ undo, redo } = {}) => {
    renderList();
    const note = store.doc.notes.find((n) => n.id === selectedId);
    if (!note || undo || redo || !titleInput) {
      if (!note) selectedId = store.doc.notes[0]?.id ?? null;
      renderEditor();
      return;
    }
    if (document.activeElement !== titleInput) titleInput.value = note.title;
    if (document.activeElement !== bodyInput) bodyInput.value = note.body;
  };
  return { element, sync };
}

const REASON_LABELS = {
  created: ['Created', 'neutral'],
  manual: ['Saved version', 'accent'],
  'pre-restore': ['Safety snapshot', 'warning'],
  'pre-migration': ['Pre-upgrade snapshot', 'warning'],
  import: ['Imported', 'info'],
  duplicate: ['Duplicated', 'info'],
};

const PATH_LABELS = { name: 'Name', description: 'Description', category: 'Category', application: 'Civilian application', stage: 'Design stage', tags: 'Tags', modules: 'Module data', notes: 'Notes' };

function describeChange(change, prefs, docs) {
  const [root, key, leaf] = change.path;
  let label = PATH_LABELS[root] ?? formatPath(change.path);
  let format = (value) => (value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value));
  if (root === 'requirements') {
    const def = requirementField(key);
    label = def ? `${def.label}${leaf && leaf !== 'value' ? ` (${leaf})` : ''}` : formatPath(change.path);
    if (def && leaf === 'value') format = (value) => (value === undefined ? '—' : formatQuantity(value, def.unit, prefs.displayUnit(def.key, def.displayUnits[0])));
  } else if (root === 'notes') {
    const id = String(key ?? '').replace(/^\[|\]$/g, '');
    const note = [...(docs.to?.notes ?? []), ...(docs.from?.notes ?? [])].find((n) => n.id === id);
    label = `Note “${note?.title ?? id}”${leaf ? ` — ${leaf}` : ''}`;
    format = (value) => (value === undefined ? '—' : typeof value === 'object' ? `“${value.title}”` : String(value));
  } else if (root === 'category') {
    format = (value) => categoryInfo(value)?.label ?? String(value ?? '—');
  } else if (root === 'application') {
    format = (value) => applicationInfo(value)?.label ?? String(value ?? '—');
  } else if (root === 'stage') {
    format = (value) => stageInfo(value)?.label ?? String(value ?? '—');
  } else if (root === 'tags') {
    format = (value) => (Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '—'));
  }
  const truncate = (text) => (text.length > 160 ? `${text.slice(0, 157)}…` : text);
  return { label, before: truncate(format(change.before)), after: truncate(format(change.after)) };
}

function versionsTab(ctx) {
  const { projects, actions, prefs, store } = ctx;
  const element = h('div', { class: 'page-grid' });
  const labelId = nextId('vr');
  const noteId = nextId('vr');
  const fromId = nextId('vr');
  const toId = nextId('vr');
  let versions = [];
  const comparison = h('div', { class: 'comparison', 'aria-live': 'polite' });

  const runCompare = async (fromValue, toValue) => {
    try {
      const result = await projects.compare(fromValue, toValue);
      const fromDoc = fromValue === 'current' ? store.doc : versions.find((v) => v.id === fromValue)?.snapshot;
      const toDoc = toValue === 'current' ? store.doc : versions.find((v) => v.id === toValue)?.snapshot;
      comparison.replaceChildren(
        h('p', { class: 'muted' }, `${result.from} → ${result.to}: ${result.changes.length} change${result.changes.length === 1 ? '' : 's'}`),
        result.changes.length
          ? h(
              'table',
              { class: 'table table--compact' },
              h('caption', { class: 'visually-hidden' }, 'Differences between versions'),
              h('thead', null, h('tr', null, ['Field', 'Change', 'Before', 'After'].map((label) => h('th', { scope: 'col' }, label)))),
              h(
                'tbody',
                null,
                result.changes.map((change) => {
                  const d = describeChange(change, prefs, { from: fromDoc, to: toDoc });
                  return h('tr', null, h('td', null, d.label), h('td', null, badge(change.type, change.type === 'removed' ? 'danger' : change.type === 'added' ? 'success' : 'info')), h('td', { class: 'diff-before' }, d.before), h('td', { class: 'diff-after' }, d.after));
                }),
              ),
            )
          : h('p', null, 'The two states are identical in design content.'),
      );
    } catch (error) {
      comparison.replaceChildren(h('p', { class: 'field__error' }, error.message));
    }
  };

  const render = async () => {
    versions = await projects.listVersions();
    const labelInput = h('input', { id: labelId, class: 'input', type: 'text', maxlength: 200, placeholder: `Version ${(versions[0]?.number ?? 0) + 1}`, autocomplete: 'off' });
    const noteInput = h('input', { id: noteId, class: 'input', type: 'text', maxlength: 2000, placeholder: 'What changed and why (optional)', autocomplete: 'off' });
    const form = h(
      'form',
      { class: 'version-form', novalidate: true },
      field({ id: labelId, label: 'Version label', control: labelInput }),
      field({ id: noteId, label: 'Note', control: noteInput }),
      button({ label: 'Save version', icon: 'history', variant: 'primary', type: 'submit' }),
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await actions.saveVersion({ label: labelInput.value.trim(), note: noteInput.value.trim() });
    });
    const options = [{ value: 'current', label: 'Current design' }, ...versions.map((v) => ({ value: v.id, label: `v${v.number} — ${v.label}` }))];
    const fromSelect = selectControl({ id: fromId, options, value: versions[0]?.id ?? 'current' });
    const toSelect = selectControl({ id: toId, options, value: 'current' });
    element.replaceChildren(
      card({
        title: 'Version history',
        icon: 'history',
        class: 'span-2',
        description: 'Versions are complete snapshots. Restoring one first saves the current design as a safety snapshot, and can be undone.',
        body: [
          form,
          h(
            'table',
            { class: 'table' },
            h('caption', { class: 'visually-hidden' }, 'Saved versions'),
            h('thead', null, h('tr', null, ['#', 'Label', 'Kind', 'Saved', 'App', ''].map((label) => h('th', { scope: 'col' }, label)))),
            h(
              'tbody',
              null,
              versions.map((version) => {
                const [kind, tone] = REASON_LABELS[version.reason] ?? [version.reason, 'neutral'];
                return h(
                  'tr',
                  null,
                  h('td', { class: 'mono' }, `v${version.number}`),
                  h('td', null, h('span', null, version.label), version.note ? h('span', { class: 'table__note' }, version.note) : null),
                  h('td', null, badge(kind, tone)),
                  h('td', { title: formatDateTime(version.createdAt) }, formatRelative(version.createdAt)),
                  h('td', { class: 'mono' }, version.appVersion),
                  h(
                    'td',
                    { class: 'table__actions' },
                    button({ label: 'Compare', icon: 'compare', size: 'sm', onClick: () => { fromSelect.value = version.id; toSelect.value = 'current'; runCompare(version.id, 'current'); } }),
                    button({ label: 'Restore', icon: 'restore', size: 'sm', onClick: () => actions.restoreVersion(version) }),
                  ),
                );
              }),
            ),
          ),
        ],
      }),
      card({
        title: 'Compare',
        icon: 'compare',
        class: 'span-2',
        body: [
          h('div', { class: 'form-row form-row--end' }, field({ id: fromId, label: 'From', control: fromSelect }), field({ id: toId, label: 'To', control: toSelect }), button({ label: 'Compare', icon: 'compare', onClick: () => runCompare(fromSelect.value, toSelect.value) })),
          comparison,
        ],
      }),
    );
  };
  render();
  const off = projects.on('versions-changed', () => render());
  return { element, sync: () => {}, destroy: off };
}

const TAB_BUILDERS = { overview: overviewTab, requirements: requirementsTab, notes: notesTab, versions: versionsTab };

async function renderWorkspace(container, ctx, route) {
  const { projects, store, actions } = ctx;
  const id = route.segments[0];
  if (projects.currentId !== id) {
    container.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'boot__spinner', 'aria-hidden': 'true' }), h('p', null, 'Opening project…')));
    try {
      await projects.openProject(id);
    } catch (error) {
      container.replaceChildren(
        emptyState({
          icon: 'warning',
          title: 'This project cannot be opened',
          message: error.message,
          actions: [button({ label: 'All projects', onClick: () => ctx.router.navigate('projects') }), /Trash/.test(error.message) ? button({ label: 'Open Trash', onClick: () => ctx.router.navigate('projects', ['trash']) }) : null],
        }),
      );
      return null;
    }
  }
  const tabId = TAB_BUILDERS[route.params.tab] ? route.params.tab : 'overview';
  const tab = TAB_BUILDERS[tabId](ctx);
  const doc = store.doc;
  const title = h('span', null, doc.name);
  const subtitle = h('span');
  const updateHeader = () => {
    title.textContent = store.doc.name;
    subtitle.textContent = `${categoryInfo(store.doc.category)?.label} · ${applicationInfo(store.doc.application)?.label} · ${stageInfo(store.doc.stage)?.label}`;
    document.title = `${store.doc.name} — AEROLAB X`;
    for (const t of TABS) {
      const counter = container.querySelector(`[data-tab-count="${t.id}"]`);
      if (counter && t.id === 'notes') counter.textContent = String(store.doc.notes.length);
    }
  };
  const tabs = h(
    'div',
    { class: 'tabs tabs--page', role: 'tablist', 'aria-label': 'Project sections' },
    TABS.map((t) =>
      h(
        'a',
        { class: 'tab', role: 'tab', href: `#/projects/${id}?tab=${t.id}`, 'aria-selected': String(t.id === tabId), 'aria-controls': 'project-tabpanel', id: `project-tab-${t.id}` },
        icon(t.icon, { size: 15 }),
        h('span', null, t.label),
        t.id === 'notes' ? h('span', { class: 'tab__count', dataset: { tabCount: 'notes' } }, String(doc.notes.length)) : null,
      ),
    ),
  );
  container.replaceChildren(
    pageHeader({
      title,
      icon: categoryInfo(doc.category)?.icon ?? 'folder',
      subtitle,
      actions: [
        button({ label: 'Save version', icon: 'history', size: 'sm', onClick: () => actions.saveVersion() }),
        button({ label: 'Export', icon: 'download', size: 'sm', onClick: () => actions.exportProject(id) }),
        button({ label: 'Duplicate', icon: 'copy', size: 'sm', onClick: () => actions.duplicateProject(id) }),
        button({ label: 'Close', icon: 'close', size: 'sm', variant: 'ghost', onClick: () => actions.closeProject() }),
        button({ label: 'Trash', icon: 'trash', size: 'sm', variant: 'ghost', ariaLabel: 'Move this project to the Trash', onClick: () => actions.trashProject(id) }),
      ],
    }),
    tabs,
    h('div', { class: 'tabpanel', id: 'project-tabpanel', role: 'tabpanel', 'aria-labelledby': `project-tab-${tabId}` }, tab.element),
  );
  updateHeader();
  const offs = [
    store.on('change', (event) => {
      if (!store.doc) return;
      updateHeader();
      tab.sync(event);
    }),
    store.on('load', () => {
      if (store.doc?.id === id) ctx.router.resolve();
      else if (!store.doc) ctx.router.navigate('projects', [], {}, { replace: true });
    }),
  ];
  return () => {
    offs.forEach((off) => off());
    tab.destroy?.();
  };
}

export async function mount(container, ctx, route) {
  if (!ctx.projects) {
    container.replaceChildren(
      pageHeader({ title: 'My Projects', icon: 'folder' }),
      emptyState({ icon: 'database', title: 'Local storage is unavailable', message: ctx.storageError ?? 'This browser context does not allow IndexedDB, so projects cannot be stored. Try a normal (non-private) window.' }),
    );
    return null;
  }
  const [first] = route.segments;
  if (!first) return renderList(container, ctx);
  if (first === 'trash') return renderTrash(container, ctx);
  return renderWorkspace(container, ctx, route);
}
