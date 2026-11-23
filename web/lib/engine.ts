"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchEvent, RunBundle } from "@/lib/events/types";
import { fetchJson } from "@/lib/hooks";

export interface EngineStatus {
  mode: "demo" | "live" | "disconnected" | "loading";
  db: boolean;
  provider: { configured: boolean; model: string | null };
  workers: { id: string; role_pool: string; last_heartbeat: string; stale: boolean }[];
  paused: { global: boolean; problems: string[] };
  queue: Record<string, number>;
  checkedAt: string | null;
  detail?: string;
}

const LOADING: EngineStatus = { mode: "loading", db: false, provider: { configured: false, model: null }, workers: [], paused: { global: false, problems: [] }, queue: {}, checkedAt: null };

export function useEngineStatus(pollMs = 15000): EngineStatus {
  const [s, setS] = useState<EngineStatus>(LOADING);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as EngineStatus;
        if (live) setS(j);
      } catch (e) {
        if (live) setS((p) => ({ ...p, mode: p.mode === "live" ? "disconnected" : "demo", checkedAt: new Date().toISOString(), detail: `Status endpoint unreachable (${(e as Error).message}).` }));
      }
    };
    tick();
    const id = window.setInterval(tick, pollMs);
    return () => { live = false; window.clearInterval(id); };
  }, [pollMs]);
  return s;
}

export interface RunsIndex { bundles: { file: string; campaign: string; problem_id: string; recorded_at: string; events: number; title: string }[] }

/** Recorded runs (replay) — real events persisted by the engine and exported. */
export function useRecordedRuns() {
  const [state, setState] = useState<{ bundles: RunBundle[]; loading: boolean; error: string | null }>({ bundles: [], loading: true, error: null });
  useEffect(() => {
    let live = true;
    fetchJson<RunsIndex>("/data/runs/index.json")
      .then((idx) => Promise.all(idx.bundles.map((b) => fetchJson<RunBundle>(`/data/runs/${b.file}`))))
      .then((bundles) => live && setState({ bundles, loading: false, error: null }))
      .catch((e: Error) => live && setState({ bundles: [], loading: false, error: e.message }));
    return () => { live = false; };
  }, []);
  return state;
}

/** Live event stream with replay after reconnection (SSE + Last-Event-ID). */
export function useLiveEvents(enabled: boolean) {
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const seen = useRef(new Set<number>());
  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource reconnects and sends Last-Event-ID
    es.addEventListener("research", (m) => {
      const ev = JSON.parse((m as MessageEvent).data) as ResearchEvent;
      if (seen.current.has(ev.seq)) return;
      seen.current.add(ev.seq);
      setEvents((p) => [...p, ev].sort((a, b) => a.seq - b.seq));
      setLastUpdate(new Date().toISOString());
    });
    return () => es.close();
  }, [enabled]);
  return { events, connected, lastUpdate };
}

export function useEventsFor(problem: string | null, status: EngineStatus) {
  const recorded = useRecordedRuns();
  const live = useLiveEvents(status.mode === "live");
  return useMemo(() => {
    const isLive = status.mode === "live";
    const source = isLive ? live.events : recorded.bundles.flatMap((b) => b.events);
    const events = problem ? source.filter((e) => e.problem_id === problem) : source;
    return {
      mode: isLive ? ("live" as const) : ("replay" as const),
      events,
      bundles: recorded.bundles,
      loading: !isLive && recorded.loading,
      error: recorded.error,
      connected: live.connected,
      lastUpdate: live.lastUpdate,
    };
  }, [problem, status.mode, live.events, live.connected, live.lastUpdate, recorded]);
}
