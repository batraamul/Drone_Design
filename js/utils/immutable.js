/**
 * Immutable data helpers. The project model is treated as immutable: every edit
 * produces a new root object that shares unchanged branches with the previous one.
 * This makes undo/redo cheap and lets derived calculations detect changes by
 * reference equality.
 */

/** Normalise "a.b.0.c" or ['a','b',0,'c'] into an array path. */
export function toPath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== 'string' || path === '') return [];
  return path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function getIn(object, path) {
  let node = object;
  for (const key of toPath(path)) {
    if (node == null) return undefined;
    node = node[key];
  }
  return node;
}

/** Return a copy of `object` with the value at `path` replaced. Intermediate containers are created as needed. */
export function setIn(object, path, value) {
  const keys = toPath(path);
  if (keys.length === 0) return value;
  const [head, ...rest] = keys;
  const base = object ?? (typeof head === 'number' ? [] : {});
  const current = base[head];
  const next = rest.length === 0 ? value : setIn(current, rest, value);
  if (Object.is(current, next) && head in Object(base)) return base;
  if (Array.isArray(base)) {
    const copy = base.slice();
    copy[head] = next;
    return copy;
  }
  return { ...base, [head]: next };
}

/** Return a copy of `object` with the key at `path` removed. */
export function deleteIn(object, path) {
  const keys = toPath(path);
  if (keys.length === 0 || object == null) return object;
  const [head, ...rest] = keys;
  if (!(head in Object(object))) return object;
  if (rest.length === 0) {
    if (Array.isArray(object)) return object.filter((_, index) => index !== head);
    const { [head]: _removed, ...remaining } = object;
    return remaining;
  }
  const child = deleteIn(object[head], rest);
  if (child === object[head]) return object;
  return Array.isArray(object)
    ? Object.assign(object.slice(), { [head]: child })
    : { ...object, [head]: child };
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

export function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
