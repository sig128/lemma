"""Generate the BSD datasets used by the web instruments.

Every number written here comes from a PARI/GP call made in this script.
Exactness is tagged per field: "exact" (rational/integer arithmetic or a
theorem-backed deduction), "numerical" (floating point at the recorded
precision), or "conditional" (depends on a stated hypothesis).

Run:  python3 -I research/scripts/gen_bsd.py web/public/data/bsd
"""
from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import cypari2

pari = cypari2.Pari()
pari.allocatemem(512 * 1024 * 1024)
PREC_DIGITS = 38  # ~128 bits
pari.set_real_precision(PREC_DIGITS)

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "web/public/data/bsd")
OUT.mkdir(parents=True, exist_ok=True)

PARI_VERSION = ".".join(str(v) for v in pari.version())
RUN_AT = datetime.now(timezone.utc).isoformat(timespec="seconds")


def prov(functions: list[str], **extra):
    p = {
        "tool": "PARI/GP via cypari2",
        "pari_version": PARI_VERSION,
        "cypari2_version": "2.2.9",
        "python": platform.python_version(),
        "realprecision_digits": PREC_DIGITS,
        "functions": functions,
        "computed_at": RUN_AT,
        "script": "research/scripts/gen_bsd.py",
    }
    p.update(extra)
    return p


def s(x) -> str:
    return str(x)


def fnum(x, digits=20) -> str:
    """Numerical value as a decimal string (PARI real), `digits` significant digits."""
    return str(pari(f'Strprintf("%.{digits}g", {x})'))


def kodaira_symbol(code: int) -> str:
    """PARI Kodaira codes: 1=II, 2=III, 3=IV, 4+v=I_v; -1=I0*, -2=II*, -3=III*, -4=IV*, -4-v=I_v*."""
    if code == 0:
        return "I0"
    if code > 0:
        return {1: "II", 2: "III", 3: "IV"}.get(code, f"I{code - 4}")
    return {-1: "I0*", -2: "II*", -3: "III*", -4: "IV*"}.get(code, f"I{-code - 4}*")


CURVES = [
    {
        "id": "11a1", "lmfdb": "11.a2", "ainvs": [0, -1, 1, -10, -20],
        "tex": r"y^2 + y = x^3 - x^2 - 10x - 20",
        "note": "Smallest conductor of any elliptic curve over Q. Rank 0, torsion of order 5.",
    },
    {
        "id": "37a1", "lmfdb": "37.a1", "ainvs": [0, 0, 1, -1, 0],
        "tex": r"y^2 + y = x^3 - x",
        "note": "Smallest conductor with positive rank. Rank 1.",
    },
    {
        "id": "389a1", "lmfdb": "389.a1", "ainvs": [0, 1, 1, -2, 0],
        "tex": r"y^2 + y = x^3 + x^2 - 2x",
        "note": "Smallest conductor of rank 2.",
    },
    {
        "id": "5077a1", "lmfdb": "5077.a1", "ainvs": [0, 0, 1, -7, 6],
        "tex": r"y^2 + y = x^3 - 7x + 6",
        "note": "Smallest conductor of rank 3; analytic rank 3 established by Buhler-Gross-Zagier (1985).",
    },
    {
        "id": "234446a1", "lmfdb": "234446.a1", "ainvs": [1, -1, 0, -79, 289],
        "tex": r"y^2 + xy = x^3 - x^2 - 79x + 289",
        "note": "Smallest known conductor of rank 4.",
    },
]


def derivative_status(k: int, r_alg: int, w: int, val, eps) -> dict:
    """Classify L^{(k)}(E,1) using only theorems plus the numerical value.

    Theorems used (each recorded in the output):
      parity:  Lambda(E,s) = w Lambda(E,2-s), so derivatives of order with
               (-1)^k = -w vanish identically.
      kolyvagin0: L(E,1) != 0 implies rank 0 (Kolyvagin, with modularity).
      gzk1:    L(E,1) = 0 and L'(E,1) != 0 implies rank 1 (Gross-Zagier + Kolyvagin).
    """
    v = abs(float(val))
    if (-1) ** k == -w:
        return {"k": k, "value": fnum(val), "status": "zero-theorem",
                "reason": f"Root number w = {w:+d}: the functional equation forces every derivative of order k with (-1)^k = -w to vanish."}
    if k == 0 and r_alg >= 1:
        return {"k": k, "value": fnum(val), "status": "zero-theorem",
                "reason": "Algebraic rank >= 1 is certified, and Kolyvagin's theorem says L(E,1) != 0 forces rank 0, so L(E,1) = 0."}
    if k == 1 and r_alg >= 2:
        return {"k": k, "value": fnum(val), "status": "zero-theorem",
                "reason": "Algebraic rank >= 2 is certified, and Gross-Zagier + Kolyvagin say a simple zero forces rank 1, so L'(E,1) = 0."}
    if v < eps:
        return {"k": k, "value": fnum(val), "status": "numerically-zero",
                "reason": f"|value| < {eps:.1e} at {PREC_DIGITS}-digit precision. No available theorem forces exact vanishing; numerical smallness is not a proof."}
    return {"k": k, "value": fnum(val), "status": "nonzero-numerical",
            "reason": "Numerically nonzero with a margin far above the working precision (PARI floating point, not interval arithmetic)."}


