import { Q, logBig } from "./rational";

/**
 * Elliptic curves in long Weierstrass form over Q:
 *   y^2 + a1 x y + a3 y = x^3 + a2 x^2 + a4 x + a6
 * The identity O is the point at infinity and is part of the model.
 * Group law: Silverman, The Arithmetic of Elliptic Curves, III.2.3.
 */
export type Ainvs = readonly [number, number, number, number, number];

export type Point = { kind: "inf" } | { kind: "aff"; x: Q; y: Q };
export const O: Point = { kind: "inf" };

export function pt(x: string | Q, y: string | Q): Point {
  return { kind: "aff", x: typeof x === "string" ? Q.parse(x) : x, y: typeof y === "string" ? Q.parse(y) : y };
}

export class Curve {
  readonly a1: Q; readonly a2: Q; readonly a3: Q; readonly a4: Q; readonly a6: Q;
  readonly ainvs: Ainvs;
  constructor(ainvs: Ainvs) {
    this.ainvs = ainvs;
    [this.a1, this.a2, this.a3, this.a4, this.a6] = ainvs.map((a) => Q.of(BigInt(a))) as [Q, Q, Q, Q, Q];
  }

  /** b-invariants and discriminant (exact). */
  invariants() {
    const { a1, a2, a3, a4, a6 } = this;
    const b2 = a1.mul(a1).add(Q.of(4n).mul(a2));
    const b4 = Q.of(2n).mul(a4).add(a1.mul(a3));
    const b6 = a3.mul(a3).add(Q.of(4n).mul(a6));
    const b8 = a1.mul(a1).mul(a6).add(Q.of(4n).mul(a2).mul(a6)).sub(a1.mul(a3).mul(a4)).add(a2.mul(a3).mul(a3)).sub(a4.mul(a4));
    const disc = b2.mul(b2).mul(b8).neg()
      .sub(Q.of(8n).mul(b4.pow(3)))
      .sub(Q.of(27n).mul(b6.mul(b6)))
      .add(Q.of(9n).mul(b2).mul(b4).mul(b6));
    return { b2, b4, b6, b8, disc };
  }

  isNonsingular(): boolean {
    return !this.invariants().disc.isZero();
  }

  onCurve(P: Point): boolean {
    if (P.kind === "inf") return true;
    const { x, y } = P;
    const lhs = y.mul(y).add(this.a1.mul(x).mul(y)).add(this.a3.mul(y));
    const rhs = x.pow(3).add(this.a2.mul(x.mul(x))).add(this.a4.mul(x)).add(this.a6);
    return lhs.eq(rhs);
  }

  neg(P: Point): Point {
    if (P.kind === "inf") return O;
    return { kind: "aff", x: P.x, y: P.y.neg().sub(this.a1.mul(P.x)).sub(this.a3) };
  }

  /**
   * Chord-and-tangent data for P + Q: the line y = lambda x + nu (or a vertical
   * line), the third intersection R* on the curve, and the sum R = -R*.
   */
  chord(P: Point, Qp: Point): ChordStep {
    if (P.kind === "inf") return { kind: "identity", sum: Qp, note: "O is the identity: O + Q = Q." };
    if (Qp.kind === "inf") return { kind: "identity", sum: P, note: "O is the identity: P + O = P." };
    const { a1, a2, a3, a4, a6 } = this;
    if (P.x.eq(Qp.x)) {
      const s = P.y.add(Qp.y).add(a1.mul(Qp.x)).add(a3);
      if (s.isZero()) {
        return { kind: "vertical", x: P.x, sum: O, note: P.y.eq(Qp.y) ? "Vertical tangent at a 2-torsion point: 2P = O." : "Q = -P: the line is vertical and meets the curve again at O." };
      }
      const den = Q.of(2n).mul(P.y).add(a1.mul(P.x)).add(a3);
      const lam = Q.of(3n).mul(P.x.mul(P.x)).add(Q.of(2n).mul(a2).mul(P.x)).add(a4).sub(a1.mul(P.y)).div(den);
      const nu = P.x.pow(3).neg().add(a4.mul(P.x)).add(Q.of(2n).mul(a6)).sub(a3.mul(P.y)).div(den);
      return this.finish(P, Qp, lam, nu, true);
    }
    const lam = Qp.y.sub(P.y).div(Qp.x.sub(P.x));
    const nu = P.y.mul(Qp.x).sub(Qp.y.mul(P.x)).div(Qp.x.sub(P.x));
    return this.finish(P, Qp, lam, nu, false);
  }

  private finish(P: Extract<Point, { kind: "aff" }>, Qp: Extract<Point, { kind: "aff" }>, lam: Q, nu: Q, tangent: boolean): ChordStep {
    const x3 = lam.mul(lam).add(this.a1.mul(lam)).sub(this.a2).sub(P.x).sub(Qp.x);
    const yStar = lam.mul(x3).add(nu);
    const third: Point = { kind: "aff", x: x3, y: yStar };
    const sum = this.neg(third);
    return { kind: tangent ? "tangent" : "secant", lambda: lam, nu, third, sum, note: tangent ? "Tangent line at P meets the curve with multiplicity 2 at P." : "The line through P and Q meets the curve in a third point." };
  }

