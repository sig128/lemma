/**
 * 2D incompressible Navier-Stokes on the torus [0, 2pi)^2 in vorticity form:
 *   d(omega)/dt + u . grad(omega) = nu * laplace(omega),  u = (psi_y, -psi_x),  laplace(psi) = -omega.
 * Pseudo-spectral in space (2/3 dealiasing), classical RK4 in time.
 * Educational scope: two dimensions have global smooth solutions; this
 * solver says nothing about the three-dimensional problem.
 */
export function fft1(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

export function fft2(re: Float64Array, im: Float64Array, N: number, inverse: boolean) {
  const r = new Float64Array(N), c = new Float64Array(N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) { r[x] = re[y * N + x]; c[x] = im[y * N + x]; }
    fft1(r, c, inverse);
    for (let x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = c[x]; }
  }
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; c[y] = im[y * N + x]; }
    fft1(r, c, inverse);
    for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = c[y]; }
  }
}

export type IC = "tg" | "shear" | "turb";

export class NS2D {
  N: number; nu: number; t = 0; steps = 0;
  wr: Float64Array; wi: Float64Array; // omega-hat
  kx: Float64Array; ky: Float64Array; k2: Float64Array; mask: Uint8Array;
  private buf: Float64Array[];
  constructor(N: number, nu: number) {
    this.N = N; this.nu = nu;
    const M = N * N;
    this.wr = new Float64Array(M); this.wi = new Float64Array(M);
    this.kx = new Float64Array(M); this.ky = new Float64Array(M); this.k2 = new Float64Array(M); this.mask = new Uint8Array(M);
    const kc = Math.floor(N / 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const kxv = i <= N / 2 ? i : i - N, kyv = j <= N / 2 ? j : j - N;
      const p = j * N + i;
      this.kx[p] = kxv; this.ky[p] = kyv; this.k2[p] = kxv * kxv + kyv * kyv;
      this.mask[p] = Math.abs(kxv) <= kc && Math.abs(kyv) <= kc ? 1 : 0;
    }
    this.buf = Array.from({ length: 12 }, () => new Float64Array(M));
  }

  setPhysical(omega: Float64Array) {
    this.wr.set(omega); this.wi.fill(0);
    fft2(this.wr, this.wi, this.N, false);
    for (let p = 0; p < this.wr.length; p++) if (!this.mask[p]) { this.wr[p] = 0; this.wi[p] = 0; }
  }

