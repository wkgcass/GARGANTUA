/**
 * GARGANTUA — engine
 * Raw WebGL2 pipeline: geodesic raytracer → HDR target; bright pass;
 * separable gaussian bloom; composite (ACES, CA, vignette, grain).
 */
import { RAYTRACE_FRAG, FULLSCREEN_VERT } from './shaders.js';
import { BRIGHT_FRAG, BLUR_FRAG, COMPOSITE_FRAG } from './postshaders.js';
import { QUALITY, Quality, QualityProfile, STEP } from './params.js';

export interface CameraBasis {
  pos: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  fwd: [number, number, number];
  fovTan: number;
}

export class Engine {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  private raytraceProg: WebGLProgram;
  private brightProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compositeProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private sceneTex: WebGLTexture;
  private sceneFBO: WebGLFramebuffer;
  private brightTex: WebGLTexture;
  private brightFBO: WebGLFramebuffer;
  private blurA: WebGLTexture; private blurB: WebGLTexture;
  private blurAFBO: WebGLFramebuffer; private blurBFBO: WebGLFramebuffer;
  private width = 1; private height = 1;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  quality: Quality = 'high';
  qualityProfile: QualityProfile;
  private _params: Record<string, number> = {};
  paramsOverride: Record<string, number> = {};
  onAfterRender?: (t: number, dt: number) => void;
  private frameCount = 0;
  private timeStart = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl2 = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    if (!gl2) throw new Error('WebGL2 not supported');
    this.gl = gl2;
    /* enable float renderability (HDR pipeline) — WebGL2 needs this ext */
    gl2.getExtension('EXT_color_buffer_float');
    gl2.getExtension('EXT_color_buffer_half_float');
    gl2.getExtension('OES_texture_float_linear');
    this.qualityProfile = QUALITY[this.quality];

    this.raytraceProg = this.build(RAYTRACE_FRAG);
    this.brightProg = this.build(BRIGHT_FRAG);
    this.blurProg = this.build(BLUR_FRAG);
    this.compositeProg = this.build(COMPOSITE_FRAG);

