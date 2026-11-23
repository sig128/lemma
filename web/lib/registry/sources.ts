/**
 * Source registry. "retrieved" means the document was fetched and read during
 * the build session on the recorded date (via the build assistant's web
 * tools; the shell had no route to these hosts, so no byte-level content hash
 * exists for those retrievals). "metadata-only" means the bibliographic record
 * is stored but the text was not read in this environment: an access gap,
 * reported as such.
 */
export type SourceKind = "official" | "paper" | "preprint" | "statement" | "software-doc" | "database" | "news" | "formal-artifact";
export type Retrieval =
  | { status: "retrieved"; at: string; via: string; contentHash: string | null; note?: string }
  | { status: "metadata-only"; reason: string };

export interface SourcePassage {
  id: string;
  anchor: string; // section / page / theorem
  kind: "quote" | "paraphrase";
  text: string; // quotes kept under fifteen words
  supports: string[]; // frontier node ids
}

export interface SourceDocument {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  kind: SourceKind;
  url: string;
  doi?: string;
  arxiv?: { id: string; version?: string };
  publication: "published" | "preprint" | "official-web" | "community-statement" | "news" | "documentation" | "formal-artifact";
  access: string;
  retrieval: Retrieval;
  problems: string[];
  why: string;
  passages: SourcePassage[];
  supersededBy?: string;
}

const BUILD = "2026-11-23";
const viaWeb = "build-session web fetch (shell egress to this host blocked)";

