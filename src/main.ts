/**
 * GARGANTUA — bootstrap & main loop
 * - WebGL2 pipeline (engine.ts) with HDR bloom + ACES filmic composite
 * - OrbitControls + 4 presets + cinematic camera (camera.ts)
 * - 21+ parameter HUD with localStorage persistence (hud.ts / params.ts)
 * - Debug views 0–9, quality tiers, ambient audio
 * - URL API for automation: ?shot=1&frames=N&view=K&quality=q&preset=i
 */
import { PerspectiveCamera } from 'three';
import { Engine } from './engine.js';
import { CameraRig } from './camera.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import {
  PARAM_DEFS, ParamsState, Quality, QUALITY, loadParams, saveParams,
} from './params.js';
import { safeGetContext, watchContextLoss, BlackScreenWatcher, showFatal } from './reliability.js';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const boot = document.getElementById('boot')!;

/* ---------------- URL API ---------------- */
const qp = new URLSearchParams(location.search);

function qnum(k: string, d: number): number {
  const v = qp.get(k);
  if (v === null) return d;
  const n = parseFloat(v);
  return isFinite(n) ? n : d;
}

/* ---------------- WebGL bootstrap with guards ---------------- */
let gl: WebGL2RenderingContext | null = safeGetContext(canvas);
if (!gl) {
  showFatal('WebGL2 is not available in this browser / device.');
  boot.classList.add('hidden');
  throw new Error('WebGL2 unavailable');
}

let engine: Engine;
try {
  engine = new Engine(canvas);
} catch (e) {
  console.error(e);
  showFatal('Renderer initialization failed: ' + (e as Error).message);
  boot.classList.add('hidden');
  throw e;
}
boot.classList.add('hidden');

/* ---------------- app state ---------------- */
const params: ParamsState = (() => {
  const p = loadParams();
  for (const def of PARAM_DEFS) {
    const v = qp.get(def.id);
    if (v !== null && isFinite(parseFloat(v))) p[def.id] = parseFloat(v);
  }
  return p;
})();

const preferQuality = qp.get('quality') ?? 'high';
const quality: Quality = (['standard', 'high', 'cinematic'] as string[]).includes(preferQuality)
  ? preferQuality as Quality : 'high';

const hud = new HUD(document.body);
const audio = new AudioEngine();
const watcher = new BlackScreenWatcher(gl);

/* three.js camera & OrbitControls (basis fed to the raytracer) */
const camera3 = new PerspectiveCamera(58, 1, 0.01, 500);
const rig = new CameraRig(canvas, camera3);

engine.quality = quality;
engine.qualityProfile = QUALITY[quality];

/* ---------------- HUD wiring ---------------- */
hud.setParamHandlers({
  onParam: (id, v) => { params[id] = v; },
  onQuality: (q) => setQuality(q),
  onPreset: (i) => {
    if (rig.cinematic) { rig.setCinematic(false); hud.setCinematic(false); }
    rig.applyPreset(i);
    /* keep the fov param in sync with the preset's camera fov */
    params.fov = rig.getFov();
    hud.setSlider('fov', params.fov);
  },
  onCinematic: (on) => rig.setCinematic(on),
  onSnap: () => snapshot(),
});

hud.bindParams(params, (id, v) => {
  params[id] = v;
  if (id === 'fov') rig.setFov(v);
  debounceSave();
}, () => saveParams(params));

hud.setQualityLabel(QUALITY[quality].label);

function setQuality(q: string) {
  const qq = q as Quality;
  if (!QUALITY[qq]) return;
  engine.quality = qq;
  engine.qualityProfile = QUALITY[qq];
  hud.setQualityLabel(QUALITY[qq].label);
  engine.resize(window.innerWidth, window.innerHeight);
  try { localStorage.setItem('gargantua.quality', qq); } catch { /* ok */ }
}

let saveTimer = 0;
function debounceSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveParams(params), 400);
}

/* audio */
document.addEventListener('gargantua-toggle-audio', async () => {
  const on = await audio.toggle();
  const btn = document.getElementById('btn-audio')!;
  btn.classList.toggle('active', on);
  btn.textContent = on ? '♪' : '♪';
  try { localStorage.setItem('gargantua.audio', on ? '1' : '0'); } catch { /* ok */ }
});

