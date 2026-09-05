/**
 * GARGANTUA — GLSL shader sources (raw WebGL2, GLSL ES 3.00)
 *
 * Physics (verified numerically in tools/*.py — see README):
 *   • Null geodesic ODE:  d²x/dλ² = -(3/2)·rs·h²·x/|x|^5,  h = |x×v|
 *     versus exact Schwarzschild light deflection: <1e-3 rad @ 60 steps.
 *   • Doppler / gravitational factor for circular orbit emitters:
 *     g = sqrt(1 − 1.5·rs/r) / (1 − β·cosχ),  β = sqrt(rs/(2(r−rs)))
 *     equals the exact invariant 1/(uᵗ − b·u^φ) to machine precision.
 *
 * The accretion disk is a VOLUMETRIC medium: a 3-D density field with FBM
 * turbulence advected by Keplerian differential rotation, sampled along the
 * bent ray (like volumetric clouds). It is lensed, shows multiple crossings,
 * and is Doppler-brightened / gravitationally reddened physically.
 */

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/* ================================================================
 *  PASS A — GEODESIC RAYTRACER (HDR output)
 * ================================================================ */
export const RAYTRACE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform vec2  uResolution;
uniform float uTime;

/* camera */
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uFovTan;
uniform float uAspect;

/* physics / scene */
uniform float uRs;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskThickness;
uniform float uDiskDensity;
uniform float uDiskOpacity;
uniform float uDiskTemp;
uniform float uDiskTilt;
uniform float uDiskTurbAmp;
uniform float uDiskTurbScale;
uniform float uDiskTurbSpeed;
uniform float uDiskShear;
uniform float uDopplerBoost;
uniform float uRedshiftStr;
uniform float uStarDensity;
uniform float uStarBright;
uniform float uGalaxyBright;

/* integration */
uniform int   uDebugView;
uniform int   uMaxSteps;
uniform float uStepK;
uniform float uStepA;
uniform float uStepMin;
uniform float uStepMax;
uniform int   uDiskSub;
uniform int   uNoiseOct;
uniform float uEscapeR;
uniform mat3  uTilt;      /* disk tilt rotation (world -> disk frame)      */
uniform mat3  uTiltInv;   /* its inverse — sky is sampled in world frame    */

/* ---------------------------------------------------------- */
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}
float fbm3(vec3 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise3(p);
    p = p * 2.03 + vec3(11.3, 7.1, 3.7);
    a *= 0.5;
  }
  return s;
}

vec3 blackbody(float T) {
  T = clamp(T, 1000.0, 40000.0) / 100.0;
  float r, g, b;
  if (T <= 66.0) {
    r = 255.0;
    g = clamp(99.4708 * log(T) - 161.1196, 0.0, 255.0);
    b = (T <= 19.0) ? 0.0 : clamp(138.5177 * log(T - 10.0) - 305.0448, 0.0, 255.0);
  } else {
    r = clamp(329.6987 * pow(T - 60.0, -0.1332047), 0.0, 255.0);
    g = clamp(288.1222 * pow(T - 60.0, -0.0755148), 0.0, 255.0);
    b = 255.0;
  }
  return vec3(r, g, b) / 255.0;
}

/* ------------------ procedural sky ------------------ */
vec3 starLayer(vec3 dir, float scale, float density, float brightPow, float size, float amp) {
  vec3 p = dir * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 acc = vec3(0.0);
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 cell = id + vec3(float(x), float(y), float(z));
    float h = hash13(cell * 1.713);
    if (h > density) continue;
    /* star position in the cell -> P - S distance in cell units */
    vec3 off = vec3(hash13(cell * 2.31 + 5.0), hash13(cell * 4.3 + 9.1), hash13(cell * 6.7 + 1.3)) - 0.5;
    vec3 P = id + f + 0.5;
    vec3 S = cell + off;
    float d = length(P - S);
    float hn = h / max(density, 1e-4);
    float mag = 0.015 + pow(hn, brightPow) * amp;
    float temp = 2600.0 + hash13(cell * 3.77 + 11.0) * 19700.0;
    float core = exp(-d * d * size * size);
    acc += blackbody(temp) * mag * core;
  }
  return acc;
}

