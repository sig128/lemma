"use client";
import { useMemo, useState } from "react";
import { Icon, StatusGlyph } from "@/components/glyphs";
import { PRESETS, STATE_LABEL, STATE_ORDER, type Snapshot } from "@/lib/research";
import type { EngineStatus } from "@/lib/engine";
import type { TaskRecord } from "@/lib/events/types";
import { PROBLEM_BY_ID, PROBLEMS, type ProblemId } from "@/lib/registry/problems";
import { useUrlState } from "@/lib/hooks";
import { roleName } from "@/lib/format";

const ROLES = [
  { name: "DIRECTOR", model: true, does: "Plans bounded tasks by expected information value per cost" },
  { name: "SCOUT", model: true, does: "Literature discovery with exact metadata" },
  { name: "LIBRARIAN", model: true, does: "Extracts statements with anchors" },
  { name: "ARITHMETIC", model: false, does: "PARI/GP computations in the sandbox" },
  { name: "SYNTHESIST", model: true, does: "Candidate lemmas and strategies" },
  { name: "SKEPTIC", model: true, does: "Independent challenge; rule checks run without a model" },
  { name: "FORMALIZER", model: true, does: "Lean statements and proofs" },
  { name: "AUDITOR", model: false, does: "Fresh-process re-runs and Lean re-checks" },
  { name: "CURATOR", model: false, does: "Summaries, failures, reports" },
];