def curve_record(c: dict) -> dict:
    t0 = time.time()
    E = pari.ellinit(c["ainvs"])
    gr = pari.ellglobalred(E)
    N = int(gr[0])
    disc = E[11]
    j = E[12]
    tors = pari.elltors(E)
    tors_order = int(tors[0])
    tors_struct = [int(x) for x in tors[1]]
    tors_gens = [[s(P[0]), s(P[1])] for P in tors[2]] if tors_order > 1 else []
    w = int(pari.ellrootno(E))
    loc = []
    fa = gr[3]
    for i in range(len(fa[0])):
        p = int(fa[0][i])
        lr = pari.elllocalred(E, p)
        loc.append({"p": p, "conductor_exponent": int(lr[0]), "kodaira": kodaira_symbol(int(lr[1])), "c_p": int(lr[3])})
    tam = int(gr[2])

    rk = pari.ellrank(E)
    r_lo, r_hi, sha_s = int(rk[0]), int(rk[1]), int(rk[2])
    pts = [list(P) for P in rk[3]]
    sat_bound = 200
    gens = pari.ellsaturation(E, rk[3], sat_bound) if r_lo > 0 else []
    gens = [[s(P[0]), s(P[1])] for P in gens]
    reg = pari.matdet(pari.ellheightmatrix(E, [[pari(x), pari(y)] for x, y in gens])) if gens else pari(1)
    heights = [fnum(pari.ellheight(E, [pari(x), pari(y)])) for x, y in gens]

    an = pari.ellanalyticrank(E)
    r_an = int(an[0])
    lead = an[1]
    eps = 2.0 ** (-(PREC_DIGITS * 3.32) / 2)

    derivs = []
    for k in range(0, max(r_an, r_lo) + 1):
        val = pari.lfun(E, 1, k) if k > 0 else pari.lfun(E, 1)
        derivs.append(derivative_status(k, r_lo, w, val, eps))

    bsd_c = pari.ellbsd(E)  # Omega * prod c_p / |T|^2 (PARI definition)
    fact = math.factorial(r_an)
    sha_an = (lead / fact) / (bsd_c * reg)

    # L(E,s) along the real line near s = 1
    samples = []
    for i in range(0, 61):
        sv = 0.4 + i * 0.02
        samples.append([round(sv, 4), float(pari.lfun(E, pari(f"{sv:.4f}")))])

    # rational points of bounded naive height
    h_bound = 400 if N < 100000 else 150
    rp = pari.ellratpoints(E, h_bound)
    points = [[s(P[0]), s(P[1])] for P in rp]

    # multiples / small combinations of generators (exact)
    combos = []
    if gens:
        G = [[pari(x), pari(y)] for x, y in gens]
        if len(G) == 1:
            for n in range(1, 9):
                Q = pari.ellmul(E, G[0], n)
                if Q != [0]:
                    combos.append({"coeffs": [n], "x": s(Q[0]), "y": s(Q[1])})
        else:
            rng = range(-2, 3)
            import itertools
            for co in itertools.product(rng, repeat=len(G)):
                if all(a == 0 for a in co):
                    continue
                Q = [0]
                for a, P in zip(co, G):
                    Q = pari.elladd(E, Q, pari.ellmul(E, P, a))
                if Q != [0]:
                    combos.append({"coeffs": list(co), "x": s(Q[0]), "y": s(Q[1])})

    r_alg_certified = r_lo == r_hi
    lz = [d for d in derivs if d["status"] in ("zero-theorem",)]
    nz = [d for d in derivs if d["status"] == "numerically-zero"]
    lead_status = derivs[r_an]["status"] if r_an < len(derivs) else "unknown"
    if not nz and lead_status == "nonzero-numerical" and len(lz) == r_an:
        an_status = "established"
        an_text = f"ord_(s=1) L(E,s) = {r_an}: lower derivatives vanish by theorem; L^({r_an})(E,1) is numerically nonzero."
    else:
        possible = sorted({d['k'] for d in nz} | {r_an})
        an_status = "open"
        an_text = (f"ord_(s=1) L(E,s) is in {possible}: derivative(s) of order {[d['k'] for d in nz]} are numerically zero "
                   "but no theorem forces exact vanishing.")

    if r_alg_certified and an_status == "established" and r_an == r_lo:
        if r_an <= 1:
            rank_eq = {"status": "theorem", "text": "Rank equality holds: analytic rank <= 1, so Gross-Zagier + Kolyvagin apply (with modularity)."}
        else:
            rank_eq = {"status": "verified-instance", "text": f"Both sides equal {r_an} for this specific curve. No general theorem covers rank {r_an}; this is a checked instance, not a proof of the conjecture."}
    elif r_alg_certified and an_status == "open":
        rank_eq = {"status": "open", "text": f"Algebraic rank {r_lo} is certified, but the analytic order is not determined. Rank equality for this curve is open."}
    else:
        rank_eq = {"status": "open", "text": "Algebraic rank not certified by 2-descent."}

    rec = {
        "id": c["id"], "cremona_label": c["id"], "lmfdb_label": c["lmfdb"],
        "ainvs": c["ainvs"], "equation_tex": c["tex"], "note": c["note"],
        "conductor": N, "discriminant": s(disc), "j_invariant": s(j),
        "torsion": {"order": tors_order, "structure": tors_struct, "generators": tors_gens, "exactness": "exact"},
        "root_number": w,
        "local_data": loc, "tamagawa_product": tam,
        "rank_bounds": {
            "lower": r_lo, "upper": r_hi, "sha_2_info_s": sha_s, "exactness": "exact",
            "method": "PARI ellrank: 2-descent. Lower bound from exhibited independent points; upper bound from the 2-Selmer rank minus torsion and the even quantity s (documented by PARI as computed unconditionally).",
        },
        "generators": gens, "saturation": {"bound": sat_bound, "meaning": f"Index of the subgroup generated is not divisible by any prime < {sat_bound} (PARI ellsaturation)."},
        "canonical_heights": heights, "regulator": fnum(reg),
        "analytic": {
            "order_numerical": r_an, "leading_derivative": fnum(lead), "leading_over_factorial": fnum(lead / fact),
            "threshold_eps": f"{eps:.3e}", "status": an_status, "summary": an_text,
            "method": "PARI ellanalyticrank and lfun. PARI documents that values below eps are assumed to be zero; the order it reports is numerical.",
            "derivatives_at_1": derivs,
        },
        "rank_equality": rank_eq,
        "bsd_refinement": {
            "ellbsd_constant": fnum(bsd_c), "sha_analytic": fnum(sha_an, 15),
            "meaning": "sha_analytic = (L^(r)(E,1)/r!) / (ellbsd(E) * Regulator). The full BSD formula predicts this equals #Sha(E/Q). This is a numerical consistency check of the leading-coefficient refinement, separate from rank equality.",
            "exactness": "numerical",
        },
        "L_real_samples": {"s": [p[0] for p in samples], "L": [p[1] for p in samples], "exactness": "numerical"},
        "point_search": {"height_bound": h_bound, "points": points, "count": len(points),
                         "meaning": f"Affine rational points with naive height below {h_bound} returned by PARI ellratpoints. The point at infinity O is the identity and is not listed. For rank > 0, E(Q) is infinite, so any finite search is incomplete.",
                         "exactness": "exact"},
        "generator_combinations": combos,
        "provenance": prov(["ellinit", "ellglobalred", "elltors", "ellrootno", "ellrank", "ellsaturation", "ellheightmatrix",
                            "ellheight", "ellanalyticrank", "lfun", "ellbsd", "ellratpoints", "ellmul", "elladd"],
                           wall_seconds=round(time.time() - t0, 3)),
    }
    return rec


