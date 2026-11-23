import { describe, expect, it } from "vitest";
import { U1Lattice, besselI, binned, blocking, exactPlaquette, exactWilson } from "@/lib/ym";

describe("2D U(1) lattice gauge theory", () => {
  it("Bessel functions match known values", () => {
    expect(besselI(0, 1)).toBeCloseTo(1.2660658777520082, 12);
    expect(besselI(1, 1)).toBeCloseTo(0.5651591039924851, 12);
    expect(besselI(2, 3)).toBeCloseTo(2.245212440929951, 10);
  });

  it("finite-volume exact plaquette tends to I1/I0", () => {
    const b = 2;
    expect(Math.abs(exactPlaquette(b, 256) - besselI(1, b) / besselI(0, b))).toBeLessThan(1e-12);
    expect(Math.abs(exactWilson(b, 256, 4) - (besselI(1, b) / besselI(0, b)) ** 4)).toBeLessThan(1e-10);
  });

  it("Metropolis Monte Carlo agrees with the exact plaquette within 4 standard errors", () => {
    const L = 12, beta = 1.5;
    const lat = new U1Lattice(L, beta, 42);
    for (let i = 0; i < 300; i++) lat.sweep();
    const ps: number[] = [], ws: number[] = [];
    for (let i = 0; i < 1600; i++) { lat.sweep(); ps.push(lat.meanPlaquette()); if (i % 4 === 0) ws.push(lat.wilson(2, 2)); }
    const p = binned(ps, 40), w = binned(ws, 20);
    expect(Math.abs(p.mean - exactPlaquette(beta, L * L))).toBeLessThan(4 * p.err + 1e-3);
    expect(Math.abs(w.mean - exactWilson(beta, L * L, 4))).toBeLessThan(4 * w.err + 2e-3);
  });
});

describe("blocking analysis", () => {
  // Deterministic Gaussian samples (Box–Muller over a small LCG) so the test is reproducible.
  function gaussians(n: number, seed: number) {
    let s = seed >>> 0;
    const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    const out: number[] = [];
    while (out.length < n) { const a = u(), b = u(); const r = Math.sqrt(-2 * Math.log(a)); out.push(r * Math.cos(2 * Math.PI * b), r * Math.sin(2 * Math.PI * b)); }
    return out.slice(0, n);
  }

  it("recovers the naive error for independent samples", () => {
    const N = 1 << 14;
    const xs = gaussians(N, 7);
    const b = blocking(xs);
    expect(b.plateau).toBe(true);
    expect(b.err / (1 / Math.sqrt(N))).toBeGreaterThan(0.85);
    expect(b.err / (1 / Math.sqrt(N))).toBeLessThan(1.2);
    expect(b.tau).toBeLessThan(0.8);
  });

  it("finds the integrated autocorrelation time of an AR(1) chain", () => {
    const N = 1 << 16, phi = 0.9;
    const e = gaussians(N, 11);
    const xs: number[] = [];
    let x = 0;
    for (let i = 0; i < N; i++) { x = phi * x + e[i]; xs.push(x); }
    // AR(1): tau_int = (1 + phi) / (2 (1 - phi)) = 9.5; Var(x) = 1 / (1 - phi^2).
    const tau = (1 + phi) / (2 * (1 - phi));
    const trueErr = Math.sqrt((1 / (1 - phi * phi)) * 2 * tau / N);
    const b = blocking(xs);
    expect(b.plateau).toBe(true);
    expect(b.err / trueErr).toBeGreaterThan(0.75);
    expect(b.err / trueErr).toBeLessThan(1.3);
    expect(b.tau).toBeGreaterThan(6);
    expect(b.tau).toBeLessThan(13);
  });

  it("reports no error and no plateau with too few samples", () => {
    const b = blocking([1, 2, 3]);
    expect(Number.isNaN(b.err)).toBe(true);
    expect(b.plateau).toBe(false);
  });
});
