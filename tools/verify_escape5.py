#!/usr/bin/env python3
"""Step budget to reach escape radius 45 — ground truth = fine-dt reference."""
import numpy as np
RS = 1.0

def step_ode(x, v, h2, dt):
    def fd(p):
        p2 = p @ p
        return -1.5 * RS * h2 * p / (p2 * p2 * np.sqrt(p2))
    k1 = fd(x); l1 = v
    k2 = fd(x + l1*dt/2); l2 = v + k1*dt/2
    k3 = fd(x + l2*dt/2); l3 = v + k2*dt/2
    k4 = fd(x + l3*dt);   l4 = v + k3*dt
    return x + dt/6*(l1+2*l2+2*l3+l4), v + dt/6*(k1+2*k2+2*k3+k4)

def trace(b, r0, escapeR, dtmax, dtmin, stepk, stepa, maxsteps=8000):
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    steps = 0
    for i in range(maxsteps):
        r = float(np.linalg.norm(x))
        if r < 0.99 * RS: return None, steps
        if r > escapeR: break
        dt = min(dtmax, max(dtmin, stepk * max(0.0, r - stepa * RS)))
        x, v = step_ode(x, v, h2, dt)
        steps += 1
    vn = v/np.linalg.norm(v)
    return -float(np.arctan2(vn[0], vn[1])), steps

def trace_ref(b, r0, escapeR, maxsteps=6000000):
    """ground truth: fixed dt = 2e-4"""
    x = np.array([b, -r0, 0.0]); v = np.array([0.0, 1.0, 0.0])
    h2 = float(np.cross(x, v) @ np.cross(x, v))
    for i in range(maxsteps):
        r = float(np.linalg.norm(x))
        if r < 0.99*RS: return None
        if r > escapeR: break
        x, v = step_ode(x, v, h2, 2e-4)
    vn = v/np.linalg.norm(v)
    return -float(np.arctan2(vn[0], vn[1]))

if __name__ == '__main__':
    bs = [2.62, 2.70, 3.0, 4.0, 6.0, 9.0]
    refs = {b: trace_ref(b, 13.0, 45.0) for b in bs}
    print("config   (dtmax, dtmin, stepk, stepa) : maxerr(rad)  avgSteps  maxSteps")
    for name, dtmax, dtmin, stepk, stepa in [
        ('Std',  1.4, 0.08, 0.14, 0.95),
        ('High', 0.9, 0.05, 0.10, 0.95),
        ('Cine', 0.6, 0.035,0.075,0.95),
        ('Std2', 2.5, 0.08, 0.12, 1.5),
        ('High2',1.8, 0.05, 0.09, 1.5),
        ('Cine2',1.2, 0.035,0.07, 1.5),
    ]:
        errs, sts = [], []
        for b in bs:
            ve, st = trace(b, 13.0, 45.0, dtmax, dtmin, stepk, stepa)
            if ve is None: continue
            errs.append(abs(ve - refs[b])); sts.append(st)
        print(f"{name:6s} ({dtmax},{dtmin},{stepk},{stepa}) : {max(errs):.5f}  {np.mean(sts):5.0f}  {max(sts):4d}")