"use client";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ProblemTabs, Rail, SubNav, Toast, TopBar } from "@/components/shell/chrome";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { FocusBar, useFocusAndExport, ViewActions } from "@/components/shell/FocusExport";
import { useEngineStatus } from "@/lib/engine";
import { useUrlState } from "@/lib/hooks";
import { PROBLEM_IDS, type ProblemId } from "@/lib/registry/problems";

const loading = () => <div className="workspace"><div className="stage" style={{ display: "grid", placeItems: "center" }}><span className="skeleton" style={{ width: 220, height: 12 }} /></div></div>;
const WORKSPACES: Record<ProblemId, React.ComponentType<{ status: ReturnType<typeof useEngineStatus> }>> = {
  bsd: dynamic(() => import("@/components/bsd/BsdWorkspace"), { ssr: false, loading }),
  riemann: dynamic(() => import("@/components/riemann/RiemannWorkspace"), { ssr: false, loading }),
  pnp: dynamic(() => import("@/components/pnp/PnpWorkspace"), { ssr: false, loading }),
  ns: dynamic(() => import("@/components/ns/NsWorkspace"), { ssr: false, loading }),
  ym: dynamic(() => import("@/components/ym/YmWorkspace"), { ssr: false, loading }),
  hodge: dynamic(() => import("@/components/hodge/HodgeWorkspace"), { ssr: false, loading }),
};
const ProblemView = dynamic(() => import("@/components/views/ProblemViews"), { ssr: false, loading });
const GlobalView = dynamic(() => import("@/components/views/GlobalViews"), { ssr: false, loading });
const ArchiveView = dynamic(() => import("@/components/views/ArchiveView"), { ssr: false, loading });

function ObservatoryInner() {
  const url = useUrlState();
  const status = useEngineStatus();
  const section = url.get("s") ?? "atlas";
  const pRaw = url.get("p") ?? "bsd";
  const problem = (PROBLEM_IDS as string[]).includes(pRaw) || pRaw === "archive" ? pRaw : "bsd";
  const view = url.get("v") ?? "explore";
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const onInstrument = section === "atlas" && view === "explore" && problem !== "archive";
  const fx = useFocusAndExport(problem, onInstrument, setToast);

  useEffect(() => {
    try { if (localStorage.getItem("noether:motion") === "reduce") document.documentElement.dataset.motion = "reduce"; } catch { /* storage unavailable */ }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectProblem = useCallback((id: string) => {
    url.set({ p: id === "bsd" ? null : id, curve: null, inst: null, pt: null, pt2: null, k: null, d: null, node: null, src: null }, { push: true });
  }, [url]);

  const Workspace = problem !== "archive" ? WORKSPACES[problem as ProblemId] : null;
  return (
    <div className="app" data-problem={problem === "archive" ? "bsd" : problem} data-focus={fx.focus ? "true" : undefined} data-drawer={fx.focus && fx.drawer ? "true" : undefined}>
      <a href="#main" className="sr-only">Skip to workspace</a>
      <TopBar status={status} onSearch={() => setPalette(true)} onEngine={() => url.set({ s: "settings" }, { push: true })} />
      <Rail section={section} onSelect={(s) => url.set({ s: s === "atlas" ? null : s }, { push: true })} />
      <main className="main" id="main" style={section === "atlas" ? undefined : { gridTemplateRows: "minmax(0, 1fr)" }}>
        {section === "atlas" ? (
          <>
            <ProblemTabs active={problem} onSelect={selectProblem} />
            {problem === "archive" ? (
              <div style={{ gridRow: "2 / span 2", minHeight: 0 }}><ArchiveView /></div>
            ) : (
              <>
                <SubNav view={view} onSelect={(v) => url.set({ v: v === "explore" ? null : v }, { push: true })}
                  right={view === "explore" ? <ViewActions onFocus={fx.enter} onExport={(f) => { void fx.doExport(f); }} /> : null} />
                {view === "explore" && Workspace ? <Workspace key={problem} status={status} /> : <ProblemView key={`${problem}-${view}`} problem={problem as ProblemId} view={view} status={status} onToast={setToast} />}
              </>
            )}
          </>
        ) : (
          <GlobalView section={section} status={status} onToast={setToast} />
        )}
      </main>
      {fx.focus && <FocusBar problem={problem} drawer={fx.drawer} onExit={() => fx.setFocus(false)} onDrawer={() => fx.setDrawer(!fx.drawer)} onExport={() => { void fx.doExport("png"); }} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} onToast={setToast} />}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

export function Observatory() {
  return (
    <Suspense fallback={<div className="app" />}>
      <ObservatoryInner />
    </Suspense>
  );
}
