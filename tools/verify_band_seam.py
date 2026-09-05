#!/usr/bin/env python3
"""
Seam verification for the Milky-Way band.

OLD approach (pre-fix): sample FBM at (lon, lat) where lon = atan2(...) jumps
  from +pi to -pi across one meridian  ->  the noise lattice is discontinuous
  there  ->  a visible seam.

NEW approach (post-fix): sample FBM in the continuous galaxy-frame linear
  coordinates g = (dot(dir,t1), dot(dir,t2), dot(dir,n))  ->  continuous
  everywhere, periodic by construction.

We numerically demonstrate: for a sequence of directions crossing the old
seam meridian, the FBM band brightness jumps (old) vs. varies smoothly (new).
"""
import numpy as np

# ---- minimal FBM (identical structure to the GLSL, 4 octaves) ----
def hash13(p):
    p = np.mod(p * 0.1031, 1.0)
    p = p + np.dot(p, [p[2] + 31.32, p[0] + 31.32, p[1] + 31.32])
    return np.mod((p[0] + p[1]) * p[2], 1.0)

def vnoise3(p):
    i = np.floor(p)
    f = p - i
    f = f * f * (3.0 - 2.0 * f)
    def h(ix, iy, iz):
        return hash13(np.array([i[0] + ix, i[1] + iy, i[2] + iz]))
    n000, n100 = h(0,0,0), h(1,0,0)
    n010, n110 = h(0,1,0), h(1,1,0)
    n001, n101 = h(0,0,1), h(1,0,1)
    n011, n111 = h(0,1,1), h(1,1,1)
    x00 = n000 + (n100 - n000) * f[0]
    x10 = n010 + (n110 - n010) * f[0]
    x01 = n001 + (n101 - n001) * f[0]
    x11 = n011 + (n111 - n011) * f[0]
    y0 = x00 + (x10 - x00) * f[1]
    y1 = x01 + (x11 - x01) * f[1]
    return y0 + (y1 - y0) * f[2]

def fbm3(p, octaves=4):
    s = 0.0; a = 0.5
    for _ in range(octaves):
        s += a * vnoise3(p)
        p = p * 2.03 + np.array([11.3, 7.1, 3.7])
        a *= 0.5
    return s

N = np.array([0.42, 0.26, 1.0]); N = N / np.linalg.norm(N)
T2 = np.cross(N, np.array([0.0, 1.0, 0.0])); T2 = T2 / np.linalg.norm(T2)
T1 = np.cross(N, T2)

def old_band(dirv):
    lat = float(dirv @ N)
    band = np.exp(-lat * lat * 30.0)
    if band < 0.002: return 0.0
    lon = np.arctan2(float(dirv @ T2), float(dirv @ T1))
    latn = lat * 5.0
    n1 = fbm3(np.array([lon * 2.1, latn, lon * 0.34]))
    return n1 * band

def new_band(dirv):
    lat = float(dirv @ N)
    band = np.exp(-lat * lat * 30.0)
    if band < 0.002: return 0.0
    g = np.array([float(dirv @ T1), float(dirv @ T2), lat])
    gq = np.array([g[0] * 1.05, g[1] * 1.05, g[2] * 3.4])
    n1 = fbm3(gq * 1.55)
    return n1 * band

if __name__ == '__main__':
    # Walk a small circle around the north pole of the galaxy frame — it crosses
    # the old seam meridian (dir*T1 = -1 direction) exactly once on each side.
    # Sample ridge of the band: lat=0 great circle, parametrized by angle A.
    print("walk along band equator (lat=0), monitoring old vs new FBM values:")
    print(f"{'A (deg)':>8} {'old':>8} {'new':>8}   (A=180 is the old seam)")
    prev_old = prev_new = None
    for A in range(-180, 181, 20):
        dirv = T1 * np.cos(np.radians(A)) + T2 * np.sin(np.radians(A))
        o, nw = old_band(dirv), new_band(dirv)
        dx = f"{o - prev_old:+.4f}" if prev_old is not None else "   —"
        dy = f"{nw - prev_new:+.4f}" if prev_new is not None else "   —"
        print(f"{A:8d} {1258.0 if False else o:8.4f} {nw:8.4f}  Δold={dx}  Δnew={dy}")
        prev_old, prev_new = o, nw
    print("\ninterpretation: 'Δ' is the change between successive samples.")
    print("At the old seam (A = ±180°) the OLD Δ is a spike (noise jump),")
    print("while the NEW Δ stays at normal magnitude (smooth field).")
# --- precise seam test: sample directions EXACTLY on either side of the
#     old seam meridian (dir = -T1, i.e. lon = ±pi) and measure the jump.
if __name__ == '__main__':
    print("\n=== exact seam sampling (dir = -T1 ± eps*T2), lat=0 ===")
    eps = 1e-6
    rng = np.random.default_rng(0)
    d1 = -T1 + eps * T2; d1 = d1 / np.linalg.norm(d1)
    d2 = -T1 - eps * T2; d2 = d2 / np.linalg.norm(d2)
    o1, o2 = old_band(d1), old_band(d2)
    n1_, n2_ = new_band(d1), new_band(d2)
    print(f"OLD: f(-T1+ε)={o1:.6f}  f(-T1-ε)={o2:.6f}  |jump|={abs(o1-o2):.6f}")
    print(f"NEW: f(-T1+ε)={n1_:.6f}  f(-T1-ε)={n2_:.6f}  |jump|={abs(n1_-n2_):.6f}")
    # control: sample a random smooth direction pair with same eps
    a = rng.uniform(0, 2*np.pi)
    dd = T1*np.cos(a) + T2*np.sin(a)
    dd2 = dd + eps * N; dd2 = dd2/np.linalg.norm(dd2)
    print(f"control (smooth spot): OLD |jump|={abs(old_band(dd)-old_band(dd2)):.6f}  NEW |jump|={abs(new_band(dd)-new_band(dd2)):.6f}")
    print("\nVERDICT:",
          "OLD has a seam (jump >> smooth-spot fluctuation); NEW is continuous"
          if abs(o1-o2) > 10*abs(n1_-n2_) else "both look similar at this eps")
