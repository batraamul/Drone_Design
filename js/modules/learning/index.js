/**
 * Learning Centre view: lesson index, lesson pages and the searchable glossary.
 */
import { h } from '../../utils/dom.js';
import { icon } from '../../ui/icons.js';
import { badge, button, card, emptyState, pageHeader } from '../../ui/components.js';
import { STORES } from '../../database.js';
import { LESSONS, LEARNING_PATHS, getLesson } from './lessons.js';
import { GLOSSARY } from './glossary.js';
import { WIDGETS } from './widgets.js';
import { formatDateTime } from '../../utils/format.js';

async function loadProgress(db) {
  if (!db) return new Map();
  try {
    const records = await db.getAll(STORES.learning);
    return new Map(records.map((record) => [record.id, record]));
  } catch {
    return new Map();
  }
}

function lessonCard(lesson, progress, ctx) {
  const record = progress.get(lesson.id);
  return h(
    'article',
    { class: 'lesson-card' },
    h('div', { class: 'lesson-card__icon' }, icon(lesson.icon, { size: 22 })),
    h(
      'div',
      { class: 'lesson-card__body' },
      h('h3', { class: 'lesson-card__title' }, h('a', { href: `#/learning/${lesson.id}` }, lesson.title)),
      h('p', { class: 'lesson-card__summary' }, lesson.summary),
      h(
        'p',
        { class: 'lesson-card__meta' },
        badge(lesson.level, 'info'),
        h('span', null, `${lesson.minutes} min`),
        record?.completedAt ? badge('Completed', 'success', { title: `Knowledge check passed ${formatDateTime(record.completedAt)}` }) : null,
      ),
    ),
    button({ label: record?.completedAt ? 'Review' : 'Start', size: 'sm', variant: record?.completedAt ? undefined : 'primary', onClick: () => ctx.router.navigate('learning', [lesson.id]) }),
  );
}

async function renderIndex(container, ctx) {
  const progress = await loadProgress(ctx.db);
  const completed = LESSONS.filter((lesson) => progress.get(lesson.id)?.completedAt).length;
  container.replaceChildren(
    pageHeader({
      title: 'Learning Centre',
      icon: 'book',
      subtitle: 'Engineering theory behind each AEROLAB X model, with worked examples, calculators and knowledge checks. New lessons arrive with each build.',
      badges: [badge('Partial', 'warning', { title: 'Build 1 includes the engineering-foundations lessons and the glossary.' })],
    }),
    h(
      'div',
      { class: 'page-grid' },
      card({
        title: 'Engineering foundations',
        icon: 'layers',
        description: `${completed} of ${LESSONS.length} lessons completed`,
        class: 'span-2',
        body: h('div', { class: 'lesson-list' }, LESSONS.map((lesson) => lessonCard(lesson, progress, ctx))),
      }),
      card({
        title: 'Technical glossary',
        icon: 'book',
        description: `${GLOSSARY.length} terms, searchable here and from Ctrl+K`,
        body: [
          h('ul', { class: 'term-preview' }, GLOSSARY.slice(0, 6).map((entry) => h('li', null, h('a', { href: `#/learning/glossary?q=${encodeURIComponent(entry.term)}` }, entry.term)))),
          button({ label: 'Open glossary', icon: 'search', size: 'sm', onClick: () => ctx.router.navigate('learning', ['glossary']) }),
        ],
      }),
      card({
        title: 'Learning paths',
        icon: 'roadmap',
        description: 'Paths fill in as the matching modules are built.',
        body: h(
          'ul',
          { class: 'path-list' },
          LEARNING_PATHS.map((path) =>
            h('li', { class: 'path-list__item' }, h('span', null, path.title), path.status === 'available' ? badge('Available', 'success') : badge(`Build ${path.build}`, 'neutral', { title: `Planned with Build ${path.build}; not available yet` })),
          ),
        ),
      }),
    ),
  );
}

