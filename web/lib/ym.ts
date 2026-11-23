/**
 * Two-dimensional U(1) lattice gauge theory with the Wilson action
 *   S = beta * sum_p (1 - cos theta_p)
 * on an L x L periodic lattice. Exact results by character expansion:
 *   Z = sum_n I_n(beta)^V,  <cos theta_p> = sum_n I_n^(V-1) (I_(n-1)+I_(n+1))/2 / Z,
 *   <W(A)> = sum_n I_n^(V-A) I_(n+1)^A / Z  (contractible loop of area A),
 * which tend to I_1/I_0 and (I_1/I_0)^A in infinite volume.
 * Scope: a toy model. It says nothing about four-dimensional SU(N) in the continuum.
 */
export function besselI(n: number, x: number): number {
  n = Math.abs(n);
  let term = Math.pow(x / 2, n);
  for (let k = 1; k <= n; k++) term /= k;
  let sum = term;
  for (let k = 1; k < 400; k++) {
    term *= (x / 2) ** 2 / (k * (k + n));
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

export function exactPlaquette(beta: number, V: number): number {
  const I0 = besselI(0, beta);
  const r = (n: number) => besselI(n, beta) / I0;
  let num = 0, den = 0;
  for (let n = -40; n <= 40; n++) {
    const rn = r(n);
    if (rn === 0) continue;
    const base = Math.pow(rn, V - 1);
    num += (base * (r(n - 1) + r(n + 1))) / 2;
    den += base * rn;
  }
  return num / den;
}

export function exactWilson(beta: number, V: number, A: number): number {
  const I0 = besselI(0, beta);
  const r = (n: number) => besselI(n, beta) / I0;
  let num = 0, den = 0;
  for (let n = -40; n <= 40; n++) {
    const rn = r(n);
    if (rn === 0) continue;
    num += Math.pow(rn, V - A) * Math.pow(r(n + 1), A);
    den += Math.pow(rn, V);
  }
  return num / den;
}

export class U1Lattice {
  L: number; beta: number; theta: Float64Array; delta = 1.2; accepted = 0; proposed = 0; sweeps = 0;
  private rnd: () => number;
  constructor(L: number, beta: number, seed = 1) {
    this.L = L; this.beta = beta; this.theta = new Float64Array(2 * L * L);
    let a = seed >>> 0;
    this.rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  link(x: number, y: number, mu: number) { const L = this.L; return 2 * (((y + L) % L) * L + ((x + L) % L)) + mu; }
  plaq(x: number, y: number) {
    const t = this.theta;
    return t[this.link(x, y, 0)] + t[this.link(x + 1, y, 1)] - t[this.link(x, y + 1, 0)] - t[this.link(x, y, 1)];
  }
  sweep() {
    const L = this.L, b = this.beta, t = this.theta;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) for (let mu = 0; mu < 2; mu++) {
      const i = this.link(x, y, mu);
      // plaquettes containing this link: for mu=0: p(x,y) [+] and p(x,y-1) [-]; for mu=1: p(x,y) [-] and p(x-1,y) [+]
      const pa = mu === 0 ? [x, y, 1] : [x, y, -1];
      const pb = mu === 0 ? [x, y - 1, -1] : [x - 1, y, 1];
      const old = t[i];
      const before = Math.cos(this.plaq(pa[0], pa[1])) + Math.cos(this.plaq(pb[0], pb[1]));
      const prop = old + this.delta * (2 * this.rnd() - 1);
      t[i] = prop;
      const after = Math.cos(this.plaq(pa[0], pa[1])) + Math.cos(this.plaq(pb[0], pb[1]));
      const dS = -b * (after - before);
      this.proposed++;
      if (dS <= 0 || this.rnd() < Math.exp(-dS)) { this.accepted++; t[i] = Math.atan2(Math.sin(prop), Math.cos(prop)); }
      else t[i] = old;
    }
    this.sweeps++;
    const acc = this.accepted / Math.max(1, this.proposed);
    if (this.sweeps < 200 && this.sweeps % 10 === 0) { this.delta *= acc > 0.5 ? 1.1 : 0.9; this.accepted = 0; this.proposed = 0; }
  }
  meanPlaquette() {
    let s = 0;
    for (let y = 0; y < this.L; y++) for (let x = 0; x < this.L; x++) s += Math.cos(this.plaq(x, y));
    return s / (this.L * this.L);
  }
  /** Re W(R,T) averaged over positions: product of plaquettes inside equals the boundary holonomy. */
  wilson(R: number, T: number) {
    const L = this.L;
    let s = 0;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      let ang = 0;
      for (let i = 0; i < R; i++) ang += this.theta[this.link(x + i, y, 0)] - this.theta[this.link(x + i, y + T, 0)];
      for (let j = 0; j < T; j++) ang += this.theta[this.link(x + R, y + j, 1)] - this.theta[this.link(x, y + j, 1)];
      s += Math.cos(ang);
    }
    return s / (L * L);
  }
}

export type BlockingResult = {
  mean: number; err: number; bin: number; bins: number; tau: number; plateau: boolean;
  levels: { bin: number; bins: number; err: number; dErr: number }[];
};

/**
 * Blocking analysis (Flyvbjerg and Petersen, J. Chem. Phys. 91, 461 (1989)).
 * Bin sizes double while at least `minBins` bins remain. The chosen level is the first one whose
 * error estimate agrees with the next level's within the estimate's own uncertainty
 * err / sqrt(2(n-1)); the reported error is the larger of the two. Without a plateau the largest
 * estimate is returned with plateau = false and should be read as a lower bound.
 * tau is the integrated autocorrelation time in measurement units, 0.5 (err_b / err_1)^2.
 */
export function blocking(xs: number[], minBins = 16): BlockingResult {
  const N = xs.length;
  const mean = N ? xs.reduce((a, b) => a + b, 0) / N : NaN;
  const levels: BlockingResult["levels"] = [];
  for (let b = 1; Math.floor(N / b) >= minBins; b *= 2) {
    const n = Math.floor(N / b);
    const ms = new Float64Array(n);
    let m = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < b; j++) s += xs[i * b + j]; ms[i] = s / b; m += ms[i]; }
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (ms[i] - m) ** 2;
    const err = Math.sqrt(v / (n - 1) / n);
    levels.push({ bin: b, bins: n, err, dErr: err / Math.sqrt(2 * (n - 1)) });
  }
  if (levels.length < 2) return { mean, err: NaN, bin: 0, bins: 0, tau: NaN, plateau: false, levels };
  let pick = -1;
  for (let k = 0; k + 1 < levels.length; k++) {
    if (levels[k + 1].err - levels[k].err <= levels[k + 1].dErr) { pick = k; break; }
  }
  const e1 = levels[0].err;
  if (pick < 0) {
    const last = levels[levels.length - 1];
    const maxErr = Math.max(...levels.map((l) => l.err));
    return { mean, err: maxErr, bin: last.bin, bins: last.bins, tau: e1 > 0 ? 0.5 * (maxErr / e1) ** 2 : NaN, plateau: false, levels };
  }
  const err = Math.max(levels[pick].err, levels[pick + 1].err);
  return { mean, err, bin: levels[pick].bin, bins: levels[pick].bins, tau: e1 > 0 ? 0.5 * (err / e1) ** 2 : NaN, plateau: true, levels };
}

/** Mean and binned standard error with a fixed bin size (kept for tests and comparison). */
export function binned(xs: number[], bin = 20) {
  const n = Math.floor(xs.length / bin);
  if (n < 2) return { mean: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length), err: NaN, bins: n };
  const means = Array.from({ length: n }, (_, i) => xs.slice(i * bin, (i + 1) * bin).reduce((a, b) => a + b, 0) / bin);
  const m = means.reduce((a, b) => a + b, 0) / n;
  const v = means.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return { mean: m, err: Math.sqrt(v / n), bins: n };
}
