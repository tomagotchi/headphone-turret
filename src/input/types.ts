/**
 * The seam between "where is the player's head" and the rest of the game.
 *
 * Today the only implementation is the webcam (MediaPipe). The native Mac port
 * replaces it with AirPods head tracking (CMHeadphoneMotionManager), which
 * reports the same two angles. Nothing outside src/input/webcamHead.ts knows
 * a camera exists.
 */
export interface HeadPose {
  /** Degrees. Positive = player turned to their right. */
  yaw: number;
  /** Degrees. Positive = player looking up. */
  pitch: number;
}

export interface HeadPoseSource {
  /** Latest pose, or null while the head isn't being tracked. */
  readonly pose: HeadPose | null;
}

/** Where the turret should aim, each axis -1..1 (x: left→right, y: down→up). */
export interface AimPoint {
  x: number;
  y: number;
}