def fundamental_discriminants(bound: int):
    out = []
    for d in range(-bound, bound + 1):
        if d in (0, 1):
            continue
        if pari.isfundamental(d):
            out.append(d)
    return out


def twist_family(base: dict, bound: int):
    E0 = pari.ellinit(base["ainvs"])
    N0 = int(pari.ellglobalred(E0)[0])
    rows = []
    t_all = time.time()
    for d in fundamental_discriminants(bound):
        if math.gcd(abs(d), N0) != 1:
            continue
        t0 = time.time()
        Ed = pari.ellinit(pari.elltwist(E0, d))
        Ed = pari.ellinit(pari.ellminimalmodel(Ed))
        N = int(pari.ellglobalred(Ed)[0])
        w = int(pari.ellrootno(Ed))
        try:
            rk = pari.ellrank(Ed)
            r_lo, r_hi = int(rk[0]), int(rk[1])
        except Exception:
            r_lo, r_hi = None, None
        an = pari.ellanalyticrank(Ed)
        r_an = int(an[0])
        lead = float(an[1])
        sha_an = None
        route = None
        if r_an <= 1 and (r_lo is None or r_lo <= r_an <= r_hi):
            status = "theorem"
            route = "descent and analytic agree" if r_lo == r_hi else "analytic: Gross-Zagier-Kolyvagin determines the rank; 2-descent bounds do not meet (nontrivial Sha[2] expected)"
            if r_an == 0:
                sha_an = float(an[1] / pari.ellbsd(Ed))
        elif r_lo is not None and r_lo == r_hi and r_an == r_lo and r_an in (2, 3):
            status = "verified-instance"
            route = "descent certifies the rank; lower derivatives vanish by parity/Kolyvagin/GZK; leading derivative numerically nonzero"
        elif r_lo is not None and r_lo == r_hi:
            status = "open"
            route = "analytic order not established"
        else:
            status = "rank-undetermined"
            route = "2-descent bounds do not meet and the analytic rank is >= 2"
        rows.append({"d": d, "conductor": N, "root_number": w, "rank_lower": r_lo, "rank_upper": r_hi,
                     "analytic_order_numerical": r_an, "leading_derivative": lead, "status": status, "route": route,
                     "sha_analytic": sha_an,
                     "seconds": round(time.time() - t0, 3)})
    return {
        "base": base["id"], "family": "quadratic twists E^(d)", "d_bound": bound,
        "selection": f"Fundamental discriminants d with |d| <= {bound}, gcd(d, {N0}) = 1 (twists by d sharing a prime with the conductor are excluded).",
        "rows": rows,
        "provenance": prov(["isfundamental", "elltwist", "ellminimalmodel", "ellglobalred", "ellrootno", "ellrank", "ellanalyticrank"],
                           wall_seconds=round(time.time() - t_all, 2)),
        "status_meaning": {
            "theorem": "Numerical analytic order <= 1 and consistent with the descent bounds: Gross-Zagier-Kolyvagin then give rank = analytic order (and finite Sha). When the descent bounds do not meet, the rank is determined analytically.",
            "verified-instance": "Algebraic rank 2 or 3 certified and equal to the numerical analytic order; lower-order vanishing follows from theorems as for 389a1/5077a1, the leading value is numerically nonzero.",
            "open": "Ranks disagree or the analytic order is not established.",
            "rank-undetermined": "2-descent bounds do not meet (possible nontrivial Sha[2]); algebraic rank not certified.",
        },
    }


def main():
    index = []
    for c in CURVES:
        rec = curve_record(c)
        path = OUT / f"{c['id']}.json"
        payload = json.dumps(rec, indent=1)
        path.write_text(payload)
        index.append({"id": c["id"], "lmfdb": c["lmfdb"], "tex": c["tex"], "conductor": rec["conductor"],
                      "rank": rec["rank_bounds"]["lower"], "sha256": hashlib.sha256(payload.encode()).hexdigest()})
        print(c["id"], "done", rec["provenance"]["wall_seconds"], "s", rec["analytic"]["status"], rec["rank_equality"]["status"])
    fam = twist_family(CURVES[0], int(sys.argv[2]) if len(sys.argv) > 2 else 300)
    p = json.dumps(fam, indent=1)
    (OUT / "twists-11a1.json").write_text(p)
    index.append({"id": "twists-11a1", "sha256": hashlib.sha256(p.encode()).hexdigest(), "count": len(fam["rows"])})
    (OUT / "index.json").write_text(json.dumps({"generated_at": RUN_AT, "pari_version": PARI_VERSION, "files": index}, indent=1))
    print("twists:", len(fam["rows"]), "in", fam["provenance"]["wall_seconds"], "s")


if __name__ == "__main__":
    main()
