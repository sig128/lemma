export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number]; invert: (p: number) => number; ticks: (n?: number) => number[]; kind: "linear" | "log" };

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain, [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain; f.range = range; f.kind = "linear";
  f.invert = (p: number) => (k === 0 ? d0 : d0 + (p - r0) / k);
  f.ticks = (n = 5) => niceTicks(d0, d1, n);
  return f;
}

export function log10(domain: [number, number], range: [number, number]): Scale {
  const l0 = Math.log10(domain[0]), l1 = Math.log10(domain[1]);
  const inner = linear([l0, l1], range);
  const f = ((v: number) => inner(Math.log10(Math.max(v, 1e-300)))) as Scale;
  f.domain = domain; f.range = range; f.kind = "log";
  f.invert = (p: number) => 10 ** inner.invert(p);
  f.ticks = (n = 6) => {
    const a = Math.ceil(Math.min(l0, l1)), b = Math.floor(Math.max(l0, l1));
    const step = Math.max(1, Math.ceil((b - a + 1) / n));
    const out: number[] = [];
    for (let e = a; e <= b; e += step) out.push(10 ** e);
    return out;
  };
  return f;
}

export function niceTicks(a: number, b: number, n = 5): number[] {
  if (!isFinite(a) || !isFinite(b) || a === b) return [a];
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const raw = (hi - lo) / Math.max(1, n);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

export function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return String(v);
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(Math.max(0, digits - 1)).replace("e", "e");
  return (+v.toPrecision(digits)).toString();
}

export function fmtTick(v: number): string {
  const a = Math.abs(v);
  if (v === 0) return "0";
  if (a >= 1e4 || a < 1e-2) {
    const e = Math.round(Math.log10(a));
    if (Math.abs(a / 10 ** e - 1) < 1e-9) return `${v < 0 ? "−" : ""}1e${e}`;
    return v.toExponential(1);
  }
  return (+v.toPrecision(6)).toString().replace("-", "−");
}

/** "1.0000000000000000000 e-40" (PARI) -> number */
export function parsePariNum(s: string): number {
  return Number(s.replace(/\s+e/, "e").replace(/\s/g, ""));
}
