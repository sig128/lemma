import "server-only";
import { Pool } from "pg";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";

let pool: Pool | null = null;
export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 4_000 });
    pool.on("error", () => { /* surfaced via status checks */ });
  }
  return pool;
}

export const STALE_SECONDS = 90;

export async function engineStatus() {
  const base = {
    provider: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: process.env.ANTHROPIC_MODEL ?? null },
    checkedAt: new Date().toISOString(),
  };
  const p = getPool();
  if (!p) {
    return { ...base, mode: "demo" as const, db: false, workers: [], paused: { global: false, problems: [] }, queue: {}, detail: "No DATABASE_URL configured: demonstration mode with recorded runs. Live research is unconfigured." };
  }
  try {
    const [w, c, q] = await Promise.all([
      p.query(`select id, role_pool, last_heartbeat, extract(epoch from (now() - last_heartbeat)) as age from worker order by last_heartbeat desc limit 20`),
      p.query(`select scope, paused from control_flag`),
      p.query(`select state, count(*)::int as n from research_task group by state`),
    ]);
    const paused = { global: c.rows.some((r) => r.scope === "global" && r.paused), problems: c.rows.filter((r) => r.scope.startsWith("problem:") && r.paused).map((r) => r.scope.slice(8)) };
    return {
      ...base, mode: "live" as const, db: true,
      workers: w.rows.map((r) => ({ id: r.id, role_pool: r.role_pool, last_heartbeat: new Date(r.last_heartbeat).toISOString(), stale: Number(r.age) > STALE_SECONDS })),
      paused, queue: Object.fromEntries(q.rows.map((r) => [r.state, r.n])),
    };
  } catch (e) {
    return { ...base, mode: "disconnected" as const, db: false, workers: [], paused: { global: false, problems: [] }, queue: {}, detail: `Database configured but unreachable: ${(e as Error).message}` };
  }
}

export async function eventsAfter(after: number, problem: string | null, limit = 500) {
  const p = getPool();
  if (!p) return null;
  const r = await p.query(
    `select seq, event_id, ts, schema_version, type, project_id, problem_id, campaign_id, task_id, run_id, actor, artifacts, summary, provenance, verification, view
       from research_event where seq > $1 and ($2::text is null or problem_id = $2) order by seq asc limit $3`,
    [after, problem, limit],
  );
  return r.rows.map((x) => ({ ...x, seq: Number(x.seq), ts: new Date(x.ts).toISOString() }));
}

export function authorized(req: Request): boolean {
  const token = process.env.NOETHER_ADMIN_TOKEN;
  if (!token) return false;
  const h = req.headers.get("authorization") ?? "";
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return given.length > 0 && timingSafeEqual(a, b);
}

const PROBLEMS = new Set(["bsd", "riemann", "pnp", "ns", "ym", "hodge"]);