vec3 starfield(vec3 dir) {
  /* three scales: dense faint dust, mid stars, few bright anchors */
  vec3 s1 = starLayer(dir, 1500.0, uStarDensity * 0.0035, 2.0, 5.5, 0.55);
  vec3 s2 = starLayer(dir, 750.0,  uStarDensity * 0.0018, 1.7, 4.2, 0.9);
  vec3 s3 = starLayer(dir, 375.0,  uStarDensity * 0.0009, 1.4, 3.2, 1.5);
  return (s1 + s2 + s3) * uStarBright * 3.2;
}

vec3 galaxyBand(vec3 dir) {
  vec3 n = normalize(vec3(0.42, 0.26, 1.0));
  float lat = dot(dir, n);
  float band = exp(-lat * lat * 30.0);
  if (band < 0.002) return vec3(0.0);

  /* Galaxy-frame coordinates (u, v span the band plane, w = latitude).
     This is a CONTINUOUS linear function of dir — no atan() anywhere — so
     the FBM field tiles the sky perfectly and the band has no seam at the
     longitude wrap (unlike sampling noise at lon*2π-lattice coords). */
  vec3 t2 = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
  vec3 t1 = cross(n, t2);
  vec3 g = vec3(dot(dir, t1), dot(dir, t2), lat);

  /* stretch along the band for streaky clouds, compress across for s/f */
  vec3 gq = vec3(g.xy * 1.05, g.z * 3.4);
  float n1 = fbm3(gq * 1.55, 4);
  float n2 = fbm3(gq * 3.1 + vec3(31.7), 3);
  float dust = 1.0 - smoothstep(0.34, 0.74, 0.62 * n2 + 0.42 * n1);
  float glow = smoothstep(0.02, 0.62, n1);

  vec3 warm = vec3(1.00, 0.58, 0.26);
  vec3 mid  = vec3(0.95, 0.80, 0.62);
  vec3 cool = vec3(0.42, 0.55, 0.94);
  vec3 col = mix(cool, warm, smoothstep(0.28, 0.70, n1 + 0.12));
  col = mix(col, mid, smoothstep(0.72, 1.0, glow) * 0.5);
  col *= band * (0.10 + 0.55 * glow * (0.30 + 0.70 * dust));

  vec3 cluster = starLayer(dir, 900.0, uStarDensity * 0.002, 2.0, 2.8, 0.7);
  col += cluster * 0.55 * band * (0.30 + 0.70 * glow);
  return col;
}

vec3 skyColor(vec3 dir) {
  vec3 base = vec3(0.0030, 0.0042, 0.0078);
  float neb = fbm3(dir * 3.2 + 17.3, 3);
  base += vec3(0.10, 0.13, 0.23) * neb * 0.012;
  return base + starfield(dir) + galaxyBand(dir) * uGalaxyBright;
}

/* ------------------ volumetric disk ------------------ */
float diskHeight(float rho) {
  return uDiskThickness * rho * pow(max(rho / uDiskInner, 1.0), 0.30);
}
float diskOmega(float rho) {
  return uDiskShear / (pow(rho, 1.5) + 0.35);
}

float diskDensity(vec3 p) {
  vec2 rv = p.xy;
  float rho = length(rv);
  if (rho < uDiskInner * 0.86 || rho > uDiskOuter * 1.10) return 0.0;
  float rhoC = max(rho, uDiskInner * 0.99);
  float H = diskHeight(rhoC);
  float za = abs(p.z);
  if (za > H * 3.6) return 0.0;

  float rn = rho / uDiskInner;
  float radial = pow(rn, -1.15);
  float fIn  = smoothstep(0.895, 1.045, rho / uDiskInner);
  float fOut = 1.0 - smoothstep(0.72, 1.00, rho / uDiskOuter);
  float vert = exp(-0.5 * (za / H) * (za / H));

  float omega = diskOmega(rhoC);
  float ph = omega * uTime * uDiskTurbSpeed;
  float c = cos(ph), s = sin(ph);
  vec3 q = vec3(c * p.x + s * p.y, -s * p.x + c * p.y, p.z * 2.6);
  q *= uDiskTurbScale;

  vec2 rd = rv / max(rho, 1e-5);
  vec2 td = vec2(-rd.y, rd.x);
  vec3 qs = vec3(dot(q.xy, rd) * 0.80, dot(q.xy, td) * 2.4, q.z);
  float n = fbm3(qs, uNoiseOct);

  float dens = radial * vert * fIn * fOut;
  dens *= 0.35 + 1.3 * max(n - 0.15, 0.0);
  dens *= 1.0 + uDiskTurbAmp * 0.30;
  return max(dens, 0.0) * uDiskDensity;
}

