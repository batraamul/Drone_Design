/**
 * Central project state store.
 *
 * - Holds the open project document as an immutable, frozen tree.
 * - Every edit produces a new root; previous roots form the undo history.
 * - Rapid edits to the same field are coalesced into one undo step.
 * - Derived calculations are registered as nodes with explicit dependencies
 *   (document paths or other nodes). A node is recomputed only when one of its
 *   dependencies changed (detected by reference equality), which is how a change
 *   to one parameter propagates to every dependent result.
 */
import { Emitter } from './utils/events.js';
import { deepFreeze, getIn, setIn, toPath } from './utils/immutable.js';

export class Store extends Emitter {
  #doc = null;
  #undo = [];
  #redo = [];
  #lastEdit = null;
  #nodes = new Map();
  #historyLimit;
  #coalesceMs;
  #clock;

  constructor({ historyLimit = 200, coalesceMs = 800, clock = () => Date.now() } = {}) {
    super();
    this.#historyLimit = historyLimit;
    this.#coalesceMs = coalesceMs;
    this.#clock = clock;
  }

  /** Current document (frozen) or null when no project is open. */
  get doc() {
    return this.#doc;
  }

  get hasDocument() {
    return this.#doc !== null;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
  }

  get historySize() {
    return { undo: this.#undo.length, redo: this.#redo.length };
  }

  /** Replace the document (e.g. when a project is opened). Clears undo history. */
  load(doc) {
    this.#doc = doc === null ? null : deepFreeze(structuredClone(doc));
    this.#undo = [];
    this.#redo = [];
    this.#lastEdit = null;
    this.emit('load', { doc: this.#doc });
    this.emit('history', this.historySize);
  }

  unload() {
    this.load(null);
  }

  get(path) {
    return getIn(this.#doc, path);
  }

  /**
   * Set a value at `path`. Options:
   *  - label: human-readable description for the history/console
   *  - coalesce: set false to force a separate undo step
   *  - record: set false for non-undoable bookkeeping updates (e.g. persistence metadata)
   */
  set(path, value, { label, coalesce = true, record = true } = {}) {
    return this.#apply([[toPath(path), value]], { label: label ?? `Edit ${toPath(path).join('.')}`, coalesce, record });
  }

  /** Apply several changes as a single undo step. `fn` receives a `set(path, value)` callback. */
  transact(label, fn, { record = true } = {}) {
    const changes = [];
    fn((path, value) => changes.push([toPath(path), value]));
    return this.#apply(changes, { label, coalesce: false, record });
  }

  #apply(changes, { label, coalesce, record }) {
    if (!this.#doc) throw new Error('No project is open');
    let next = this.#doc;
    for (const [path, value] of changes) {
      next = setIn(next, path, deepFreeze(value));
    }
    if (next === this.#doc) return false;
    deepFreeze(next);

    if (record) {
      const key = changes.length === 1 ? changes[0][0].join('.') : null;
      const now = this.#clock();
      const canCoalesce =
        coalesce &&
        key !== null &&
        this.#lastEdit &&
        this.#lastEdit.key === key &&
        now - this.#lastEdit.time <= this.#coalesceMs &&
        this.#undo.length > 0;
      if (!canCoalesce) {
        this.#undo.push({ doc: this.#doc, label });
        if (this.#undo.length > this.#historyLimit) this.#undo.shift();
      }
      this.#lastEdit = key === null ? null : { key, time: now };
      this.#redo = [];
    }
    const previous = this.#doc;
    this.#doc = next;
    this.emit('change', { doc: next, previous, label, paths: changes.map(([path]) => path), record });
    if (record) this.emit('history', this.historySize);
    return true;
  }

  undo() {
    if (!this.#doc || this.#undo.length === 0) return false;
    const entry = this.#undo.pop();
    this.#redo.push({ doc: this.#doc, label: entry.label });
    const previous = this.#doc;
    this.#doc = entry.doc;
    this.#lastEdit = null;
    this.emit('change', { doc: this.#doc, previous, label: `Undo: ${entry.label}`, paths: null, record: true, undo: true });
    this.emit('history', this.historySize);
    return true;
  }

  redo() {
    if (!this.#doc || this.#redo.length === 0) return false;
    const entry = this.#redo.pop();
    this.#undo.push({ doc: this.#doc, label: entry.label });
    const previous = this.#doc;
    this.#doc = entry.doc;
    this.#lastEdit = null;
    this.emit('change', { doc: this.#doc, previous, label: `Redo: ${entry.label}`, paths: null, record: true, redo: true });
    this.emit('history', this.historySize);
    return true;
  }

  /** Label of the step that undo() would revert, for tooltips. */
  get undoLabel() {
    return this.#undo.at(-1)?.label ?? null;
  }

  get redoLabel() {
    return this.#redo.at(-1)?.label ?? null;
  }

  // ---- Derived calculation graph -------------------------------------------------

  /**
   * Register a derived calculation.
   * @param {string} id unique node id
   * @param {{deps: Array<string|string[]|{node: string}>, compute: (...values) => any, meta?: object}} spec
   *   deps are document paths (string/array) or `{ node: id }` references to other nodes.
   */
  define(id, { deps, compute, meta = {} }) {
    if (this.#nodes.has(id)) throw new Error(`Derived node "${id}" is already defined`);
    if (!Array.isArray(deps) || typeof compute !== 'function') throw new TypeError('define() needs deps[] and compute()');
    this.#nodes.set(id, {
      deps: deps.map((dep) => (dep && typeof dep === 'object' && !Array.isArray(dep) ? dep : toPath(dep))),
      compute,
      meta,
      cache: null,
      evaluations: 0,
      lastEvaluatedAt: null,
      evaluating: false,
    });
  }

  /** Evaluate (or return cached) value of a derived node for the current document. */
  derive(id) {
    const node = this.#nodes.get(id);
    if (!node) throw new Error(`Unknown derived node "${id}"`);
    if (node.evaluating) throw new Error(`Circular dependency detected at derived node "${id}"`);
    node.evaluating = true;
    try {
      const values = node.deps.map((dep) => (Array.isArray(dep) ? getIn(this.#doc, dep) : this.derive(dep.node)));
      if (node.cache && node.cache.values.length === values.length && node.cache.values.every((v, i) => v === values[i])) {
        return node.cache.result;
      }
      const result = node.compute(...values);
      node.cache = { values, result };
      node.evaluations += 1;
      node.lastEvaluatedAt = this.#clock();
      this.emit('derived', { id, result, meta: node.meta });
      return result;
    } finally {
      node.evaluating = false;
    }
  }

  /** Diagnostics for the calculations panel. */
  derivedInfo() {
    return [...this.#nodes.entries()].map(([id, node]) => ({
      id,
      meta: node.meta,
      evaluations: node.evaluations,
      lastEvaluatedAt: node.lastEvaluatedAt,
    }));
  }
}