export async function setPaused(scope: string, paused: boolean, by: string) {
  const p = getPool();
  if (!p) throw new Error("Engine not configured");
  if (scope !== "global" && !(scope.startsWith("problem:") && PROBLEMS.has(scope.slice(8)))) throw new Error("Invalid scope");
  await p.query(`insert into control_flag(scope, paused, updated_by, updated_at) values ($1,$2,$3,now())
                 on conflict (scope) do update set paused = excluded.paused, updated_by = excluded.updated_by, updated_at = now()`, [scope, paused, by]);
  await p.query(`insert into research_event(event_id, type, problem_id, actor, summary, provenance) values ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), paused ? "run.paused" : "run.resumed", scope === "global" ? "bsd" : scope.slice(8), { role: "OWNER", worker_id: null }, `${paused ? "Paused" : "Resumed"} ${scope}`, { via: "web control", scope }]);
}

export async function requestCancel(taskId: string, by: string) {
  const p = getPool();
  if (!p) throw new Error("Engine not configured");
  const r = await p.query(`update research_task set cancel_requested = true, state = case when state in ('queued','waiting','paused','blocked') then 'canceled' else state end, updated_at = now()
                           where id = $1 and state not in ('completed','failed','canceled','dead') returning problem_id, state`, [taskId]);
  if (!r.rowCount) throw new Error("Task not found or already finished");
  await p.query(`insert into research_event(event_id, type, problem_id, task_id, actor, summary, provenance) values ($1,'task.canceled',$2,$3,$4,$5,$6)`,
    [randomUUID(), r.rows[0].problem_id, taskId, { role: "OWNER", worker_id: null }, `Cancellation requested for ${taskId} (${r.rows[0].state === "canceled" ? "not yet started" : "running; worker will stop at its next heartbeat"})`, { by }]);
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

/** Same shape as the exported recorded bundle, read live from the database. */
export async function snapshot() {
  const p = getPool();
  if (!p) return null;
  const [t, e, a, v, c, h, r] = await Promise.all([
    p.query(`select * from research_task order by id`),
    p.query(`select * from research_event order by seq desc limit 2000`),
    p.query(`select id, sha256, kind, title, task_id, exactness, conditional_flags, reproducer, created_at, bytes from artifact order by created_at desc limit 500`),
    p.query(`select * from verification_result order by checked_at desc limit 300`),
    p.query(`select id, problem_id, kind, title, statement, status, novelty from mathematical_statement order by id`),
    p.query(`select statement_id, old_status, new_status, reason, event_seq, changed_at from statement_label_history order by id`),
    p.query(`select data from artifact where kind = 'report' order by created_at desc limit 1`),
  ]);
  return {
    bundle_version: 1, kind: "live-snapshot", recorded_at: new Date().toISOString(), environment: "live engine",
    campaign: { id: "live", title: "Live campaigns", problem_id: "bsd" },
    tasks: t.rows.map((x) => ({ ...x, started_at: iso(x.started_at), finished_at: iso(x.finished_at), limits: { seconds: x.limits.seconds, tokens: x.limits.tokens ?? 0, usd: x.limits.usd ?? 0 } })),
    events: e.rows.reverse().map((x) => ({ ...x, seq: Number(x.seq), ts: iso(x.ts) })),
    artifacts: a.rows.map((x) => ({ ...x, created_at: iso(x.created_at), exactness: x.exactness ?? "text" })),
    verification: v.rows.map((x) => ({ ...x, statement_hash: x.statement_sha256, checked_at: iso(x.checked_at), log_excerpt: "" })),
    claims: c.rows,
    claim_history: h.rows.map((x) => ({ ...x, changed_at: iso(x.changed_at) })),
    report: r.rows[0]?.data ?? null,
  };
}

const ROLES = new Set(["DIRECTOR", "SCOUT", "LIBRARIAN", "ARITHMETIC", "SYNTHESIST", "SKEPTIC", "FORMALIZER", "AUDITOR", "CURATOR"]);
const PRESETS = new Set(["arxiv-search", "bsd-invariants", "compute", "rule-review", "lean-check", "model", "audit-rerun", "precision-escalation", "twist-family", "novelty-check", "report"]);

export async function createTask(b: Record<string, unknown>, by: string) {
  const p = getPool();
  if (!p) throw new Error("Engine not configured");
  const str = (k: string, max = 600) => { const v = b[k]; if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`invalid ${k}`); return v.trim(); };
  const problem = str("problem_id", 20), role = str("role", 20), preset = str("preset", 40);
  if (!PROBLEMS.has(problem) || !ROLES.has(role) || !PRESETS.has(preset)) throw new Error("unknown problem, role or preset");
  const limits = b.limits as { seconds?: number; tokens?: number; usd?: number } | undefined;
  if (!limits || !(Number(limits.seconds) > 0 && Number(limits.seconds) <= 21600) || !(Number(limits.tokens) >= 0 && Number(limits.tokens) <= 400000)) throw new Error("invalid limits");
  const id = `U-${randomUUID().slice(0, 8)}`;
  await p.query(
    `insert into research_task(id, problem_id, role, preset, objective, question, inputs, limits, success_criteria, failure_criteria, idempotency_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$1)`,
    [id, problem, role, preset, str("objective"), str("question", 2000), b.inputs ?? {}, { seconds: Number(limits.seconds), tokens: Number(limits.tokens), usd: Number(limits.usd ?? 0) }, str("success_criteria"), str("failure_criteria")],
  );
  await p.query(`insert into research_event(event_id, type, problem_id, task_id, actor, summary, provenance) values ($1,'task.queued',$2,$3,$4,$5,$6)`,
    [randomUUID(), problem, id, { role: "OWNER", worker_id: null }, `Queued by owner: ${str("objective")}`, { by }]);
  return id;
}
