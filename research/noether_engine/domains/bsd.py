"""BSD computations with PARI/GP (cypari2). Runs inside the sandbox:
    PYTHONPATH=research python3 -m noether_engine.domains.bsd < request.json > result.json   (from the repository root)
Every field is tagged exact / numerical; conditional assumptions are listed.
Timing fields are excluded from the result hash so an audit re-run in a fresh
process can be compared byte-for-byte.
"""
from __future__ import annotations

import json
import math
import sys
import time

import cypari2

pari = cypari2.Pari()
pari.allocatemem(512 * 1024 * 1024)


def _num(x, digits=20) -> str:
    return str(pari(f'Strprintf("%.{digits}g", {x})'))


def invariants(ainvs, digits=38):
    pari.set_real_precision(digits)
    E = pari.ellinit(ainvs)
    gr = pari.ellglobalred(E)
    tors = pari.elltors(E)
    rk = pari.ellrank(E)
    r_lo, r_hi = int(rk[0]), int(rk[1])
    gens = pari.ellsaturation(E, rk[3], 200) if r_lo > 0 else []
    reg = pari.matdet(pari.ellheightmatrix(E, gens)) if r_lo > 0 else pari(1)
    w = int(pari.ellrootno(E))
    an = pari.ellanalyticrank(E)
    eps = 2.0 ** (-(digits * 3.32) / 2)
    ders = []
    bits = math.ceil(digits * math.log2(10))
    for k in range(0, max(int(an[0]), r_lo) + 1):
        v = pari.lfun(E, 1, k, precision=bits) if k else pari.lfun(E, 1, precision=bits)
        forced = (-1) ** k == -w or (k == 0 and r_lo >= 1) or (k == 1 and r_lo >= 2)
        ders.append({"k": k, "value": _num(v), "abs_below_eps": abs(float(v)) < eps, "forced_zero_by_theorem": bool(forced)})
    return {
        "ainvs": ainvs, "conductor": int(gr[0]), "discriminant": str(E[11]), "root_number": w,
        "torsion_order": int(tors[0]), "rank_lower": r_lo, "rank_upper": r_hi,
        "generators": [[str(P[0]), str(P[1])] for P in gens], "regulator": _num(reg),
        "analytic_order_numerical": int(an[0]), "derivatives_at_1": ders, "threshold_eps": f"{eps:.3e}",
        "exactness": {"conductor": "exact", "root_number": "exact", "torsion": "exact", "rank_bounds": "exact", "generators": "exact",
                      "regulator": "numerical", "derivatives": "numerical", "analytic_order": "numerical"},
        # PARI's ellanalyticrank treats |L^(k)(E,1)| < eps as zero, so the order it reports is numerical.
        # Whether a claim inherits this flag is decided per curve by the handler (handlers.classify_bsd):
        # derivatives forced to vanish by a theorem do not depend on the threshold.
        "method_flags": {"analytic_order_numerical": ["numerical-threshold"]},
        "provenance": {"pari": ".".join(map(str, pari.version())), "realprecision": digits,
                       "functions": ["ellinit", "ellglobalred", "elltors", "ellrank", "ellsaturation", "ellheightmatrix", "ellrootno", "ellanalyticrank", "lfun"]},
    }


def derivative_at_precisions(ainvs, k, precisions):
    out = []
    for d in precisions:
        bits = math.ceil(d * math.log2(10))
        pari.set_real_precision(d)
        E = pari.ellinit(ainvs)
        v = pari.lfun(E, 1, k, precision=bits)  # cypari2 ignores realprecision here unless precision (bits) is passed explicitly
        out.append({"digits": d, "value": _num(v, 12), "log10_abs": (math.log10(abs(float(v))) if float(v) != 0 else None),
                    "noise_floor_log10": -d})
    return {"ainvs": ainvs, "k": k, "rows": out, "exactness": "numerical", "conditional_flags": ["numerical-threshold"],
            "interpretation": "If |value| tracks the precision floor as digits increase, the computation cannot distinguish an exact zero from a tiny nonzero value; it is never a proof of vanishing."}


def twists(base, bound):
    pari.set_real_precision(38)
    E0 = pari.ellinit(base)
    N0 = int(pari.ellglobalred(E0)[0])
    rows = []
    for d in range(-bound, bound + 1):
        if d in (0, 1) or not pari.isfundamental(d) or math.gcd(abs(d), N0) != 1:
            continue
        Ed = pari.ellinit(pari.ellminimalmodel(pari.ellinit(pari.elltwist(E0, d))))
        rk = pari.ellrank(Ed)
        an = pari.ellanalyticrank(Ed)
        rows.append({"d": d, "conductor": int(pari.ellglobalred(Ed)[0]), "w": int(pari.ellrootno(Ed)), "rank": [int(rk[0]), int(rk[1])], "an": int(an[0])})
    counts = {}
    for r in rows:
        key = f"w={r['w']:+d},an={r['an']}"
        counts[key] = counts.get(key, 0) + 1
    return {"base": base, "bound": bound, "n": len(rows), "counts": counts, "rows": rows, "exactness": "mixed", "conditional_flags": ["numerical-threshold"]}


OPS = {"invariants": lambda a: invariants(a["ainvs"], a.get("digits", 38)),
       "derivative_precisions": lambda a: derivative_at_precisions(a["ainvs"], a["k"], a["precisions"]),
       "twists": lambda a: twists(a["base"], a["bound"])}

if __name__ == "__main__":
    req = json.loads(sys.stdin.read())
    t0 = time.time()
    res = OPS[req["op"]](req["args"])
    print(json.dumps({"result": res, "seconds": round(time.time() - t0, 3)}))