float diskTemp(float rho) {
  float rn = rho / max(uDiskInner * 1.001, 1e-3);
  float t = pow(rn, -0.75) * pow(max(1.0 - 1.0 / rn, 1e-4), 0.25);
  return uDiskTemp * t;
}

/* Emitted surface brightness of the disk annulus at radius rho.
   Physically color follows the effective temperature T(rho); the intensity
   envelope follows a milder falloff than T^4 so the outer disk stays bright
   (like observed SEDs of AGN disks and the reference look). */
vec3 diskEmission(float rho, float g) {
  float rn = rho / max(uDiskInner, 1e-3);
  float Tk = diskTemp(rho) * (uRedshiftStr > 0.001 ? g : 1.0);
  vec3 col = blackbody(clamp(Tk, 1000.0, 40000.0));
  /* intensity envelope with mild power law; clamp the beaming blow-up so
     the hot inner rim keeps color instead of clipping to white */
  float envelope = pow(max(rn, 1.0), -1.7);
  float beam = pow(g, uDopplerBoost);
  float lum = envelope * beam;
  lum = lum / (1.0 + 0.55 * lum);   /* soft shoulder */
  return col * lum * 3.1;
}

float dopplerG(vec3 p, vec3 v) {
  float r = length(p);
  float rho = max(length(p.xy), 1e-5);
  vec3 rhat = p / max(r, 1e-5);
  vec3 ph = vec3(-p.y, p.x, 0.0) / rho;
  vec3 th = cross(ph, rhat);
  float pr = inversesqrt(1.0 - uRs / r) * dot(v, rhat);
  float pz = dot(v, th);
  float pf = dot(v, ph);
  float nn = max(sqrt(pr * pr + pz * pz + pf * pf), 1e-9);
  float coschi = pf / nn;
  float beta = sqrt(uRs / (2.0 * max(r - uRs, 1e-3)));
  float grav = max(1.0 - 1.5 * uRs / r, 1e-4);
  grav = mix(1.0, grav, uRedshiftStr);
  return sqrt(grav) / max(1.0 - beta * coschi, 1e-4);
}