export function ResearchBoard({ data, mode, status, problem, onToast }: { data: Snapshot | null; mode: "live" | "replay"; status: EngineStatus; problem: ProblemId | null; onToast: (t: string) => void }) {
  const url = useUrlState();
  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => !problem || t.problem_id === problem), [data, problem]);
  const evs = useMemo(() => (data?.events ?? []).filter((e) => !problem || e.problem_id === problem), [data, problem]);
  const [sel, setSel] = useState<string | null>(null);
  const task = tasks.find((t) => t.id === sel) ?? null;
  const presetFromUrl = url.get("preset");
  const [composer, setComposer] = useState<string | null>(presetFromUrl);
  const groups = STATE_ORDER.map((s) => ({ s, items: tasks.filter((t) => t.state === s) })).filter((g) => g.items.length || ["running", "queued", "blocked", "completed"].includes(g.s));
  const workers = useMemo(() => {
    if (mode === "live") return status.workers.map((w) => ({ id: w.id, last: w.last_heartbeat, stale: w.stale }));
    const m = new Map<string, string>();
    for (const e of data?.events ?? []) if (e.actor.worker_id) m.set(e.actor.worker_id, e.ts);
    return [...m.entries()].map(([id, last]) => ({ id, last, stale: true }));
  }, [mode, status.workers, data]);
  const lastByRole = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of evs) m.set(e.actor.role, e.summary);
    return m;
  }, [evs]);
  const live = mode === "live";
  const controlNote = live ? "" : "Controls act on a connected engine. This deployment replays a recorded run, so nothing is running and the buttons explain instead of acting.";
  const control = async (action: string, scope?: string) => {
    if (!live) { onToast("No engine connected: pause, resume and cancel act on live workers. See Settings to connect one."); return; }
    const token = window.prompt("Owner token (NOETHER_ADMIN_TOKEN)") ?? "";
    const r = await fetch("/api/control", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ action, scope }) });
    onToast(r.ok ? `${action} sent` : `Refused: ${(await r.json().catch(() => ({ error: r.status }))).error}`);
  };
  return (
    <div style={{ display: "grid", gap: 28 }}>
      <section>
        <div className="field-row" style={{ flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div className="mark" style={{ fontSize: 14 }}><span className="engine-dot" data-state={live ? "live" : "replay"} />{live ? (status.paused.global ? "Engine live, globally paused" : "Engine live") : "Recorded run, replay only"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => control(status.paused.global ? "resume" : "pause", "global")}><Icon name={status.paused.global ? "play" : "pause"} />{status.paused.global ? "Resume all" : "Pause all"}</button>
            {problem && <button className="btn" onClick={() => control(status.paused.problems.includes(problem) ? "resume" : "pause", `problem:${problem}`)}>{status.paused.problems.includes(problem) ? `Resume ${PROBLEM_BY_ID[problem].short}` : `Pause ${PROBLEM_BY_ID[problem].short}`}</button>}
          </div>
        </div>
        {controlNote && <p className="note" style={{ margin: "8px 0 0" }}>{controlNote}</p>}
      </section>

      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Campaign board</h3>
        <div className="board">
          {groups.map((g) => (
            <div className="board-col" key={g.s}>
              <h3><span>{STATE_LABEL[g.s]}</span><span className="mono">{g.items.length}</span></h3>
              {g.items.length === 0 && <p className="note" style={{ margin: 0 }}>{EMPTY_COL[g.s] ?? "No tasks"}</p>}
              {g.items.map((t) => (
                <button className="task" key={t.id} aria-pressed={sel === t.id} onClick={() => setSel(sel === t.id ? null : t.id)}>
                  <span className="task-title">{t.objective}</span>
                  <span className="task-meta"><span className="mono">{t.id}</span><span>{roleName(t.role)}</span>{!problem && <span>{PROBLEM_BY_ID[t.problem_id]?.short}</span>}{t.attempts > 1 && <span>attempt {t.attempts}</span>}</span>
                  {t.state === "blocked" && t.blocked_reason && <BlockedReason text={t.blocked_reason} />}
                </button>
              ))}
            </div>
          ))}
        </div>
        {task && <TaskDetail t={task} events={(data?.events ?? []).filter((e) => e.task_id === task.id)} />}
      </section>

      <div className="grid-2">
        <section>
          <h3 className="h-sec" style={{ marginTop: 0 }}>Agent roster</h3>
          <table className="data">
            <thead><tr><th>Role</th><th>Needs a model</th><th>Availability</th></tr></thead>
            <tbody>
              {ROLES.map((r) => {
                const avail = r.model ? (status.provider.configured ? "Available" : "Blocked: provider unconfigured") : "Available (deterministic)";
                return (
                  <tr key={r.name}>
                    <td><strong style={{ color: "var(--text)", fontWeight: 550 }}>{roleName(r.name)}</strong><div className="note">{r.does}</div>{lastByRole.get(r.name) && <div className="note">Last: {lastByRole.get(r.name)!.slice(0, 110)}</div>}</td>
                    <td>{r.model ? "yes" : "no"}</td>
                    <td><span className="mark"><StatusGlyph status={avail.startsWith("Blocked") ? "blocked" : "literature-theorem"} />{avail}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="h-sec" style={{ marginTop: 0 }}>Workers and queue health</h3>
          <table className="data">
            <thead><tr><th>Worker</th><th>Last heartbeat</th><th>State</th></tr></thead>
            <tbody>
              {workers.map((w) => <tr key={w.id}><td className="mono">{w.id}</td><td className="mono">{w.last.replace("T", " ").slice(0, 19)}</td><td>{live ? (w.stale ? "Stale: no heartbeat for 90 s" : "Healthy") : "Recorded (not running now)"}</td></tr>)}
              {workers.length === 0 && <tr><td colSpan={3} className="note">No worker has reported.</td></tr>}
            </tbody>
          </table>
          <dl className="kv" style={{ marginTop: 12 }}>
            {STATE_ORDER.map((s) => { const n = tasks.filter((t) => t.state === s).length; return n ? [<dt key={`${s}-dt`}>{STATE_LABEL[s]}</dt>, <dd key={`${s}-dd`} className="mono">{n}</dd>] : null; })}
            <dt>Concurrency</dt><dd>2 model tasks by default (NOETHER_CONCURRENCY)</dd>
            <dt>Budget</dt><dd>{live ? "Daily ledger enforced before dispatch (see Settings)" : "Daily $25 and 4M tokens by default; enforced by atomic reservation before dispatch"}</dd>
          </dl>
        </section>
      </div>

      <section>
        <h3 className="h-sec" style={{ marginTop: 0 }}>Start a bounded task</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((p) => <button key={p.id} className="btn" aria-pressed={composer === p.label} onClick={() => setComposer(composer === p.label ? null : p.label)}>{p.label}</button>)}
        </div>
        {composer && <Composer preset={PRESETS.find((p) => p.label === composer)!} problem={problem ?? "bsd"} live={live} onToast={onToast} />}
      </section>
    </div>
  );
}

function TaskDetail({ t, events }: { t: TaskRecord & { depends_on?: string[] }; events: Snapshot["events"] }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="grid-2">
        <div>
          <p className="insp-title" style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>{t.objective}</p>
          <dl className="kv">
            <dt>Task</dt><dd className="mono">{t.id}</dd>
            <dt>Role</dt><dd>{roleName(t.role)}</dd>
            {t.preset && <><dt>Preset</dt><dd>{t.preset}</dd></>}
            <dt>Question</dt><dd>{t.question}</dd>
            <dt>Limits</dt><dd className="mono">{t.limits.seconds} s, {t.limits.tokens} tokens, ${t.limits.usd}</dd>
            <dt>Success</dt><dd>{t.success_criteria}</dd>
            <dt>Failure</dt><dd>{t.failure_criteria}</dd>
            {t.depends_on && t.depends_on.length > 0 && <><dt>Depends on</dt><dd className="mono">{t.depends_on.join(", ")}</dd></>}
            <dt>State</dt><dd>{t.state}{t.attempts > 1 ? `, ${t.attempts} attempts` : ""}</dd>
            {t.result_summary && <><dt>Result</dt><dd>{t.result_summary}</dd></>}
          </dl>
        </div>
        <div>
          <div className="insp-h">Events for this task</div>
          <ul className="list">
            {events.map((e) => <li key={e.seq}><span className="mono muted" style={{ fontSize: 11 }}>#{e.seq}</span><span><span className="mono muted">{e.type}</span> {e.summary}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Composer({ preset, problem, live, onToast }: { preset: (typeof PRESETS)[number]; problem: string; live: boolean; onToast: (t: string) => void }) {
  const [spec, setSpec] = useState({ objective: preset.label, question: "", seconds: 600, tokens: preset.role === "ARITHMETIC" || preset.role === "AUDITOR" ? 0 : 30000, success: "", failure: "" });
  const body = { problem_id: problem, role: preset.role, preset: preset.preset, objective: spec.objective, question: spec.question, limits: { seconds: spec.seconds, tokens: spec.tokens, usd: +(spec.tokens / 1e6 * 20).toFixed(2) }, success_criteria: spec.success, failure_criteria: spec.failure };
  const valid = spec.question.trim() && spec.success.trim() && spec.failure.trim();
  const submit = async () => {
    if (!live) { onToast("No engine connected: the task specification below is valid but was not queued."); return; }
    const token = window.prompt("Owner token (NOETHER_ADMIN_TOKEN)") ?? "";
    const r = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    onToast(r.ok ? "Task queued" : `Refused: ${(await r.json().catch(() => ({ error: r.status }))).error}`);
  };
  return (
    <div className="panel" style={{ marginTop: 14, maxWidth: 760, display: "grid", gap: 10 }}>
      <p className="note" style={{ margin: 0 }}>Every task is bounded: an exact question, limits, and explicit success and failure criteria. Role: {roleName(preset.role)}. Handler: {preset.preset}. Problem: {PROBLEMS.find((p) => p.id === problem)?.short}.</p>
      <label className="field">Objective<input type="text" value={spec.objective} onChange={(e) => setSpec({ ...spec, objective: e.target.value })} /></label>
      <label className="field">Exact question<input type="text" value={spec.question} placeholder="e.g. Is L''(E,1) forced to vanish for 234446a1 by any published identity?" onChange={(e) => setSpec({ ...spec, question: e.target.value })} /></label>
      <div className="grid-2" style={{ gap: 10 }}>
        <label className="field">Time limit (s)<input type="number" min={10} max={21600} value={spec.seconds} onChange={(e) => setSpec({ ...spec, seconds: +e.target.value })} /></label>
        <label className="field">Token limit<input type="number" min={0} max={400000} value={spec.tokens} onChange={(e) => setSpec({ ...spec, tokens: +e.target.value })} /></label>
      </div>
      <label className="field">Success criteria<input type="text" value={spec.success} onChange={(e) => setSpec({ ...spec, success: e.target.value })} /></label>
      <label className="field">Failure criteria<input type="text" value={spec.failure} onChange={(e) => setSpec({ ...spec, failure: e.target.value })} /></label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-accent" disabled={!valid} onClick={submit}>{live ? "Queue task" : "Validate specification"}</button>
        {!valid && <span className="note">Fill in the question and both criteria.</span>}
      </div>
      <details className="alt"><summary>Specification JSON</summary><pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(body, null, 2)}</pre></details>
    </div>
  );
}

/* The engine records the full reason, including raw transport errors and the queries kept for
   retry. The card shows the first clause; the rest is one click away. */
function BlockedReason({ text }: { text: string }) {
  const cut = text.search(/ \(|; |: \[|\. /);
  const head = cut > 24 ? text.slice(0, cut) : text;
  if (head.length >= text.length - 2) return <span className="note">{text}</span>;
  return (
    <details className="reason" onClick={(e) => e.stopPropagation()}>
      <summary className="note">{head}.</summary>
      <span className="note mono" style={{ wordBreak: "break-word" }}>{text}</span>
    </details>
  );
}

const EMPTY_COL: Record<string, string> = {
  running: "Nothing is running.", queued: "The queue is empty.", blocked: "Nothing is blocked.", completed: "No task has finished yet.",
  failed: "No failures.", dead: "No dead letters.", waiting: "Nothing is waiting.", canceled: "Nothing canceled.", paused: "Nothing paused.",
};
