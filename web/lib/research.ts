"use client";
import { useEffect, useMemo, useState } from "react";
import type { RunBundle } from "@/lib/events/types";
import { useRecordedRuns, type EngineStatus } from "@/lib/engine";

export type Snapshot = RunBundle & {
  claims?: { id: string; problem_id: string; kind: string; title: string; statement: string; status: string; novelty: string }[];
  claim_history?: { statement_id: string; old_status: string | null; new_status: string; reason: string; event_seq: number; changed_at: string }[];
  reviews?: { id: string; target_id: string; reviewer_role: string; fresh_context: boolean; verdict: string; findings: { reasons?: string[]; argument?: string }; created_at: string }[];
  failed_approaches?: { id: string; problem_id: string; what: string; where_failed: string; failure_kind: string; retry_conditions: string }[];
};

/** Research data in one shape: the live snapshot when an engine is connected, else the recorded bundle. */
export function useResearchData(status: EngineStatus): { data: Snapshot | null; mode: "live" | "replay"; loading: boolean; error: string | null } {
  const recorded = useRecordedRuns();
  const [live, setLive] = useState<{ data: Snapshot | null; error: string | null }>({ data: null, error: null });
  const isLive = status.mode === "live";
  useEffect(() => {
    if (!isLive) return;
    let on = true;
    const load = () => fetch("/api/snapshot", { cache: "no-store" }).then((r) => r.json()).then((d) => on && setLive({ data: d, error: null })).catch((e) => on && setLive({ data: null, error: String(e) }));
    load();
    const id = setInterval(load, 10000);
    return () => { on = false; clearInterval(id); };
  }, [isLive]);
  return useMemo(() => {
    if (isLive) return { data: live.data, mode: "live" as const, loading: !live.data && !live.error, error: live.error };
    return { data: (recorded.bundles[0] as Snapshot) ?? null, mode: "replay" as const, loading: recorded.loading, error: recorded.error };
  }, [isLive, live, recorded]);
}

export const STATE_ORDER = ["running", "queued", "waiting", "blocked", "completed", "failed", "dead", "canceled", "paused"] as const;
export const STATE_LABEL: Record<string, string> = {
  running: "Running", queued: "Queued", waiting: "Waiting", blocked: "Blocked by a missing capability", completed: "Completed",
  failed: "Failed", dead: "Dead letter", canceled: "Canceled", paused: "Paused",
};

export const PRESETS = [
  { id: "survey", label: "Survey the current state of a precise subproblem", role: "SCOUT", preset: "arxiv-search" },
  { id: "reproduce", label: "Reproduce this theorem's worked example", role: "ARITHMETIC", preset: "bsd-invariants" },
  { id: "counterexample", label: "Search for a counterexample to this auxiliary claim", role: "ARITHMETIC", preset: "compute" },
  { id: "audit", label: "Audit the assumptions in this argument", role: "SKEPTIC", preset: "rule-review" },
  { id: "formalize", label: "Formalize this isolated lemma", role: "FORMALIZER", preset: "lean-check" },
  { id: "compare", label: "Compare two candidate strategies", role: "DIRECTOR", preset: "model" },
  { id: "refresh", label: "Refresh sources relevant to this proof node", role: "SCOUT", preset: "arxiv-search" },
];
