#!/usr/bin/env python3
"""DEFINITIVE Doppler-frame verification.

Exact reference g (V0): from geodesic invariants only, using the Binet first
integral so b = sqrt(h^2/E^2-ish) is read off the trajectory exactly:
    1/b^2 = (du/dphi)^2 + u^2 - rs u^3          [with u = 1/r]
    g_exact = 1/(u^t_em - b u^phi_em),   u^t=1/sqrt(1-3M/r), u^phi=sqrt(M/r^3)/sqrt(1-3M/r)

Shader formula (V1): local static-frame direction of the photon:
    pr = (1-rs/r)^-1/2 * (v . rhat)
    pz = (v . theta_hat),  pf = (v . phi_hat)
    cos(chi) = pf / |p|
    g_shader = sqrt(1 - 1.5 rs/r) / (1 - beta cos(chi))
"""
import numpy as np
RS = 1.0
M = RS/2.0

def trace(ro, rd, n=60000, dt=2e-3):
    h2 = float(np.cross(ro, rd) @ np.cross(ro, rd))
    x, v = np.array(ro), np.array(rd)
    samp = []
    def fd(p):
        p2 = p @ p
        return -1.5 * RS * h2 * p / (p2*p2*np.sqrt(p2))
    for i in range(n):
        r = float(np.linalg.norm(x))
        if r < 0.995*RS: break
        if r > 260.0: break
        k1 = fd(x); l1 = v
        k2 = fd(x + l1*dt/2); l2 = v + k1*dt/2
        k3 = fd(x + l2*dt/2); l3 = v + k2*dt/2
        k4 = fd(x + l3*dt);   l4 = v + k3*dt
        x = x + dt/6*(l1+2*l2+2*l3+l4)
        v = v + dt/6*(k1+2*k2+2*k3+k4)
        samp.append((x.copy(), v.copy()))
    return samp

def g_exact_V0(x, v):
    r = float(np.linalg.norm(x))
    rho2 = float(x[0]*x[0] + x[1]*x[1])
    # flat-space angular velocity derived from ODE state:
    rdot = float(np.dot(x, v)/r)
    phidot = float(x[0]*v[1] - x[1]*v[0]) / rho2      # dphi/dl
    thetadot_contrib = float((np.cross(x, v) @ np.cross(x, v)) / (r*r*rho2)) # sin^2 th (thdot^2+...) handled below
    # full flat |v|^2 = rdot^2 + r^2(thdot^2 + sin^2th phidot^2)
    v2 = float(v @ v)
    tang2 = max(v2 - rdot*rdot, 0.0)      # r^2(thdot^2+sin^2 phidot^2)
    sin2 = rho2/(r*r)
    phidot2 = phidot*phidot
    # sin^2(th) phidot^2 = sin2 * phidot^2 ; thdot^2 = tang2/r^2 - sin2 phidot^2
    thdot2 = tang2/(r*r) - sin2*phidot2
    # E and L from the null condition (metric, Schwarzschild):
    E2 = rdot*rdot + (1 - RS/r)*(r*r*(thdot2 + sin2*phidot2))
    E = np.sqrt(max(E2, 1e-12))
    L = r*np.sqrt(sin2) * abs(phidot) * r  # |L| = r^2 sin th |phidot|
    # signed:
    sgn = 1.0 if phidot >= 0 else -1.0
    b = sgn * L/E
    ut = 1.0/np.sqrt(1 - 3*M/r)
    uph = np.sqrt(M/r**3)/np.sqrt(1 - 3*M/r)
    return 1.0/(ut - b*uph), b

def g_shader_V1(x, v, exp_):
    r = float(np.linalg.norm(x))
    rho = float(np.hypot(x[0], x[1]))
    rhat = x / r
    ph = np.array([-x[1], x[0], 0.0])/max(rho, 1e-12)
    th = np.cross(ph, rhat)
    pr = (1 - RS/r)**exp_ * float(v @ rhat)
    pz = float(v @ th)
    pf = float(v @ ph)
    nn = np.sqrt(pr*pr + pz*pz + pf*pf)
    coschi = pf/nn
    beta = np.sqrt(RS/(2*(r - RS)))
    return np.sqrt(1 - 1.5*RS/r)/(1 - beta*coschi)

if __name__ == '__main__':
    rng = np.random.default_rng(3)
    worst1, worst2 = 0.0, 0.0
    nt = 0
    cams = [(14.0, 0.0, 2.5), (9.0, 0.0, 9.0), (13.0, 2.0, 0.6), (16.0,-3.0,1.5), (12.0,4.0,-2.0)]
    for cam in cams:
        for k in range(50):
            tgt = np.array([0.0,0.0,0.0]) + rng.normal(0, 2.2, 3)
            ro = np.array(cam)
            rd = tgt - ro; rd /= np.linalg.norm(rd)
            if abs(rd[2]) < 0.02:
                rd[2] = 0.02; rd /= np.linalg.norm(rd)
            samp = trace(ro, rd, n=30000, dt=3e-3)
            pts = [i for i,(x,vv) in enumerate(samp) if 3.2 <= float(np.hypot(x[0],x[1])) <= 10.0 and abs(x[2]) < 0.10]
            if not pts: continue
            i = pts[len(pts)//2]
            x, v = samp[i]
            g0, b = g_exact_V0(x, v)
            g1 = g_shader_V1(x, v, -0.5)   # shader factor (1-rs/r)^-1/2
            g2 = g_shader_V1(x, v, +0.5)   # alternative (1-rs/r)^+1/2
            d1 = abs(g0-g1)/abs(g0)
            d2 = abs(g0-g2)/abs(g0)
            if d1 > worst1: worst1 = d1; w1 = (g0, g1, b, x.copy(), v.copy())
            if d2 > worst2: worst2 = d2; w2 = (g0, g2, b, x.copy(), v.copy())
            nt += 1
    print(f"tested {nt} disk crossings")
    print(f"V1 (shader, exp=-0.5): worst rel diff = {worst1:.3e}   {'PASS' if worst1 < 1e-6 else 'FAIL'}")
    print(f"V2 (exp=+0.5):         worst rel diff = {worst2:.3e}")
    if worst1 >= 1e-6:
        g0, g1, b, x, v = w1
        print("  sample:", g0, g1, b)