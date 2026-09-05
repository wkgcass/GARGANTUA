/**
 * GARGANTUA — camera rig
 * OrbitControls with damping, four curated view presets, and a cinematic
 * camera that orbits the black hole on a smooth closed path.
 */
import * as THREE from 'three';
import { OrbitControls } from '../vendors/OrbitControls.js';
import { CameraBasis } from './engine.js';

export interface ViewPreset {
  name: string;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export const VIEW_PRESETS: ViewPreset[] = [
  {
    name: 'INTERSTELLAR',
    pos: [15.8, 0.0, 5.4],
    target: [0, 0, 0],
    fov: 58,
  },
  {
    name: 'EDGE ON',
    pos: [17.2, 0.0, 0.62],
    target: [0, 0, 0],
    fov: 50,
  },
  {
    name: 'FACE ON',
    pos: [9.6, 0.0, 14.2],
    target: [0, 0, 0],
    fov: 55,
  },
  {
    name: 'WIDE CINEMA',
    pos: [20.8, 0.0, 10.6],
    target: [0, 0, 0],
    fov: 68,
  },
];

const D2R = Math.PI / 180;

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  cinematic = false;
  private cineT = 0;
  private startPos = new THREE.Vector3();
  private startTgt = new THREE.Vector3();
  private currentFov = 58;

  constructor(el: HTMLElement, camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    /* The accretion disk lies in the world xy-plane (normal = +Z, as in the
       raytracer).  Making +Z the orbit "up" keeps the disk horizontal on
       screen for the classic Gargantua look in every preset. */
    camera.up.set(0, 0, 1);
    camera.updateMatrixWorld();
    this.controls = new OrbitControls(camera, el);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.5;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI;   // full sphere: disk is visible from any side
    this.controls.target.set(0, 0, 0);
    camera.position.set(10.6, 4.9, 0);
    this.controls.update();
    this.startPos.copy(camera.position);
    this.startTgt.copy(this.controls.target);
  }

  applyPreset(i: number) {
    const p = VIEW_PRESETS[i % VIEW_PRESETS.length];
    this.camera.position.set(...p.pos);
    this.controls.target.set(...p.target);
    this.currentFov = p.fov;
    this.camera.fov = p.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** animate to a chosen preset (if target preset is not current) */
  private animFrom?: ViewPreset; private animTo?: ViewPreset; private animT = 1;
  flyTo(i: number, dur = 1.6) {
    const p = VIEW_PRESETS[i % VIEW_PRESETS.length];
    this.animFrom = {
      name: 'tmp',
      pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      fov: this.currentFov,
    };
    this.animTo = p;
    this.animT = 0;
    this._flyDur = dur;
  }
  private _flyDur = 1.6;
  private _flyPosA = new THREE.Vector3();
  private _flyTgtA = new THREE.Vector3();

  private updateFly(dt: number) {
    if (!this.animTo) return;
    this.animT = Math.min(1, this.animT + dt / this._flyDur);
    const t = this.animT;
    const s = t * t * (3 - 2 * t); // smoothstep
    const from = this.animFrom!, to = this.animTo!;
    const p = this._flyPosA.set(
      from.pos[0] + (to.pos[0] - from.pos[0]) * s,
      from.pos[1] + (to.pos[1] - from.pos[1]) * s,
      from.pos[2] + (to.pos[2] - from.pos[2]) * s);
    this.camera.position.copy(p);
    const tg = this._flyTgtA.set(
      from.target[0] + (to.target[0] - from.target[0]) * s,
      from.target[1] + (to.target[1] - from.target[1]) * s,
      from.target[2] + (to.target[2] - from.target[2]) * s);
    this.controls.target.copy(tg);
    this.currentFov = from.fov + (to.fov - from.fov) * s;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
    if (this.animT >= 1) this.animTo = undefined;
  }

  setCinematic(on: boolean) {
    if (on === this.cinematic) return;
    this.cinematic = on;
    if (on) {
      this.controls.enabled = false;
    } else {
      this.controls.enabled = true;
      this.controls.update();
    }
  }

  reset() {
    this.camera.position.copy(this.startPos);
    this.controls.target.copy(this.startTgt);
    this.controls.update();
  }

  update(dt: number, time: number) {
    if (this.cinematic) {
      /* closed cinematic path: slow hero orbit around the disk plane */
      const t = time;
      const R = 13.2 + 1.4 * Math.sin(t * 0.11);
      const h = 5.9 + 2.3 * Math.sin(t * 0.053 + 1.3);
      const a = t * 0.085;
      this.camera.position.set(
        R * Math.cos(a),
        R * Math.sin(a),
        h);
      const tx = 1.1 * Math.sin(t * 0.031 + 0.7);
      const ty = 0.55 * Math.sin(t * 0.043);
      this.controls.target.set(tx, ty, 0);
      this.camera.lookAt(this.controls.target);
      const wantFov = 54 + 4 * Math.sin(t * 0.021);
      this.currentFov += (wantFov - this.currentFov) * Math.min(1, dt * 2.5);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    } else {
      this.updateFly(dt);
      this.controls.update();
    }
  }

  /** camera basis for the shader */
  getBasis(): CameraBasis {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    return {
      pos: [e[12], e[13], e[14]],
      right: [e[0], e[1], e[2]],
      up: [e[4], e[5], e[6]],
      fwd: [-e[8], -e[9], -e[10]],
      fovTan: Math.tan((this.camera.fov * D2R) / 2),
    };
  }

  /** Pan+zoom friendly: set fov param externally */
  setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.currentFov = fov;
  }
  getFov() { return this.currentFov; }
}