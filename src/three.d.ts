/**
 * Minimal ambient type declarations for the vendored three.module.js.
 */
declare module 'three' {
  export class Vector3 {
    x: number; y: number; z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
  }
  export class PerspectiveCamera {
    position: Vector3;
    up: Vector3;
    quaternion: { x: number; y: number; z: number; w: number };
    fov: number;
    aspect: number;
    near: number;
    far: number;
    matrixWorld: { elements: number[] };
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    lookAt(v: Vector3): void;
    updateProjectionMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
  }
  export class MathUtils {}
  export class EventDispatcher {}
  export const MOUSE: any;
  export const TOUCH: any;
  export class Controls {}
  export class Plane {}
  export class Ray {}
}

declare module '../vendors/OrbitControls.js' {
  import * as THREE from 'three';
  export class OrbitControls {
    constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement);
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
}