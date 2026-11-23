import { describe, expect, it } from "vitest";
import { NS2D, fft1 } from "@/lib/ns";

describe("2D pseudo-spectral Navier-Stokes", () => {
  it("FFT round-trips", () => {
    const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i) + 0.3 * i), im = new Float64Array(64);
    const r0 = Float64Array.from(re);
    fft1(re, im, false); fft1(re, im, true);
    for (let i = 0; i < 64; i++) expect(Math.abs(re[i] - r0[i])).toBeLessThan(1e-12);
  });

  it("reproduces the exact Taylor-Green decay to near machine precision", () => {
    const s = new NS2D(32, 0.05);
    s.init("tg");
    for (let k = 0; k < 40; k++) s.step(0.02);
    expect(s.tgError()).toBeLessThan(1e-9);
    const d = s.diagnostics();
    expect(d.div).toBeLessThan(1e-12);
  });

  it("energy decays monotonically for decaying turbulence (no forcing)", () => {
    const s = new NS2D(32, 0.01);
    s.init("turb", 7);
    let E = s.diagnostics().E;
    for (let k = 0; k < 20; k++) {
      s.step(s.stableDt());
      const e = s.diagnostics().E;
      expect(e).toBeLessThanOrEqual(E * (1 + 1e-9));
      E = e;
    }
  });
});