/* reset camera */
hud.onResetCamera(() => rig.reset());

/* restore quality */
try {
  const q = localStorage.getItem('gargantua.quality');
  if (q && QUALITY[q as Quality]) setQuality(q);
} catch { /* ok */ }

/* initial camera from URL preset or default */
{
  const pv = qp.get('preset');
  rig.applyPreset(pv !== null && parseInt(pv, 10) >= 0 ? parseInt(pv, 10) % 4 : 0);
  rig.setFov(params.fov);
}

/* optional render-scale override (tests / weak GPUs): ?scale=0.5 */
const scaleOverride = qnum('scale', 1.0);
engine.qualityProfile = {
  ...engine.qualityProfile,
  renderScale: Math.max(0.1, Math.min(2.0, engine.qualityProfile.renderScale * scaleOverride)),
};

/* initial debug view from URL */
engine.debugView = Math.min(9, Math.max(0, Math.round(qnum('view', 0))));

/* ---------------- resize ---------------- */
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w; canvas.height = h;
  camera3.aspect = w / h;
  camera3.updateProjectionMatrix();
  engine.resize(w, h);
  hud.setResolution(engine.getSize()[0], engine.getSize()[1]);
}
window.addEventListener('resize', resize);

/* context loss -> simplest robust recovery: reload module state */
watchContextLoss(gl!,
  () => { /* nothing: rAF continues but reverts to last good frame */ },
  () => { window.location.reload(); });

/* ---------------- debug keys ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key >= '0' && e.key <= '9') {
    const v = parseInt(e.key, 10);
    engine.debugView = v;
    hud.setDebugView(v);
  }
});

/* ---------------- screenshot / automation API ---------------- */
function snapshot(): string {
  const url = engine.screenshot();
  const a = document.createElement('a');
  a.href = url;
  a.download = `gargantua-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

(window as any).GARGANTUA = {
  version: '1.0.0',
  snap: snapshot,
  setParam: (id: string, v: number) => { params[id] = v; saveParams(params); },
  getParam: (id: string) => params[id],
  getParams: () => ({ ...params }),
  setView: (v: number) => { engine.debugView = v; hud.setDebugView(v); },
  setQuality: (q: string) => setQuality(q),
  preset: (i: number) => rig.applyPreset(i),
  ready: false,
};

/* ---------------- URL screenshot: ?shot=1&frames=N ---------------- */
const shotMode = qp.get('shot') === '1';
let shotFrames = Math.max(1, parseInt(qp.get('frames') ?? '', 10) || 45);
let shotDone = false;

/* ---------------- main loop ---------------- */
let last = performance.now();
let acc = 0, frames = 0, fpsT = 0;
let time = qnum('t', 0);
let fps = 60;
let readyFired = false;

function tick(now: number) {
  requestAnimationFrame(tick);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt);
  last = now;
  if (document.hidden) return;
  /* real (uncapped) time for animation so time advances even at very low
     fps (e.g. software rasterizers); dt (capped) drives damping only */
  time += Math.min(rawDt, 1.0);
  frames++; fpsT += rawDt;
  if (fpsT >= 0.5) {
    fps = frames / fpsT;
    hud.setFps(fps);
    frames = 0; fpsT = 0;
  }

  rig.update(dt, time);
  const basis = rig.getBasis();
  engine.setParams(params);
  engine.render(basis, time, dt);

  if (!watcher.isBlack) watcher.tick();

  if (shotMode && !shotDone) {
    shotFrames--;
    if (shotFrames <= 0) {
      shotDone = true;
      const url = engine.screenshot();
      console.log('GARGANTUA_SHOT_READY');
      (window as any).__GARGANTUA_SHOT__ = url;
      document.dispatchEvent(new CustomEvent('gargantua-shot', { detail: url }));
    }
  }

  if (!readyFired && frames >= 2) { /* signal ready after first full frames */
    readyFired = true;
    (window as any).GARGANTUA.ready = true;
    (window as any).__GARGANTUA_READY__ = true;
  }

  void acc;
}
acc = performance.now();
resize();
requestAnimationFrame(tick);