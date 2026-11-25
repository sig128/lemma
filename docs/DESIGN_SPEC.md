# Design spec

Lemma is a dark observatory: a calm room where the instrument is the brightest thing, the record is
always one glance away, and nothing pretends to be further along than it is.

## Tokens

Defined once in `web/app/globals.css`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#080B10` | Page and stage |
| `--raised` / `--quiet` | `#10151E` / `#161D28` | Panels, selected rows |
| `--rule` / `--rule-soft` | `#263141` / `#1C2533` | Dividers, axes |
| `--text` / `--text-2` / `--muted` | `#F0ECE3` / `#A4AFBF` / `#8794A8` | Warm ink; muted meets 4.5:1 on raised surfaces |
| `--cobalt`, `--amber` | `#6B91FF`, `#E5B866` | Focus and primary accent; blocked and numerical warnings |
| `--success`, `--rejected` | `#79C6A4`, `#E38B8B` | Status marks, always paired with a glyph and a word |
| `--paper*` | `#EEE9DF` and inks | The source reader: sources read as paper, not as UI |
| `--series-1..4` | `#5C82F2 #BA8A2E #8E79DC #2F9E82` | Chart series, validated for colour-vision deficiency on the dark surface |

Each problem sets its own `--accent` pair on `[data-problem]` (BSD cobalt and amber, Riemann lilac,
P vs NP amber and white, Navier–Stokes ice and coral, Yang–Mills jade and gold, Hodge bone and rose).

Type: Newsreader (display, optical sizes) for titles and statements, IBM Plex Sans for interface text,
IBM Plex Mono for values that are copied or compared. KaTeX renders every formula (`trust: false`).
Spacing steps 4 to 64 px; radii 2, 4, 6 px; motion 160, 320, 420 ms on one easing curve.

## Layout

```
┌ top bar: wordmark · search (⌘K) · engine mode ───────────────────────────────┐
│rail│ problem tabs (official status | community status)                       │
│    │ view tabs: Explore Research Evidence Proof Sources History   PNG SVG Focus│
│    │ ┌ stage ─────────────────────────────┐ ┌ inspector ──────────────┐       │
│    │ │ title, equation, facts      tools  │ │ selected object          │       │
│    │ │ instrument (measured inset below)  │ │ arithmetic / provenance  │       │
│    │ │                                    │ │ what the agent attempts  │       │
│    │ ├ timeline dock (recorded or live) ──┤ │ evidence, unresolved     │       │
│    │ └────────────────────────────────────┘ └──────────────────────────┘       │
```

- The stage header's height is measured (ResizeObserver) and passed to instruments, so drawings start
  below it at any width and with any equation.
- The inspector is resizable (280 to 640 px, remembered) and becomes a drawer in focus mode.
- Under 920 px the rail moves to the bottom and the inspector stacks under the stage; under 640 px of stage
  width the header stacks its tools, panels flow below drawings and the stage scrolls.

## Instruments

| Workspace | Instrument | Computed where |
|---|---|---|
| BSD | Curve with the exact chord-and-tangent group law; L(E,s) near 1 with a log-scale derivative ledger and the precision floor; twist family | Browser (rational arithmetic) and PARI datasets |
| Riemann | Domain colouring of ζ in the strip (equal-lightness OKLCH phase), Hardy's Z(t) aligned with the zeros; primes from zeros | Browser worker (Borwein series), checked against mpmath |
| P vs NP | Clause–variable graph with a CDCL trace; search versus verification benchmark | Browser worker, DRUP proofs checked independently |
| Navier–Stokes | 2D pseudo-spectral vorticity solver, mesh refinement, Taylor–Green exact check | Browser worker |
| Yang–Mills | 2D U(1) lattice Monte Carlo against the exact finite-volume solution, blocking-analysis errors | Browser worker |
| Hodge | WebGL2 ray-traced Clebsch cubic with its 27 exact lines; SVG fallback | Browser GPU and an exact dataset |

Illustrations are labelled as such (dashed amber badge); computed values carry exactness tags.

## Interaction

- URL holds the state of every view (curve, point, derivative, zero, line, node, source), so any view can
  be linked and reloaded.
- Command palette (Ctrl/⌘ K) reaches problems, objects, sources, bounded-task presets and actions.
- Focus mode (F, Esc to leave) hides chrome and keeps a caption bar with the object and its official status.
- Export writes the instrument's drawing layers as PNG or SVG with a caption: title, URL parameters, UTC
  time, and a provenance line. Chart views export their charts only.
- Keyboard: tabs use roving focus with arrow keys; instruments pan and zoom with arrows and +/−; zeros,
  points and graph nodes are buttons.

## Accessibility and motion

Visible focus rings everywhere; status is never colour alone (glyph plus word); muted text meets 4.5:1;
reduced motion follows the system setting and can be forced from the palette (remembered across visits);
forced-colours mode keeps selection marks visible.

## Visual review log

Three passes in headless Chrome at 1440×900, 820×1180 and 390×844, every workspace and view.

1. **Composition**: drawings ran under the stage headers (Riemann, P vs NP, Yang–Mills, Hodge), and the
   Riemann domain colouring read as a saturated rainbow. Fixed with the measured header inset, a shorter
   Riemann equation, an equal-lightness phase palette, and room for axis labels. The P vs NP graph was small
   and covered by its trace panel; panels moved to a side column. The archive glyph rendered at full width;
   it is now sized, and the archive shows a labelled schematic of a neck pinch. Middle-dot meta strings and
   upper-case role names were replaced by plain separators and readable names.
2. **Interaction**: focus mode, the inspector drawer, PNG and SVG export, the palette, zero selection, point
   picking and reduced-motion persistence were driven by script (`web/scripts/dev/interact.mjs`). Findings
   fixed: the header measurement detached under React's double mount; view tabs lacked roving focus; zero
   rows had small hit targets; exported captions named the instrument rather than the object.
3. **Scientific readability**: derivative values now read as `7.31 × 10⁻⁴²` instead of PARI's
   `7.31 E-42`; sub- and superscripts in statements render properly; chart margins fit long tick labels;
   the precision-floor label no longer covers a data point; capability states say where a capability runs;
   Yang–Mills errors come from blocking analysis with a plateau test instead of fixed bins; the timeline
   shows elapsed time instead of repeated clock times.
