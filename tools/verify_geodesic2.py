#!/usr/bin/env python3
"""
Ground-truth check with full Christoffel-symbol integration of the
Schwarzschild null geodesic, compared against:
  A) vector ODE:      d2x/dl2 = -1.5*rs*h^2 * x / |x|^5
  B) Binet:           u'' + u = 1.5*rs*u^2
"""
import numpy as np

RS = 1.0  # rs = 1, i.e. M = 0.5

# ---------------- A) vector ODE ----------------
def trace_vector(b, r0=200.0, dt=0.02, maxsteps=800000):
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    def f(p, q):
        r2 = p @ p
        return -1.5 * RS * h2 * p / (r2 * r2 * np.sqrt(r2))
    trail = [x.copy()]
    captured = False
    for i in range(maxsteps):
        k1 = f(x, v); l1 = v
        k2 = f(x + l1*dt/2, v + k1*dt/2); l2 = v + k1*dt/2
        k3 = f(x + l2*dt/2, v + k2*dt/2); l3 = v + k2*dt/2
        k4 = f(x + l3*dt, v + k3*dt);     l4 = v + k3*dt
        x = x + dt/6*(l1 + 2*l2 + 2*l3 + l4)
        v = v + dt/6*(k1 + 2*k2 + 2*k3 + k4)
        if i % 500 == 0:
            trail.append(x.copy())
        if np.linalg.norm(x) < 0.9*RS:
            captured = True
            break
        if x[1] > r0*0.5 and i > 1000:
            break
    return np.array(trail), captured

# ---------------- B) Binet ----------------
def trace_binet(b, r0=200.0, dphi=1e-5, maxsteps=4000000):
    rr = float(np.hypot(b, r0)); phi0 = float(np.arctan2(-r0, b))
    u0 = 1.0/rr
    up0 = np.sqrt(max(1.0/b**2 - u0*u0 + RS*u0**3, 0.0))
    u, up, phi = u0, up0, phi0
    pts = [(phi, u)]
    captured = False
    for i in range(maxsteps):
        def acc(uu): return 1.5*RS*uu*uu - uu
        k1u, k1w = up, acc(u)
        k2u, k2w = up + dphi/2*k1w, acc(u + dphi/2*k1u)
        k3u, k3w = up + dphi/2*k2w, acc(u + dphi/2*k2u)
        k4u, k4w = up + dphi*k3w,   acc(u + dphi*k3u)
        u  += dphi/6*(k1u + 2*k2u + 2*k3u + k4u)
        up += dphi/6*(k1w + 2*k2w + 2*k3w + k4w)
        phi += dphi
        if i % 200000 == 0:
            pts.append((phi, u))
        if u > 1.0/0.9:
            captured = True
            break
        if u < 1e-10:
            break
    return np.array(pts), captured