    const gl = this.gl;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    const tex = (): WebGLTexture => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.sceneTex = tex(); this.sceneFBO = gl.createFramebuffer()!;
    this.brightTex = tex(); this.brightFBO = gl.createFramebuffer()!;
    this.blurA = tex(); this.blurB = tex();
    this.blurAFBO = gl.createFramebuffer()!; this.blurBFBO = gl.createFramebuffer()!;
  }

  /* ---------------- shader helpers ---------------- */
  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error('Shader compile error:', log, '\n', src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n').slice(0, 4000));
      throw new Error(`Shader compile failed: ${log}`);
    }
    return sh;
  }
  private build(frag: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.compile(gl.VERTEX_SHADER, FULLSCREEN_VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, frag);
    const p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Link failed: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    return p;
  }
  private uniforms(prog: WebGLProgram): Record<string, WebGLUniformLocation | null> {
    const gl = this.gl;
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
    const out: Record<string, WebGLUniformLocation | null> = {};
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i)!;
      out[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    return out;
  }

  /* ---------------- resize / RT wiring ---------------- */
  resize(w: number, h: number) {
    const gl = this.gl;
    const scale = this.qualityProfile.renderScale;
    const dpr = Math.min(window.devicePixelRatio || 1, this.qualityProfile.dprCap);
    const rw = Math.max(2, Math.round(w * scale * dpr));
    const rh = Math.max(2, Math.round(h * scale * dpr));
    if (rw === this.width && rh === this.height) return;
    this.width = rw; this.height = rh;

    const attach = (tex: WebGLTexture, fbo: WebGLFramebuffer) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, rw, rh, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    };
    attach(this.sceneTex, this.sceneFBO);
    attach(this.brightTex, this.brightFBO);
    attach(this.blurA, this.blurAFBO);
    attach(this.blurB, this.blurBFBO);
    for (const f of [this.sceneFBO, this.brightFBO, this.blurAFBO, this.blurBFBO]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Framebuffer incomplete — float render targets unsupported');
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  setParams(p: Record<string, number>) { this._params = p; }

  /* ---------------- frame ---------------- */
  render(cam: CameraBasis, t: number, dt: number) {
    const gl = this.gl;
    const P = { ...this._params, ...this.paramsOverride };
    const prof = this.qualityProfile;
    const fovTan = Math.tan((P.fov * Math.PI / 180) / 2);
    const aspect = this.width / Math.max(this.height, 1);

    /* ------- pass 0: raytrace -> sceneHDR ------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.raytraceProg);
    const U = this.uniOf(this.raytraceProg);
    this.set3(U.uCamPos, cam.pos); this.set3(U.uCamRight, cam.right);
    this.set3(U.uCamUp, cam.up); this.set3(U.uCamFwd, cam.fwd);
    gl.uniform1f(U.uFovTan, fovTan);
    gl.uniform1f(U.uAspect, aspect);
    gl.uniform2f(U.uResolution, this.width, this.height);
    gl.uniform1f(U.uTime, t);
    gl.uniform1f(U.uRs, P.rs);
    gl.uniform1f(U.uDiskInner, P.diskInner);
    gl.uniform1f(U.uDiskOuter, P.diskOuter);
    gl.uniform1f(U.uDiskThickness, P.diskThickness);
    gl.uniform1f(U.uDiskDensity, P.diskDensity);
    gl.uniform1f(U.uDiskOpacity, P.diskOpacity);
    gl.uniform1f(U.uDiskTemp, P.diskTemp);
    gl.uniform1f(U.uDiskTilt, P.diskTilt);
    gl.uniform1f(U.uDiskTurbAmp, P.diskTurbAmp);
    gl.uniform1f(U.uDiskTurbScale, P.diskTurbScale);
    gl.uniform1f(U.uDiskTurbSpeed, P.diskTurbSpeed);
    gl.uniform1f(U.uDiskShear, P.diskShear);
    gl.uniform1f(U.uDopplerBoost, P.dopplerBoost);
    gl.uniform1f(U.uRedshiftStr, P.redshiftStr);
    gl.uniform1f(U.uStarDensity, P.starDensity);
    gl.uniform1f(U.uStarBright, P.starBright);
    gl.uniform1f(U.uGalaxyBright, P.galaxyBright);
    gl.uniform1i(U.uDebugView, this.debugView);
    gl.uniform1i(U.uMaxSteps, prof.maxSteps);
    const k = prof.stepsK;
    gl.uniform1f(U.uStepK, STEP.k * k);
    gl.uniform1f(U.uStepA, STEP.a);
    gl.uniform1f(U.uStepMin, STEP.min);
    gl.uniform1f(U.uStepMax, STEP.max * k);
    gl.uniform1i(U.uDiskSub, prof.diskSub);
    gl.uniform1i(U.uNoiseOct, prof.noiseOct);
    gl.uniform1f(U.uEscapeR, 45.0);
    const ct = Math.cos(P.diskTilt), st = Math.sin(P.diskTilt);
    /* rotation about x-axis by uDiskTilt (world -> disk frame) */
    const tiltMat = new Float32Array([
      1, 0, 0,
      0, ct, st,
      0, -st, ct,
    ]);
    const tiltMatInv = new Float32Array([
      1, 0, 0,
      0, ct, -st,
      0, st, ct,
    ]);
    gl.uniformMatrix3fv(U.uTilt, false, tiltMat);
    gl.uniformMatrix3fv(U.uTiltInv, false, tiltMatInv);
    this.draw();

    /* ------- pass 1: bright pass ------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFBO);
    gl.viewport(0, 0, this.width >> 1, this.height >> 1);
    gl.useProgram(this.brightProg);
    const UB = this.uniOf(this.brightProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(UB.uTex, 0);
    gl.uniform1f(UB.uThreshold, P.bloomThreshold);
    this.draw();

    /* ------- pass 2: blur chain (ping-pong x2) ------- */
    const scaleW = Math.max(1, this.width >> 1), scaleH = Math.max(1, this.height >> 1);
    for (let i = 0; i < 2; i++) {
      // H
      gl.bindFramebuffer(gl.FRAMEBUFFER, i === 0 ? this.blurAFBO : this.blurBFBO);
      gl.viewport(0, 0, scaleW, scaleH);
      gl.useProgram(this.blurProg);
      const UH = this.uniOf(this.blurProg);
      gl.bindTexture(gl.TEXTURE_2D, i === 0 ? this.brightTex : this.blurA);
      gl.uniform1i(UH.uTex, 0);
      gl.uniform2f(UH.uDir, 1 / scaleW, 0);
      gl.uniform1f(UH.uRadius, prof.bloomRadius);
      this.draw();
      // V
      gl.bindFramebuffer(gl.FRAMEBUFFER, i === 0 ? this.blurBFBO : this.blurAFBO);
      gl.useProgram(this.blurProg);
      gl.bindTexture(gl.TEXTURE_2D, i === 0 ? this.blurA : this.blurB);
      gl.uniform1i(UH.uTex, 0);
      gl.uniform2f(UH.uDir, 0, 1 / scaleH);
      gl.uniform1f(UH.uRadius, prof.bloomRadius);
      this.draw();
    }

    /* ------- pass 3: composite ------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compositeProg);
    const UC = this.uniOf(this.compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(UC.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurB);
    gl.uniform1i(UC.uBloom, 1);
    gl.uniform1f(UC.uExposure, P.exposure);
    gl.uniform1f(UC.uBloomAmt, P.bloomAmt);
    gl.uniform1f(UC.uCAAmount, P.caAmount);
    gl.uniform1f(UC.uVignette, P.vignette);
    gl.uniform1f(UC.uGrain, P.grain);
    gl.uniform1f(UC.uTime, t);
    gl.uniform1f(UC.uGradK, 0);
    gl.uniform1i(UC.uDebugView, this.debugView);
    this.draw();

    this.frameCount++;
    this.onAfterRender?.(t, dt);
  }

  debugView = 0;

  private uniCache = new Map<WebGLProgram, Record<string, WebGLUniformLocation | null>>();
  private uniOf(p: WebGLProgram) {
    let u = this.uniCache.get(p);
    if (!u) { u = this.uniforms(p); this.uniCache.set(p, u); }
    return u;
  }

  private set3(loc: WebGLUniformLocation | null, v: [number, number, number]) {
    if (loc) this.gl.uniform3f(loc, v[0], v[1], v[2]);
  }

  private draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** render to canvas at exact pixel size for screenshots */
  screenshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  getSize(): [number, number] { return [this.width, this.height]; }

  get frames() { return this.frameCount; }
  get elapsed() { return (performance.now() - this.timeStart) / 1000; }
}