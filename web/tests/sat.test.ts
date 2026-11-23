import { describe, expect, it } from "vitest";
import { cdcl, checkRUP, random3SAT, verifyWitness, type CNF } from "@/lib/sat";

function brute(cnf: CNF): boolean {
  const n = cnf.n;
  for (let m = 0; m < 1 << n; m++) {
    if (cnf.clauses.every((c) => c.some((l) => (l > 0 ? (m >> (l - 1)) & 1 : !((m >> (-l - 1)) & 1))))) return true;
  }
  return false;
}

describe("CDCL solver with independent certificate checks", () => {
  it("agrees with brute force on 300 small random instances", () => {
    let sat = 0, unsat = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const n = 6 + (seed % 9);
      const cnf = random3SAT(n, Math.round(4.6 * n), seed);
      const r = cdcl(cnf);
      expect(r.result === "SAT").toBe(brute(cnf));
      if (r.result === "SAT") { sat++; expect(verifyWitness(cnf, r.assignment!).ok).toBe(true); }
      else { unsat++; expect(checkRUP(cnf, r.lemmas).ok).toBe(true); }
    }
    expect(sat).toBeGreaterThan(20);
    expect(unsat).toBeGreaterThan(20);
  });

  it("every UNSAT answer at n = 30..50 carries a DRUP proof the independent checker accepts", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const n = 30 + (seed % 3) * 10;
      const cnf = random3SAT(n, Math.round(4.6 * n), 1000 + seed);
      const r = cdcl(cnf);
      if (r.result === "UNSAT") { expect(checkRUP(cnf, r.lemmas).ok).toBe(true); checked++; }
      else expect(verifyWitness(cnf, r.assignment!).ok).toBe(true);
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("rejects a forged certificate and a wrong witness", () => {
    const cnf: CNF = { n: 2, clauses: [[1, 2], [-1, 2], [1, -2]] }; // satisfiable by 1=2=true
    expect(checkRUP(cnf, [[]]).ok).toBe(false);
    const bad = new Int8Array([0, -1, -1]);
    expect(verifyWitness(cnf, bad).ok).toBe(false);
    const good = new Int8Array([0, 1, 1]);
    expect(verifyWitness(cnf, good).ok).toBe(true);
  });
});
