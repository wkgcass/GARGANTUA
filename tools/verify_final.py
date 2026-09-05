#!/usr/bin/env python3
"""
FINAL PHYSICS VERIFICATION for GARGANTUA:

1. Vector ODE  d2x/dl2 = -1.5*rs*h^2*x/|x|^5  vs exact Schwarzschild bending.
2. Doppler factor g = sqrt(1 - 1.5*rs/r)/(1 - beta*cos(theta))  vs exact
   invariant g = 1/(u^t_em - b*u^phi_em), derived from the true photon 4-momentum
   (NOT circular: b and theta are related by the geodesic geometry b = r cos(th)/sqrt(1-rs/r),
    full derivation in comments below).
"""
import numpy as np

M = 0.5           # rs = 2M = 1
RS = 2*M

# ---------- 2) Doppler: exact derivation, no circular reasoning ----------
# Circular orbit emitter 4-velocity (Schwarzschild):
#   u^t = 1/sqrt(1-3M/r),  u^phi = sqrt(M/r^3)/sqrt(1-3M/r)
# Photon 4-momentum: conserved E=-p_t, L=p_phi; null condition gives
#   p^(r) = +-sqrt(E^2 - L^2(1-rs/r)/r^2)/(1-rs/r)
# Local static tetrad: p^(t) = E/sqrt(1-rs/r), p^(r), p^(phi) = L/r
# Angle from azimuthal direction: cos(th) = p^(phi)/|p| with |p| = p^(t) (null)
#   =>  cos(th) = b*sqrt(1-rs/r)/r,  b = L/E
# Observed : emitted g = (p.u_obs)/(p.u_em)
#   p.u_obs = -E ; p.u_em = -E u^t + L u^phi  =>  g = 1/(u^t - b u^phi)
def g_exact(r, th):
    b = r*np.cos(th)/np.sqrt(1-RS/r)
    ut = 1.0/np.sqrt(1-3*M/r)
    uph = np.sqrt(M/r**3)/np.sqrt(1-3*M/r)
    return 1.0/(ut - b*uph)

def beta(r):
    return np.sqrt(RS/(2*(r-RS)))

def g_fast(r, th):
    return np.sqrt(1-1.5*RS/r)/(1 - beta(r)*np.cos(th))

print("=== Doppler factor: exact invariant vs shader fast formula ===")
print(f"{'r/rs':>6} {'theta':>8} {'g_exact':>12} {'g_fast':>12} {'rel.diff'}")
worst = 0.0
for r in [3.0, 3.5, 5.0, 8.0, 15.0, 30.0]:
    for th in [0.0, 0.4, 1.0, 1.5708, 2.4, 3.1416]:
        ge = g_exact(r, th); gf = g_fast(r, th)
        d = abs(ge-gf)/max(abs(ge), 1e-12)
        worst = max(worst, d)
        print(f"{r:6.2f} {th:8.4f} {ge:12.6f} {gf:12.6f} {d:.2e}")
print(f"worst relative diff = {worst:.2e}")

# ---------- 1) Deflection: vector ODE vs exact analytic (once more, clean) ----------
def trace_deflection(b, r0=800.0, dt=0.001, maxsteps=20000000):
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    def fd(p):
        r2 = p @ p
        return -1.5 * RS * h2 * p / (r2 * r2 * np.sqrt(r2))
    for i in range(maxsteps):
        k1 = fd(x); l1 = v
        k2 = fd(x + l1*dt/2); l2 = v + k1*dt/2
        k3 = fd(x + l2*dt/2); l3 = v + k2*dt/2
        k4 = fd(x + l3*dt);   l4 = v + k3*dt
        x = x + dt/6*(l1 + 2*l2 + 2*l3 + l4)
        v = v + dt/6*(k1 + 2*k2 + 2*k3 + k4)
        if np.linalg.norm(x) < 0.9*RS: return None
        if x[1] > r0*0.2 and i > 1000:
            v = v/np.linalg.norm(v)
            return -float(np.arctan2(v[0], v[1]))   # positive deflection
    return None

print("\n=== Deflection angle: vector ODE vs exact Schwarzschild (substitution integral) ===")
from numpy import pi
def exact_deflection(b):
    """Exact Schwarzschild light bending via Binet first integral.
    f(u) = u^3 - u^2 + 1/b^2  (u = 1/r, rs = 1), slowest root u_turn.
    f(u) = (u - u_turn)(u^2 + A u + B) with A = u_turn-1, B = u_turn(u_turn-1).
    Sub u = u_turn sin^2 t removes the sqrt singularity:
      int du/sqrt(f) = 2 sqrt(u_turn) sin(t)/sqrt(-Q) dt,  Q = u^2 + A u + B."""
    f = lambda u: u**3 - u*u + 1.0/b**2
    step = 5e-4; u = 0.0
    while True:
        u += step
        if f(u) < 0:
            a, c = u - step, u
            for _ in range(200):
                m = 0.5*(a+c)
                if f(m) > 0: a = m
                else: c = m
            u_turn = 0.5*(a+c); break
        if u > 2.5:
            raise RuntimeError(f'no root for b={b}')
    A = u_turn - 1.0
    B = u_turn * A
    N = 400000
    t = np.linspace(0.0, np.pi/2 - 1e-12, N)
    uu = u_turn*np.sin(t)**2
    Q = uu*uu + A*uu + B      # negative on [0, u_turn) for u_turn < 1
    I = np.trapezoid(2*np.sqrt(u_turn)*np.sin(t)/np.sqrt(-Q), t)
    return 2*I - np.pi

for b in [3.0, 4.0, 6.0, 10.0]:
    if b < 2.598: continue
    ex = exact_deflection(b)
    ve = trace_deflection(b, r0=200.0, dt=0.001)
    if ve is None:
        print(f"  b={b:5.2f}  exact={ex: .8f}  vectorODE=captured")
    else:
        print(f"  b={b:5.2f}  exact={ex: .8f}  vectorODE={ve: .8f}  diff={abs(ex-ve):.2e}")