export const SOURCES: SourceDocument[] = [
  {
    id: "clay-millennium",
    title: "The Millennium Prize Problems",
    authors: ["Clay Mathematics Institute"],
    year: 2026,
    kind: "official",
    url: "https://www.claymath.org/millennium-problems",
    publication: "official-web",
    access: "Public web page",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Status labels read on 2026-11-23: Navier–Stokes Active, Riemann Active, BSD Unsolved, Hodge Unsolved, P vs NP Unsolved, Yang–Mills Unsolved, Poincaré Solved." },
    problems: ["bsd", "riemann", "pnp", "ns", "ym", "hodge", "poincare"],
    why: "Authoritative list of the seven problems and the official status label shown for each.",
    passages: [
      { id: "clay-status", anchor: "Problem list", kind: "paraphrase", text: "The page lists Navier–Stokes and the Riemann Hypothesis as Active; BSD, Hodge, P vs NP and Yang–Mills as Unsolved; the Poincaré Conjecture as Solved.", supports: ["bsd:target", "riemann:target", "ns:target"] },
    ],
  },
  {
    id: "clay-rules",
    title: "Millennium Prize Description and Rules",
    authors: ["Clay Mathematics Institute"],
    year: 2022,
    kind: "official",
    url: "https://www.claymath.org/wp-content/uploads/2022/03/millennium_prize_rules_0.pdf",
    publication: "official-web",
    access: "Public PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Read through search excerpts and a secondary summary; full PDF not parsed." },
    problems: ["bsd", "riemann", "pnp", "ns", "ym", "hodge"],
    why: "Defines what counts as a solution for prize purposes: publication, waiting period, and general acceptance.",
    passages: [
      { id: "clay-rules-acceptance", anchor: "Rules", kind: "paraphrase", text: "A proposed solution must appear in a qualifying outlet, at least two years must pass, and it must have general acceptance in the mathematics community before CMI considers it.", supports: ["riemann:external-formal", "ns:external-claim"] },
    ],
  },
  {
    id: "clay-ns-announcement",
    title: "Navier-Stokes Announcement",
    authors: ["Clay Mathematics Institute"],
    year: 2026,
    kind: "official",
    url: "https://www.claymath.org/news/navier-stokes-announcement/",
    publication: "official-web",
    access: "Public web page",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null },
    problems: ["ns"],
    why: "CMI's only public statement on the September 2026 claim; it does not confirm the result.",
    passages: [
      { id: "clay-ns-apparently", anchor: "Announcement, 11 September 2026", kind: "quote", text: "the Navier-Stokes problem has apparently been settled", supports: ["ns:external-claim"] },
      { id: "clay-ns-unhurried", anchor: "Announcement, 11 September 2026", kind: "quote", text: "The process is deliberately unhurried, but we will provide updates.", supports: ["ns:external-claim"] },
    ],
  },
  {
    id: "wiles-bsd",
    title: "The Birch and Swinnerton-Dyer Conjecture (official problem description)",
    authors: ["Andrew Wiles"],
    year: 2000,
    venue: "Clay Mathematics Institute",
    kind: "official",
    url: "https://www.claymath.org/wp-content/uploads/2022/05/birchswin.pdf",
    publication: "official-web",
    access: "Public PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Statement of the conjecture read from the PDF text." },
    problems: ["bsd"],
    why: "The official statement used as the campaign's target, including the form of the Taylor expansion at s = 1.",
    passages: [
      { id: "wiles-statement", anchor: "Conjecture (Birch and Swinnerton-Dyer)", kind: "paraphrase", text: "The Taylor expansion of L(C,s) at s = 1 has the form c(s-1)^r + higher order terms with c nonzero and r = rank C(Q). In particular L(C,1) = 0 exactly when C(Q) is infinite.", supports: ["bsd:target"] },
      { id: "wiles-modularity", anchor: "Introduction", kind: "paraphrase", text: "Analytic continuation of L(C,s) follows from modularity, now known for all elliptic curves over Q.", supports: ["bsd:modularity"] },
    ],
  },
  {
    id: "clay-monograph",
    title: "The Millennium Prize Problems",
    authors: ["J. Carlson", "A. Jaffe", "A. Wiles (eds.)"],
    year: 2006,
    venue: "Clay Mathematics Institute and American Mathematical Society",
    kind: "official",
    url: "https://www.claymath.org/library/monographs/MPPc.pdf",
    publication: "published",
    access: "Public PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Table of contents and front matter read; individual descriptions not parsed in this run." },
    problems: ["riemann", "pnp", "ym", "hodge", "ns", "bsd"],
    why: "Contains the official descriptions: Bombieri (RH), Cook (P vs NP), Jaffe and Witten (Yang–Mills), Deligne (Hodge), Fefferman (Navier–Stokes), Wiles (BSD).",
    passages: [
      { id: "monograph-contents", anchor: "Contents", kind: "paraphrase", text: "Official descriptions by Wiles, Deligne, Fefferman, Milnor, Cook, Bombieri, and Jaffe and Witten, with the prize rules.", supports: ["riemann:target", "pnp:target", "ym:target", "hodge:target"] },
    ],
  },
  {
    id: "fefferman-ns",
    title: "Existence and Smoothness of the Navier-Stokes Equation (official problem description)",
    authors: ["Charles L. Fefferman"],
    year: 2000,
    venue: "Clay Mathematics Institute",
    kind: "official",
    url: "https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf",
    publication: "official-web",
    access: "Public PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Statements (A) and (B) and the heading of (D) read from search excerpts of the PDF." },
    problems: ["ns"],
    why: "Defines the four alternative statements (A)-(D); (C) and (D) are breakdown statements that allow a smooth external force.",
    passages: [
      { id: "fefferman-four", anchor: "Problem statement", kind: "paraphrase", text: "A solver may prove one of four statements: existence and smoothness on R^3 (A) or on the torus (B) with zero force, or breakdown on R^3 (C) or on the torus (D).", supports: ["ns:target", "ns:external-claim"] },
    ],
  },
  {
    id: "lean-rh-statement",
    title: "Lean verification of the Riemann Hypothesis",
    authors: ["Lean and Mathlib communities"],
    year: 2026,
    kind: "statement",
    url: "https://leanprover-community.github.io/blog/posts/riemann-hypothesis/",
    publication: "community-statement",
    access: "Public web page",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Read through search excerpts of the post." },
    problems: ["riemann"],
    why: "The verification community's certification of the formal statement and proof released on 20 November 2026.",
    passages: [
      { id: "lean-rh-certify", anchor: "Statement, 21 November 2026", kind: "quote", text: "both the statement and the proof of the Riemann Hypothesis are correct", supports: ["riemann:external-formal"] },
      { id: "lean-rh-size", anchor: "Opening paragraph", kind: "paraphrase", text: "The proof was released as a Lean library of about 17 million lines; the statement proved is Mathlib's RiemannHypothesis.", supports: ["riemann:external-formal"] },
    ],
  },
  {
    id: "lean-rh-notes",
    title: "riemann-hypothesis: verification notes",
    authors: ["leanprover-community"],
    year: 2026,
    kind: "formal-artifact",
    url: "https://github.com/leanprover-community/riemann-hypothesis/blob/main/verification/NOTES.md",
    publication: "formal-artifact",
    access: "Public repository",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Search excerpt only." },
    problems: ["riemann"],
    why: "Records how the main theorem is assembled, which an independent audit would need to re-check.",
    passages: [
      { id: "lean-rh-route", anchor: "Statements", kind: "paraphrase", text: "Main.lean derives riemannHypothesis from a statement that no Dirichlet L-function vanishes for Re s > 1/2.", supports: ["riemann:external-formal"] },
    ],
  },
  {
    id: "anthropic-zeta",
    title: "Claude improves a lower bound for zeros of the Riemann zeta function on the critical line",
    authors: ["Anthropic"],
    year: 2026,
    kind: "news",
    url: "https://anthropic.com/research/riemann-zeta",
    publication: "news",
    access: "Public web page; paper and Lean development linked",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null },
    problems: ["riemann"],
    why: "August 2026 result: the proven proportion of zeros on the critical line raised from about 41.6% to about 67.2%. Not a proof of RH.",
    passages: [
      { id: "anthropic-zeta-bound", anchor: "Post dated 10 August 2026", kind: "paraphrase", text: "An unreleased research version of Claude raised the known lower bound for the proportion of zeros on the critical line from 41.6% to 67.2%, with a Lean formalization.", supports: ["riemann:proportion"] },
    ],
  },
  {
    id: "platt-trudgian",
    title: "The Riemann hypothesis is true up to 3·10^12",
    authors: ["Dave Platt", "Tim Trudgian"],
    year: 2021,
    venue: "Bull. London Math. Soc. 53(3), 792-797",
    kind: "paper",
    url: "https://arxiv.org/abs/2004.09765",
    doi: "10.1112/blms.12460",
    arxiv: { id: "2004.09765", version: "v1" },
    publication: "published",
    access: "arXiv preprint open; journal version subscription",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract read." },
    problems: ["riemann"],
    why: "Rigorous (interval arithmetic) verification of RH up to height 3·10^12; all these zeros are simple.",
    passages: [
      { id: "pt-abstract", anchor: "Abstract", kind: "paraphrase", text: "Using interval arithmetic, all zeros with 0 < gamma <= 3·10^12 are shown to have real part 1/2.", supports: ["riemann:computed-height"] },
    ],
  },
  {
    id: "loeffler-stoll",
    title: "Formalizing zeta and L-functions in Lean",
    authors: ["David Loeffler", "Michael Stoll"],
    year: 2025,
    venue: "Annals of Formalized Mathematics 1",
    kind: "paper",
    url: "https://arxiv.org/abs/2503.00959",
    doi: "10.46298/afm.15328",
    arxiv: { id: "2503.00959", version: "v4" },
    publication: "published",
    access: "Open access",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract and declaration list read." },
    problems: ["riemann"],
    why: "Documents Mathlib's formal statement RiemannHypothesis, the statement any formal audit must match.",
    passages: [
      { id: "ls-rh-def", anchor: "Section 1.2", kind: "paraphrase", text: "Mathlib defines riemannZeta and a proposition RiemannHypothesis stating that zeros outside the trivial ones and s = 1 have real part 1/2.", supports: ["riemann:target", "riemann:external-formal"] },
    ],
  },
  {
    id: "openai-ns",
    title: "On the Navier-Stokes Millennium Prize Problem",
    authors: ["OpenAI"],
    year: 2026,
    kind: "news",
    url: "https://openai.com/index/navier-stokes-solution/",
    publication: "news",
    access: "Public web page; write-up and Lean formalization linked",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Read through search excerpts." },
    problems: ["ns"],
    why: "The claim under evaluation: finite-time singularity of 3D Navier–Stokes with a smooth external force, establishing statements (C) and (D).",
    passages: [
      { id: "openai-ns-claim", anchor: "The result", kind: "paraphrase", text: "A smooth external force acts on fluid that starts at rest; energy stays finite while the velocity becomes unbounded in finite time. The post says this establishes (C) and also (D).", supports: ["ns:external-claim"] },
    ],
  },
  {
    id: "sciam-ns",
    title: "Did OpenAI solve the wrong Navier-Stokes problem?",
    authors: ["Scientific American"],
    year: 2026,
    kind: "news",
    url: "https://scientificamerican.com/article/did-openai-solve-the-wrong-navier-stokes-problem",
    publication: "news",
    access: "Public web page",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Search excerpt only." },
    problems: ["ns"],
    why: "Reports the debate over whether the forced version is the problem most experts had in mind; the official (C)/(D) explicitly allow forcing.",
    passages: [
      { id: "sciam-force", anchor: "Article body", kind: "paraphrase", text: "Experts usually think of the unforced problem; the forcing-based route builds on the Cordoba and Martinez-Zoroa program.", supports: ["ns:external-claim"] },
    ],
  },
  {
    id: "bsz-majority",
    title: "A majority of elliptic curves over Q satisfy the Birch and Swinnerton-Dyer conjecture",
    authors: ["Manjul Bhargava", "Christopher Skinner", "Wei Zhang"],
    year: 2014,
    kind: "preprint",
    url: "https://arxiv.org/abs/1407.1826",
    arxiv: { id: "1407.1826", version: "v2" },
    publication: "preprint",
    access: "Open access (arXiv)",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract and Theorems 1-3 read." },
    problems: ["bsd"],
    why: "Shows that at least 66.48% of curves ordered by height satisfy the rank part; a statement about proportions, not every curve.",
    passages: [
      { id: "bsz-6648", anchor: "Theorems 1-2", kind: "paraphrase", text: "At least 66.48% of elliptic curves over Q, ordered by height, satisfy the BSD rank conjecture and have finite Tate-Shafarevich group.", supports: ["bsd:bsz"] },
    ],
  },
  {
    id: "bhargava-shankar",
    title: "Ternary cubic forms having bounded invariants, and the existence of a positive proportion of elliptic curves having rank 0",
    authors: ["Manjul Bhargava", "Arul Shankar"],
    year: 2015,
    venue: "Annals of Mathematics 181(2), 587-621",
    kind: "paper",
    url: "https://annals.math.princeton.edu/wp-content/uploads/annals-v181-n2-p04-p.pdf",
    doi: "10.4007/annals.2015.181.2.4",
    publication: "published",
    access: "Journal PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Introduction excerpt read." },
    problems: ["bsd"],
    why: "Average-rank bounds and positive proportions of rank 0 via Selmer group averages; the basis for proportion results.",
    passages: [
      { id: "bs-positive", anchor: "Introduction", kind: "paraphrase", text: "Combining Selmer averages with Skinner-Urban, a positive proportion of curves have analytic rank 0 and satisfy BSD.", supports: ["bsd:bsz"] },
    ],
  },
  {
    id: "bgz-rank3",
    title: "On the conjecture of Birch and Swinnerton-Dyer for an elliptic curve of rank 3",
    authors: ["Joe P. Buhler", "Benedict H. Gross", "Don B. Zagier"],
    year: 1985,
    venue: "Mathematics of Computation 44, 473-481",
    kind: "paper",
    url: "https://www.ams.org/journals/mcom/1985-44-170/S0025-5718-1985-0777279-X",
    doi: "10.1090/S0025-5718-1985-0777279-X",
    publication: "published",
    access: "Abstract public",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract read." },
    problems: ["bsd"],
    why: "The model for proving analytic rank 3: forced vanishing of lower derivatives plus numerical nonvanishing of L'''(E,1), for the curve of conductor 5077.",
    passages: [
      { id: "bgz-triple", anchor: "Abstract", kind: "paraphrase", text: "Assuming modularity for the curve of conductor 5077, its L-series has a triple zero at s = 1; the leading coefficient matches regulator times period.", supports: ["bsd:instance-5077", "bsd:rank4-gap"] },
    ],
  },
  {
    id: "bmsw-average",
    title: "Average ranks of elliptic curves: tension between data and conjecture",
    authors: ["Baur Bektemirov", "Barry Mazur", "William Stein", "Mark Watkins"],
    year: 2007,
    venue: "Bull. Amer. Math. Soc. 44, 233-254",
    kind: "paper",
    url: "https://www.ams.org/bull/2007-44-02/S0273-0979-07-01138-X/",
    publication: "published",
    access: "Open access",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract read." },
    problems: ["bsd"],
    why: "Explains why small-conductor data overstate average rank; the selection-effect warning for the family explorer.",
    passages: [
      { id: "bmsw-tension", anchor: "Abstract", kind: "paraphrase", text: "Average-rank data computed at accessible conductors appear to disagree with the predicted limit; the authors argue the two are compatible once slow convergence is understood.", supports: ["bsd:family-pattern"] },
    ],
  },
  {
    id: "gjpst-verification",
    title: "Computational verification of the Birch and Swinnerton-Dyer conjecture for individual elliptic curves",
    authors: ["G. Grigorov", "A. Jorza", "S. Patrikis", "W. Stein", "C. Tarnita"],
    year: 2009,
    venue: "Mathematics of Computation 78, 2397-2425",
    kind: "paper",
    url: "https://ctarnita.scholar.princeton.edu/document/95",
    publication: "published",
    access: "Author PDF",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Abstract read." },
    problems: ["bsd"],
    why: "Shows what full verification of the leading-coefficient formula for specific curves requires beyond rank equality.",
    passages: [
      { id: "gjpst-scope", anchor: "Abstract", kind: "paraphrase", text: "For non-CM curves of conductor at most 1000 and rank 0 or 1, the full BSD formula is verified up to certain excluded odd primes.", supports: ["bsd:refinement"] },
    ],
  },
  {
    id: "pari-elliptic",
    title: "PARI/GP reference: elliptic curves (ellrank, ellanalyticrank, ellsaturation, ellratpoints)",
    authors: ["The PARI Group"],
    year: 2026,
    kind: "software-doc",
    url: "https://pari.math.u-bordeaux.fr/dochtml/html/Elliptic_curves.html",
    publication: "documentation",
    access: "Public documentation",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null },
    problems: ["bsd"],
    why: "States which outputs are unconditional and which rely on a numerical threshold; drives the exactness tags in every BSD artifact.",
    passages: [
      { id: "pari-analyticrank", anchor: "ellanalyticrank", kind: "quote", text: "it is assumed that any value less than eps is zero", supports: ["bsd:rank4-gap", "bsd:rejected-numerical"] },
      { id: "pari-ellrank", anchor: "ellrank", kind: "quote", text: "The algorithm computes unconditionally three quantities", supports: ["bsd:instance-5077", "bsd:instance-389"] },
    ],
  },
  {
    id: "mathworld-mpp",
    title: "Millennium Prize Problems",
    authors: ["Wolfram MathWorld"],
    year: 2026,
    kind: "news",
    url: "https://mathworld.wolfram.com/MillenniumPrizeProblems.html",
    publication: "news",
    access: "Public web page",
    retrieval: { status: "retrieved", at: BUILD, via: viaWeb, contentHash: null, note: "Secondary source. Used only to locate primary statements." },
    problems: ["riemann", "ns"],
    why: "Secondary summary of 2026 developments, pointing to the primary CMI and community statements.",
    passages: [],
  },
  // ---- metadata-only (access gap in this environment) ----
  ...metadataOnly(),
];