# ---------------- C) full Christoffel integration ----------------
def trace_full(b, r0=200.0, dt=0.02, maxsteps=1000000):
    """
    3+1 formulation via Christoffel symbols, in Schwarzschild coords (t, r, th, ph).
    State: r, th, ph, pr, pth, pph (momentum components), with affine parameter.
    Use the standard geodesic eq: p^a d/dlam p^b = -Gamma^b_ac p^a p^c.
    """
    M = RS/2.0
    # initial position: (b, -r0) in equatorial plane; direction +y
    r = float(np.hypot(b, r0)); th = np.pi/2
    # direction: (0,1,0). Compute p^r, p^ph from contravariant conversion:
    # at point (r,th): position angle phi = atan2(-r0, b); basis e_phi = (-sin, cos) in xy
    phi0 = float(np.arctan2(-r0, b))
    # Cartesian: (x,y) = (r sin th cos ph, r sin th sin ph), v = (0,1,0)
    vx, vy = 0.0, 1.0
    # p^r = v . rhat = vx cos ph + vy sin ph ; p^th=0 ; p^phi = (v . phihat)/r /... 
    rhat = np.array([np.cos(phi0), np.sin(phi0)])
    phihat = np.array([-np.sin(phi0), np.cos(phi0)])
    vvec = np.array([vx, vy])
    pr = float(vvec @ rhat)
    pphi = float(vvec @ phihat) / r
    # null condition fixes p^t: g_tt (pt)^2 + ... we work with normalized affine param;
    # set pt so that ds^2=0: -(1-rs/r) (pt)^2 + ... use p^t = 1 initially? 
    # Instead: choose p^t from constraint: -(1-2M/r)(pt)^2 + (1-2M/r)^-1 (pr)^2 + r^2 (pphi)^2 = 0
    # -> (pt)^2 = (pr)^2 + r^2 (1-2M/r) (pphi)^2 ... careful
    # g_ab p^a p^b = -A(pt)^2 + (1/A)(pr)^2 + r^2 (pphi)^2, A=1-2M/r ; => (pt)^2 = (pr)^2/A + r^2(pphi)^2 / A
    A = 1.0 - RS/r
    pt = np.sqrt((pr*pr)/A + (r*r*pphi*pphi)/A)  # positive root
    def gammas():
        # nonzero Christoffels, equatorial th=pi/2, in (t,r,ph): use 2D
        pass
    # state = [r, phi, pr, pphi]
    st = np.array([r, phi0, pr, pphi])
    def deriv(s):
        rr, ph, p_r, p_ph = s
        A = 1.0 - RS/rr
        dph_dl = p_ph / (rr*rr)
        dr_dl = A * p_r
        A2 = RS/(rr*rr)     # dA/dr = rs/r^2
        dp_r_dl = -0.5*(A2*p_r*p_r/A) + 0.5*A2/A * 0 + 0.5*(RR) 
        return None
    # simpler: use known 2D eqs with rs:
    # From Lagrangian: p^r-dot = -(1/2)[ A' p_r^2 ... ]  do full 4D with (pr, pphi)
    def dydl(s):
        rr, ph, p_r, p_ph = s
        A = 1.0 - RS/rr; dA = RS/(rr*rr)
        # d r/dl = A p_r ; d ph/dl = p_ph/r^2
        dr = A*p_r
        dph = p_ph/(rr*rr)
        # Geodesic: dp_r/dl = -Gamma^r_ab p^a p^b = -Gamma^r_rr p^r p^r - Gamma^r_tt p^t p^t - ...
        # Gamma^r_tt = 0.5 A dA/dr ; Gamma^r_rr = -0.5 dA/dr / A ; Gamma^r_phph = -A r sin^2 th
        # = - (Gamma^r_tt (pt)^2 + Gamma^r_rr (pr)^2 + Gamma^r_phph (pphi)^2)  with (pt)^2 = (pr)^2/A + r^2 pph^2/A
        Gtt = 0.5*dA; Grr = -0.5*dA/A; Gphph = -A*rr
        pt2 = (p_r*p_r)/A + (rr*rr*p_ph*p_ph)/A
        dpr = -(Gtt*pt2 + Grr*p_r*p_r + Gphph*p_ph*p_ph)
        # Garnmn^ph_ab: d p_ph/dl = -Gamma^ph_phr p^ph p^r *2 ... p_ph is conserved (no phi dependence)
        dpph = 0.0
        return np.array([dr, dph, dpr, dpph])
    pts = [np.array([r, phi0, pr, pphi])]
    captured = False
    st = np.array([r, phi0, pr, pphi])
    for i in range(maxsteps):
        k1 = dydl(st); k2 = dydl(st + dt/2*k1); k3 = dydl(st + dt/2*k2); k4 = dydl(st + dt*k3)
        st = st + dt/6*(k1 + 2*k2 + 2*k3 + k4)
        if i % 500 == 0:
            pts.append(st.copy())
        if st[0] < 0.9*RS:
            captured = True
            break
        if st[0] > r0*0.5 and i > 1000:
            break
    return np.array(pts), captured

if __name__ == '__main__':
    print("Compare u(phi) curves among: vector-ODE, Binet, full-Christoffel")
    print(f"{'b':>6} {'max|u_vec-u_grd|':>18} {'max|u_bin-u_grd|':>18}")
    for b in [2.7, 3.0, 4.0, 6.0, 12.0]:
        trail, cv = trace_vector(b, r0=150.0, dt=0.02)
        binet, cb = trace_binet(b)
        full, cf = trace_full(b, r0=150.0, dt=0.02)
        # convert all to (phi, u=1/r)
        t = trail
        phi_v = np.arctan2(t[:,1], t[:,0]); u_v = 1.0/np.linalg.norm(t, axis=1)
        phi_b = binet[:,0]; u_b = binet[:,1]
        phi_f = full[:,1]; u_f = 1.0/full[:,0]
        lo = max(phi_v.min(), phi_b.min(), phi_f.min())
        hi = min(phi_v.max(), phi_b.max(), phi_f.max())
        phis = np.linspace(lo, hi, 3000)
        uv = np.interp(phis, phi_v, u_v)
        ub = np.interp(phis, phi_b, u_b)
        uf = np.interp(phis, phi_f, u_f)
        print(f"{b:6.2f} {np.max(np.abs(uv-uf)):18.3e} {np.max(np.abs(ub-uf)):18.3e}")