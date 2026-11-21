/**
 * Page shown for modules that are not implemented yet. It states plainly that
 * nothing here calculates anything, and describes what the module will do and when.
 */
import { h } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { badge, card, linkButton, pageHeader } from '../ui/components.js';
import { BUILDS, getModule, statusLabel } from './module-registry.js';
import { BUILD_NUMBER } from '../version.js';

export function mount(container, ctx, route) {
  const module = getModule(route.module);
  const builds = module.builds.map((number) => BUILDS.find((build) => build.number === number)).filter(Boolean);
  container.replaceChildren(
    pageHeader({
      title: module.title,
      icon: module.icon,
      subtitle: module.summary,
      badges: [badge(statusLabel(module), 'neutral')],
    }),
    h(
      'div',
      { class: 'notice notice--info', role: 'note' },
      icon('info', { size: 18 }),
      h(
        'p',
        null,
        h('strong', null, 'Not implemented yet. '),
        `This module is scheduled for Build ${module.builds.join(' and ')}; the current release is Build ${BUILD_NUMBER}. Nothing on this page performs calculations or stores data.`,
      ),
    ),
    h(
      'div',
      { class: 'page-grid' },
      card({
        title: 'What this module will do',
        icon: 'roadmap',
        class: 'span-2',
        body: h('ul', { class: 'scope-list' }, module.scope.map((item) => h('li', null, item))),
      }),
      card({
        title: 'Planned build',
        icon: 'layers',
        body: builds.map((build) =>
          h(
            'div',
            { class: 'build-summary' },
            h('p', { class: 'build-summary__title' }, `Build ${build.number} — ${build.name}`),
            h('p', null, build.scope),
            h('p', { class: 'muted' }, h('strong', null, 'Acceptance: '), build.acceptance),
          ),
        ),
      }),
      card({
        title: 'Connections',
        icon: 'neural',
        body: [
          h('p', { class: 'muted' }, 'Depends on'),
          module.dependsOn?.length
            ? h('ul', { class: 'chip-list' }, module.dependsOn.map((id) => h('li', null, h('a', { class: 'chip', href: `#/${id}` }, getModule(id)?.title ?? id))))
            : h('p', null, 'No other module'),
          h('p', { class: 'muted' }, 'Shares in the project model'),
          h('ul', { class: 'chip-list' }, (module.dataShared ?? []).map((key) => h('li', null, h('code', { class: 'chip chip--code' }, key)))),
        ],
      }),
      card({
        title: 'Meanwhile',
        icon: 'book',
        body: [
          h('p', null, 'Record design intent for this area in your project notes, and review the engineering foundations in the Learning Centre.'),
          h('div', { class: 'button-row' }, linkButton({ href: '#/projects', label: 'My Projects', icon: 'folder', size: 'sm' }), linkButton({ href: '#/learning', label: 'Learning Centre', icon: 'book', size: 'sm' })),
        ],
      }),
    ),
  );
  return null;
}
