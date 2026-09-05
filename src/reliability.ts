/**
 * GARGANTUA — WebGL reliability utilities
 * Context creation with fallback, lost/restored handling, black-screen guard.
 */

export interface GLStatus {
  ok: boolean;
  error?: string;
}

/**
 * Try to create a WebGL2 context with the given attributes.
 * Returns null if unsupported (caller shows the fatal overlay).
 */
export function safeGetContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  const attrs: WebGLContextAttributes = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  };
  if ('getContext' in canvas) {
    try {
      const gl = canvas.getContext('webgl2', attrs);
      if (gl) return gl as WebGL2RenderingContext;
    } catch (e) { console.error('webgl2 ctx error', e); }
  }
  return null;
}

/** Attach lost/restored handlers; returns a restore callback setter. */
export function watchContextLoss(
  gl: WebGL2RenderingContext,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const canvas = gl.canvas as HTMLCanvasElement;
  const lost = (e: Event) => {
    e.preventDefault();
    console.warn('GARGANTUA: WebGL context lost');
    onLost();
  };
  const restored = () => {
    console.warn('GARGANTUA: WebGL context restored');
    onRestored();
  };
  canvas.addEventListener('webglcontextlost', lost, false);
  canvas.addEventListener('webglcontextrestored', restored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}

/**
 * Black-screen watchdog: samples the center pixel of the draw buffer a few
 * frames after start; if the whole frame is black (rendering failed silently)
 * reports it so the caller can flip a uniform-off fallback.
 */
export class BlackScreenWatcher {
  private gl: WebGL2RenderingContext;
  private frames = 0;
  private pixel = new Uint8Array(4);
  isBlack = false;
  constructor(gl: WebGL2RenderingContext) { this.gl = gl; }

  /** call after each frame; returns true when black-frame detected (once) */
  tick(): boolean {
    this.frames++;
    if (this.frames < 30) return false;
    if (this.frames > 90) return false;
    const gl = this.gl;
    const x = Math.floor(gl.drawingBufferWidth / 2);
    const y = Math.floor(gl.drawingBufferHeight / 2);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
    const sum = this.pixel[0] + this.pixel[1] + this.pixel[2];
    if (sum < 2) {
      this.isBlack = true;
      console.warn('GARGANTUA: black frame suspected (center pixel empty)');
      return true;
    }
    return false;
  }
}

/** Factory: shows the #fatal overlay with the message. */
export function showFatal(msg: string) {
  const el = document.getElementById('fatal');
  if (!el) return;
  document.getElementById('fatal-msg')!.textContent = msg;
  el.classList.remove('hidden');
}