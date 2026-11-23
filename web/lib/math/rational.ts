/**
 * Exact rational arithmetic over BigInt. Every stored coordinate in the BSD
 * instruments is a Q value; floating point is used only for drawing.
 */
export class Q {
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static of(n: bigint | number, d: bigint | number = 1n): Q {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new RangeError("Q: zero denominator");
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(nn < 0n ? -nn : nn, dd);
    return new Q(g === 0n ? 0n : nn / g, g === 0n ? 1n : dd / g);
  }

  /** Parse "a", "-a", "a/b" (as emitted by PARI). */
  static parse(s: string): Q {
    const t = s.trim();
    const m = /^([+-]?\d+)(?:\s*\/\s*(\d+))?$/.exec(t);
    if (!m) throw new SyntaxError(`Q.parse: not a rational: ${s}`);
    return Q.of(BigInt(m[1]), m[2] ? BigInt(m[2]) : 1n);
  }

  static readonly ZERO = Q.of(0n);
  static readonly ONE = Q.of(1n);

  add(o: Q): Q { return Q.of(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Q): Q { return Q.of(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Q): Q { return Q.of(this.n * o.n, this.d * o.d); }
  div(o: Q): Q {
    if (o.n === 0n) throw new RangeError("Q: division by zero");
    return Q.of(this.n * o.d, this.d * o.n);
  }
  neg(): Q { return Q.of(-this.n, this.d); }
  pow(k: number): Q {
    let r: Q = Q.ONE;
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
  isZero(): boolean { return this.n === 0n; }
  eq(o: Q): boolean { return this.n === o.n && this.d === o.d; }
  sign(): number { return this.n === 0n ? 0 : this.n > 0n ? 1 : -1; }

  toNumber(): number {
    // Safe for large numerators/denominators: scale via string lengths.
    const a = this.n < 0n ? -this.n : this.n;
    const la = a.toString().length;
    const lb = this.d.toString().length;
    if (la < 300 && lb < 300) return Number(this.n) / Number(this.d);
    const shift = BigInt(Math.max(0, Math.min(la, lb) - 20));
    const p = 10n ** shift;
    return Number(this.n / p) / Number(this.d / p);
  }

  toString(): string { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }

  toTex(): string {
    if (this.d === 1n) return this.n.toString();
    const sgn = this.n < 0n ? "-" : "";
    const a = this.n < 0n ? -this.n : this.n;
    return `${sgn}\\tfrac{${a}}{${this.d}}`;
  }

  /** Naive height H(a/b) = max(|a|, |b|). */
  height(): bigint {
    const a = this.n < 0n ? -this.n : this.n;
    return a > this.d ? a : this.d;
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a < 0n ? -a : a;
}

/** log of a positive bigint, robust for very large values. */
export function logBig(x: bigint): number {
  if (x <= 0n) return -Infinity;
  const s = x.toString();
  if (s.length < 300) return Math.log(Number(x));
  return Math.log(Number(s.slice(0, 17))) + (s.length - 17) * Math.LN10;
}
