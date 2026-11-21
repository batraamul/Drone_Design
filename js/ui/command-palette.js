/**
 * Command palette (Ctrl/⌘ + K): searches modules, projects, commands and glossary terms.
 */
import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { MODULES, statusLabel } from '../modules/module-registry.js';
import { categoryInfo } from '../project-schema.js';
import { formatRelative } from '../utils/format.js';
import { GLOSSARY } from '../modules/learning/glossary.js';

export function scoreMatch(text, query) {
  const t = String(text).toLowerCase();
  const q = String(query).toLowerCase().trim();
  if (!q) return 1;
  const index = t.indexOf(q);
  if (index === 0) return 100 - t.length * 0.01;
  if (index > 0) return (/[\s\-–(/]/.test(t[index - 1]) ? 90 : 70) - index * 0.1;
  let position = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, position);
    if (found === -1) return 0;
    gaps += found - position;
    position = found + 1;
  }
  return Math.max(1, 40 - gaps);
}

export class CommandPalette {
  #ctx;
  #dialog = null;
  #input = null;
  #list = null;
  #items = [];
  #visible = [];
  #active = 0;
  #scope = null;

  constructor(ctx) {
    this.#ctx = ctx;
  }

  #build() {
    this.#input = h('input', {
      class: 'palette__input',
      type: 'text',
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': 'palette-list',
      'aria-autocomplete': 'list',
      'aria-label': 'Search',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Search modules, projects, commands and glossary…',
    });
    this.#list = h('ul', { class: 'palette__list', id: 'palette-list', role: 'listbox', 'aria-label': 'Results' });
    this.#dialog = h(
      'dialog',
      { class: 'palette', 'aria-label': 'Search' },
      h('div', { class: 'palette__search' }, icon('search', { size: 18 }), this.#input, h('kbd', null, 'Esc')),
      this.#list,
      h('footer', { class: 'palette__footer' }, h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' navigate'), h('span', null, h('kbd', null, 'Enter'), ' open'), h('span', null, h('kbd', null, 'Esc'), ' close')),
    );
    this.#input.addEventListener('input', () => this.#filter());
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.#move(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.#move(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.#run(this.#visible[this.#active]);
      }
    });
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.close();
    });
    this.#dialog.addEventListener('close', () => {
      this.#scope = null;
    });
    document.body.append(this.#dialog);
  }

  async open({ scope = null, query = '' } = {}) {
    if (!this.#dialog) this.#build();
    if (this.#dialog.open) this.close();
    this.#scope = scope;
    this.#items = await this.#collect();
    this.#input.value = query;
    this.#input.placeholder = scope === 'projects' ? 'Open a project or create a new one…' : 'Search modules, projects, commands and glossary…';
    this.#dialog.showModal();
    this.#input.focus();
    this.#filter();
  }

  close() {
    if (this.#dialog?.open) this.#dialog.close();
  }

  async #collect() {
    const { projects, actions } = this.#ctx;
    const items = [];
    if (this.#scope !== 'projects') {
      for (const module of MODULES) {
        items.push({ group: 'Modules', label: module.title, hint: statusLabel(module), icon: module.icon, keywords: module.summary, run: () => this.#ctx.router.navigate(module.id) });
      }
    }
    if (projects) {
      try {
        const list = await projects.listProjects();
        for (const project of list) {
          items.push({
            group: 'Projects',
            label: project.name,
            hint: `${categoryInfo(project.category)?.label ?? project.category} · updated ${formatRelative(project.updatedAt)}`,
            icon: 'folder',
            keywords: project.tags.join(' '),
            run: () => this.#ctx.router.navigate('projects', [project.id]),
          });
        }
      } catch {
        // storage unavailable: no project results
      }
    }
    for (const command of actions.commands()) {
      if (this.#scope === 'projects' && !command.projectScope) continue;
      items.push({ group: 'Commands', ...command });
    }
    if (this.#scope !== 'projects') {
      for (const entry of GLOSSARY) {
        items.push({
          group: 'Glossary',
          label: entry.term,
          hint: entry.definition.length > 90 ? `${entry.definition.slice(0, 88)}…` : entry.definition,
          icon: 'book',
          keywords: entry.aliases?.join(' ') ?? '',
          lowPriority: true,
          run: () => this.#ctx.router.navigate('learning', ['glossary'], { q: entry.term }),
        });
      }
    }
    return items;
  }

  #filter() {
    const query = this.#input.value;
    const scored = this.#items
      .map((item) => {
        const score = Math.max(scoreMatch(item.label, query), scoreMatch(item.keywords ?? '', query) * 0.6, scoreMatch(item.hint ?? '', query) * 0.3);
        return { item, score: item.lowPriority && query ? score * 0.8 : score };
      })
      .filter(({ item, score }) => score > 0 && (query.trim() || !item.lowPriority))
      .sort((a, b) => b.score - a.score);
    let order = ['Projects', 'Commands', 'Modules', 'Glossary'];
    const groups = new Map(order.map((g) => [g, []]));
    const best = new Map(order.map((g) => [g, 0]));
    for (const { item, score } of scored.slice(0, 60)) {
      groups.get(item.group)?.push(item);
      best.set(item.group, Math.max(best.get(item.group) ?? 0, score));
    }
    if (query.trim()) {
      // The group holding the best match comes first, so Enter runs the best match.
      order = [...order].sort((a, b) => best.get(b) - best.get(a));
    } else {
      // Without a query keep the natural order within groups.
      for (const [group, list] of groups) groups.set(group, this.#items.filter((item) => item.group === group && list.includes(item)));
    }
    this.#visible = order.flatMap((g) => groups.get(g));
    this.#active = 0;
    this.#render(groups, order);
  }

  #render(groups, order) {
    const children = [];
    let index = 0;
    for (const group of order) {
      const list = groups.get(group);
      if (!list.length) continue;
      children.push(h('li', { class: 'palette__group', role: 'presentation' }, group));
      for (const item of list) {
        const i = index;
        children.push(
          h(
            'li',
            {
              class: 'palette__item',
              role: 'option',
              id: `palette-option-${i}`,
              'aria-selected': String(i === this.#active),
              onClick: () => this.#run(item),
              onMousemove: () => {
                if (this.#active !== i) {
                  this.#active = i;
                  this.#highlight();
                }
              },
            },
            h('span', { class: 'palette__icon' }, icon(item.icon ?? 'chevronRight', { size: 16 })),
            h('span', { class: 'palette__label' }, item.label),
            item.hint ? h('span', { class: 'palette__hint' }, item.hint) : null,
          ),
        );
        index += 1;
      }
    }
    if (!children.length) children.push(h('li', { class: 'palette__empty', role: 'presentation' }, 'No matches. Try another word.'));
    this.#list.replaceChildren(...children);
    this.#highlight();
  }

  #move(delta) {
    if (!this.#visible.length) return;
    this.#active = (this.#active + delta + this.#visible.length) % this.#visible.length;
    this.#highlight();
  }

  #highlight() {
    for (const option of this.#list.querySelectorAll('[role="option"]')) {
      const selected = option.id === `palette-option-${this.#active}`;
      option.setAttribute('aria-selected', String(selected));
      if (selected) option.scrollIntoView({ block: 'nearest' });
    }
    if (this.#visible.length) this.#input.setAttribute('aria-activedescendant', `palette-option-${this.#active}`);
    else this.#input.removeAttribute('aria-activedescendant');
  }

  #run(item) {
    if (!item) return;
    this.close();
    Promise.resolve()
      .then(() => item.run())
      .catch((error) => this.#ctx.notify({ level: 'error', title: 'Command failed', message: error.message }));
  }
}
