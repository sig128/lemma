/**
 * Problem registry. Official status, community status and the application's
 * own campaign are separate fields with separate sources. Nothing here (or
 * anywhere in the app) derives "solved" from a claim, a label or a check.
 */
export type ProblemId = "bsd" | "riemann" | "pnp" | "ns" | "ym" | "hodge";

export type ClaimStatus =
  | "literature-theorem"
  | "candidate"
  | "refuted"
  | "numerically-supported"
  | "conditionally-derived"
  | "verified-instance"
  | "independently-reproduced"
  | "formally-checked"
  | "externally-reviewed"
  | "accepted"
  | "open"
  | "blocked";

export type NodeKind = "definition" | "theorem" | "conditional" | "candidate" | "blocked" | "rejected" | "target" | "instance" | "external-claim" | "evidence" | "refinement";
export type EdgeType = "depends-on" | "assumes" | "supports" | "contradicts" | "specializes" | "cites" | "equivalent-under" | "attempted-by" | "checked-by";

export interface FrontierNode {
  id: string;
  kind: NodeKind;
  title: string;
  statement: string;
  tex?: string;
  scope: string;
  assumptions: string[];
  sources: string[]; // passage ids or source ids
  status: ClaimStatus;
  novelty?: "unchecked" | "found-in-literature" | "potentially-new" | "expert-assessed";
  version: number;
  why?: string; // why it matters / why proving it would help
  remains?: string; // what would remain afterwards
  artifact?: string; // evidence artifact id
  instrument?: { curve?: string; view?: string; object?: string };
}
export interface FrontierEdge { from: string; to: string; type: EdgeType }

export interface ExternalClaim {
  id: string;
  date: string;
  who: string;
  what: string;
  formal?: string;
  review: string;
  sources: string[];
  appReproduction: { status: "not-attempted" | "blocked" | "reproduced"; reason: string };
}

export interface Capability {
  area: "Literature" | "Computation" | "Model reasoning" | "Formal checking" | "Review";
  name: string;
  state: "available" | "available-in-browser" | "needs-credentials" | "needs-network" | "not-implemented" | "blocked";
  detail: string;
}

export interface ProblemDefinition {
  id: ProblemId;
  order: number;
  name: string;
  short: string;
  accent: [string, string];
  statementTex: string[];
  statement: string;
  setting: string;
  official: { label: "Unsolved" | "Active" | "Solved"; source: string; verifiedAt: string; note: string };
  community: { label: string; summary: string; claims: ExternalClaim[] };
  campaign: { title: string; state: "idle" | "recorded" | "running" | "blocked" | "completed"; summary: string; obligation: string };
  lastVerified: string;
  instrument: { title: string; kind: "computed" | "illustrative" | "mixed"; summary: string };
  frontier: { plan: string; version: number; nodes: FrontierNode[]; edges: FrontierEdge[] };
  capabilities: Capability[];
}

const V = "2026-11-23";