  add(P: Point, Qp: Point): Point {
    return this.chord(P, Qp).sum;
  }

  mul(n: number, P: Point): Point {
    if (n === 0 || P.kind === "inf") return O;
    if (n < 0) return this.mul(-n, this.neg(P));
    let R: Point = O;
    let A: Point = P;
    let k = n;
    while (k > 0) {
      if (k & 1) R = this.add(R, A);
      A = this.add(A, A);
      k >>= 1;
    }
    return R;
  }

  /** f(x) such that y-roots exist iff D(x) = 4x^3 + b2 x^2 + 2 b4 x + b6 >= 0. */
  discCubic(): [number, number, number, number] {
    const { b2, b4, b6 } = this.invariants();
    return [4, b2.toNumber(), 2 * b4.toNumber(), b6.toNumber()];
  }

  yOf(x: number, sign: 1 | -1): number | null {
    const [c3, c2, c1, c0] = this.discCubic();
    const D = ((c3 * x + c2) * x + c1) * x + c0;
    if (D < 0) return null;
    const a1 = this.a1.toNumber();
    const a3 = this.a3.toNumber();
    return (-(a1 * x + a3) + sign * Math.sqrt(D)) / 2;
  }
}

export type ChordStep =
  | { kind: "identity"; sum: Point; note: string }
  | { kind: "vertical"; x: Q; sum: Point; note: string }
  | { kind: "secant" | "tangent"; lambda: Q; nu: Q; third: Point; sum: Point; note: string };

export function eqPoint(P: Point, Qp: Point): boolean {
  if (P.kind === "inf" || Qp.kind === "inf") return P.kind === Qp.kind;
  return P.x.eq(Qp.x) && P.y.eq(Qp.y);
}

/** Naive logarithmic height of the x-coordinate, h(x) = log max(|a|,|b|). */
export function naiveLogHeight(P: Point): number {
  if (P.kind === "inf") return 0;
  return logBig(P.x.height());
}

/** Real roots of a cubic c3 x^3 + c2 x^2 + c1 x + c0 (c3 != 0), ascending. */
export function realCubicRoots(c3: number, c2: number, c1: number, c0: number): number[] {
  const a = c2 / c3, b = c1 / c3, c = c0 / c3;
  const p = b - (a * a) / 3;
  const q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const disc = (q * q) / 4 + (p * p * p) / 27;
  const shift = -a / 3;
  let roots: number[];
  if (disc > 1e-14 * Math.max(1, Math.abs(q * q))) {
    const s = Math.sqrt(disc);
    roots = [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + shift];
  } else if (Math.abs(disc) <= 1e-14 * Math.max(1, Math.abs(q * q))) {
    const u = Math.cbrt(-q / 2);
    roots = [2 * u + shift, -u + shift];
  } else {
    const r = Math.sqrt(-(p * p * p) / 27);
    const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
    const m = 2 * Math.cbrt(r);
    roots = [0, 1, 2].map((k) => m * Math.cos((phi + 2 * Math.PI * k) / 3) + shift);
  }
  // polish with Newton
  roots = roots.map((x) => {
    for (let i = 0; i < 6; i++) {
      const f = ((c3 * x + c2) * x + c1) * x + c0;
      const df = (3 * c3 * x + 2 * c2) * x + c1;
      if (df === 0) break;
      x -= f / df;
    }
    return x;
  });
  return [...new Set(roots.map((r) => +r.toPrecision(14)))].sort((u, v) => u - v);
}

/**
 * Sample the real locus E(R) within [xmin, xmax] as polylines in (x,y).
 * Near each root of D the parametrization x = r + u^2 keeps the vertical
 * tangent smooth. Components: a compact oval (if 3 real roots) and the
 * unbounded branch.
 */
export function sampleRealLocus(E: Curve, xmax: number, steps = 900): { compact: number[][] | null; branch: number[][] } {
  const [c3, c2, c1, c0] = E.discCubic();
  const roots = realCubicRoots(c3, c2, c1, c0);
  const a1 = E.a1.toNumber(), a3 = E.a3.toNumber();
  const D = (x: number) => Math.max(0, ((c3 * x + c2) * x + c1) * x + c0);
  const y = (x: number, s: number) => (-(a1 * x + a3) + s * Math.sqrt(D(x))) / 2;

  const arc = (lo: number, hi: number, n: number) => {
    // dense near both ends via a sine-squared spacing
    const xs: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      xs.push(lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * t)));
    }
    return xs;
  };

  let compact: number[][] | null = null;
  if (roots.length === 3) {
    const xs = arc(roots[0], roots[1], Math.round(steps / 3));
    const upper = xs.map((x) => [x, y(x, 1)]);
    const lower = xs.slice().reverse().map((x) => [x, y(x, -1)]);
    compact = [...upper, ...lower, upper[0]];
  }
  const r = roots[roots.length - 1];
  const span = Math.max(1e-6, xmax - r);
  const n = steps;
  const upper: number[][] = [];
  const lower: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = r + span * t * t; // dense near the root
    upper.push([x, y(x, 1)]);
    lower.push([x, y(x, -1)]);
  }
  const branch = [...lower.reverse(), ...upper.slice(1)];
  return { compact, branch };
}
