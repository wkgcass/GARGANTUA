#!/usr/bin/env python3
"""
Full-sky unfold diagnostics for the Milky-Way band seam.

Renders the galaxy band as a lon x lat equirectangular map (like a 2-D texture
paint programme), using an exact Python port of the GLSL noise, and measures
the seam by comparing the LAST column (lon=+180) with the FIRST column
(lon=-180). A seamless band must have |left-right| pixel difference ~ 0.

Three variants are compared:
  OLD  — noise sampled at (lon, lat) directly          (the original seam)
  CUR  — noise sampled in continuous galaxy frame coords (previous fix)
  RING — fully periodic: noise sampled on the lon circle via (cos, sin)
         so f(lon) == f(lon + 2pi) *exactly*           (this fix)
"""
import numpy as np

# ---------------- GLSL-port noise (identical structure) ----------------
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

N  = np.array([0.42, 0.26, 1.0]); N  = N / np.linalg.norm(N)
T2 = np.cross(N, np.array([0.0, 1.0, 0.0])); T2 = T2 / np.linalg.norm(T2)
T1 = np.cross(N, T2)

# ---------------- band variants (mirror the GLSL) ----------------
def band_old(d):
    lat = float(d @ N)
    b = np.exp(-lat * lat * 30.0)
    if b < 0.002: return 0.0
    lon = np.arctan2(float(d @ T2), float(d @ T1))
    n1 = fbm3(np.array([lon * 2.1, lat * 5.0, lon * 0.34]))
    return n1 * b

def band_cur(d):
    lat = float(d @ N)
    b = np.exp(-lat * lat * 30.0)
    if b < 0.002: return 0.0
    g = np.array([float(d @ T1), float(d @ T2), lat])
    gq = np.array([g[0] * 1.05, g[1] * 1.05, g[2] * 3.4])
    n1 = fbm3(gq * 1.55)
    return n1 * b

def band_ring(d, R=1.6, S=3.4, octs=4):
    """Fully periodic in longitude: noise input built from (cos lon, sin lon)
    and the latitude, so the map tiles perfectly at the lon wrap."""
    lat = float(d @ N)
    b = np.exp(-lat * lat * 30.0)
    if b < 0.002: return 0.0
    lon = np.arctan2(float(d @ T2), float(d @ T1))
    # circle parameterization — exact at lon = +-pi by construction
    gq = np.array([np.cos(lon) * R, np.sin(lon) * R, lat * S])
    gq = np.array([gq[0]*1.05, gq[1]*1.05, gq[2]*1.0])   # anisotropy
    # NOTE: periodicity already exact; fbm is only a function of (cos,sin,lat)
    n1 = fbm3(gq * 1.55, octs)
    return n1 * b

# ---------------- panorama + seam metric ----------------
def panorama(fn, nlon=720, nlat=180):
    lons = np.linspace(-np.pi, np.pi, nlon)
    lats = np.linspace(-np.pi/2, np.pi/2, nlat)
    img = np.zeros((nlat, nlon))
    for j, la in enumerate(lats):
        for i, lo in enumerate(lons):
            d = (T1 * np.cos(la) * np.cos(lo)
                 + T2 * np.cos(la) * np.sin(lo)
                 + N  * np.sin(la))
            img[j, i] = fn(d)
    return img

def seam_metrics(name, fn):
    img = panorama(fn)
    # seam = max |col(-pi) - col(+pi)| across all latitudes (columns must match)
    seam = np.max(np.abs(img[:, 0] - img[:, -1]))
    # control: max |col(k) - col(k+1)| over the map interior
    interior = np.max(np.abs(img[:, :-1] - img[:, 1:]))
    print(f"  {name:6s}  seam(max|first-last col|) = {seam:.6f}   max adjacent-col diff = {interior:.6f}")
    return img, seam, interior

if __name__ == '__main__':
    print("equirectangular sky unfold (nlon=720, nlat=180) — seam metric:\n")
    imgs = {}
    imgs['OLD '] = seam_metrics('OLD ', band_old)
    imgs['CUR '] = seam_metrics('CUR ', band_cur)
    imgs['RING'] = seam_metrics('RING', band_ring)

    print("""
Interpretation:
  * seam  should be ~0 for a band that wraps perfectly at lon=+/-180 deg.
  * OLD  : noise sampled on the atan2 lattice -> non-periodic -> visible seam.
  * CUR  : continuous galaxy-frame coords -> seamless in the limit, but the
           anisotropy and octave offsets are NOT periodic by construction;
           tiny numeric asymmetries can remain.
  * RING : coordinates built from (cos lon, sin lon) -> EXACT periodic tiling;
           col(-pi) == col(+pi) up to float error at ANY cd resolution.
""")