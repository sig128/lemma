/**
 * Riemann zeta in double precision for the browser instruments.
 * Re(s) >= 1/2: Borwein's accelerated alternating series for eta(s).
 * Re(s) < 1/2: the functional equation with a Lanczos Gamma.
 * Terms n are chosen from Borwein's error bound so the truncation error is
 * below ~1e-10 in absolute value; the returned `terms` is reported in the UI.
 */
export type C = [number, number];

export function borweinTerms(t: number): number {
  return Math.min(420, Math.ceil(0.9 * Math.abs(t) + 26));
}

export function borweinCoeffs(n: number): Float64Array {
  // e_k = (d_k - d_n) / d_n, with d_k = n * sum_{i<=k} (n+i-1)! 4^i / ((n-i)! (2i)!)
  const t = new Float64Array(n + 1);
  t[0] = 1 / n;
  for (let i = 0; i < n; i++) t[i + 1] = (t[i] * 4 * (n + i) * (n - i)) / ((2 * i + 1) * (2 * i + 2));
  const d = new Float64Array(n + 1);
  let acc = 0;
  for (let k = 0; k <= n; k++) { acc += t[k]; d[k] = n * acc; }
  const e = new Float64Array(n);
  for (let k = 0; k < n; k++) e[k] = (d[k] - d[n]) / d[n];
  return e;
}

const LN2 = Math.LN2;

function etaBorwein(s: number, t: number, e: Float64Array, logs: Float64Array): C {
  let re = 0, im = 0;
  for (let k = 0; k < e.length; k++) {
    const lk = logs[k]; // ln(k+1)
    const mag = Math.exp(-s * lk) * e[k] * (k & 1 ? -1 : 1);
    re += mag * Math.cos(t * lk);
    im -= mag * Math.sin(t * lk);
  }
  return [-re, -im];
}

export function makeZeta(n: number) {
  const e = borweinCoeffs(n);
  const logs = new Float64Array(n);
  for (let k = 0; k < n; k++) logs[k] = Math.log(k + 1);
  const zetaRight = (s: number, t: number): C => {
    const [er, ei] = etaBorwein(s, t, e, logs);
    // divide by 1 - 2^(1-s)
    const m = Math.exp((1 - s) * LN2);
    const dr = 1 - m * Math.cos(-t * LN2);
    const di = -m * Math.sin(-t * LN2);
    const den = dr * dr + di * di;
    return [(er * dr + ei * di) / den, (ei * dr - er * di) / den];
  };
  return (s: number, t: number): C => {
    if (s >= 0.5) return zetaRight(s, t);
    // zeta(s) = 2^s pi^(s-1) sin(pi s / 2) Gamma(1-s) zeta(1-s)
    const z = zetaRight(1 - s, -t);
    const lg = logGamma(1 - s, -t);
    const sinr = Math.sin((Math.PI * s) / 2) * Math.cosh((Math.PI * t) / 2);
    const sini = Math.cos((Math.PI * s) / 2) * Math.sinh((Math.PI * t) / 2);
    const lmag = s * LN2 + (s - 1) * Math.log(Math.PI) + lg[0];
    const ph = t * LN2 + t * Math.log(Math.PI) + lg[1];
    const fr = Math.exp(lmag) * Math.cos(ph), fi = Math.exp(lmag) * Math.sin(ph);
    const ar = fr * sinr - fi * sini, ai = fr * sini + fi * sinr;
    return [ar * z[0] - ai * z[1], ar * z[1] + ai * z[0]];
  };
}

const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
/** log Gamma(x + iy) for x > 0 (Lanczos, g = 7). Returns [Re, Im]. */
export function logGamma(x: number, y: number): C {
  if (x < 0.5) {
    // reflection
    const [lr, li] = logGamma(1 - x, -y);
    const sr = Math.sin(Math.PI * x) * Math.cosh(Math.PI * y), si = Math.cos(Math.PI * x) * Math.sinh(Math.PI * y);
    const lsr = 0.5 * Math.log(sr * sr + si * si), lsi = Math.atan2(si, sr);
    return [Math.log(Math.PI) - lsr - lr, -lsi - li];
  }
  x -= 1;
  let ar = LG[0], ai = 0;
  for (let i = 1; i < 9; i++) {
    const dr = x + i, den = dr * dr + y * y;
    ar += (LG[i] * dr) / den; ai -= (LG[i] * y) / den;
  }
  const tr = x + 7.5, ti = y;
  const lt = 0.5 * Math.log(tr * tr + ti * ti), at = Math.atan2(ti, tr);
  // (z+0.5) log t - t + log sqrt(2 pi) + log a
  const zr = x + 0.5, zi = y;
  const r = zr * lt - zi * at - tr + 0.5 * Math.log(2 * Math.PI) + 0.5 * Math.log(ar * ar + ai * ai);
  const im = zr * at + zi * lt - ti + Math.atan2(ai, ar);
  return [r, im];
}

/** Chebyshev psi(x) and primes by sieve. */
export function sieve(N: number): Uint8Array {
  const comp = new Uint8Array(N + 1);
  comp[0] = comp[1] = 1;
  for (let p = 2; p * p <= N; p++) if (!comp[p]) for (let q = p * p; q <= N; q += p) comp[q] = 1;
  return comp;
}

/** Points where psi jumps, with values (exact up to double rounding of the log sum). */
export function psiSteps(N: number): { x: number; y: number }[] {
  const comp = sieve(N);
  const out: { x: number; y: number }[] = [{ x: 1, y: 0 }];
  let psi = 0;
  for (let n = 2; n <= N; n++) {
    if (comp[n]) {
      // prime power?
      let m = n, p = 0;
      for (let q = 2; q * q <= m; q++) if (m % q === 0) { p = q; while (m % q === 0) m /= q; break; }
      if (p && m === 1 && !comp[p]) { psi += Math.log(p); out.push({ x: n, y: psi }); }
    } else { psi += Math.log(n); out.push({ x: n, y: psi }); }
  }
  return out;
}

/** Truncated explicit formula psi_0(x) ~ x - sum_{|gamma|<=gamma_K} 2 Re(x^rho / rho) - log(2 pi) - 1/2 log(1 - x^-2). */
export function psiExplicit(x: number, gammas: number[]): number {
  const lx = Math.log(x);
  let s = 0;
  const sq = Math.sqrt(x);
  for (const g of gammas) {
    // x^rho / rho with rho = 1/2 + i g
    const cr = sq * Math.cos(g * lx), ci = sq * Math.sin(g * lx);
    const den = 0.25 + g * g;
    s += 2 * ((cr * 0.5 + ci * g) / den);
  }
  return x - s - Math.log(2 * Math.PI) - 0.5 * Math.log(1 - 1 / (x * x));
}
