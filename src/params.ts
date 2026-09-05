/**
 * GARGANTUA — parameter registry
 * Every parameter: id, label, group, min/max/step, default, and format.
 * Persisted to localStorage + exposed on window.GARGANTUA for automation.
 */

export type ParamGroup =
  | 'PHYSICS'
  | 'DISK'
  | 'TURBULENCE'
  | 'RELATIVITY'
  | 'SKY'
  | 'CAMERA'
  | 'POST'
  | 'MISC';

export interface ParamDef {
  id: string;
  label: string;
  group: ParamGroup;
  min: number;
  max: number;
  step: number;
  def: number;
  log?: boolean;
  unit?: string;
  hint?: string;
}

export const PARAM_DEFS: ParamDef[] = [
  /* ---------- PHYSICS ---------- */
  { id: 'rs',           label: 'SCHWARZSCHILD RADIUS', group: 'PHYSICS', min: 0.5, max: 2.0, step: 0.01, def: 1.0, unit: ' rs',  hint: 'Rendered BH size vs world units' },
  { id: 'diskInner',    label: 'DISK INNER RADIUS',    group: 'PHYSICS', min: 2.7, max: 5.0, step: 0.01, def: 3.0, unit: ' rs',  hint: 'ISCO = 3 rs (innermost stable orbit)' },
  { id: 'diskOuter',    label: 'DISK OUTER RADIUS',    group: 'PHYSICS', min: 8.0, max: 20.0, step: 0.1, def: 12.0, unit: ' rs', hint: 'Where the disk fades out' },
  { id: 'diskTilt',     label: 'DISK INCLINATION',     group: 'PHYSICS', min: -1.2, max: 1.2, step: 0.01, def: 0.18, unit: ' rad', hint: 'Tilt of disk plane' },
  { id: 'diskTemp',     label: 'DISK TEMPERATURE',     group: 'PHYSICS', min: 1000, max: 30000, step: 100, def: 7000, unit: ' K',  log: false, hint: 'Peak blackbody temperature' },
  { id: 'diskDensity',  label: 'DISK DENSITY',         group: 'PHYSICS', min: 0.2, max: 4.0, step: 0.02, def: 1.0, hint: 'Volumetric density scaling' },
  { id: 'diskOpacity',  label: 'DISK OPACITY',         group: 'PHYSICS', min: 0.2, max: 6.0, step: 0.05, def: 1.6, hint: 'Absorption cross-section σ' },
  /* ---------- DISK shape ---------- */
  { id: 'diskThickness', label: 'DISK THICKNESS (H/R)', group: 'DISK', min: 0.02, max: 0.35, step: 0.005, def: 0.042, hint: 'Vertical scale height ratio' },
  /* ---------- TURBULENCE ---------- */
  { id: 'diskTurbAmp',   label: 'TURBULENCE AMPLITUDE', group: 'TURBULENCE', min: 0.0, max: 2.0, step: 0.02, def: 1.05 },
  { id: 'diskTurbScale', label: 'TURBULENCE SCALE',     group: 'TURBULENCE', min: 0.5, max: 8.0, step: 0.05, def: 2.6, unit: ' f' },
  { id: 'diskTurbSpeed', label: 'TURBULENCE SPEED',     group: 'TURBULENCE', min: 0.0, max: 4.0, step: 0.02, def: 1.0, unit: '×' },
  { id: 'diskShear',     label: 'DIFFERENTIAL SHEAR',   group: 'TURBULENCE', min: 0.0, max: 3.0, step: 0.02, def: 1.0, unit: '×' },
  /* ---------- RELATIVITY ---------- */
  { id: 'dopplerBoost',  label: 'DOPPLER BEAMING',      group: 'RELATIVITY', min: 0.0, max: 5.0, step: 0.05, def: 2.6, unit: ' g^n', hint: 'Intensity ∝ g^n' },
  { id: 'redshiftStr',   label: 'GRAVITATIONAL REDSHIFT', group: 'RELATIVITY', min: 0.0, max: 1.0, step: 0.01, def: 1.0, hint: '0=off, 1=full' },
  /* ---------- SKY ---------- */
  { id: 'starDensity',   label: 'STAR DENSITY',  group: 'SKY', min: 0.0, max: 2.5, step: 0.02, def: 1.0 },
  { id: 'starBright',    label: 'STAR BRIGHTNESS', group: 'SKY', min: 0.0, max: 4.0, step: 0.05, def: 1.0 },
  { id: 'galaxyBright',  label: 'MILKY WAY GLOW', group: 'SKY', min: 0.0, max: 3.0, step: 0.02, def: 1.1 },
  /* ---------- POST ---------- */
  { id: 'exposure',      label: 'EXPOSURE',      group: 'POST', min: 0.2, max: 3.5, step: 0.02, def: 1.0 },
  { id: 'bloomAmt',      label: 'BLOOM INTENSITY', group: 'POST', min: 0.0, max: 3.0, step: 0.02, def: 0.55 },
  { id: 'bloomThreshold', label: 'BLOOM THRESHOLD', group: 'POST', min: 0.2, max: 4.0, step: 0.05, def: 1.15 },
  { id: 'caAmount',      label: 'CHROMATIC ABERRATION', group: 'POST', min: 0.0, max: 0.02, step: 0.0005, def: 0.0022 },
  { id: 'vignette',      label: 'VIGNETTE',      group: 'POST', min: 0.0, max: 1.2, step: 0.02, def: 0.55 },
  { id: 'grain',         label: 'FILM GRAIN',    group: 'POST', min: 0.0, max: 0.25, step: 0.005, def: 0.045 },
  /* ---------- CAMERA / MISC ---------- */
  { id: 'fov',           label: 'FOV',           group: 'CAMERA', min: 20, max: 110, step: 1, def: 58, unit: '°' },
  { id: 'maxSteps',      label: 'RAY STEPS',     group: 'MISC', min: 24, max: 320, step: 4, def: 96, hint: 'Geodesic integration budget' },
  { id: 'noiseOct',      label: 'NOISE OCTAVES', group: 'MISC', min: 1, max: 5, step: 1, def: 3, hint: 'FBM detail' },
];

