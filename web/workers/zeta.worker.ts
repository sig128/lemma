/// <reference lib="webworker" />
import { borweinTerms, makeZeta } from "@/lib/zeta";
import { oklchToRgb, PHASE_C, PHASE_L } from "@/lib/color";

type Req = { id: number; w: number; h: number; s0: number; s1: number; t0: number; t1: number };

/* Domain coloring: hue = arg ζ at constant OKLCH lightness and low chroma; lightness carries the
   modulus (soft bands at |ζ| = 2^k, dark toward zeros, pale where |ζ| is large). */
self.onmessage = (e: MessageEvent<Req>) => {
  const { id, w, h, s0, s1, t0, t1 } = e.data;
  const n = borweinTerms(Math.max(Math.abs(t0), Math.abs(t1)) + 2);
  const zeta = makeZeta(n);
  const buf = new Uint8ClampedArray(w * h * 4);
  const started = performance.now();
  for (let j = 0; j < h; j++) {
    const t = t1 - ((j + 0.5) / h) * (t1 - t0);
    for (let i = 0; i < w; i++) {
      const s = s0 + ((i + 0.5) / w) * (s1 - s0);
      const [zr, zi] = zeta(s, t);
      const mod = Math.hypot(zr, zi);
      const k = (j * w + i) * 4;
      if (!Number.isFinite(mod)) { buf[k] = 226; buf[k + 1] = 222; buf[k + 2] = 214; buf[k + 3] = 255; continue; }
      const lm = Math.log2(mod);
      const ring = lm - Math.floor(lm);
      let L = PHASE_L * (0.86 + 0.14 * Math.pow(ring, 0.8));
      L *= 0.22 + 0.78 * Math.pow(Math.min(1, mod / 0.45), 0.7);
      let C = PHASE_C;
      const far = mod > 5 ? Math.min(1, (Math.log(mod) - Math.log(5)) / 3) : 0;
      L = L * (1 - far) + 0.86 * far;
      C = C * (1 - 0.8 * far);
      const [r, g, b] = oklchToRgb(L, C, Math.atan2(zi, zr) + 0.6);
      buf[k] = 255 * r; buf[k + 1] = 255 * g; buf[k + 2] = 255 * b; buf[k + 3] = 255;
    }
  }
  (self as unknown as Worker).postMessage({ id, buf, w, h, n, ms: performance.now() - started }, [buf.buffer]);
};