export const PROBLEMS: ProblemDefinition[] = [
  {
    id: "bsd", order: 0, name: "Birch and Swinnerton-Dyer", short: "BSD", accent: ["#6B91FF", "#E5B866"],
    statementTex: [String.raw`\operatorname{rank} E(\mathbb{Q}) \;=\; \operatorname{ord}_{s=1} L(E,s)`],
    statement: "For every elliptic curve E over Q, the rank of the group of rational points equals the order of vanishing of L(E,s) at s = 1.",
    setting: "Elliptic curves over Q in Weierstrass form; L(E,s) continued analytically via modularity.",
    official: { label: "Unsolved", source: "clay-millennium", verifiedAt: V, note: "Label shown on the CMI problem list." },
    community: { label: "Open", summary: "Rank equality is a theorem when the analytic rank is at most 1 (Gross–Zagier, Kolyvagin, with modularity). At least 66.48% of curves ordered by height satisfy it. Nothing general is known in analytic rank 2 or more; individual curves of rank 2 and 3 are checked case by case.", claims: [] },
    campaign: { title: "First BSD campaign", state: "recorded", summary: "Source-backed map of the rank conjecture, reproduction of known examples with PARI, a bounded twist-family audit, and a report of the exact remaining gap.", obligation: "bsd:rank4-gap" },
    lastVerified: V,
    instrument: { title: "Elliptic-curve explorer", kind: "computed", summary: "Real locus sampled from the Weierstrass equation; rational points and group law in exact arithmetic; L-values from PARI." },
    frontier: {
      plan: "Rank equality, curve by curve and in families", version: 3,
      nodes: [
        { id: "bsd:target", kind: "target", title: "BSD rank conjecture", statement: "rank E(Q) = ord_{s=1} L(E,s) for every elliptic curve E/Q.", tex: String.raw`\operatorname{rank}E(\mathbb Q)=\operatorname{ord}_{s=1}L(E,s)`, scope: "All elliptic curves over Q.", assumptions: [], sources: ["wiles-statement", "clay-status"], status: "open", version: 1, why: "The target. Everything else is either a proven special case or evidence." },
        { id: "bsd:modularity", kind: "theorem", title: "Modularity", statement: "Every elliptic curve over Q is modular, so L(E,s) has analytic continuation and a functional equation with root number w = ±1.", scope: "All E/Q.", assumptions: [], sources: ["wiles-modularity", "wiles-flt", "bcdt"], status: "literature-theorem", version: 1 },
        { id: "bsd:parity-fe", kind: "theorem", title: "Forced vanishing from the root number", statement: "If w = +1 then all odd-order derivatives of L(E,s) at s = 1 vanish; if w = -1, all even-order ones vanish.", tex: String.raw`\Lambda(E,s)=w\,\Lambda(E,2-s)`, scope: "All E/Q (given modularity).", assumptions: ["Functional equation (modularity)"], sources: ["bsd:modularity"], status: "literature-theorem", version: 1 },
        { id: "bsd:gzk", kind: "theorem", title: "Gross–Zagier + Kolyvagin", statement: "If ord_{s=1} L(E,s) <= 1 then rank E(Q) equals it and Sha(E/Q) is finite. Contrapositive used below: L(E,1) != 0 forces rank 0, and a simple zero forces rank 1.", scope: "Curves of analytic rank 0 or 1.", assumptions: ["Modularity", "Auxiliary nonvanishing results for the choice of imaginary quadratic field"], sources: ["gross-zagier", "kolyvagin-euler"], status: "literature-theorem", version: 1 },
        { id: "bsd:bsz", kind: "theorem", title: "A positive proportion (at least 66.48%)", statement: "At least 66.48% of elliptic curves over Q, ordered by height, satisfy the rank conjecture.", scope: "Density statement over the family of all curves; says nothing about any individual curve outside the proven classes.", assumptions: [], sources: ["bsz-6648", "bs-positive"], status: "literature-theorem", version: 1 },
        { id: "bsd:instance-389", kind: "instance", title: "389a1: both ranks equal 2", statement: "Algebraic rank 2 (descent with exhibited points). L(E,1) = 0 by the GZK contrapositive, L'(E,1) = 0 since w = +1, and L''(E,1) is numerically nonzero.", scope: "This one curve.", assumptions: ["Numerical nonvanishing of L''(E,1) at 128-bit precision (PARI floating point, not interval arithmetic)"], sources: ["pari-ellrank"], status: "verified-instance", version: 1, artifact: "bsd-389a1", instrument: { curve: "389a1", view: "lfunction" } },
        { id: "bsd:instance-5077", kind: "instance", title: "5077a1: both ranks equal 3", statement: "Algebraic rank 3. L(E,1) = L''(E,1) = 0 since w = -1; L'(E,1) = 0 by the GZK contrapositive; L'''(E,1) numerically nonzero. Reproduces Buhler-Gross–Zagier (1985).", scope: "This one curve.", assumptions: ["Numerical nonvanishing of L'''(E,1)"], sources: ["bgz-triple", "pari-ellrank"], status: "independently-reproduced", novelty: "found-in-literature", version: 1, artifact: "bsd-5077a1", instrument: { curve: "5077a1", view: "lfunction" } },
        { id: "bsd:rank4-gap", kind: "blocked", title: "Prove L''(E,1) = 0 for 234446a1", statement: "For the rank-4 curve 234446a1 (algebraic rank 4 certified), the vanishing of L(E,1), L'(E,1) and L'''(E,1) is forced, but L''(E,1) is only numerically zero. Proving it exactly would give analytic rank 4 and rank equality for this curve.", tex: String.raw`L''(E,1)\overset{?}{=}0,\quad |L''(E,1)|_{\text{num}}\approx 7\cdot10^{-42}`, scope: "One curve; the same obstruction applies to every curve of rank 4 or more.", assumptions: [], sources: ["pari-analyticrank", "bgz-triple"], status: "blocked", version: 2, artifact: "bsd-234446a1", why: "Proving this one equality would establish the first case of analytic rank 4. The tools that settle ranks 2 and 3 (parity, and Gross–Zagier-Kolyvagin applied in contrapositive) do not reach the second derivative.", remains: "Even with this curve settled, the general rank conjecture in rank >= 2 would remain open; this is an instance, not a strategy.", instrument: { curve: "234446a1", view: "lfunction", object: "L''" } },
        { id: "bsd:rejected-numerical", kind: "rejected", title: "Rejected: small value implies vanishing", statement: "Argument: |L''(E,1)| < 10^-40 at working precision, hence L''(E,1) = 0 and the analytic rank is 4.", scope: "Seeded invalid argument.", assumptions: [], sources: ["pari-analyticrank"], status: "refuted", version: 1, why: "Rejected by review: a floating-point magnitude below the working precision is consistent with an exact zero and with a very small nonzero value. PARI itself documents this as an assumption." },
        { id: "bsd:family-pattern", kind: "candidate", title: "Pattern in the 11a1 twist family", statement: "Among 1,116 quadratic twists of 11a1 with |d| <= 2000, every analytic order equals the descent rank where descent determines it. Candidate question: does the share of even-parity twists with rank 2 fall as |d| grows?", scope: "Finite family, |d| <= 2000, gcd(d,11) = 1.", assumptions: ["Numerical analytic orders"], sources: ["bmsw-tension"], status: "numerically-supported", novelty: "found-in-literature", version: 1, artifact: "bsd-twists-11a1", why: "Generates a testable question; it is not a theorem and small-conductor data are known to be biased.", instrument: { view: "family" } },
        { id: "bsd:refinement", kind: "refinement", title: "Leading-coefficient formula", statement: "lim_{s→1} L(E,s)/(s−1)^r = Ω Reg |Ш| ∏ c_p / |E_{tors}|^2. Checked numerically (analytic Sha = 1.000...) for the five flagship curves; a separate refinement.", tex: String.raw`\lim_{s\to1}\frac{L(E,s)}{(s-1)^r}=\frac{\Omega_E\,\mathrm{Reg}_E\,|\text{Ш}(E)|\,\prod_p c_p}{|E(\mathbb Q)_{\mathrm{tors}}|^2}`, scope: "Numerical consistency only.", assumptions: [], sources: ["gjpst-scope"], status: "numerically-supported", version: 1 },
      ],
      edges: [
        { from: "bsd:parity-fe", to: "bsd:modularity", type: "depends-on" },
        { from: "bsd:gzk", to: "bsd:modularity", type: "depends-on" },
        { from: "bsd:bsz", to: "bsd:gzk", type: "depends-on" },
        { from: "bsd:instance-389", to: "bsd:gzk", type: "depends-on" },
        { from: "bsd:instance-389", to: "bsd:parity-fe", type: "depends-on" },
        { from: "bsd:instance-5077", to: "bsd:gzk", type: "depends-on" },
        { from: "bsd:instance-5077", to: "bsd:parity-fe", type: "depends-on" },
        { from: "bsd:rank4-gap", to: "bsd:parity-fe", type: "depends-on" },
        { from: "bsd:rank4-gap", to: "bsd:gzk", type: "depends-on" },
        { from: "bsd:instance-389", to: "bsd:target", type: "supports" },
        { from: "bsd:instance-5077", to: "bsd:target", type: "supports" },
        { from: "bsd:bsz", to: "bsd:target", type: "supports" },
        { from: "bsd:rank4-gap", to: "bsd:target", type: "specializes" },
        { from: "bsd:rejected-numerical", to: "bsd:rank4-gap", type: "attempted-by" },
        { from: "bsd:family-pattern", to: "bsd:target", type: "supports" },
        { from: "bsd:refinement", to: "bsd:target", type: "specializes" },
      ],
    },
    capabilities: [
      { area: "Literature", name: "arXiv adapter", state: "needs-network", detail: "Implemented with rate limiting and conditional requests; this build environment cannot reach export.arxiv.org." },
      { area: "Computation", name: "PARI/GP 2.19.1 (cypari2)", state: "available", detail: "Runs in the research worker: invariants, 2-descent, saturation, heights, L-values." },
      { area: "Computation", name: "SageMath", state: "not-implemented", detail: "Adapter interface defined; no SageMath installation in this environment." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL=claude-opus-5-5." },
      { area: "Formal checking", name: "Lean 4.36.0 (core)", state: "available", detail: "Builds and axiom-audits isolated lemmas; Mathlib not installed here." },
      { area: "Review", name: "Auditor re-computation", state: "available", detail: "Re-runs PARI computations in a fresh process and compares hashes." },
    ],
  },
  {
    id: "riemann", order: 1, name: "Riemann hypothesis", short: "Riemann", accent: ["#B9AEF0", "#C9CED8"],
    statementTex: [String.raw`\zeta(s)=0,\;\; 0<\operatorname{Re}s<1 \;\Longrightarrow\; \operatorname{Re}s=\tfrac12`],
    statement: "Every nontrivial zero of the Riemann zeta function has real part 1/2.",
    setting: "zeta(s) continued meromorphically to C; nontrivial zeros lie in the critical strip 0 < Re s < 1.",
    official: { label: "Active", source: "clay-millennium", verifiedAt: V, note: "Label shown on the CMI problem list. CMI has not published a statement on the November 2026 formal proof." },
    community: {
      label: "Formal proof certified by the Lean community",
      summary: "On 20 November 2026 Levent Alpöge released a Lean proof (developed with Claude) of Mathlib's RiemannHypothesis and of GRH for Dirichlet L-functions. On 21 November the Lean and Mathlib communities certified the statement and proof. No conventional paper has been through peer review, and CMI's rules require publication, two years and general acceptance.",
      claims: [{
        id: "rh-alpoge-2026", date: "2026-11-20", who: "Levent Alpöge (with Claude)", what: "Lean proof of the Riemann hypothesis and of GRH for Dirichlet L-functions, about 17 million lines.",
        formal: "Theorem riemannHypothesis : RiemannHypothesis (Mathlib statement).", review: "Lean and Mathlib communities' statement of 21 November 2026, endorsed by the Lean FRO and the Mathlib Initiative.",
        sources: ["lean-rh-statement", "lean-rh-notes", "clay-rules"],
        appReproduction: { status: "blocked", reason: "Rebuilding a 17-million-line library needs the archive and substantial compute; neither is available in this environment." },
      }],
    },
    campaign: { title: "Independent audit of the released formal proof", state: "blocked", summary: "Bounded task: fetch the pinned archive, rebuild with the pinned toolchain, compare the theorem's type with Mathlib's RiemannHypothesis, and audit axioms. Blocked here by network and compute.", obligation: "riemann:audit" },
    lastVerified: V,
    instrument: { title: "Critical-strip instrument", kind: "mixed", summary: "Zeros and Z(t) from mpmath; domain coloring and explicit formula computed in the browser; precision shown." },
    frontier: {
      plan: "Evidence, proportion results and the external formal claim", version: 2,
      nodes: [
        { id: "riemann:target", kind: "target", title: "Riemann hypothesis", statement: "All nontrivial zeros of zeta(s) have real part 1/2.", scope: "All zeros.", assumptions: [], sources: ["clay-status", "ls-rh-def"], status: "open", version: 1, why: "Official status is Active; the app does not convert an external claim into a solved label." },
        { id: "riemann:computed-height", kind: "theorem", title: "Verified up to height 3·10^12", statement: "Every zero with 0 < gamma <= 3·10^12 lies on the critical line and is simple (rigorous interval arithmetic).", scope: "Finite height.", assumptions: [], sources: ["pt-abstract"], status: "literature-theorem", version: 1 },
        { id: "riemann:proportion", kind: "theorem", title: "More than two thirds of zeros on the line", statement: "More than 67.25% of nontrivial zeros are simple and lie on the critical line (August 2026, Claude research model; validated and formalized).", scope: "Proportion, not all zeros.", assumptions: [], sources: ["anthropic-zeta-bound", "prz-512"], status: "formally-checked", version: 1 },
        { id: "riemann:external-formal", kind: "external-claim", title: "Released formal proof (20 Nov 2026)", statement: "A Lean term of type RiemannHypothesis, certified by the Lean and Mathlib communities on 21 November 2026.", scope: "Mathlib's formal statement.", assumptions: ["Soundness of Lean's kernel and the axioms reported by the audit"], sources: ["lean-rh-certify", "lean-rh-size", "lean-rh-route"], status: "externally-reviewed", version: 1, why: "If the formal statement matches the classical one, as the community statement says, this settles RH formally. Prize status is a separate question governed by CMI's rules." },
        { id: "riemann:audit", kind: "blocked", title: "Reproduce the formal check here", statement: "Rebuild the released archive with its pinned toolchain; check the type of the main theorem against Mathlib's RiemannHypothesis; list axioms.", scope: "Independent reproduction by this app.", assumptions: [], sources: ["lean-rh-notes"], status: "blocked", version: 1, remains: "Not attempted in this environment: network access to the archive and substantial compute required." },
        { id: "riemann:evidence-300", kind: "evidence", title: "First 300 zeros located", statement: "The first 300 ordinates were computed (mpmath, 25 digits); Z(t) changes sign across each, which places each zero on the line.", scope: "Height <= 541.85.", assumptions: ["Correct floating-point evaluation of Z(t)"], sources: [], status: "numerically-supported", version: 1, artifact: "riemann-zeros-300" },
      ],
      edges: [
        { from: "riemann:computed-height", to: "riemann:target", type: "supports" },
        { from: "riemann:proportion", to: "riemann:target", type: "supports" },
        { from: "riemann:external-formal", to: "riemann:target", type: "supports" },
        { from: "riemann:audit", to: "riemann:external-formal", type: "checked-by" },
        { from: "riemann:evidence-300", to: "riemann:computed-height", type: "specializes" },
      ],
    },
    capabilities: [
      { area: "Computation", name: "mpmath zeros and Z(t)", state: "available", detail: "Precomputed dataset with recorded precision; regenerated by research/scripts/gen_riemann.py." },
      { area: "Computation", name: "In-browser zeta (Borwein series)", state: "available-in-browser", detail: "Domain coloring and explicit formula; numerical, precision shown." },
      { area: "Formal checking", name: "Audit of external archive", state: "blocked", detail: "Needs network access and large compute." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "Required for bounded proof-analysis tasks." },
      { area: "Literature", name: "arXiv adapter", state: "needs-network", detail: "Implemented; unreachable from this environment." },
    ],
  },
  {
    id: "pnp", order: 2, name: "P versus NP", short: "P vs NP", accent: ["#E5B866", "#EEF2F7"],
    statementTex: [String.raw`\mathsf{P}\overset{?}{=}\mathsf{NP}\qquad\Longleftrightarrow\qquad \mathrm{SAT}\overset{?}{\in}\mathsf{P}`],
    statement: "Is every language decidable in nondeterministic polynomial time also decidable in deterministic polynomial time? Equivalently, is SAT solvable in polynomial time?",
    setting: "Deterministic and nondeterministic Turing machines; polynomial-time many-one reductions.",
    official: { label: "Unsolved", source: "clay-millennium", verifiedAt: V, note: "Label shown on the CMI problem list." },
    community: { label: "Open", summary: "Open. Relativization, natural proofs and algebrization rule out broad classes of techniques.", claims: [] },
    campaign: { title: "Finite benchmark: search versus verification", state: "completed", summary: "Measured CDCL search work against witness checking on a stated random 3-SAT dataset. A finite benchmark for one solver; it is not a lower bound.", obligation: "pnp:target" },
    lastVerified: V,
    instrument: { title: "SAT instrument", kind: "computed", summary: "CDCL solver with clause learning running in a Web Worker; witnesses checked independently; UNSAT answers carry a DRUP certificate checked by separate code." },
    frontier: {
      plan: "Known barriers and what a benchmark can and cannot show", version: 1,
      nodes: [
        { id: "pnp:target", kind: "target", title: "P != NP (or P = NP)", statement: "Decide whether P = NP.", scope: "All polynomial-time algorithms.", assumptions: [], sources: ["monograph-contents"], status: "open", version: 1 },
        { id: "pnp:cook", kind: "theorem", title: "SAT is NP-complete", statement: "Every NP language reduces to SAT in polynomial time (Cook-Levin).", scope: "", assumptions: [], sources: ["cook-1971"], status: "literature-theorem", version: 1 },
        { id: "pnp:relativization", kind: "theorem", title: "Relativization barrier", statement: "There are oracles A, B with P^A = NP^A and P^B != NP^B.", scope: "Techniques that relativize.", assumptions: [], sources: ["bgs"], status: "literature-theorem", version: 1 },
        { id: "pnp:natural", kind: "theorem", title: "Natural proofs barrier", statement: "Natural lower-bound proofs against P/poly would yield attacks on pseudorandom functions believed secure.", scope: "Natural, constructive, large properties.", assumptions: ["Existence of strong pseudorandom functions"], sources: ["razborov-rudich"], status: "conditionally-derived", version: 1 },
        { id: "pnp:algebrization", kind: "theorem", title: "Algebrization barrier", statement: "Algebrizing techniques cannot resolve P vs NP.", scope: "", assumptions: [], sources: ["aaronson-wigderson"], status: "literature-theorem", version: 1 },
        { id: "pnp:benchmark", kind: "evidence", title: "Measured work on random 3-SAT", statement: "For one CDCL solver on random 3-SAT at clause ratio 4.26 with stated seeds, measured search work grows faster than witness verification work across n = 10..70.", scope: "One solver, a finite dataset, one machine.", assumptions: [], sources: [], status: "numerically-supported", version: 1, why: "Illustrates the gap between finding and checking a witness. It is not evidence about all algorithms and proves no lower bound." },
      ],
      edges: [
        { from: "pnp:cook", to: "pnp:target", type: "specializes" },
        { from: "pnp:relativization", to: "pnp:target", type: "contradicts" },
        { from: "pnp:natural", to: "pnp:target", type: "contradicts" },
        { from: "pnp:algebrization", to: "pnp:target", type: "contradicts" },
        { from: "pnp:benchmark", to: "pnp:cook", type: "cites" },
      ],
    },
    capabilities: [
      { area: "Computation", name: "CDCL solver + DRUP checker", state: "available-in-browser", detail: "Runs in a Web Worker; worker-side adapter not implemented." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "For bounded barrier-analysis tasks." },
      { area: "Literature", name: "arXiv adapter", state: "needs-network", detail: "Implemented; unreachable here." },
    ],
  },
  {
    id: "ns", order: 3, name: "Navier–Stokes existence and smoothness", short: "Navier–Stokes", accent: ["#8CCBEB", "#E7957F"],
    statementTex: [String.raw`\partial_t u+(u\cdot\nabla)u=\nu\Delta u-\nabla p+f,\qquad \nabla\cdot u=0`],
    statement: "In three dimensions, prove global existence of smooth finite-energy solutions from smooth data with zero force (A on R^3, B on the torus), or exhibit breakdown with a smooth force (C on R^3, D on the torus).",
    setting: "Incompressible viscous fluid in R^3 or R^3/Z^3, nu > 0, smooth divergence-free initial data.",
    official: { label: "Active", source: "clay-millennium", verifiedAt: V, note: "CMI's 11 September 2026 announcement says the problem has 'apparently been settled' and that evaluation follows the prize rules." },
    community: {
      label: "Breakdown claimed; under evaluation",
      summary: "On 8 September 2026 OpenAI announced a proof, with a Lean formalization, of finite-time singularity under a smooth external force, which would establish statements (C) and (D). CMI's evaluation is ongoing, credit questions have been raised publicly, and no prize has been awarded.",
      claims: [{
        id: "ns-openai-2026", date: "2026-09-08", who: "OpenAI (internal system)", what: "Finite-time singularity of 3D Navier–Stokes with a smooth external force, with finite energy throughout; claimed to establish (C) and (D).",
        formal: "Lean formalization released with the write-up.", review: "CMI announcement of 11 September 2026; public expert discussion, including on whether the forced version is the intended problem.",
        sources: ["openai-ns-claim", "clay-ns-announcement", "fefferman-ns", "sciam-ns"],
        appReproduction: { status: "blocked", reason: "The formal artifact was not ingested in this environment; statement-correspondence audit not run." },
      }],
    },
    campaign: { title: "Audit statement correspondence for (C)/(D)", state: "blocked", summary: "Bounded task: compare the formal statement's function spaces, forcing class and energy condition with Fefferman's (C)/(D). Blocked here: artifact not retrieved.", obligation: "ns:audit" },
    lastVerified: V,
    instrument: { title: "Fluid-analysis instrument", kind: "mixed", summary: "Authentic 2D pseudo-spectral solver on the torus with diagnostics. 2D results do not bear on the 3D problem." },
    frontier: {
      plan: "What is known in 2D and 3D, and the external claim", version: 1,
      nodes: [
        { id: "ns:target", kind: "target", title: "Statements (A)-(D)", statement: "Prove one of Fefferman's (A), (B), (C), (D).", scope: "3D.", assumptions: [], sources: ["fefferman-four", "clay-status"], status: "open", version: 1 },
        { id: "ns:leray", kind: "theorem", title: "Global weak solutions", statement: "Leray-Hopf weak solutions exist globally in 3D.", scope: "Weak solutions; smoothness and uniqueness not implied.", assumptions: [], sources: ["leray"], status: "literature-theorem", version: 1 },
        { id: "ns:ckn", kind: "theorem", title: "Partial regularity", statement: "Singular sets of suitable weak solutions have zero one-dimensional parabolic Hausdorff measure.", scope: "Suitable weak solutions.", assumptions: [], sources: ["ckn"], status: "literature-theorem", version: 1 },
        { id: "ns:tao", kind: "theorem", title: "Averaged-equation blowup", statement: "An averaged NS equation with the same energy identity blows up in finite time.", scope: "Barrier for proofs using only those structures.", assumptions: [], sources: ["tao-averaged"], status: "literature-theorem", version: 1 },
        { id: "ns:external-claim", kind: "external-claim", title: "Claimed breakdown with smooth force", statement: "Finite-time singularity with a smooth force and finite energy, claimed to establish (C) and (D).", scope: "Forced problem as stated in (C)/(D).", assumptions: ["Correctness of the write-up and the Lean formalization"], sources: ["openai-ns-claim", "clay-ns-apparently", "clay-rules-acceptance", "sciam-force"], status: "externally-reviewed", version: 1, why: "CMI calls the problem apparently settled; its process is unhurried and no prize decision exists." },
        { id: "ns:audit", kind: "blocked", title: "Statement-correspondence audit", statement: "Check the formal statement's spaces for f and u0, the energy bound and the singularity notion against (C)/(D).", scope: "This app's independent check.", assumptions: [], sources: ["fefferman-four"], status: "blocked", version: 1 },
        { id: "ns:2d-demo", kind: "evidence", title: "2D simulation (educational)", statement: "Pseudo-spectral 2D solver reproduces the exact Taylor-Green decay to spectral accuracy. 2D global regularity is a classical theorem; this run is about numerics only.", scope: "2D torus, finite resolution.", assumptions: [], sources: [], status: "numerically-supported", version: 1 },
      ],
      edges: [
        { from: "ns:leray", to: "ns:target", type: "supports" },
        { from: "ns:ckn", to: "ns:leray", type: "depends-on" },
        { from: "ns:tao", to: "ns:target", type: "contradicts" },
        { from: "ns:external-claim", to: "ns:target", type: "supports" },
        { from: "ns:audit", to: "ns:external-claim", type: "checked-by" },
        { from: "ns:2d-demo", to: "ns:target", type: "cites" },
      ],
    },
    capabilities: [
      { area: "Computation", name: "2D pseudo-spectral solver", state: "available-in-browser", detail: "Vorticity form on the torus, RK4, 2/3 dealiasing; Web Worker." },
      { area: "Computation", name: "3D solver", state: "not-implemented", detail: "No 3D solver is wired in; the UI shows this instead of substituting an animation." },
      { area: "Formal checking", name: "Audit of external formalization", state: "blocked", detail: "Artifact not retrieved here." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "" },
    ],
  },
  {
    id: "ym", order: 4, name: "Yang–Mills existence and mass gap", short: "Yang–Mills", accent: ["#5FC4A0", "#D9B45A"],
    statementTex: [String.raw`\exists\ \text{QYM on }\mathbb R^4\ \text{for compact simple }G,\qquad \operatorname{spec}H\subset\{0\}\cup[\Delta,\infty),\ \Delta>0`],
    statement: "For every compact simple gauge group G, construct a quantum Yang–Mills theory on R^4 satisfying axioms at least as strong as Wightman or Osterwalder-Schrader, and prove it has a mass gap.",
    setting: "Four-dimensional continuum quantum field theory; lattice models are approximations.",
    official: { label: "Unsolved", source: "clay-millennium", verifiedAt: V, note: "Label shown on the CMI problem list." },
    community: { label: "Open", summary: "Open. Lattice numerics strongly support a gap, but the required continuum construction in four dimensions is not known.", claims: [] },
    campaign: { title: "Exact checks on a toy lattice", state: "completed", summary: "Monte Carlo for 2D U(1) lattice gauge theory against its exact finite-volume solution. Says nothing about 4D continuum SU(N).", obligation: "ym:target" },
    lastVerified: V,
    instrument: { title: "Lattice gauge instrument", kind: "computed", summary: "2D U(1) Wilson action on a periodic lattice; plaquette and Wilson loops with binned errors, compared with exact results." },
    frontier: {
      plan: "Scope separation: toy lattice, 4D lattice, continuum", version: 1,
      nodes: [
        { id: "ym:target", kind: "target", title: "Existence and mass gap", statement: "Construct 4D quantum Yang–Mills for compact simple G and prove Delta > 0.", scope: "Continuum, 4D.", assumptions: [], sources: ["monograph-contents"], status: "open", version: 1 },
        { id: "ym:lattice", kind: "definition", title: "Wilson lattice gauge theory", statement: "Gauge fields as group elements on links; action from plaquettes; Wilson loops as observables.", scope: "", assumptions: [], sources: ["wilson-1974"], status: "literature-theorem", version: 1 },
        { id: "ym:2d-exact", kind: "theorem", title: "2D U(1) is exactly solvable", statement: "On an L x L torus, <cos theta_p> = sum_n I_n(beta)^(V-1) (I_(n-1)+I_(n+1))/2 / sum_n I_n(beta)^V; in infinite volume W(R,T) = (I_1/I_0)^(RT).", scope: "Two dimensions, abelian.", assumptions: [], sources: ["wilson-1974"], status: "literature-theorem", version: 1 },
        { id: "ym:mc", kind: "evidence", title: "Monte Carlo agrees with the exact solution", statement: "Metropolis estimates of the plaquette and small Wilson loops match the exact values within binned errors.", scope: "Finite lattice, 2D U(1).", assumptions: [], sources: [], status: "numerically-supported", version: 1 },
        { id: "ym:4d", kind: "blocked", title: "4D SU(N) spectrum", statement: "Estimate glueball masses on 4D lattices with controlled continuum extrapolation.", scope: "Lattice evidence only.", assumptions: [], sources: ["creutz-1980"], status: "blocked", version: 1, remains: "Not implemented here; even with it, lattice estimates do not construct the continuum theory." },
      ],
      edges: [
        { from: "ym:2d-exact", to: "ym:lattice", type: "specializes" },
        { from: "ym:mc", to: "ym:2d-exact", type: "checked-by" },
        { from: "ym:4d", to: "ym:target", type: "supports" },
        { from: "ym:lattice", to: "ym:target", type: "cites" },
      ],
    },
    capabilities: [
      { area: "Computation", name: "2D U(1) Metropolis", state: "available-in-browser", detail: "Web Worker; exact finite-volume reference computed with Bessel series." },
      { area: "Computation", name: "4D SU(N) lattice", state: "not-implemented", detail: "Shown as unavailable; no substitute animation." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "" },
    ],
  },
  {
    id: "hodge", order: 5, name: "Hodge conjecture", short: "Hodge", accent: ["#E9E4DA", "#C99AA6"],
    statementTex: [String.raw`H^{2p}(X,\mathbb Q)\cap H^{p,p}(X)\;=\;\operatorname{span}_{\mathbb Q}\{[Z]\,:\,Z\subset X\ \text{algebraic},\ \operatorname{codim}Z=p\}`],
    statement: "On a non-singular complex projective variety, every rational cohomology class of type (p,p) is a rational linear combination of classes of algebraic subvarieties.",
    setting: "Smooth complex projective varieties X; Hodge decomposition of H^k(X,C).",
    official: { label: "Unsolved", source: "clay-millennium", verifiedAt: V, note: "Label shown on the CMI problem list." },
    community: { label: "Open", summary: "Open in general. True for p = 1 (Lefschetz) and hence p = n-1; the integral version and the Kähler version are false.", claims: [] },
    campaign: { title: "Exact cycle classes on a cubic surface", state: "completed", summary: "Computed the 27 lines on the Clebsch cubic exactly and their intersection form: rank 7 = b2, signature (1,6). An illustration of the proven case p = 1.", obligation: "hodge:target" },
    lastVerified: V,
    instrument: { title: "Algebraic-surface instrument", kind: "computed", summary: "Real points of the Clebsch cubic ray-traced exactly (cubic roots per pixel); the 27 lines from exact equations over Q(√5)." },
    frontier: {
      plan: "Proven cases, failures of variants, and the example", version: 1,
      nodes: [
        { id: "hodge:target", kind: "target", title: "Hodge conjecture", statement: "Rational (p,p) classes are algebraic for all p.", scope: "Smooth complex projective X.", assumptions: [], sources: ["monograph-contents"], status: "open", version: 1 },
        { id: "hodge:lefschetz", kind: "theorem", title: "Lefschetz (1,1)", statement: "Every class in H^2(X,Z) of type (1,1) is the class of a divisor.", scope: "p = 1; with hard Lefschetz also p = n-1.", assumptions: [], sources: ["lefschetz-11"], status: "literature-theorem", version: 1 },
        { id: "hodge:integral-fails", kind: "theorem", title: "Integral version fails", statement: "There are integral Hodge classes not represented by algebraic cycles.", scope: "Integral coefficients.", assumptions: [], sources: ["atiyah-hirzebruch"], status: "literature-theorem", version: 1 },
        { id: "hodge:kahler-fails", kind: "theorem", title: "Kahler version fails", statement: "Some compact Kahler manifolds have Hodge classes not spanned by analytic subvarieties or Chern classes.", scope: "Non-projective Kahler.", assumptions: [], sources: ["voisin-2002"], status: "literature-theorem", version: 1 },
        { id: "hodge:clebsch", kind: "evidence", title: "Clebsch cubic: lines span H^2", statement: "The 27 line classes span a lattice of rank 7 with signature (1,6), all of H^2(X,Q) for a cubic surface. Consistent with Lefschetz (1,1).", scope: "One surface, p = 1.", assumptions: [], sources: [], status: "verified-instance", version: 1, artifact: "hodge-clebsch" },
      ],
      edges: [
        { from: "hodge:lefschetz", to: "hodge:target", type: "specializes" },
        { from: "hodge:integral-fails", to: "hodge:target", type: "contradicts" },
        { from: "hodge:kahler-fails", to: "hodge:target", type: "contradicts" },
        { from: "hodge:clebsch", to: "hodge:lefschetz", type: "specializes" },
      ],
    },
    capabilities: [
      { area: "Computation", name: "Exact lines on cubic surfaces", state: "available", detail: "sympy/mpmath script with symbolic verification." },
      { area: "Computation", name: "Higher-dimensional Hodge computations", state: "not-implemented", detail: "No adapter for periods or Noether-Lefschetz loci." },
      { area: "Model reasoning", name: "Claude provider", state: "needs-credentials", detail: "" },
    ],
  },
];

export const ARCHIVE = [{
  id: "poincare", name: "Poincaré conjecture", status: "Solved",
  statement: "Every simply connected, closed 3-manifold is homeomorphic to the 3-sphere.",
  history: "Proved by Grigori Perelman in preprints posted in 2002 and 2003 using Ricci flow with surgery. CMI awarded the Millennium Prize in 2010; Perelman declined it.",
  source: "clay-millennium", verifiedAt: V,
}];

export const EXTENSIONS = [
  { id: "collatz", name: "Collatz conjecture", statement: "Iterating n ↦ n/2 for even n and n ↦ 3n + 1 for odd n reaches 1 from every positive integer.", note: "Registry entry only. Not a Millennium Prize Problem." },
  { id: "goldbach", name: "Goldbach conjecture", statement: "Every even integer greater than 2 is a sum of two primes.", note: "Registry entry only. Not a Millennium Prize Problem." },
  { id: "twin-primes", name: "Twin prime conjecture", statement: "There are infinitely many primes p with p + 2 prime.", note: "Registry entry only. Not a Millennium Prize Problem." },
];

export const PROBLEM_BY_ID = Object.fromEntries(PROBLEMS.map((p) => [p.id, p])) as Record<ProblemId, ProblemDefinition>;
export const PROBLEM_IDS = PROBLEMS.map((p) => p.id);
