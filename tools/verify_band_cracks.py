#!/usr/bin/env python3
"""
Pixel-level seam diagnostics on the REAL rendered sky (probe-ch2.png).

The galaxy band is rendered in an equirectangular texture.  A perfect band is
smooth everywhere except the longitude seam, which must be *invisible* because
the parameterization is periodic.

Find every discontinuity: for each row, compute |value(x) - value(x+1)| and
flag spots where the change is much larger than the local gradient (a "spike" —
not a feature, a crack).  Report their (x, y) so we can map them back to the
sky and identify the cause.
"""
import numpy as np
from PIL import Image

img = np.asarray(Image.open('shots/probe-ch2-v2.png').convert('RGB')).astype(np.float32) / 255.0
H, W, _ = img.shape
lum = img.mean(axis=2)

# gradient magnitude in x (longitude direction)
gx = np.abs(np.diff(lum, axis=1))          # (H, W-1)
gy = np.abs(np.diff(lum, axis=0))          # (H-1, W)

# robust scale: median abs diff (noise level)
med_x = np.median(gx)
med_y = np.median(gy)

# spikes: gradient >> median (say > 8x) - these are cracks, not texture
spike_x = gx > max(0.05, 8 * med_x)
spike_y = gy > max(0.05, 8 * med_y)

ys, xs = np.where(spike_x)
print(f"image {W}x{H}, median gx={med_x:.5f} gy={med_y:.5f}")
print(f"x-direction spikes: {len(xs)}")
crack_pts = set()
for y, x in zip(ys, xs):
    crack_pts.add((x // 16, y // 16))
print("crack clusters (16px cells):", sorted(crack_pts)[:30])

ys2, xs2 = np.where(spike_y)
print(f"y-direction spikes: {len(ys2)}")

# longitude seam check: compare col 0 vs col W-1 scaled... actually the
# parameter invariant: col(x) vs col(x) shifted by period - the FULL period
# is W pixels. The seam should equal the neighbouring columns.
seam = np.abs(lum[:, 0] - lum[:, -1])
print(f"\nseam (col0 vs col-1): max={seam.max():.5f} mean={seam.mean():.5f}")
# adjacent-column difference at the seam for comparison
adj = np.abs(lum[:, 0] - lum[:, 1])
print(f"col0 vs col1        : max={adj.max():.5f} mean={adj.mean():.5f}")

# horizontal texture spikes: find the (x, y) of the biggest y-spikes
order = np.argsort(gy.ravel())[::-1][:20]
print("\nlargest y-spikes:")
for k in order:
    y, x = divmod(int(k), W - 1)
    print(f"  ({x:4d},{y:3d})  gy={gy[y,x]:.4f} (median {med_y:.5f})  lum={lum[y,x]:.3f}")