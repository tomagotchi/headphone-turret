/** Placeholder sound effects, synthesised on the fly. No audio files. */
export class Sfx {
  ctx: AudioContext | null = null;
  volume = 0.6;
  /** Called with a sound's length (ms) whenever one starts playing. */
  onPlay: (ms: number) => void = () => {};

  private master: GainNode | null = null;

  /** Must be called from a click or key press: browsers block audio otherwise. */
  unlock(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  pew(): void {
    this.tone('square', 880, 220, 0.09, 0.25);
  }
  pop(): void {
    this.noise(0.12, 0.35);
    this.tone('triangle', 520, 140, 0.1, 0.25);
  }
  thud(): void {
    this.tone('sine', 110, 40, 0.3, 0.6);
    this.noise(0.2, 0.25);
  }
  shieldUp(): void {
    this.tone('sine', 300, 900, 0.3, 0.3);
  }
  shieldBlock(): void {
    this.tone('triangle', 900, 600, 0.12, 0.25);
  }
  reload(): void {
    this.tone('square', 180, 240, 0.05, 0.15);
  }
  empty(): void {
    this.tone('square', 120, 100, 0.04, 0.12);
  }
  wave(): void {
    this.tone('triangle', 440, 660, 0.18, 0.2);
  }
  gameOver(): void {
    this.tone('sawtooth', 330, 55, 0.8, 0.3);
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
    this.onPlay(dur * 1000);
  }

  private noise(dur: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buffer;
    g.gain.value = gain * this.volume;
    src.connect(g).connect(this.master);
    src.start();
    this.onPlay(dur * 1000);
  }
}
