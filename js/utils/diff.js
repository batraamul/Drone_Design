/**
 * Structural diff used to compare project versions.
 * Arrays of objects that carry an `id` are matched by id (so re-ordering notes
 * is not reported as a change of every element); other arrays are compared by index.
 */
import { deepEqual, isPlainObject } from './immutable.js';

const IGNORED_ROOT_KEYS = new Set(['revision', 'updatedAt', 'appVersion']);

function isIdArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isPlainObject(item) && 'id' in item);
}

function walk(before, after, path, changes) {
  if (deepEqual(before, after)) return;

  if (isIdArray(before) || isIdArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    const byIdA = new Map(a.map((item) => [item.id, item]));
    const byIdB = new Map(b.map((item) => [item.id, item]));
    for (const [id, item] of byIdA) {
      if (!byIdB.has(id)) changes.push({ path: [...path, `[${id}]`], type: 'removed', before: item, after: undefined });
      else walk(item, byIdB.get(id), [...path, `[${id}]`], changes);
    }
    for (const [id, item] of byIdB) {
      if (!byIdA.has(id)) changes.push({ path: [...path, `[${id}]`], type: 'added', before: undefined, after: item });
    }
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (path.length === 0 && IGNORED_ROOT_KEYS.has(key)) continue;
      walk(before[key], after[key], [...path, key], changes);
    }
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length);
    for (let i = 0; i < length; i += 1) walk(before[i], after[i], [...path, i], changes);
    return;
  }

  let type = 'changed';
  if (before === undefined) type = 'added';
  else if (after === undefined) type = 'removed';
  changes.push({ path, type, before, after });
}

/**
 * @returns {{path: Array<string|number>, type: 'added'|'removed'|'changed', before: unknown, after: unknown}[]}
 */
export function diff(before, after) {
  const changes = [];
  walk(before, after, [], changes);
  return changes;
}

export function formatPath(path) {
  return path
    .map((part, index) => {
      if (typeof part === 'number') return `[${part}]`;
      if (String(part).startsWith('[')) return part;
      return index === 0 ? part : `.${part}`;
    })
    .join('');
}
