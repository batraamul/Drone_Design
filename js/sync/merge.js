/**
 * Three-way merge of AEROLAB X data from several devices (pure functions, no DOM).
 *
 * A snapshot is { projects: [], versions: [], learning: [], gone: { projectId: deletedAtIso } }.
 * `base` is what both sides last had in common (the other device's copy merged here last),
 * `local` is this device, `remote` the other device. Rules, applied field by field and
 * note by note:
 *   - changed on one side only        → that side wins
 *   - changed on both sides           → the more recently edited side wins
 *   - deleted on one side, unchanged on the other → deleted
 *   - deleted on one side, edited on the other    → the edit is kept (nothing is lost)
 *   - present on one side only with no common base → kept (an addition)
 * Permanently deleted projects leave a marker in `gone`, so they are never brought back.
 * The per-device `revision` counter is never merged; each device keeps its own.
 */

export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => same(a[k], b[k]));
}

/** Pick one value from base/local/remote. `preferLocal` breaks true conflicts. */
export function pick(b, l, r, preferLocal) {
  if (same(l, r)) return l;
  if (b === undefined) {
    if (l === undefined) return r;
    if (r === undefined) return l;
    return preferLocal ? l : r;
  }
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  if (l === undefined) return r; // edit beats delete
  if (r === undefined) return l;
  return preferLocal ? l : r;
}

const time = (x) => Date.parse(x?.updatedAt ?? '') || 0;

function mergeMap(b, l, r, preferLocal) {
  b = b ?? {};
  l = l ?? {};
  r = r ?? {};
  const out = {};
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const v = pick(b[key], l[key], r[key], preferLocal);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function mergeNotes(b, l, r) {
  const B = new Map((b ?? []).map((n) => [n.id, n]));
  const L = new Map((l ?? []).map((n) => [n.id, n]));
  const R = new Map((r ?? []).map((n) => [n.id, n]));
  const order = [...L.keys(), ...[...R.keys()].filter((id) => !L.has(id))];
  const out = [];
  for (const id of order) {
    const v = pick(B.get(id), L.get(id), R.get(id), time(L.get(id)) >= time(R.get(id)));
    if (v !== undefined) out.push(v);
  }
  return out;
}

const SPECIAL = new Set(['notes', 'requirements', 'modules', 'revision', 'updatedAt']);

/** Merge one project document. */
export function mergeProject(b, l, r) {
  if (!l) return r;
  if (!r) return l;
  const preferLocal = time(l) >= time(r);
  const out = {};
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (SPECIAL.has(key)) continue;
    const v = pick(b?.[key], l[key], r[key], preferLocal);
    if (v !== undefined) out[key] = v;
  }
  out.requirements = mergeMap(b?.requirements, l.requirements, r.requirements, preferLocal);
  out.modules = mergeMap(b?.modules, l.modules, r.modules, preferLocal);
  out.notes = mergeNotes(b?.notes, l.notes, r.notes);
  out.updatedAt = preferLocal ? l.updatedAt : r.updatedAt;
  out.revision = l.revision;
  return out;
}

function byId(list) {
  return new Map((Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x]));
}

function mergeLearning(l, r) {
  const L = byId(l);
  const R = byId(r);
  const out = [];
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const a = L.get(id);
    const c = R.get(id);
    if (!a || !c) {
      out.push(a ?? c);
      continue;
    }
    const later = String(a.lastAttemptAt ?? '') >= String(c.lastAttemptAt ?? '') ? a : c;
    const done = [a.completedAt, c.completedAt].filter(Boolean).sort()[0] ?? null;
    out.push({ ...later, attempts: Math.max(a.attempts ?? 0, c.attempts ?? 0), completedAt: done });
  }
  return out;
}

/** Merge two whole snapshots with an optional common base. */
export function mergeSnapshots(base, local, remote) {
  base = base ?? {};
  local = local ?? {};
  remote = remote ?? {};
  const gone = { ...(base.gone ?? {}), ...(remote.gone ?? {}), ...(local.gone ?? {}) };
  const B = byId(base.projects);
  const L = byId(local.projects);
  const R = byId(remote.projects);
  const projects = [];
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    if (gone[id]) continue;
    const merged = mergeProject(B.get(id), L.get(id), R.get(id));
    if (merged) projects.push(merged);
  }
  const versions = [...new Map([...byId(remote.versions), ...byId(local.versions)]).values()].filter((v) => !gone[v.projectId]);
  return { projects, versions, learning: mergeLearning(local.learning, remote.learning), gone };
}

/** Content of a project ignoring the per-device revision counter (for change detection). */
export function projectContent(doc) {
  if (!doc) return doc;
  const { revision: _revision, ...rest } = doc;
  return rest;
}

/** Short, stable fingerprint of a snapshot (to know whether this device's copy needs uploading). */
export function fingerprint(snapshot) {
  const text = JSON.stringify({
    p: [...(snapshot.projects ?? [])].map(projectContent).sort((a, b) => a.id.localeCompare(b.id)),
    v: [...(snapshot.versions ?? [])].map((v) => v.id).sort(),
    l: [...(snapshot.learning ?? [])].sort((a, b) => a.id.localeCompare(b.id)),
    g: Object.keys(snapshot.gone ?? {}).sort(),
  });
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `${text.length.toString(36)}-${h1.toString(36)}-${h2.toString(36)}`;
}
