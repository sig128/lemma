"use client";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, StatusGlyph } from "@/components/glyphs";
import type { ResearchEvent } from "@/lib/events/types";

/* Instruments lay out below the stage header. The header's height depends on the title, the
   equation and the viewport, so it is measured rather than assumed. */
const StageInsetContext = createContext(150);
export const useStageInset = () => useContext(StageInsetContext);

function useMeasuredInset(stage: React.RefObject<HTMLElement | null>) {
  const [inset, setInset] = useState(150);
  const observed = useRef<HTMLElement | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    const st = stage.current;
    if (!st) return;
    const head = st.querySelector(".stage-head") as HTMLElement | null;
    if (head === observed.current) return;
    ro.current?.disconnect();
    observed.current = head;
    if (!head) return;
    const measure = () => {
      const v = Math.ceil(head.getBoundingClientRect().bottom - st.getBoundingClientRect().top) + 18;
      setInset((old) => (Math.abs(old - v) > 1 ? v : old));
    };
    measure();
    ro.current = new ResizeObserver(measure);
    ro.current.observe(head);
    ro.current.observe(st);
  });
  // reset on unmount (and on React's development double-mount) so the next mount re-attaches
  useEffect(() => () => { ro.current?.disconnect(); ro.current = null; observed.current = null; }, []);
  return inset;
}

