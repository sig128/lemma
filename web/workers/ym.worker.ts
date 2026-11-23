/// <reference lib="webworker" />
import { U1Lattice } from "@/lib/ym";

let lat: U1Lattice | null = null;
let running = false;
let therm = 200;
const post = (d: unknown) => (self as unknown as Worker).postMessage(d);
const LOOPS: [number, number][] = [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [2, 4], [3, 4], [4, 4]];

function measure() {
  if (!lat) return;
  const L = lat.L;
  const plaq = new Float32Array(L * L);
  for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) plaq[y * L + x] = Math.cos(lat.plaq(x, y));
  const measuring = lat.sweeps > therm;
  post({
    type: "state", sweeps: lat.sweeps, therm, measuring, plaq, L, delta: lat.delta,
    mean: lat.meanPlaquette(),
    loops: measuring ? LOOPS.map(([R, T]) => ({ R, T, w: lat!.wilson(R, T) })) : null,
  });
}

function loop() {
  if (!running || !lat) return;
  const t0 = performance.now();
  while (performance.now() - t0 < 25) lat.sweep();
  measure();
  setTimeout(loop, 0);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") { running = false; lat = new U1Lattice(m.L, m.beta, m.seed); therm = m.therm ?? 200; measure(); }
  else if (m.type === "run") { if (!running) { running = true; loop(); } }
  else if (m.type === "pause") running = false;
};
