/**
 * SAT instrument core. Literals are nonzero integers (+v / -v, v in 1..n).
 * - random3SAT: seeded uniform random 3-SAT (distinct variables per clause).
 * - cdcl: conflict-driven clause learning (two watched literals, VSIDS, 1-UIP,
 *   non-chronological backjumping, Luby restarts). Every learned clause is
 *   logged as a DRUP lemma; UNSAT ends with the empty clause.
 * - checkRUP: an independent checker (naive unit propagation, no shared code
 *   with the solver) that verifies each lemma is a reverse-unit-propagation
 *   consequence of the formula plus earlier lemmas.
 * - verifyWitness: evaluates every clause under an assignment, counting work.
 */
export type CNF = { n: number; clauses: number[][] };

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function random3SAT(n: number, m: number, seed: number): CNF {
  const r = mulberry32(seed * 2654435761 + n * 97 + m);
  const clauses: number[][] = [];
  for (let i = 0; i < m; i++) {
    const vs = new Set<number>();
    while (vs.size < 3) vs.add(1 + Math.floor(r() * n));
    clauses.push([...vs].map((v) => (r() < 0.5 ? v : -v)));
  }
  return { n, clauses };
}

export type TraceEv =
  | { k: "decide"; lit: number; level: number }
  | { k: "prop"; lit: number; clause: number; level: number }
  | { k: "conflict"; clause: number; level: number }
  | { k: "learn"; lemma: number[]; backjump: number }
  | { k: "restart" }
  | { k: "done"; result: "SAT" | "UNSAT" };

export interface SolveResult {
  result: "SAT" | "UNSAT" | "UNKNOWN";
  assignment: Int8Array | null; // index v: 1 true, -1 false, 0 unassigned
  lemmas: number[][];
  stats: { decisions: number; propagations: number; conflicts: number; learned: number; restarts: number; work: number };
  trace: TraceEv[];
}

function luby(i: number): number {
  let k = 1;
  while ((1 << k) - 1 < i) k++;
  while (i !== (1 << k) - 1) { i -= (1 << (k - 1)) - 1; k = 1; while ((1 << k) - 1 < i) k++; }
  return 1 << (k - 1);
}

export function cdcl(cnf: CNF, opts: { trace?: boolean; maxConflicts?: number } = {}): SolveResult {
  const { n } = cnf;
  const clauses: number[][] = cnf.clauses.map((c) => [...new Set(c)]);
  const value = new Int8Array(n + 1);
  const level = new Int32Array(n + 1);
  const reason = new Int32Array(n + 1).fill(-1);
  const trail: number[] = [];
  const trailLim: number[] = [];
  const activity = new Float64Array(n + 1);
  let inc = 1;
  const watches = new Map<number, number[]>();
  const W = (lit: number) => { let w = watches.get(lit); if (!w) { w = []; watches.set(lit, w); } return w; };
  const stats = { decisions: 0, propagations: 0, conflicts: 0, learned: 0, restarts: 0, work: 0 };
  const trace: TraceEv[] = [];
  const lemmas: number[][] = [];
  const T = opts.trace ?? false;
  const litVal = (l: number) => (l > 0 ? value[l] : -value[-l]);
  const dl = () => trailLim.length;
  const assign = (l: number, r: number) => { const v = Math.abs(l); value[v] = l > 0 ? 1 : -1; level[v] = dl(); reason[v] = r; trail.push(l); };

  const units: number[] = [];
  for (let i = 0; i < clauses.length; i++) {
    const c = clauses[i];
    if (c.length === 0) return { result: "UNSAT", assignment: null, lemmas: [[]], stats, trace };
    if (c.length === 1) units.push(i); else { W(-c[0]).push(i); W(-c[1]).push(i); }
  }
  for (const i of units) {
    const l = clauses[i][0];
    if (litVal(l) === -1) { lemmas.push([]); if (T) trace.push({ k: "done", result: "UNSAT" }); return { result: "UNSAT", assignment: null, lemmas, stats, trace }; }
    if (litVal(l) === 0) assign(l, i);
  }

  let qhead = 0;
  const propagate = (): number => {
    while (qhead < trail.length) {
      const p = trail[qhead++]; // p became true; visit clauses watching -p... (watch lists keyed by the literal that became true's negation)
      const ws = W(p);
      let i = 0;
      while (i < ws.length) {
        const ci = ws[i];
        const c = clauses[ci];
        stats.work++;
        if (c[0] === -p) { c[0] = c[1]; c[1] = -p; }
        if (litVal(c[0]) === 1) { i++; continue; }
        let found = false;
        for (let k = 2; k < c.length; k++) {
          if (litVal(c[k]) !== -1) {
            c[1] = c[k]; c[k] = -p;
            W(-c[1]).push(ci);
            ws[i] = ws[ws.length - 1]; ws.pop();
            found = true; break;
          }
        }
        if (found) continue;
        if (litVal(c[0]) === -1) return ci;
        assign(c[0], ci); stats.propagations++;
        if (T) trace.push({ k: "prop", lit: c[0], clause: ci, level: dl() });
        i++;
      }
    }
    return -1;
  };

  const analyze = (confl: number): { learnt: number[]; bt: number } => {
    const seen = new Uint8Array(n + 1);
    const learnt: number[] = [0];
    let pathC = 0, p = 0, idx = trail.length - 1;
    let c = clauses[confl];
    do {
      for (const q of c) {
        if (q === p) continue;
        const v = Math.abs(q);
        stats.work++;
        if (!seen[v] && level[v] > 0) {
          seen[v] = 1;
          activity[v] += inc;
          if (activity[v] > 1e100) { for (let j = 1; j <= n; j++) activity[j] *= 1e-100; inc *= 1e-100; }
          if (level[v] >= dl()) pathC++; else learnt.push(q);
        }
      }
      while (!seen[Math.abs(trail[idx])]) idx--;
      p = trail[idx]; idx--;
      seen[Math.abs(p)] = 0;
      pathC--;
      if (pathC > 0) c = clauses[reason[Math.abs(p)]];
    } while (pathC > 0);
    learnt[0] = -p;
    let bt = 0;
    if (learnt.length > 1) {
      let mi = 1;
      for (let i = 2; i < learnt.length; i++) if (level[Math.abs(learnt[i])] > level[Math.abs(learnt[mi])]) mi = i;
      [learnt[1], learnt[mi]] = [learnt[mi], learnt[1]];
      bt = level[Math.abs(learnt[1])];
    }
    return { learnt, bt };
  };

  const cancelUntil = (lv: number) => {
    if (dl() <= lv) return;
    const stop = trailLim[lv];
    for (let i = trail.length - 1; i >= stop; i--) { const v = Math.abs(trail[i]); value[v] = 0; reason[v] = -1; }
    trail.length = stop; trailLim.length = lv; qhead = Math.min(qhead, trail.length);
  };

  let restartAt = 100 * luby(1), restartNo = 1, conflictsSinceRestart = 0;
  const maxC = opts.maxConflicts ?? 200000;
  for (;;) {
    const confl = propagate();
    if (confl >= 0) {
      stats.conflicts++; conflictsSinceRestart++;
      if (T) trace.push({ k: "conflict", clause: confl, level: dl() });
      if (dl() === 0) { lemmas.push([]); if (T) trace.push({ k: "done", result: "UNSAT" }); return { result: "UNSAT", assignment: null, lemmas, stats, trace }; }
      const { learnt, bt } = analyze(confl);
      lemmas.push([...learnt]);
      stats.learned++;
      if (T) trace.push({ k: "learn", lemma: [...learnt], backjump: bt });
      cancelUntil(bt);
      clauses.push(learnt);
      const ci = clauses.length - 1;
      if (learnt.length === 1) assign(learnt[0], ci);
      else { W(-learnt[0]).push(ci); W(-learnt[1]).push(ci); assign(learnt[0], ci); }
      stats.propagations++;
      inc *= 1 / 0.95;
      if (stats.conflicts > maxC) return { result: "UNKNOWN", assignment: null, lemmas, stats, trace };
    } else {
      if (conflictsSinceRestart >= restartAt) {
        cancelUntil(0); conflictsSinceRestart = 0; restartNo++; restartAt = 100 * luby(restartNo); stats.restarts++;
        if (T) trace.push({ k: "restart" });
        continue;
      }
      let best = 0, bestA = -1;
      for (let v = 1; v <= n; v++) if (value[v] === 0 && activity[v] > bestA) { bestA = activity[v]; best = v; }
      if (best === 0) {
        if (T) trace.push({ k: "done", result: "SAT" });
        return { result: "SAT", assignment: value.slice(), lemmas, stats, trace };
      }
      trailLim.push(trail.length);
      stats.decisions++;
      const lit = -best; // phase: false first
      assign(lit, -1);
      if (T) trace.push({ k: "decide", lit, level: dl() });
    }
  }
}

