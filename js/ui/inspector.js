/**
 * Right-hand inspector: properties of the open project, live engineering checks
 * and derived values. Modules can temporarily replace the content with their own.
 */
import { h, $, rafThrottle } from '../utils/dom.js';
import { icon } from './icons.js';
import { button, checkCard, derivedList, emptyState, keyValueList, badge, progressBar } from './components.js';
import { categoryInfo, applicationInfo, stageInfo } from '../project-schema.js';
import { FIDELITY_DISCLAIMER } from '../engineering/provenance.js';
import { formatRelative } from '../utils/format.js';

export class InspectorPanel {
  #ctx;
  #root = $('#inspector-content');
  #override = null;
  render = rafThrottle(() => this.#render());

  constructor(ctx) {
    this.#ctx = ctx;
    ctx.store.on('change', () => this.render());
    ctx.store.on('load', () => this.render());
    ctx.projects?.on('status', () => this.render());
    ctx.prefs.on('change', ({ key }) => key === 'displayUnits' && this.render());
  }

  /** Replace the inspector content with `builder()` output until cleared with null. */
  setOverride(builder) {
    this.#override = builder;
    this.render();
  }

  #section(title, iconName, content, { count } = {}) {
    return h(
      'section',
      { class: 'inspector__section' },
      h('h2', { class: 'inspector__heading' }, icon(iconName, { size: 16 }), h('span', null, title), count !== undefined ? badge(String(count), count ? 'warning' : 'neutral') : null),
      content,
    );
  }

  #render() {
    if (this.#override) {
      this.#root.replaceChildren(this.#override());
      return;
    }
    const { store, projects, prefs, actions } = this.#ctx;
    const doc = store.doc;
    if (!doc) {
      this.#root.replaceChildren(
        h('h2', { class: 'inspector__title' }, 'Inspector'),
        emptyState({
          icon: 'folder',
          title: 'No project open',
          message: 'Open or create a project to see its properties, live engineering checks and derived values here.',
          actions: projects
            ? [button({ label: 'New project', icon: 'plus', variant: 'primary', size: 'sm', onClick: () => actions.newProject() }), button({ label: 'All projects', size: 'sm', onClick: () => this.#ctx.router.navigate('projects') })]
            : null,
        }),
      );
      return;
    }
    const evaluation = this.#ctx.engineering.evaluate();
    const counts = { error: 0, warning: 0, info: 0 };
    for (const check of evaluation.checks) counts[check.severity] += 1;
    const attention = counts.error + counts.warning;
    this.#root.replaceChildren(
      h('h2', { class: 'inspector__title' }, 'Inspector'),
      this.#section(
        'Project',
        'folder',
        keyValueList([
          ['Name', doc.name],
          ['Category', categoryInfo(doc.category)?.label ?? doc.category],
          ['Application', applicationInfo(doc.application)?.label ?? doc.application],
          ['Stage', stageInfo(doc.stage)?.label ?? doc.stage],
          ['Revision', String(projects?.current?.baseRevision ?? doc.revision)],
          ['Last saved', formatRelative(projects?.current?.lastSavedAt)],
        ]),
      ),
      this.#section(
        'Design review',
        'checkCircle',
        h(
          'div',
          { class: 'inspector__review' },
          h('p', { class: 'inspector__meta' }, `${evaluation.completeness.set} of ${evaluation.completeness.total} requirements set`),
          progressBar(evaluation.completeness.set, evaluation.completeness.total, { label: 'Requirements set' }),
          evaluation.checks.length
            ? h('div', { class: 'check-list' }, evaluation.checks.map((check) => checkCard(check, prefs, { compact: true })))
            : h('p', { class: 'inspector__ok' }, icon('checkCircle', { size: 16 }), evaluation.completeness.set ? 'No requirement conflicts found.' : 'Set requirements to start the design review.'),
        ),
        { count: attention },
      ),
      evaluation.derived.length ? this.#section('Derived values', 'lightning', derivedList(evaluation.derived, prefs)) : null,
      h('p', { class: 'inspector__disclaimer' }, FIDELITY_DISCLAIMER),
    );
  }
}