export const PARAM_GROUPS: ParamGroup[] = [
  'PHYSICS', 'DISK', 'TURBULENCE', 'RELATIVITY', 'SKY', 'POST', 'CAMERA', 'MISC',
];

/* ---------- quality presets ---------- */
export type Quality = 'standard' | 'high' | 'cinematic';

export interface QualityProfile {
  label: string;
  renderScale: number;      // pixel ratio multiplier
  maxSteps: number;
  diskSub: number;          // disk sub-samples per geodesic step
  noiseOct: number;
  bloomRadius: number;
  dprCap: number;
  stepsK: number;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  standard: {
    label: 'STANDARD', renderScale: 0.66, maxSteps: 168, diskSub: 2,
    noiseOct: 2, bloomRadius: 1.6, dprCap: 1.25, stepsK: 1.0,
  },
  high: {
    label: 'HIGH', renderScale: 0.85, maxSteps: 232, diskSub: 3,
    noiseOct: 3, bloomRadius: 2.0, dprCap: 1.6, stepsK: 1.0,
  },
  cinematic: {
    label: 'CINEMATIC', renderScale: 1.0, maxSteps: 300, diskSub: 4,
    noiseOct: 4, bloomRadius: 2.6, dprCap: 2.0, stepsK: 0.9,
  },
};

/** step scheme for geodesic adaptive stepping (validated in tools/verify_steps.py) */
export const STEP = { k: 0.12, a: 1.5, min: 0.035, max: 1.6 };

export interface ParamsState {
  [id: string]: number;
}

export function makeDefaults(): ParamsState {
  const s: ParamsState = {};
  for (const p of PARAM_DEFS) s[p.id] = p.def;
  return s;
}

const LS_KEY = 'gargantua.params.v1';

export function loadParams(): ParamsState {
  const s = makeDefaults();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      for (const p of PARAM_DEFS) {
        if (typeof o[p.id] === 'number' && isFinite(o[p.id])) s[p.id] = o[p.id];
      }
    }
  } catch { /* ignore */ }
  return s;
}

export function saveParams(s: ParamsState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function formatVal(p: ParamDef, v: number): string {
  let t = p.step >= 1 ? v.toFixed(0) : v.toFixed(2);
  return `${t}${p.unit || ''}`;
}