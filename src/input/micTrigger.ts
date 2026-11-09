/**
 * Fires on sharp sounds ("pew!", a clap, a click). It listens to loudness only:
 * a short window of samples is read each frame, reduced to one number, and
 * thrown away. Nothing is recorded or sent anywhere.
 */
export class MicTrigger {
  /** Current loudness, 0..1 (0 = -60 dB, 1 = full scale). */
  level = 0;
  /** Rolling estimate of the room's background noise, same scale. */
  floor = 0;
  /** Loudness a sound must reach to fire: floor + threshold. */
  triggerLevel = 1;
  active = false;

  /** Margin above the noise floor, 0..1. Set from the settings slider. */
  threshold = 0.25;
  cooldownMs = 150;
  onFire: () => void = () => {};

  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(1024);
  private envelope = 0;
  private armed = true;
  private lastFire = -Infinity;
  private lastPoll = 0;
  private muteUntil = 0;

  async start(ctx: AudioContext): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Echo cancellation keeps the game's own sounds out of the mic.
        // The other two would flatten exactly the spikes we want to detect.
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    // ~21 ms of audio per read: longer than a frame, so no sample is skipped.
    this.analyser.fftSize = 1024;
    this.buf = new Float32Array(this.analyser.fftSize);
    source.connect(this.analyser);
    this.active = true;
  }

  /** Ignore the mic until this time (used while the game's own sounds play). */
  muteFor(ms: number, now = performance.now()): void {
    this.muteUntil = Math.max(this.muteUntil, now + ms);
  }

  /** Call once per animation frame. */
  poll(now: number): void {
    if (!this.analyser) return;
    const dt = Math.min(0.1, (now - this.lastPoll) / 1000) || 0.016;
    this.lastPoll = now;

    this.analyser.getFloatTimeDomainData(this.buf);
    let peak = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = Math.abs(this.buf[i]);
      if (v > peak) peak = v;
    }
    const db = 20 * Math.log10(peak + 1e-6);
    this.level = Math.min(1, Math.max(0, (db + 60) / 60));

    // Envelope: jumps up instantly, falls back over ~120 ms. A drawn-out
    // "peeeew" therefore stays "one sound" rather than re-triggering.
    this.envelope = Math.max(this.level, this.envelope - dt * 4);

    this.triggerLevel = Math.min(0.98, this.floor + this.threshold);
    const muted = now < this.muteUntil;

    if (!muted) {
      // Noise floor: drops quickly to quiet, creeps up slowly towards noise.
      const rate = this.level < this.floor ? 6 : 0.4;
      this.floor += (this.level - this.floor) * Math.min(1, rate * dt);
    }

    if (this.envelope < this.triggerLevel - 0.04) this.armed = true;

    if (
      !muted &&
      this.armed &&
      this.level >= this.triggerLevel &&
      now - this.lastFire >= this.cooldownMs
    ) {
      this.armed = false;
      this.lastFire = now;
      this.onFire();
    }
  }
}
