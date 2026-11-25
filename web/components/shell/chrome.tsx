"use client";
import { useEffect, useRef } from "react";
import { Aperture, Icon, ProblemGlyph, StatusGlyph } from "@/components/glyphs";
import { PROBLEMS } from "@/lib/registry/problems";
import type { EngineStatus } from "@/lib/engine";

export function TopBar({ status, onSearch, onEngine }: { status: EngineStatus; onSearch: () => void; onEngine: () => void }) {
  const state = status.mode === "live" ? "live" : status.mode === "disconnected" ? "disconnected" : "replay";
  const text =
    status.mode === "live"
      ? status.paused.global ? "Engine paused" : `Engine live, ${status.workers.filter((w) => !w.stale).length} worker${status.workers.length === 1 ? "" : "s"}`
      : status.mode === "disconnected" ? "Engine disconnected" : status.mode === "loading" ? "Checking engine" : "Demonstration: recorded runs";
  return (
    <header className="topbar">
      <a className="wordmark" href="/" aria-label="Lemma, the mathematics observatory">
        <Aperture className="wordmark-glyph" />
        <span className="wordmark-name">LEMMA</span>
        <span className="wordmark-rule" aria-hidden />
        <span className="wordmark-desc">The Mathematics Observatory</span>
      </a>
      <button className="search-trigger" onClick={onSearch} aria-label="Search problems, objects and sources, or run a command" aria-keyshortcuts="Meta+K Control+K">
        <Icon name="search" className="" />
        <span>Search<span className="long"> problems, objects, sources</span></span>
        <kbd>⌘K</kbd>
      </button>
      <div className="topbar-status">
        <button className="engine-chip" onClick={onEngine} title={status.detail ?? "Engine status and configuration"}>
          <span className="engine-dot" data-state={state} aria-hidden />
          <span className="engine-text">{text}</span>
          <span className="sr-only">Open engine settings</span>
        </button>
      </div>
    </header>
  );
}

const RAIL = [
  { id: "atlas", label: "Atlas", icon: "atlas" },
  { id: "research", label: "Research", icon: "research" },
  { id: "sources", label: "Sources", icon: "sources" },
  { id: "proofs", label: "Proofs", icon: "proofs" },
  { id: "runs", label: "Runs", icon: "runs" },
];

export function Rail({ section, onSelect }: { section: string; onSelect: (s: string) => void }) {
  return (
    <nav className="rail" aria-label="Sections">
      {RAIL.map((r) => (
        <button key={r.id} className="rail-item" aria-current={section === r.id ? "page" : undefined} onClick={() => onSelect(r.id)}>
          <Icon name={r.icon} />
          <span>{r.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <button className="rail-item" aria-current={section === "settings" ? "page" : undefined} onClick={() => onSelect("settings")}>
        <Icon name="settings" />
        <span>Settings</span>
      </button>
    </nav>
  );
}

export function ProblemTabs({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const ids = [...PROBLEMS.map((p) => p.id), "archive"];
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = ids.length - 1;
    else return;
    e.preventDefault();
    refs.current[n]?.focus();
    onSelect(ids[n]);
  };
  useEffect(() => {
    const i = ids.indexOf(active);
    refs.current[i]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ptabs" role="tablist" aria-label="Problems">
      {PROBLEMS.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          id={`tab-${p.id}`}
          aria-selected={active === p.id}
          aria-controls="workspace-panel"
          tabIndex={active === p.id ? 0 : -1}
          className="ptab"
          style={{ ["--tab-accent" as string]: p.accent[0] }}
          onClick={() => onSelect(p.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <ProblemGlyph id={p.id} className="ptab-glyph" />
          <span className="ptab-text">
            <span className="ptab-name">{p.short}</span>
            <span className="ptab-status">
              <OfficialGlyph label={p.official.label} />
              <span>{p.official.label}</span>
              {p.official.label === "Active" && <span className="ptab-community">{p.id === "riemann" ? "formal proof certified" : "claim under evaluation"}</span>}
            </span>
          </span>
        </button>
      ))}
      <span className="ptab-sep" aria-hidden />
      <button
        ref={(el) => { refs.current[PROBLEMS.length] = el; }}
        role="tab" id="tab-archive" aria-selected={active === "archive"} aria-controls="workspace-panel" tabIndex={active === "archive" ? 0 : -1}
        className="ptab ptab-archive" style={{ ["--tab-accent" as string]: "#a4afbf" }}
        onClick={() => onSelect("archive")} onKeyDown={(e) => onKey(e, PROBLEMS.length)}
      >
        <ProblemGlyph id="poincare" className="ptab-glyph" />
        <span className="ptab-text"><span className="ptab-name">Archive</span><span className="ptab-status">Solved problem and registry</span></span>
      </button>
    </div>
  );
}

function OfficialGlyph({ label }: { label: string }) {
  if (label === "Solved") return <StatusGlyph status="accepted" className="" />;
  if (label === "Active") return <StatusGlyph status="externally-reviewed" className="" />;
  return <StatusGlyph status="open" className="" />;
}

export const VIEWS = [
  { id: "explore", label: "Explore" },
  { id: "research", label: "Research" },
  { id: "evidence", label: "Evidence" },
  { id: "proof", label: "Proof" },
  { id: "sources", label: "Sources" },
  { id: "history", label: "History" },
];

export function SubNav({ view, onSelect, right }: { view: string; onSelect: (v: string) => void; right?: React.ReactNode }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % VIEWS.length : e.key === "ArrowLeft" ? (i - 1 + VIEWS.length) % VIEWS.length : e.key === "Home" ? 0 : e.key === "End" ? VIEWS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    onSelect(VIEWS[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="subnav">
      <div className="subnav-tabs" role="tablist" aria-label="Workspace views">
        {VIEWS.map((v, i) => (
          <button key={v.id} ref={(el) => { refs.current[i] = el; }} id={`view-${v.id}`} role="tab" className="subtab" aria-selected={view === v.id}
            tabIndex={view === v.id ? 0 : -1} onClick={() => onSelect(v.id)} onKeyDown={(e) => onKey(e, i)}>{v.label}</button>
        ))}
      </div>
      <div className="subnav-right">{right}</div>
    </div>
  );
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 3600); return () => clearTimeout(id); }, [onDone]);
  return <div className="toast" role="status">{text}</div>;
}