function renderQuiz(lesson, ctx, record) {
  const answers = new Array(lesson.quiz.length).fill(null);
  const result = h('div', { class: 'quiz__result', 'aria-live': 'polite' });
  const form = h(
    'form',
    { class: 'quiz', novalidate: true },
    lesson.quiz.map((question, qi) =>
      h(
        'fieldset',
        { class: 'quiz__question' },
        h('legend', null, `${qi + 1}. ${question.question}`),
        question.options.map((option, oi) => {
          const id = `quiz-${lesson.id}-${qi}-${oi}`;
          return h(
            'label',
            { class: 'quiz__option', for: id },
            h('input', { type: 'radio', name: `q${qi}`, id, value: String(oi), onChange: () => (answers[qi] = oi) }),
            h('span', null, option),
          );
        }),
        h('p', { class: 'quiz__feedback', hidden: true, dataset: { feedback: qi } }),
      ),
    ),
    h('div', { class: 'quiz__actions' }, button({ label: 'Check answers', type: 'submit', variant: 'primary' }), record?.completedAt ? h('span', { class: 'muted' }, `Passed ${formatDateTime(record.completedAt)}`) : null),
    result,
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    let correct = 0;
    lesson.quiz.forEach((question, qi) => {
      const feedback = form.querySelector(`[data-feedback="${qi}"]`);
      const ok = answers[qi] === question.answer;
      if (ok) correct += 1;
      feedback.hidden = false;
      feedback.className = `quiz__feedback quiz__feedback--${ok ? 'correct' : 'incorrect'}`;
      feedback.textContent = answers[qi] === null ? `Not answered. ${question.explanation}` : `${ok ? 'Correct.' : `Not quite — the answer is “${question.options[question.answer]}”.`} ${question.explanation}`;
    });
    const passed = correct === lesson.quiz.length;
    result.replaceChildren(h('p', { class: passed ? 'quiz__score quiz__score--pass' : 'quiz__score' }, `${correct} of ${lesson.quiz.length} correct.${passed ? ' Lesson completed.' : ' Review the explanations and try again.'}`));
    if (ctx.db) {
      const now = new Date().toISOString();
      const previous = (await ctx.db.get(STORES.learning, lesson.id).catch(() => undefined)) ?? { id: lesson.id, attempts: 0 };
      await ctx.db
        .put(STORES.learning, { ...previous, attempts: (previous.attempts ?? 0) + 1, lastScore: correct, lastAttemptAt: now, completedAt: previous.completedAt ?? (passed ? now : null) })
        .catch(() => {});
      if (passed && !previous.completedAt) ctx.log.info('learning', `Completed lesson "${lesson.title}"`);
    }
  });
  return form;
}

