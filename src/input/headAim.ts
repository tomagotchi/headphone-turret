import type { Settings } from '../settings';
import type { AimPoint, HeadPose } from './types';

/** Head turn (degrees) that reaches the screen edge at sensitivity 1. */
const YAW_RANGE = 20;
/** Nodding is less comfortable than turning, so pitch gets a smaller range. */
const PITCH_RANGE = 13;

/**
 * Turns raw head angles into a smoothed aim point: calibration offset,
 * dead zone, range mapping and low-pass filter. Pure maths with no browser
 * APIs, so it ports straight to Swift.
 */
export class HeadAim {
  private centre: HeadPose | null = null;
  private current: AimPoint = { x: 0, y: 0 };

  get calibrated(): boolean {
    return this.centre !== null;
  }

  /** Treat this pose as "looking at the centre of the screen". */
  calibrate(pose: HeadPose): void {
    this.centre = { ...pose };
    this.current = { x: 0, y: 0 };
  }

  update(pose: HeadPose, dt: number, s: Settings): AimPoint {
    if (!this.centre) return this.current;

    const yaw = (pose.yaw - this.centre.yaw) * (s.invertYaw ? -1 : 1);
    const pitch = (pose.pitch - this.centre.pitch) * (s.invertPitch ? -1 : 1);

    const tx = mapAxis(yaw, s.deadZone, YAW_RANGE / s.sensitivity);
    const ty = mapAxis(pitch, s.deadZone, PITCH_RANGE / s.sensitivity);

    // Frame-rate independent low-pass: smoothing 0 → instant, 0.9 → ~0.27s lag.
    const tau = s.smoothing * 0.3;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    this.current.x += (tx - this.current.x) * alpha;
    this.current.y += (ty - this.current.y) * alpha;
    return this.current;
  }
}

/** Dead zone, then scale so `range` degrees still reaches exactly ±1. */
function mapAxis(deg: number, deadZone: number, range: number): number {
  const mag = Math.abs(deg);
  if (mag <= deadZone) return 0;
  const usable = Math.max(1, range - deadZone);
  return Math.sign(deg) * Math.min(1, (mag - deadZone) / usable);
}
