import type { ProblemId } from "@/lib/registry/problems";

/** Persisted, typed research events (schema version 1). The backend is the
 * source of truth; the UI only renders what it receives or replays. */
export const EVENT_TYPES = [
  "source.discovered", "source.ingested", "statement.extracted",
  "task.queued", "task.started", "task.checkpointed", "task.completed", "task.failed", "task.canceled", "task.retried",
  "experiment.started", "experiment.completed",
  "claim.proposed", "claim.refuted", "claim.promoted",
  "proof.check.started", "proof.check.failed", "proof.check.passed",
  "dependency.blocked", "capability.unavailable", "agent.waiting",
  "run.paused", "run.resumed", "budget.reserved", "budget.exhausted",
  "worker.recovered", "report.published",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface ResearchEvent {
  seq: number;
  event_id: string;
  ts: string;
  schema_version: 1;
  type: EventType;
  project_id: string;
  problem_id: ProblemId;
  campaign_id: string | null;
  task_id: string | null;
  run_id: string | null;
  actor: { role: string; worker_id: string | null };
  artifacts: { id: string; sha256: string }[];
  summary: string;
  provenance: Record<string, unknown>;
  verification?: { status: string; detail?: string } | null;
  view?: { curve?: string; view?: string; object?: string } | null;
}

export interface RunBundle {
  bundle_version: 1;
  kind: "recorded-run";
  recorded_at: string;
  environment: string;
  campaign: { id: string; title: string; problem_id: ProblemId };
  tasks: TaskRecord[];
  events: ResearchEvent[];
  artifacts: ArtifactRecord[];
  report?: CampaignReport;
  verification?: VerificationRecord[];
}

export interface TaskRecord {
  id: string;
  campaign_id: string;
  problem_id: ProblemId;
  role: string;
  preset: string;
  objective: string;
  question: string;
  depends_on?: string[];
  state: "queued" | "running" | "waiting" | "paused" | "failed" | "canceled" | "completed" | "blocked" | "dead";
  blocked_reason?: string | null;
  attempts: number;
  limits: { seconds: number; tokens: number; usd: number };
  success_criteria: string;
  failure_criteria: string;
  expected_artifacts: string[];
  started_at?: string | null;
  finished_at?: string | null;
  result_summary?: string | null;
}

export interface ArtifactRecord {
  id: string;
  sha256: string;
  kind: string;
  title: string;
  task_id: string | null;
  exactness: "exact" | "numerical" | "conditional" | "mixed" | "text";
  created_at: string;
  reproducer?: string;
  summary?: string;
  data?: unknown;
}

export interface VerificationRecord {
  id: string;
  statement_id: string;
  statement_hash: string;
  kind: "lean" | "computation";
  result: "passed" | "failed" | "rejected" | "flagged";
  scope: string;
  toolchain: Record<string, string>;
  axioms?: string[];
  findings: string[];
  reproducer: string;
  log_excerpt: string;
  reviewer: string;
  checked_at: string;
}

export interface CampaignReport {
  title: string;
  changed: { evidence: string[]; rejected: string[]; verified: string[]; remaining_gap: string; next_task: string };
  steps: { n: number; title: string; outcome: string; status: string }[];
}
