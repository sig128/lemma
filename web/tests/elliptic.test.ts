import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Curve, O, eqPoint, pt } from "@/lib/math/elliptic";
import { Q } from "@/lib/math/rational";

type CurveFile = {
  id: string;
  ainvs: [number, number, number, number, number];
  discriminant: string;
  generators: [string, string][];
  torsion: { order: number; generators: [string, string][] };
  point_search: { points: [string, string][] };
  generator_combinations: { coeffs: number[]; x: string; y: string }[];
};

const load = (id: string): CurveFile =>
  JSON.parse(readFileSync(path.join(__dirname, "..", "public", "data", "bsd", `${id}.json`), "utf8"));

const IDS = ["11a1", "37a1", "389a1", "5077a1", "234446a1"];

describe("exact rational arithmetic", () => {
  it("normalizes and parses PARI rationals", () => {
    expect(Q.parse("-20/49").toString()).toBe("-20/49");
    expect(Q.parse("6/4").toString()).toBe("3/2");
    expect(Q.of(3n, -6n).toString()).toBe("-1/2");
    expect(Q.parse("1/4").add(Q.parse("-5/8")).toString()).toBe("-3/8");
  });
});

describe("elliptic curve group law (independent TypeScript implementation vs PARI)", () => {
  for (const id of IDS) {
    const f = load(id);
    const E = new Curve(f.ainvs);
    it(`${id}: discriminant matches PARI`, () => {
      expect(E.invariants().disc.toString()).toBe(f.discriminant);
    });
    it(`${id}: every searched point lies on the curve`, () => {
      for (const [x, y] of f.point_search.points) expect(E.onCurve(pt(x, y))).toBe(true);
    });
    it(`${id}: generator combinations agree with PARI ellmul/elladd`, () => {
      const G = f.generators.map(([x, y]) => pt(x, y));
      for (const c of f.generator_combinations) {
        let R = O;
        c.coeffs.forEach((a, i) => { R = E.add(R, E.mul(a, G[i])); });
        expect(R.kind).toBe("aff");
        if (R.kind === "aff") {
          expect(R.x.toString()).toBe(c.x);
          expect(R.y.toString()).toBe(c.y);
        }
      }
    });
  }

  it("11a1: torsion point has order exactly 5", () => {
    const f = load("11a1");
    const E = new Curve(f.ainvs);
    const T = pt(...f.torsion.generators[0]);
    for (let k = 1; k < 5; k++) expect(E.mul(k, T).kind).toBe("aff");
    expect(E.mul(5, T).kind).toBe("inf");
  });

  it("37a1: P + (-P) = O via a vertical line; doubling uses the tangent", () => {
    const E = new Curve([0, 0, 1, -1, 0]);
    const P = pt("0", "0");
    const step = E.chord(P, E.neg(P));
    expect(step.kind).toBe("vertical");
    expect(step.sum.kind).toBe("inf");
    const dbl = E.chord(P, P);
    expect(dbl.kind).toBe("tangent");
    expect(eqPoint(dbl.sum, pt("1", "0"))).toBe(true);
  });

  it("identity behaves as identity", () => {
    const E = new Curve([0, 0, 1, -1, 0]);
    const P = pt("6", "14");
    expect(eqPoint(E.add(P, O), P)).toBe(true);
    expect(eqPoint(E.add(O, P), P)).toBe(true);
  });
});