/** Independent DRUP/RUP checker (naive propagation). */
export function checkRUP(cnf: CNF, lemmas: number[][]): { ok: boolean; checked: number; failedAt: number | null; work: number } {
  const db: number[][] = cnf.clauses.map((c) => [...c]);
  let work = 0;
  const rup = (lemma: number[]): boolean => {
    const val = new Int8Array(cnf.n + 1);
    for (const l of lemma) { const v = Math.abs(l); const want = l > 0 ? -1 : 1; if (val[v] === -want) return true; val[v] = want; }
    for (;;) {
      let changed = false;
      for (const c of db) {
        let unassigned = 0, last = 0, sat = false;
        for (const l of c) {
          work++;
          const x = l > 0 ? val[l] : -val[-l];
          if (x === 1) { sat = true; break; }
          if (x === 0) { unassigned++; last = l; }
        }
        if (sat) continue;
        if (unassigned === 0) return true; // conflict reached
        if (unassigned === 1) { const v = Math.abs(last); val[v] = last > 0 ? 1 : -1; changed = true; }
      }
      if (!changed) return false;
    }
  };
  for (let i = 0; i < lemmas.length; i++) {
    if (!rup(lemmas[i])) return { ok: false, checked: i, failedAt: i, work };
    db.push(lemmas[i]);
  }
  const endsEmpty = lemmas.length > 0 && lemmas[lemmas.length - 1].length === 0;
  return { ok: endsEmpty, checked: lemmas.length, failedAt: endsEmpty ? null : lemmas.length, work };
}

export function verifyWitness(cnf: CNF, a: Int8Array): { ok: boolean; work: number; firstFalse: number | null; satisfiedBy: number[] } {
  let work = 0;
  const satisfiedBy: number[] = [];
  for (let i = 0; i < cnf.clauses.length; i++) {
    let sat = false;
    for (const l of cnf.clauses[i]) {
      work++;
      if ((l > 0 ? a[l] : -a[-l]) === 1) { sat = true; satisfiedBy.push(l); break; }
    }
    if (!sat) return { ok: false, work, firstFalse: i, satisfiedBy };
  }
  return { ok: true, work, firstFalse: null, satisfiedBy };
}
