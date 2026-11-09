import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HeadPose, HeadPoseSource } from './types';

const RAD = 180 / Math.PI;
/** If no face has been seen for this long, tracking counts as lost. */
const LOST_AFTER_MS = 400;

/**
 * Webcam head tracking with MediaPipe Face Landmarker. Runs entirely in the
 * browser: frames go from the <video> element into WebAssembly and nowhere else.
 */
export class WebcamHead implements HeadPoseSource {
  readonly video = document.createElement('video');
  /** Face outline points for the preview, in 0..1 image coordinates. */
  landmarks: NormalizedLandmark[] | null = null;
  ready = false;

  private landmarker: FaceLandmarker | null = null;
  private latest: HeadPose | null = null;
  private lastSeen = -Infinity;
  private lastVideoTime = -1;

  get pose(): HeadPose | null {
    return performance.now() - this.lastSeen < LOST_AFTER_MS ? this.latest : null;
  }

  /** Asks for the camera. Throws if the player says no or there isn't one. */
  async openCamera(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  /** Downloads the tracking model from this site's own files (a few MB). */
  async loadModel(): Promise<void> {
    const base = import.meta.env.BASE_URL;
    const files = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${base}models/face_landmarker.task`, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    try {
      this.landmarker = await create('GPU');
    } catch {
      this.landmarker = await create('CPU');
    }
    this.ready = true;
  }

  /** Call once per animation frame. Only does work when the camera has a new frame. */
  tick(now: number): void {
    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, now);
    const matrix = result.facialTransformationMatrixes?.[0]?.data;
    if (!matrix || !result.faceLandmarks?.[0]) {
      this.landmarks = null;
      return;
    }
    this.landmarks = result.faceLandmarks[0];
    this.latest = poseFromMatrix(matrix);
    this.lastSeen = now;
  }
}

/**
 * The matrix is 4x4, column-major. Its third column is the direction the nose
 * points in camera space (x = image right, y = up, z = towards the camera).
 * The camera sees the player unmirrored, so image-right is the player's left:
 * yaw is negated to make "player turns right" positive.
 */
export function poseFromMatrix(m: ArrayLike<number>): HeadPose {
  const fx = m[8];
  const fy = m[9];
  const fz = m[10];
  return {
    yaw: -Math.atan2(fx, fz) * RAD,
    pitch: Math.atan2(fy, Math.hypot(fx, fz)) * RAD,
  };
}

export const FACE_OVAL = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
