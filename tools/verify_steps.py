#!/usr/bin/env python3
"""
Validate the adaptive RK4 step scheme used in the GLSL raytracer.
Ground truth = same vector ODE integrated with very small fixed dt (dt=1e-4).
Compares deflection angle and step counts for quality-tier step parameters.
"""
import numpy as np
RS = 1.0

def step_ode(x, v, h2, dt):
    def fd(p):
        r2 = p @ p
        return -1.5 * RS * h2 * p / (r2 * r2 * np.sqrt(r2))
    k1 = fd(x); l1 = v
    k2 = fd(x + l1*dt/2); l2 = v + k1*dt/2
    k3 = fd(x + l2*dt/2); l3 = v + k2*dt/2
    k4 = fd(x + l3*dt);   l4 = v + k3*dt
    return x + dt/6*(l1 + 2*l2 + 2*l3 + l4), v + dt/6*(k1 + 2*k2 + 2*k3 + k4)

def trace(b, r0, dtmax, dtmin, stepk, stepa, maxsteps=4000):
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    steps = 0
    for i in range(maxsteps):
        r = float(np.linalg.norm(x))
        dt = min(dtmax, max(dtmin, stepk * max(0.0, r - stepa * RS)))
        x, v = step_ode(x, v, h2, dt)
        steps += 1
        if r < 0.98 * RS:
            return None, steps
        if r > r0 and float(np.dot(x, v)) > 0:
            break
    vn = v / np.linalg.norm(v)
    return -float(np.arctan2(vn[0], vn[1])), steps

def trace_ref(b, r0, dt=1e-4, maxsteps=4000000):
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    for i in range(maxsteps):
        r = float(np.linalg.norm(x))
        x, v = step_ode(x, v, h2, dt)
        if r < 0.98 * RS:
            return None
        if r > r0 and float(np.dot(x, v)) > 0:
            break
        if r > r0 * 1.6:
            break
    vn = v / np.linalg.norm(v)
    return -float(np.arctan2(vn[0], vn[1]))

if __name__ == '__main__':
    print("reference: dt=1e-4 fixed RK4")
    confs = [
        ('Standard',  1.20, 0.080, 0.140, 0.95),
        ('High',      0.70, 0.050, 0.100, 0.95),
        ('Cinematic', 0.45, 0.035, 0.075, 0.95),
    ]
    bs = [2.62, 2.70, 3.0, 4.0, 6.0, 9.0]
    print(f"\n{'config':>10} " + "".join(f"{b:>11}" for b in bs) + "   avgSteps")
    refs = {}
    for b in bs:
        refs[b] = trace_ref(b, 13.0)
        assert refs[b] is not None, f"reference captured b={b}"
    print("ref(rad):        " + "".join(f"{refs[b]:11.5f}" for b in bs))
    for name, dtmax, dtmin, stepk, stepa in confs:
        errs, sts, vals = [], [], []
        for b in bs:
            ve, st = trace(b, 13.0, dtmax, dtmin, stepk, stepa)
            vals.append(ve)
            errs.append(abs(ve - refs[b]))
            sts.append(st)
        print(f"{name:>10} " + "".join(f"{ve:11.5f}" for ve in vals) + f"   {np.mean(sts):6.1f}")
        print(f"{'':>10} " + "".join(f"{e:11.1e}" for e in errs) + "   (abs err)")
    # critical point check
    print("\ncritical b (photon sphere) with Cinematic params:")
    for b in [2.597, 2.598, 2.5985]:
        ve, st = trace(b, 13.0, 0.45, 0.035, 0.075, 0.95, maxsteps=6000)
        print(f"  b={b}: {'captured' if ve is None else ve:.5f}  steps={st}")