/* ------------------ geodesic integration ------------------ */
vec3 geodesic(vec3 ro, vec3 rd, out vec3 oOrder, out float oSteps) {
  float h2 = dot(cross(ro, rd), cross(ro, rd));
  vec3 p = ro, v = rd;

  vec3 acc0 = vec3(0.0);
  vec3 acc1 = vec3(0.0);
  vec3 acc2 = vec3(0.0);
  float T = 1.0;                /* global transmittance through everything */
  int order = 0;
  bool inDisk0 = false;
  float stepsUsed = 0.0;

  for (int i = 0; i < 512; i++) {
    if (i >= uMaxSteps) break;
    float r = length(p);

    if (r > uEscapeR) {
      vec3 sky = T * skyColor(normalize(uTiltInv * v));
      oOrder = vec3(length(acc0), length(acc1), length(acc2));
      oSteps = stepsUsed;
      vec3 dcol = acc0 + acc1 + acc2;
      if (uDebugView == 5) dcol = vec3(0.0); /* disk only view (sky suppressed) */
      return dcol + sky;
    }
    if (r < uRs * 1.02 + 0.002) break;

    float dt = clamp(uStepK * max(r - uStepA * uRs, 0.0), uStepMin, uStepMax);
    float rho = length(p.xy);
    float zAbs = abs(p.z);
    /* refine inside the disk slab, but not too hard — long graze-through
       chords must stay inside the step budget */
    if (rho < uDiskOuter * 1.2 &&
        zAbs < diskHeight(max(rho, uDiskInner)) * 4.0 + 0.6) {
      dt = min(dt, max(uStepMin * 9.0, dt * 0.55));
    }

    /* RK4 */
    vec3 k1v = -(1.5 * uRs * h2) * p / pow(dot(p, p), 2.5);
    vec3 k1x = v;
    vec3 x2 = p + k1x * dt * 0.5, v2 = v + k1v * dt * 0.5;
    vec3 k2v = -(1.5 * uRs * h2) * x2 / pow(dot(x2, x2), 2.5);
    vec3 k2x = v2;
    vec3 x3 = p + k2x * dt * 0.5, v3 = v + k2v * dt * 0.5;
    vec3 k3v = -(1.5 * uRs * h2) * x3 / pow(dot(x3, x3), 2.5);
    vec3 k3x = v3;
    vec3 x4 = p + k3x * dt, v4 = v + k3v * dt;
    vec3 k4v = -(1.5 * uRs * h2) * x4 / pow(dot(x4, x4), 2.5);
    vec3 k4x = v4;

    vec3 pNew = p + (k1x + 2.0 * k2x + 2.0 * k3x + k4x) * (dt / 6.0);
    vec3 vNew = v + (k1v + 2.0 * k2v + 2.0 * k3v + k4v) * (dt / 6.0);

    /* volumetric sampling inside disk slab — debug views 4 (sky only) and 5 (disk only) switch media on/off */
    bool diskOn = (uDebugView != 4);
    bool inDisk = diskOn && (rho > uDiskInner * 0.80 && rho < uDiskOuter * 1.15 &&
                   zAbs < diskHeight(max(rho, uDiskInner)) * 3.8 + 0.5);
    if (inDisk) {
      int sub = uDiskSub;
      float ds = dt / float(sub);
      for (int j = 0; j < 8; j++) {
        if (j >= sub) break;
        float t = (float(j) + 0.5) / float(sub);
        vec3 sp = mix(p, pNew, t);
        if (length(sp) <= uRs * 1.05) continue;
        float dens = diskDensity(sp);
        if (dens <= 1e-5) continue;

  float g = dopplerG(sp, normalize(v));
        g = clamp(g, 0.35, 4.0);
        float tau = uDiskOpacity * dens * ds;
        float ke = 1.0 - exp(-tau);
        /* source-function rendering: I += T · (1-e^-τ) · S
           S = blackbody(T_obs·g) · r^-env · g^beam  (Doppler beaming + shift) */
        vec3 emit = diskEmission(length(sp.xy), g) * dens;

        if (order == 0) {
          acc0 += T * emit * ke;
        } else if (order == 1) {
          acc1 += T * emit * ke;
        } else {
          acc2 += T * emit * ke;
        }
        T *= exp(-tau);
        if (T < 0.02) break;
      }
      if (!inDisk0) {
        order++;
        if (order > 2) order = 2;
        inDisk0 = true;
      }
    } else {
      inDisk0 = false;
    }

    p = pNew;
    v = vNew;
    stepsUsed += 1.0;
  }

  vec3 col = acc0 + acc1 + acc2;

  oOrder = vec3(length(acc0), length(acc1), length(acc2));
  oSteps = stepsUsed;
  col += 0.0;
  return col;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd +
                      uCamRight * ndc.x * uFovTan * uAspect +
                      uCamUp * ndc.y * uFovTan);
  vec3 ro = uCamPos;

  /* tilt the disk plane: rotate the ray into the disk frame */
  ro = uTilt * ro;
  rd = uTilt * rd;

  vec3 orderInfo; float stepsUsed;
  vec3 col = geodesic(ro, rd, orderInfo, stepsUsed);

  float o1 = orderInfo.x, o2 = orderInfo.y, o3 = orderInfo.z;
  vec3 dbg = col;
  if (uDebugView == 1)      dbg = vec3(clamp(o1, 0.0, 1.0));
  else if (uDebugView == 2) dbg = vec3(clamp(o2, 0.0, 1.0));
  else if (uDebugView == 3) dbg = vec3(0.0, 0.0, clamp(o3 / max(o1 + o2 + o3, 1e-5), 0.0, 1.0));
  else if (uDebugView == 6) dbg = vec3(clamp(o1 * 3.0, 0.0, 1.0), 0.3, 0.0);
  else if (uDebugView == 7) dbg = vec3(clamp(o2 * 3.0, 0.0, 1.0), 0.0, 0.3);
  else if (uDebugView == 8) dbg = vec3(min(stepsUsed * 0.01, 1.0), 0.0, 0.0);

  outColor = vec4(dbg, 1.0);
}
`;