  init(ic: IC, seed = 1) {
    const N = this.N, h = (2 * Math.PI) / N;
    const w = new Float64Array(N * N);
    if (ic === "tg") {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) w[j * N + i] = 2 * Math.sin(i * h) * Math.sin(j * h);
    } else if (ic === "shear") {
      const d = Math.PI / 15, eps = 0.05;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i * h, y = j * h;
        // u = tanh((y - pi/2)/d) (y <= pi), tanh((3pi/2 - y)/d) (y > pi); v = eps sin x. omega = v_x - u_y
        const uy = y <= Math.PI ? (1 / d) / Math.cosh((y - Math.PI / 2) / d) ** 2 : -(1 / d) / Math.cosh((1.5 * Math.PI - y) / d) ** 2;
        w[j * N + i] = eps * Math.cos(x) - uy;
      }
    } else {
      let a = seed >>> 0;
      const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      this.wr.fill(0); this.wi.fill(0);
      for (let p = 0; p < N * N; p++) {
        const k = Math.sqrt(this.k2[p]);
        if (k === 0 || !this.mask[p]) continue;
        const amp = k * Math.exp(-((k - 5) ** 2) / 8);
        const ph = 2 * Math.PI * rnd();
        this.wr[p] = amp * Math.cos(ph); this.wi[p] = amp * Math.sin(ph);
      }
      // make the field real: take real part in physical space
      const r = Float64Array.from(this.wr), im = Float64Array.from(this.wi);
      fft2(r, im, N, true);
      let mx = 0; for (const v of r) mx = Math.max(mx, Math.abs(v));
      for (let p = 0; p < N * N; p++) w[p] = (r[p] / mx) * 6;
    }
    this.setPhysical(w);
    this.t = 0; this.steps = 0;
  }

  /** rhs = -(u . grad omega)^ + nu * laplace(omega)^, with dealiasing */
  private rhs(wr: Float64Array, wi: Float64Array, outR: Float64Array, outI: Float64Array) {
    const N = this.N, M = N * N;
    const [ur, ui, vr, vi, xr, xi, yr, yi] = this.buf;
    for (let p = 0; p < M; p++) {
      const k2 = this.k2[p];
      const pr = k2 ? wr[p] / k2 : 0, pi = k2 ? wi[p] / k2 : 0; // psi-hat
      const kx = this.kx[p], ky = this.ky[p];
      // u = psi_y -> i ky psi ; v = -psi_x -> -i kx psi
      ur[p] = -ky * pi; ui[p] = ky * pr;
      vr[p] = kx * pi; vi[p] = -kx * pr;
      xr[p] = -kx * wi[p]; xi[p] = kx * wr[p];
      yr[p] = -ky * wi[p]; yi[p] = ky * wr[p];
    }
    fft2(ur, ui, N, true); fft2(vr, vi, N, true); fft2(xr, xi, N, true); fft2(yr, yi, N, true);
    const [nr, ni] = [this.buf[8], this.buf[9]];
    for (let p = 0; p < M; p++) { nr[p] = ur[p] * xr[p] + vr[p] * yr[p]; ni[p] = 0; }
    fft2(nr, ni, N, false);
    for (let p = 0; p < M; p++) {
      if (!this.mask[p]) { outR[p] = 0; outI[p] = 0; continue; }
      outR[p] = -nr[p] - this.nu * this.k2[p] * wr[p];
      outI[p] = -ni[p] - this.nu * this.k2[p] * wi[p];
    }
  }

  maxVelocity(): number {
    const N = this.N, M = N * N;
    const ur = new Float64Array(M), ui = new Float64Array(M), vr = new Float64Array(M), vi = new Float64Array(M);
    for (let p = 0; p < M; p++) {
      const k2 = this.k2[p];
      const pr = k2 ? this.wr[p] / k2 : 0, pi = k2 ? this.wi[p] / k2 : 0;
      ur[p] = -this.ky[p] * pi; ui[p] = this.ky[p] * pr; vr[p] = this.kx[p] * pi; vi[p] = -this.kx[p] * pr;
    }
    fft2(ur, ui, N, true); fft2(vr, vi, N, true);
    let m = 0; for (let p = 0; p < M; p++) m = Math.max(m, Math.hypot(ur[p], vr[p]));
    return m;
  }

  stableDt(cfl = 0.5): number {
    const h = (2 * Math.PI) / this.N;
    const u = Math.max(1e-6, this.maxVelocity());
    const adv = (cfl * h) / u;
    const kmax = this.N / 3;
    const visc = 2.5 / Math.max(1e-12, this.nu * kmax * kmax);
    return Math.min(adv, visc, 0.05);
  }

  step(dt: number) {
    const M = this.N * this.N;
    const [k1r, k1i, k2r, k2i] = [new Float64Array(M), new Float64Array(M), new Float64Array(M), new Float64Array(M)];
    const [k3r, k3i, k4r, k4i] = [new Float64Array(M), new Float64Array(M), new Float64Array(M), new Float64Array(M)];
    const tr = new Float64Array(M), ti = new Float64Array(M);
    this.rhs(this.wr, this.wi, k1r, k1i);
    for (let p = 0; p < M; p++) { tr[p] = this.wr[p] + 0.5 * dt * k1r[p]; ti[p] = this.wi[p] + 0.5 * dt * k1i[p]; }
    this.rhs(tr, ti, k2r, k2i);
    for (let p = 0; p < M; p++) { tr[p] = this.wr[p] + 0.5 * dt * k2r[p]; ti[p] = this.wi[p] + 0.5 * dt * k2i[p]; }
    this.rhs(tr, ti, k3r, k3i);
    for (let p = 0; p < M; p++) { tr[p] = this.wr[p] + dt * k3r[p]; ti[p] = this.wi[p] + dt * k3i[p]; }
    this.rhs(tr, ti, k4r, k4i);
    for (let p = 0; p < M; p++) {
      this.wr[p] += (dt / 6) * (k1r[p] + 2 * k2r[p] + 2 * k3r[p] + k4r[p]);
      this.wi[p] += (dt / 6) * (k1i[p] + 2 * k2i[p] + 2 * k3i[p] + k4i[p]);
    }
    this.t += dt; this.steps++;
  }

  physical(): Float64Array {
    const r = Float64Array.from(this.wr), i = Float64Array.from(this.wi);
    fft2(r, i, this.N, true);
    return r;
  }

  /** Energy, enstrophy (grid means), max |div u| measured spectrally, max |omega| and the spectral tail ratio. */
  diagnostics() {
    const N = this.N, M = N * N;
    let E = 0, Z = 0, tail = 0, peak = 0;
    const shells = new Float64Array(Math.floor(N / 2) + 2);
    for (let p = 0; p < M; p++) {
      const k2 = this.k2[p];
      const a2 = (this.wr[p] ** 2 + this.wi[p] ** 2) / (M * M);
      Z += 0.5 * a2;
      if (k2) E += (0.5 * a2) / k2;
      const k = Math.round(Math.sqrt(k2));
      if (k < shells.length) shells[k] += k2 ? (0.5 * a2) / k2 : 0;
    }
    const kc = Math.floor(N / 3);
    for (let k = 1; k < shells.length; k++) { if (shells[k] > peak) peak = shells[k]; if (k >= kc - 2 && k <= kc) tail = Math.max(tail, shells[k]); }
    // divergence check in physical space: du/dx + dv/dy computed from spectral derivatives of u, v
    const dr = new Float64Array(M), di = new Float64Array(M);
    for (let p = 0; p < M; p++) {
      const k2 = this.k2[p];
      const pr = k2 ? this.wr[p] / k2 : 0, pi = k2 ? this.wi[p] / k2 : 0;
      const ur = -this.ky[p] * pi, ui = this.ky[p] * pr, vr = this.kx[p] * pi, vi = -this.kx[p] * pr;
      // i kx u + i ky v
      dr[p] = -this.kx[p] * ui - this.ky[p] * vi;
      di[p] = this.kx[p] * ur + this.ky[p] * vr;
    }
    fft2(dr, di, N, true);
    let div = 0; for (let p = 0; p < M; p++) div = Math.max(div, Math.abs(dr[p]));
    const w = this.physical();
    let wmax = 0; for (const v of w) wmax = Math.max(wmax, Math.abs(v));
    return { t: this.t, E, Z, div, wmax, tailRatio: peak ? tail / peak : 0 };
  }

  /** L-infinity error against the exact Taylor-Green solution 2 sin x sin y exp(-2 nu t). */
  tgError(): number {
    const N = this.N, h = (2 * Math.PI) / N, w = this.physical();
    const f = Math.exp(-2 * this.nu * this.t);
    let e = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) e = Math.max(e, Math.abs(w[j * N + i] - 2 * Math.sin(i * h) * Math.sin(j * h) * f));
    return e;
  }
}
