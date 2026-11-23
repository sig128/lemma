"use client";
import { StatusGlyph } from "@/components/glyphs";
import { PROBLEM_BY_ID, type ProblemId } from "@/lib/registry/problems";
import { SOURCE_BY_ID } from "@/lib/registry/sources";
import { RichText } from "@/lib/format";

function srcLabel(id: string) {
  const s = SOURCE_BY_ID.get(id);
  if (s) return s.authors[0].length > 28 ? s.title : `${s.authors[0]}${s.authors.length > 1 ? " et al." : ""}, ${s.year}`;
  for (const doc of SOURCE_BY_ID.values()) if (doc.passages.some((p) => p.id === id)) return `${doc.authors[0]}, ${doc.year}`;
  return id;
}

/** Official status, community status and the app's own campaign: three separate fields. */
export function ProblemStatusBlock({ problem, compact = false }: { problem: ProblemId; compact?: boolean }) {
  const p = PROBLEM_BY_ID[problem];
  const ob = p.frontier.nodes.find((n) => n.id === p.campaign.obligation);
  return (
    <>
      <section className="insp-section">
        <h2 className="insp-h">Status, kept in three separate fields</h2>
        <dl className="kv">
          <dt>Clay (official)</dt>
          <dd><strong>{p.official.label}</strong> <span className="note">verified {p.official.verifiedAt}</span></dd>
          <dt>Research community</dt>
          <dd>{p.community.label}</dd>
          <dt>This app</dt>
          <dd>{p.campaign.title}: <span className="dim">{p.campaign.state === "blocked" ? "blocked" : p.campaign.state === "recorded" ? "recorded run available" : p.campaign.state}</span></dd>
        </dl>
        {!compact && <p className="note" style={{ marginTop: 8 }}>{p.official.note}</p>}
      </section>
      {p.community.claims.map((c) => (
        <section className="insp-section" key={c.id}>
          <h2 className="insp-h"><StatusGlyph status="externally-reviewed" /> External claim, {c.date}</h2>
          <p><strong>{c.who}</strong>: {c.what}</p>
          {c.formal && <p className="note">Formal statement: {c.formal}</p>}
          <p className="note">Review: {c.review}</p>
          <p className="note">Independent reproduction by this app: <strong>{c.appReproduction.status}</strong>. {c.appReproduction.reason}</p>
          <p className="note">Sources: {c.sources.map(srcLabel).join("; ")}.</p>
        </section>
      ))}
      {!compact && (
        <>
          <section className="insp-section">
            <h2 className="insp-h">What remains unresolved</h2>
            <p>{p.community.summary}</p>
            {ob && ob.id !== `${problem}:target` && <p className="callout callout-warn" style={{ marginTop: 8 }}><strong>{ob.title}.</strong> <RichText text={ob.statement} />{ob.remains ? ` ${ob.remains}` : ""}</p>}
          </section>
          <section className="insp-section">
            <h2 className="insp-h">Next useful test</h2>
            <p>{p.campaign.summary}</p>
          </section>
        </>
      )}
    </>
  );
}
