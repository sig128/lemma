"""Bounded computations for the other workspaces (sandboxed, JSON in / JSON out)."""
from __future__ import annotations

import json
import sys
import time

import mpmath as mp


def zeta_zeros(n: int, dps: int = 25):
    mp.mp.dps = dps
    out = []
    for k in range(1, n + 1):
        g = mp.zetazero(k).imag
        h = mp.mpf("1e-6")
        out.append({"n": k, "gamma": mp.nstr(g, 18), "sign_change": bool(mp.siegelz(g - h) * mp.siegelz(g + h) < 0)})
    return {"zeros": out, "all_sign_changes": all(z["sign_change"] for z in out), "exactness": "numerical",
            "provenance": {"mpmath": mp.__version__, "dps": dps}, "scope": "these zeros only"}


def u1_exact(betas, L):
    mp.mp.dps = 30
    V = L * L
    rows = []
    for b in betas:
        I = lambda n: mp.besseli(n, b)
        num = sum(I(n) ** (V - 1) * (I(n - 1) + I(n + 1)) / 2 for n in range(-30, 31))
        den = sum(I(n) ** V for n in range(-30, 31))
        rows.append({"beta": b, "L": L, "plaquette_exact": mp.nstr(num / den, 15), "infinite_volume": mp.nstr(I(1) / I(0), 15)})
    return {"rows": rows, "exactness": "exact", "method": "character expansion, mpmath 30 digits", "scope": "2D U(1), finite periodic lattice"}


OPS = {"zeta_zeros": lambda a: zeta_zeros(a["n"], a.get("dps", 25)), "u1_exact": lambda a: u1_exact(a["betas"], a["L"])}

if __name__ == "__main__":
    req = json.loads(sys.stdin.read())
    t0 = time.time()
    print(json.dumps({"result": OPS[req["op"]](req["args"]), "seconds": round(time.time() - t0, 3)}))
