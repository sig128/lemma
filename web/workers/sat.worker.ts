/// <reference lib="webworker" />
import { cdcl, checkRUP, random3SAT, verifyWitness } from "@/lib/sat";

type Msg = { type: "solve"; n: number; m: number; seed: number } | { type: "bench"; ns: number[]; seeds: number; alpha: number };
const post = (d: unknown) => (self as unknown as Worker).postMessage(d);

self.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;
  if (msg.type === "solve") {
    const cnf = random3SAT(msg.n, msg.m, msg.seed);
    const t0 = performance.now();
    const r = cdcl(cnf, { trace: msg.n <= 60 });
    const t1 = performance.now();
    let check: { kind: "witness" | "drup"; ok: boolean; work: number; ms: number; lemmas?: number; firstFalse?: number | null; satisfiedBy?: number[] } | null = null;
    if (r.result === "SAT" && r.assignment) {
      const v = verifyWitness(cnf, r.assignment);
      check = { kind: "witness", ok: v.ok, work: v.work, ms: performance.now() - t1, firstFalse: v.firstFalse, satisfiedBy: v.satisfiedBy };
    } else if (r.result === "UNSAT") {
      const c = checkRUP(cnf, r.lemmas);
      check = { kind: "drup", ok: c.ok, work: c.work, ms: performance.now() - t1, lemmas: c.checked };
    }
    post({ type: "solved", cnf, result: r.result, assignment: r.assignment ? Array.from(r.assignment) : null, stats: r.stats, trace: r.trace.slice(0, 4000), traceTruncated: r.trace.length > 4000, lemmas: r.lemmas.length, solveMs: t1 - t0, check });
    return;
  }
  if (msg.type === "bench") {
    const rows: unknown[] = [];
    for (const n of msg.ns) {
      for (let s = 1; s <= msg.seeds; s++) {
        const m = Math.round(msg.alpha * n);
        const cnf = random3SAT(n, m, 7000 + s);
        const t0 = performance.now();
        const r = cdcl(cnf);
        const ms = performance.now() - t0;
        let verifyWork = null, refuteWork = null, ok = false;
        if (r.result === "SAT" && r.assignment) { const v = verifyWitness(cnf, r.assignment); verifyWork = v.work; ok = v.ok; }
        else if (r.result === "UNSAT") { const c = checkRUP(cnf, r.lemmas); refuteWork = c.work; ok = c.ok; }
        rows.push({ n, m, seed: 7000 + s, result: r.result, searchWork: r.stats.work, conflicts: r.stats.conflicts, verifyWork, refuteWork, certified: ok, ms });
        post({ type: "bench-progress", done: rows.length, total: msg.ns.length * msg.seeds });
      }
    }
    post({ type: "bench-done", rows });
  }
};
