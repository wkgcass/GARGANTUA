/**
 * Type declarations for the vendored OrbitControls addon (JS).
 */
import * as THREE from './three-decl.js';

export class OrbitControls {
  constructor(camera: any, domElement: HTMLElement);
  enableDamping: boolean;
  dampingFactor: number;
  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  minPolarAngle: number;
  enablePan: boolean;
  enabled: boolean;
  target: THREE.Vector3;
  update(): void;
  dispose(): void;
  addEventListener(ev: string, cb: (e: any) => void): void;
  removeEventListener(ev: string, cb: (e: any) => void): void;
}