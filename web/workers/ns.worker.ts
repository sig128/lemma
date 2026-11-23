/// <reference lib="webworker" />
import { NS2D, type IC } from "@/lib/ns";

let sim: NS2D | null = null;
let running = false;
let cfg: { N: number; nu: number; ic: IC; seed: number } | null = null;
const post = (d: unknown, t?: Transferable[]) => (self as unknown as Worker).postMessage(d, t ?? []);

function frame() {
  if (!sim) return;
  const w = sim.physical();
  const N = sim.N;
  const f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = w[i];
  const d = sim.diagnostics();
  const tg = cfg?.ic === "tg" ? sim.tgError() : null;
  post({ type: "frame", N, omega: f, diag: { ...d, tgError: tg, steps: sim.steps } }, [f.buffer]);
}

function loop() {
  if (!running || !sim) return;
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < 30 && n < 8) { sim.step(sim.stableDt()); n++; }
  frame();
  setTimeout(loop, 0);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") {
    running = false;
    cfg = { N: m.N, nu: m.nu, ic: m.ic, seed: m.seed };
    sim = new NS2D(m.N, m.nu);
    sim.init(m.ic, m.seed);
    frame();
  } else if (m.type === "run") { if (!running) { running = true; loop(); } }
  else if (m.type === "pause") running = false;
  else if (m.type === "refine") {
    const rows: unknown[] = [];
    for (const N of m.Ns as number[]) {
      const s = new NS2D(N, m.nu);
      s.init(m.ic, m.seed);
      const t0 = performance.now();
      const dt = m.dt as number;
      const steps = Math.round(m.T / dt);
      for (let k = 0; k < steps; k++) s.step(dt);
      const d = s.diagnostics();
      rows.push({ N, T: s.t, dt, E: d.E, Z: d.Z, div: d.div, tail: d.tailRatio, tgError: m.ic === "tg" ? s.tgError() : null, ms: performance.now() - t0 });
      post({ type: "refine-progress", done: rows.length });
    }
    post({ type: "refine-done", rows, ic: m.ic, nu: m.nu, T: m.T });
  }
};