async function renderLesson(container, ctx, lesson) {
  const progress = await loadProgress(ctx.db);
  const example = lesson.example();
  const widget = WIDGETS[lesson.calculator];
  const section = (id, title, iconName, ...content) => h('section', { class: 'lesson__section', 'aria-labelledby': `${lesson.id}-${id}` }, h('h2', { id: `${lesson.id}-${id}` }, icon(iconName, { size: 18 }), h('span', null, title)), ...content);
  const index = LESSONS.indexOf(lesson);
  const next = LESSONS[index + 1];
  container.replaceChildren(
    pageHeader({
      title: lesson.title,
      icon: lesson.icon,
      subtitle: lesson.summary,
      badges: [badge(lesson.level, 'info'), badge(`${lesson.minutes} min`, 'neutral')],
      actions: [button({ label: 'All lessons', icon: 'chevronLeft', size: 'sm', onClick: () => ctx.router.navigate('learning') })],
    }),
    h(
      'article',
      { class: 'lesson' },
      section('beginner', 'In plain terms', 'info', ...lesson.beginner.map((p) => h('p', null, p))),
      section('theory', 'Engineering theory', 'book', ...lesson.theory.map((p) => h('p', null, p))),
      section(
        'equations',
        'Equations',
        'lightning',
        h('ol', { class: 'equation-list' }, lesson.equations.map((eq) => h('li', null, h('code', { class: 'equation' }, eq.expression), h('span', { class: 'equation-list__note' }, eq.note)))),
        h(
          'table',
          { class: 'table table--compact' },
          h('caption', null, 'Variables and SI units'),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Symbol'), h('th', { scope: 'col' }, 'Meaning'), h('th', { scope: 'col' }, 'Unit / value'))),
          h('tbody', null, lesson.variables.map((v) => h('tr', null, h('td', { class: 'mono' }, v.symbol), h('td', null, v.meaning), h('td', { class: 'mono' }, v.unit)))),
        ),
      ),
      section('example', `Worked example — ${example.title}`, 'checkCircle', h('ol', { class: 'steps' }, example.steps.map((step) => h('li', null, step)))),
      widget ? section('calculator', 'Interactive calculator', 'sliders', widget()) : null,
      section('practical', 'Practical considerations', 'tag', h('ul', null, lesson.practical.map((item) => h('li', null, item)))),
      section('mistakes', 'Common mistakes', 'warning', h('ul', null, lesson.mistakes.map((item) => h('li', null, item)))),
      section('quiz', 'Knowledge check', 'checkCircle', renderQuiz(lesson, ctx, progress.get(lesson.id))),
      section('references', 'References', 'report', h('ul', { class: 'references' }, lesson.references.map((ref) => h('li', null, ref)))),
      next ? h('nav', { class: 'lesson__next', 'aria-label': 'Next lesson' }, button({ label: `Next: ${next.title}`, icon: 'chevronRight', onClick: () => ctx.router.navigate('learning', [next.id]) })) : null,
    ),
  );
}

function renderGlossary(container, ctx, route) {
  const query = route.params.q ?? '';
  const input = h('input', { class: 'input', type: 'search', id: 'glossary-search', value: query, placeholder: 'Search terms and definitions…', autocomplete: 'off' });
  const list = h('dl', { class: 'glossary' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  const update = () => {
    const q = input.value.trim().toLowerCase();
    const matches = GLOSSARY.filter((entry) => !q || entry.term.toLowerCase().includes(q) || entry.definition.toLowerCase().includes(q) || entry.aliases?.some((a) => a.toLowerCase().includes(q)));
    count.textContent = `${matches.length} of ${GLOSSARY.length} terms`;
    list.replaceChildren(...matches.map((entry) => h('div', { class: 'glossary__entry' }, h('dt', null, entry.term), h('dd', null, entry.definition))));
    if (!matches.length) list.replaceChildren(emptyState({ icon: 'search', title: 'No matching terms', message: 'Try a shorter word or an abbreviation.' }));
  };
  input.addEventListener('input', update);
  container.replaceChildren(
    pageHeader({ title: 'Technical glossary', icon: 'book', subtitle: 'Definitions with SI units. The glossary grows with every build.', actions: [button({ label: 'All lessons', icon: 'chevronLeft', size: 'sm', onClick: () => ctx.router.navigate('learning') })] }),
    h('div', { class: 'card' }, h('div', { class: 'card__body' }, h('label', { class: 'field', for: 'glossary-search' }, h('span', { class: 'field__label' }, 'Search'), input), count, list)),
  );
  update();
  if (query) input.focus();
}

export async function mount(container, ctx, route) {
  const [sub] = route.segments;
  if (!sub) return renderIndex(container, ctx);
  if (sub === 'glossary') return renderGlossary(container, ctx, route);
  const lesson = getLesson(sub);
  if (!lesson) {
    container.replaceChildren(emptyState({ icon: 'book', title: 'Lesson not found', message: 'This lesson does not exist (yet).', actions: [button({ label: 'All lessons', onClick: () => ctx.router.navigate('learning') })] }));
    return null;
  }
  return renderLesson(container, ctx, lesson);
}
