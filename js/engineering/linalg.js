/**
 * Small dense linear algebra for the flight-dynamics models: matrix products, the
 * characteristic polynomial (Faddeev–LeVerrier), polynomial roots (Durand–Kerner) and
 * eigenvalues of small real matrices. Complex numbers are { re, im }.
 */

export const matMul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
export const matVec = (A, x) => A.map((row) => row.reduce((s, a, k) => s + a * x[k], 0));
export const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const transpose = (A) => A[0].map((_, j) => A.map((row) => row[j]));

/** Solve A x = b by Gaussian elimination with partial pivoting. */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k += 1) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Coefficients [1, c1, …, cn] of det(λI − A) (Faddeev–LeVerrier). */
export function charPoly(A) {
  const n = A.length;
  const c = [1];
  let M = identity(n).map((row) => row.map(() => 0));
  for (let k = 1; k <= n; k += 1) {
    const AM = matMul(A, M);
    M = AM.map((row, i) => row.map((v, j) => v + (i === j ? c[k - 1] : 0)));
    const AMk = matMul(A, M);
    let tr = 0;
    for (let i = 0; i < n; i += 1) tr += AMk[i][i];
    c.push(-tr / k);
  }
  return c;
}

const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const csub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cdiv = (a, b) => {
  const d = b.re * b.re + b.im * b.im || 1e-300;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/** All roots of a monic polynomial [1, c1, …, cn] (Durand–Kerner). */
export function polyRoots(coeffs) {
  const n = coeffs.length - 1;
  if (n < 1) return [];
  const scale = Math.max(1, ...coeffs.slice(1).map((c, k) => Math.abs(c) ** (1 / (k + 1))));
  let z = Array.from({ length: n }, (_, k) => ({ re: scale * 0.9 * Math.cos((2 * Math.PI * k) / n + 0.4), im: scale * 0.9 * Math.sin((2 * Math.PI * k) / n + 0.4) }));
  const evalP = (x) => coeffs.reduce((acc, c) => ({ re: acc.re * x.re - acc.im * x.im + c, im: acc.re * x.im + acc.im * x.re }), { re: 0, im: 0 });
  for (let it = 0; it < 500; it += 1) {
    let delta = 0;
    z = z.map((zi, i) => {
      let den = { re: 1, im: 0 };
      z.forEach((zj, j) => {
        if (j !== i) den = cmul(den, csub(zi, zj));
      });
      const step = cdiv(evalP(zi), den);
      delta = Math.max(delta, Math.hypot(step.re, step.im));
      return csub(zi, step);
    });
    if (delta < 1e-13 * scale) break;
  }
  return z.map((r) => ({ re: r.re, im: Math.abs(r.im) < 1e-9 * Math.max(1, Math.abs(r.re)) ? 0 : r.im }));
}

export const eigenvalues = (A) => polyRoots(charPoly(A));

/** Natural frequency, damping ratio, period and time to half/double amplitude of an eigenvalue. */
export function modeOf(l) {
  const wn = Math.hypot(l.re, l.im);
  const zeta = wn > 0 ? -l.re / wn : 1;
  return {
    eigenvalue: l,
    oscillatory: Math.abs(l.im) > 1e-9,
    wn,
    zeta,
    period: Math.abs(l.im) > 1e-9 ? (2 * Math.PI) / Math.abs(l.im) : null,
    timeConstant: Math.abs(l.re) > 1e-12 ? 1 / Math.abs(l.re) : Infinity,
    stable: l.re < 0,
    halfOrDouble: Math.abs(l.re) > 1e-12 ? Math.LN2 / Math.abs(l.re) : Infinity,
  };
}

/** RK4 simulation of ẋ = f(t, x) from t0 to t1 with step dt; records every `every` steps. */
export function rk4(f, x0, { t0 = 0, t1, dt, every = 1, onStep = null }) {
  const out = [{ t: t0, x: x0 }];
  let x = x0;
  let t = t0;
  const steps = Math.round((t1 - t0) / dt);
  const add = (a, b, k) => a.map((v, i) => v + k * b[i]);
  for (let i = 1; i <= steps; i += 1) {
    const k1 = f(t, x);
    const k2 = f(t + dt / 2, add(x, k1, dt / 2));
    const k3 = f(t + dt / 2, add(x, k2, dt / 2));
    const k4 = f(t + dt, add(x, k3, dt));
    x = x.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    t = t0 + i * dt;
    if (onStep) x = onStep(t, x) ?? x;
    if (i % every === 0) out.push({ t, x });
    if (!x.every(Number.isFinite)) break;
  }
  return out;
}
