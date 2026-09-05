/**
 * GARGANTUA — ambient audio manager
 * Plays the generated ambient pad (assets/ambient.wav), loops it seamlessly,
 * with a triangle-wave shimmer layer for extra depth. Toggle on/off; volume
 * persisted. Starts only after user interaction (autoplay policy safe).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private _on = false;
  private buffer: AudioBuffer | null = null;
  private volume = 0.55;

  get on() { return this._on; }

  async init() {
    if (this.ctx) return;
    /* load asset */
    try {
      const resp = await fetch('assets/ambient.wav');
      const arr = await resp.arrayBuffer();
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.buffer = await this.ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn('Ambient asset unavailable, falling back to silence.', e);
    }
  }

  /** call from a user gesture handler */
  async toggle(): Promise<boolean> {
    if (!this.ctx) await this.init();
    if (!this.ctx) return false;
    if (this._on) {
      this._off();
      return false;
    }
    this._on = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    if (this.buffer) {
      this.source = this.ctx.createBufferSource();
      this.source.buffer = this.buffer;
      this.source.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      this.source.connect(lp).connect(this.master);
      this.source.start();
    }

    /* shimmer: detuned triangle pad, LFO-faded */
    try {
      const shimmer = this.ctx.createOscillator();
      shimmer.type = 'triangle';
      shimmer.frequency.value = 261.6; // C4
      const sg = this.ctx.createGain();
      sg.gain.value = 0.012;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.17;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.008;
      lfo.connect(lg).connect(sg.gain);
      shimmer.connect(sg).connect(this.master);
      shimmer.start(); lfo.start();
    } catch { /* optional layer */ }

    /* fade-in */
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(this.volume, t + 2.2);
    return true;
  }

  private _off() {
    this._on = false;
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.4);
    }
    window.setTimeout(() => {
      try { this.source?.stop(); } catch { /* noop */ }
      this.source = null;
    }, 500);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.2);
    }
  }
}