function metadataOnly(): SourceDocument[] {
  const gap = "Text not retrieved in the build environment; bibliographic record only.";
  const m = (o: Partial<SourceDocument> & Pick<SourceDocument, "id" | "title" | "authors" | "year" | "url" | "problems" | "why">): SourceDocument => ({
    kind: "paper", publication: "published", access: "Journal (not accessed)", passages: [],
    retrieval: { status: "metadata-only", reason: gap }, ...o,
  });
  return [
    m({ id: "gross-zagier", title: "Heegner points and derivatives of L-series", authors: ["Benedict H. Gross", "Don B. Zagier"], year: 1986, venue: "Invent. Math. 84, 225-320", url: "https://doi.org/10.1007/BF01388809", doi: "10.1007/BF01388809", problems: ["bsd"], why: "Relates L'(E,1) to the height of a Heegner point; with Kolyvagin gives rank equality in analytic rank 1." }),
    m({ id: "kolyvagin-euler", title: "Euler systems", authors: ["Victor A. Kolyvagin"], year: 1990, venue: "The Grothendieck Festschrift, Vol. II, Birkhauser", url: "https://doi.org/10.1007/978-0-8176-4575-5_11", problems: ["bsd"], why: "Bounds Selmer groups using Heegner points: analytic rank 0 or 1 implies equal algebraic rank and finite Sha." }),
    m({ id: "wiles-flt", title: "Modular elliptic curves and Fermat's Last Theorem", authors: ["Andrew Wiles"], year: 1995, venue: "Ann. of Math. 141, 443-551", url: "https://doi.org/10.2307/2118559", doi: "10.2307/2118559", problems: ["bsd"], why: "Modularity of semistable curves; with Taylor-Wiles and BCDT, all curves over Q." }),
    m({ id: "bcdt", title: "On the modularity of elliptic curves over Q: wild 3-adic exercises", authors: ["C. Breuil", "B. Conrad", "F. Diamond", "R. Taylor"], year: 2001, venue: "J. Amer. Math. Soc. 14, 843-939", url: "https://doi.org/10.1090/S0894-0347-01-00370-8", doi: "10.1090/S0894-0347-01-00370-8", problems: ["bsd"], why: "Completes modularity for all elliptic curves over Q." }),
    m({ id: "skinner-converse", title: "A converse to a theorem of Gross, Zagier, and Kolyvagin", authors: ["Christopher Skinner"], year: 2020, venue: "Ann. of Math. 191", url: "https://arxiv.org/abs/1405.7294", arxiv: { id: "1405.7294" }, problems: ["bsd"], why: "p-converse in rank 1 under stated hypotheses on p." }),
    m({ id: "tao-averaged", title: "Finite time blowup for an averaged three-dimensional Navier-Stokes equation", authors: ["Terence Tao"], year: 2016, venue: "J. Amer. Math. Soc. 29, 601-674", url: "https://arxiv.org/abs/1402.0290", arxiv: { id: "1402.0290" }, problems: ["ns"], why: "Blowup for an averaged equation obeying the same energy identity: a barrier for proofs using only those structures." }),
    m({ id: "ckn", title: "Partial regularity of suitable weak solutions of the Navier-Stokes equations", authors: ["L. Caffarelli", "R. Kohn", "L. Nirenberg"], year: 1982, venue: "Comm. Pure Appl. Math. 35, 771-831", url: "https://doi.org/10.1002/cpa.3160350604", doi: "10.1002/cpa.3160350604", problems: ["ns"], why: "The singular set of suitable weak solutions has one-dimensional parabolic Hausdorff measure zero." }),
    m({ id: "leray", title: "Sur le mouvement d'un liquide visqueux emplissant l'espace", authors: ["Jean Leray"], year: 1934, venue: "Acta Math. 63, 193-248", url: "https://doi.org/10.1007/BF02547354", doi: "10.1007/BF02547354", problems: ["ns"], why: "Global weak solutions in 3D." }),
    m({ id: "bgs", title: "Relativizations of the P =? NP question", authors: ["T. Baker", "J. Gill", "R. Solovay"], year: 1975, venue: "SIAM J. Comput. 4, 431-442", url: "https://doi.org/10.1137/0204037", doi: "10.1137/0204037", problems: ["pnp"], why: "Oracles exist relative to which P = NP and P != NP: relativizing techniques cannot settle the question." }),
    m({ id: "razborov-rudich", title: "Natural proofs", authors: ["A. Razborov", "S. Rudich"], year: 1997, venue: "J. Comput. System Sci. 55, 24-35", url: "https://doi.org/10.1006/jcss.1997.1494", doi: "10.1006/jcss.1997.1494", problems: ["pnp"], why: "Natural circuit lower-bound arguments would break pseudorandom generators believed to exist." }),
    m({ id: "aaronson-wigderson", title: "Algebrization: a new barrier in complexity theory", authors: ["S. Aaronson", "A. Wigderson"], year: 2009, venue: "ACM Trans. Comput. Theory 1", url: "https://doi.org/10.1145/1490270.1490272", doi: "10.1145/1490270.1490272", problems: ["pnp"], why: "Algebrizing techniques cannot separate P from NP." }),
    m({ id: "cook-1971", title: "The complexity of theorem-proving procedures", authors: ["Stephen A. Cook"], year: 1971, venue: "Proc. 3rd ACM STOC, 151-158", url: "https://doi.org/10.1145/800157.805047", doi: "10.1145/800157.805047", problems: ["pnp"], why: "SAT is NP-complete (Cook-Levin)." }),
    m({ id: "wilson-1974", title: "Confinement of quarks", authors: ["Kenneth G. Wilson"], year: 1974, venue: "Phys. Rev. D 10, 2445", url: "https://doi.org/10.1103/PhysRevD.10.2445", doi: "10.1103/PhysRevD.10.2445", problems: ["ym"], why: "Lattice gauge theory and Wilson loops; area law as a confinement criterion." }),
    m({ id: "creutz-1980", title: "Monte Carlo study of quantized SU(2) gauge theory", authors: ["Michael Creutz"], year: 1980, venue: "Phys. Rev. D 21, 2308", url: "https://doi.org/10.1103/PhysRevD.21.2308", doi: "10.1103/PhysRevD.21.2308", problems: ["ym"], why: "Heat-bath Monte Carlo for 4D SU(2) on the lattice." }),
    m({ id: "atiyah-hirzebruch", title: "Analytic cycles on complex manifolds", authors: ["M. F. Atiyah", "F. Hirzebruch"], year: 1962, venue: "Topology 1, 25-45", url: "https://doi.org/10.1016/0040-9383(62)90094-0", doi: "10.1016/0040-9383(62)90094-0", problems: ["hodge"], why: "Integral Hodge classes need not be algebraic: the integral version fails." }),
    m({ id: "voisin-2002", title: "A counterexample to the Hodge conjecture extended to Kahler varieties", authors: ["Claire Voisin"], year: 2002, venue: "Int. Math. Res. Not. 2002(20), 1057-1075", url: "https://doi.org/10.1155/S1073792802111135", doi: "10.1155/S1073792802111135", problems: ["hodge"], why: "The Kahler analogue fails, so projectivity is essential." }),
    m({ id: "lefschetz-11", title: "L'analysis situs et la geometrie algebrique", authors: ["Solomon Lefschetz"], year: 1924, venue: "Gauthier-Villars", url: "https://archive.org/details/lanalysissituset00lefs", problems: ["hodge"], why: "Lefschetz (1,1) theorem: Hodge classes in degree 2 are algebraic." , kind: "paper" }),
    m({ id: "prz-512", title: "More than five-twelfths of the zeros of zeta are on the critical line", authors: ["K. Pratt", "N. Robles", "A. Zaharescu", "D. Zeindler"], year: 2020, venue: "Res. Math. Sci. 7", url: "https://arxiv.org/abs/1802.10521", arxiv: { id: "1802.10521" }, problems: ["riemann"], why: "The proportion record (about 41.7%) before August 2026." }),
  ];
}

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
export function sourcesFor(problem: string) {
  return SOURCES.filter((s) => s.problems.includes(problem));
}
