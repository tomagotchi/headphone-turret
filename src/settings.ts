export interface Settings {
  /** 1 = a ±20° head turn sweeps the whole screen. Higher = less head movement needed. */
  sensitivity: number;
  /** 0 = raw, 0.9 = very smooth (and laggier). */
  smoothing: number;
  /** Degrees around the centre pose that are ignored. */
  deadZone: number;
  invertPitch: boolean;
  invertYaw: boolean;
  /** How far above the background noise a sound must jump to fire (0..1 of the meter). */
  micThreshold: number;
  /** Ignore the mic while the game's own sound effects are playing. */
  speakerGuard: boolean;
  showPreview: boolean;
  voiceEnabled: boolean;
  volume: number;
}

export const DEFAULTS: Settings = {
  sensitivity: 1,
  smoothing: 0.5,
  deadZone: 1,
  invertPitch: false,
  invertYaw: false,
  micThreshold: 0.25,
  speakerGuard: true,
  showPreview: true,
  voiceEnabled: false,
  volume: 0.6,
};

const KEY = 'voice-turret-settings-v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable: fall through to defaults */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