export function WorkspaceFrame({ problem, stage, inspector, dock }: { problem: string; stage: React.ReactNode; inspector: React.ReactNode; dock: React.ReactNode }) {
  const stageRef = useRef<HTMLElement>(null);
  const inset = useMeasuredInset(stageRef);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const ro = new ResizeObserver(() => setNarrow(st.clientWidth < 640));
    ro.observe(st);
    return () => ro.disconnect();
  }, []);
  const [w, setW] = useState(384);
  useEffect(() => {
    try { const v = Number(localStorage.getItem("noether:inspector-w")); if (v >= 280 && v <= 640) setW(v); } catch { /* ignore */ }
  }, []);
  const save = useCallback((v: number) => {
    const c = Math.max(280, Math.min(640, v));
    setW(c);
    try { localStorage.setItem("noether:inspector-w", String(c)); } catch { /* ignore */ }
  }, []);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const onDown = (e: React.PointerEvent) => { drag.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !host.current) return;
    const r = host.current.getBoundingClientRect();
    save(r.right - e.clientX);
  };
  const onUp = () => { drag.current = false; };
  return (
    <div ref={host} className="workspace" id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${problem}`} style={{ ["--inspector-w" as string]: `${w}px` }}>
      <section ref={stageRef} className="stage" aria-label="Instrument" data-narrow={narrow ? "true" : undefined} style={{ gridColumn: 1, gridRow: 1, ["--inset" as string]: `${inset}px` }}>
        <StageInsetContext.Provider value={inset}>{stage}</StageInsetContext.Provider>
      </section>
      <button
        className="splitter" style={{ gridColumn: 2 }} role="separator" aria-orientation="vertical" aria-valuemin={280} aria-valuemax={640} aria-valuenow={w}
        aria-label="Resize inspector" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") save(w + 24); if (e.key === "ArrowRight") save(w - 24); }}
      />
      <aside className="inspector" aria-label="Research inspector">{inspector}</aside>
      <div className="dock">{dock}</div>
    </div>
  );
}

export function eventGlyph(type: string) {
  if (type.startsWith("source.") || type === "statement.extracted") return <svg viewBox="0 0 12 12" aria-hidden><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (type === "experiment.completed" || type === "experiment.started") return <svg viewBox="0 0 12 12" aria-hidden><path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill={type === "experiment.completed" ? "var(--cobalt)" : "none"} stroke="var(--cobalt)" strokeWidth="1.3" /></svg>;
  if (type === "claim.refuted" || type === "proof.check.failed" || type === "task.failed") return <StatusGlyph status="refuted" />;
  if (type === "proof.check.passed") return <StatusGlyph status="formally-checked" />;
  if (type === "claim.promoted") return <StatusGlyph status="verified-instance" />;
  if (type === "claim.proposed") return <StatusGlyph status="candidate" />;
  if (type === "dependency.blocked" || type === "capability.unavailable" || type === "agent.waiting") return <StatusGlyph status="blocked" />;
  if (type === "report.published") return <StatusGlyph status="open" />;
  if (type.startsWith("run.") || type.startsWith("budget.") || type.startsWith("worker.")) return <svg viewBox="0 0 12 12" aria-hidden><path d="M2 6h8" stroke="var(--amber)" strokeWidth="1.6" /></svg>;
  return <svg viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="3" fill="currentColor" /></svg>;
}

export function TimelineDock({
  events, mode, loading, error, selected, onSelect, recordedAt, lastUpdate,
}: {
  events: ResearchEvent[]; mode: "live" | "replay"; loading: boolean; error: string | null;
  selected: number | null; onSelect: (e: ResearchEvent | null) => void; recordedAt?: string | null; lastUpdate?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const idx = selected === null ? -1 : events.findIndex((e) => e.seq === selected);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const i = selected === null ? -1 : events.findIndex((e) => e.seq === selected);
      if (i + 1 >= events.length) { setPlaying(false); return; }
      onSelect(events[i + 1]);
    }, 1100);
    return () => window.clearInterval(id);
  }, [playing, selected, events, onSelect]);

  if (loading) return <div className="dock-inner"><div className="dock-empty"><span className="skeleton" style={{ width: 280, height: 12 }} /></div></div>;
  if (error || events.length === 0) {
    return (
      <div className="dock-inner">
        <div className="dock-empty">
          <StatusGlyph status="candidate" />
          <span>{error ? `Recorded runs could not be loaded (${error}).` : "No research events recorded for this problem yet."} The timeline shows only persisted events; nothing is simulated.</span>
        </div>
      </div>
    );
  }
  const gap = 34;
  const width = Math.max(events.length * gap + 40, 300);
  const sel = idx >= 0 ? events[idx] : null;
  const fmtTime = (ts: string) => ts.replace("T", " ").slice(0, 19) + " UTC";
  const t0 = events.length ? Date.parse(events[0].ts) : 0;
  const elapsed = (ts: string) => {
    const d = (Date.parse(ts) - t0) / 1000;
    if (d < 60) return `+${d.toFixed(d < 10 ? 2 : 1)} s`;
    if (d < 3600) return `+${Math.floor(d / 60)} min ${Math.round(d % 60)} s`;
    return `+${(d / 3600).toFixed(1)} h`;
  };
  return (
    <div className="dock-inner">
      <div className="dock-bar">
        <span className="mode">
          <span className="engine-dot" data-state={mode === "live" ? "live" : "replay"} aria-hidden />
          {mode === "live" ? <span>Live{lastUpdate && <span className="when">, last event {fmtTime(lastUpdate)}</span>}</span> : <span>Replay of a recorded run{recordedAt && <span className="when">, {fmtTime(recordedAt)}</span>}</span>}
        </span>
        <span className="muted" style={{ whiteSpace: "nowrap" }}>{events.length} events</span>
        {mode === "replay" && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            <button className="btn btn-ghost btn-icon" aria-label="Previous event" onClick={() => onSelect(events[Math.max(0, idx - 1)])}><Icon name="back" /></button>
            <button className="btn btn-ghost btn-icon" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => { if (idx === events.length - 1) onSelect(events[0]); setPlaying((p) => !p); }}><Icon name={playing ? "pause" : "play"} /></button>
            <button className="btn btn-ghost btn-icon" aria-label="Next event" onClick={() => onSelect(events[Math.min(events.length - 1, idx + 1)])}><Icon name="step" /></button>
          </span>
        )}
        {sel && <span className="dim" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span className="mono muted">#{sel.seq} {sel.type}</span> {sel.summary}</span>}
      </div>
      <div className="dock-track" ref={track} style={{ overflowX: "auto", overflowY: "hidden" }}
        tabIndex={0} aria-label="Research timeline. Use left and right arrow keys to move between events."
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); onSelect(events[Math.min(events.length - 1, idx + 1)]); }
          if (e.key === "ArrowLeft") { e.preventDefault(); onSelect(events[Math.max(0, idx - 1)]); }
        }}>
        <div style={{ position: "relative", width, height: "100%" }}>
          <div className="dock-axis" />
          {events.map((ev, i) => {
            const left = 20 + i * gap;
            const last = i === events.length - 1;
            const showTick = i === 0 || last || (i % 8 === 0 && events.length - i > 4);
            return (
              <div key={ev.seq}>
                <button className="dock-evt" style={{ left }} aria-pressed={ev.seq === selected} aria-label={`${ev.type}: ${ev.summary}`}
                  title={`${fmtTime(ev.ts)}: ${ev.summary}`} onClick={() => onSelect(ev.seq === selected ? null : ev)}>
                  {eventGlyph(ev.type)}
                </button>
                {showTick && <span className="dock-tick" data-edge={i === 0 ? "start" : last ? "end" : undefined} style={{ left }}>{i === 0 ? `${ev.ts.slice(11, 19)} UTC` : elapsed(ev.ts)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** For workspaces that compute layout above the provider: reports the measured header inset. */
export function InsetProbe({ onInset }: { onInset: (v: number) => void }) {
  const v = useStageInset();
  useEffect(() => { onInset(v); }, [v, onInset]);
  return null;
}
