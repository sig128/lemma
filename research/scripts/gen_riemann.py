"""Riemann zeta datasets: nontrivial zeros, Hardy Z(t), zero counts.

All values computed with mpmath at the recorded precision. On-line location of
each listed zero follows from a sign change of the real-valued Z(t); this script
does NOT run Turing's method, so completeness of the list up to a height is
checked only against mpmath.nzeros (Gram/Rosser based), recorded as such.

Run: python3 -I research/scripts/gen_riemann.py web/public/data/riemann
"""
import json, sys, time, hashlib, platform
from datetime import datetime, timezone
from pathlib import Path
import mpmath as mp

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
RUN_AT = datetime.now(timezone.utc).isoformat(timespec="seconds")
NZ = int(sys.argv[2]) if len(sys.argv) > 2 else 300

def prov(fns, dps, **kw):
    d = {"tool": "mpmath", "mpmath_version": mp.__version__, "python": platform.python_version(),
         "mp_dps": dps, "functions": fns, "computed_at": RUN_AT, "script": "research/scripts/gen_riemann.py"}
    d.update(kw); return d

t0 = time.time()
mp.mp.dps = 25
zeros = []
for n in range(1, NZ + 1):
    z = mp.zetazero(n)
    gamma = z.imag
    # sign change check of Z(t) around the zero (on-line certificate given correct evaluation)
    h = mp.mpf('1e-6')
    zl, zr = mp.siegelz(gamma - h), mp.siegelz(gamma + h)
    zeros.append({"n": n, "gamma": mp.nstr(gamma, 20), "re": mp.nstr(z.real, 5),
                  "sign_change": bool(zl * zr < 0)})
zeros_s = time.time() - t0

checks = []
for T in [50, 100, 200, 300, 400, 500]:
    if T > float(zeros[-1]["gamma"]):
        break
    cnt_list = sum(1 for z in zeros if float(z["gamma"]) < T)
    checks.append({"T": T, "listed_below_T": cnt_list, "mpmath_nzeros": int(mp.nzeros(T)),
                   "riemann_von_mangoldt_main_term": float(mp.siegeltheta(T) / mp.pi + 1)})

mp.mp.dps = 15
t1 = time.time()
ts, Zs = [], []
T_MAX, STEP = 100.0, 0.05
k = 0
while k * STEP <= T_MAX + 1e-9:
    t = k * STEP
    ts.append(round(t, 3)); Zs.append(float(mp.siegelz(t)))
    k += 1
z_s = time.time() - t1

out = {
    "zeros": zeros,
    "zeros_provenance": prov(["zetazero", "siegelz"], 25, wall_seconds=round(zeros_s, 2), count=NZ,
        method="mpmath.zetazero locates the n-th zero via Gram points and refines it; the sign change of Z(t) across each listed ordinate is recorded."),
    "count_checks": checks,
    "count_checks_meaning": "Number of listed zeros below T compared with mpmath.nzeros(T). mpmath.nzeros relies on Gram blocks and Rosser's rule; this is a consistency check, not a Turing-method certificate of completeness.",
    "Z": {"t": ts, "Z": Zs, "step": STEP, "provenance": prov(["siegelz"], 15, wall_seconds=round(z_s, 2))},
    "scope": "Evidence about these finitely many zeros only. It says nothing about zeros above the computed height and does not bear on the universal statement.",
}
payload = json.dumps(out)
(OUT / "zeros.json").write_text(payload)
print("zeros", NZ, round(zeros_s, 1), "s; Z samples", len(ts), round(z_s, 1), "s; sha", hashlib.sha256(payload.encode()).hexdigest()[:12])
print(checks)
print(all(z["sign_change"] for z in zeros))
