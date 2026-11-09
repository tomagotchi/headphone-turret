import { Game } from './game/game';
import { HeadAim } from './input/headAim';
import { MicTrigger } from './input/micTrigger';
import { VoiceCommands } from './input/voice';
import type { VoiceCommand } from './input/voice';
import { FACE_OVAL, WebcamHead } from './input/webcamHead';
import { DEFAULTS, loadSettings, saveSettings } from './settings';
import type { Settings } from './settings';
import { Sfx } from './sfx';

type State = 'start' | 'calibrate' | 'playing' | 'paused' | 'over';
type CameraState = 'off' | 'loading' | 'on' | 'failed';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const settings: Settings = loadSettings();
const sfx = new Sfx();
const game = new Game($<HTMLCanvasElement>('game'), sfx);
const head = new WebcamHead();
const aim = new HeadAim();
const mic = new MicTrigger();
const voice = new VoiceCommands();

let state: State = 'start';
let settingsOpen = false;
let camera: CameraState = 'off';
/** After calibrating: start a fresh game, or carry on with the paused one? */
let freshGameAfterCalibrate = true;
const mouse = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };

// ------------------------------------------------------------------ screens

const screens: Record<State, HTMLElement | null> = {
  start: $('screen-start'),
  calibrate: $('screen-calibrate'),
  playing: null,
  paused: $('screen-pause'),
  over: $('screen-over'),
};

function setState(next: State): void {
  state = next;
  for (const [name, el] of Object.entries(screens)) if (el) el.hidden = name !== next;
  $('hud').hidden = next === 'start';
  (document.activeElement as HTMLElement | null)?.blur();
}

function toast(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => (el.hidden = true), 1600);
}
toast.timer = 0;

// ------------------------------------------------------------------- set-up

async function enableCameraAndMic(): Promise<void> {
  const btn = $<HTMLButtonElement>('btn-enable');
  const status = $('start-status');
  btn.disabled = true;
  status.textContent = 'Your browser will ask for permission — choose “Allow”.';
  const ctx = sfx.unlock();
  const problems: string[] = [];

  try {
    await head.openCamera();
    camera = 'loading';
    head
      .loadModel()
      .then(() => (camera = 'on'))
      .catch((err) => {
        console.error(err);
        camera = 'failed';
      });
  } catch {
    camera = 'failed';
    problems.push('No camera — the mouse will aim instead.');
  }

  try {
    await mic.start(ctx);
  } catch {
    problems.push('No microphone — Space or a click will fire instead.');
  }

  btn.disabled = false;
  status.textContent = '';
  if (problems.length) toast(problems.join(' '));
  syncVoice();
  freshGameAfterCalibrate = true;
  setState('calibrate');
}

function playWithMouse(): void {
  sfx.unlock();
  syncVoice();
  startGame(true);
}

function startGame(fresh: boolean): void {
  if (fresh) game.reset();
  setState('playing');
}

function calibrateNow(): boolean {
  const pose = head.pose;
  if (!pose) return false;
  aim.calibrate(pose);
  return true;
}

function togglePause(): void {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') setState('playing');
}

game.onGameOver = () => {
  const best = Math.max(game.score, Number(localStorage.getItem('voice-turret-best') ?? 0));
  try {
    localStorage.setItem('voice-turret-best', String(best));
  } catch {
    /* ignore */
  }
  $('final-score').textContent = String(game.score);
  $('final-detail').textContent = `Reached wave ${game.wave} · Best ${best}`;
  setState('over');
};

// -------------------------------------------------------------------- input

type FireSource = 'mic' | 'space' | 'click';

function onFire(source: FireSource): void {
  if (settingsOpen) return;
  if (state === 'calibrate') {
    // A stray noise shouldn't skip calibration while the tracker is still
    // looking for a face; Space always lets the player through.
    const waitingForFace = camera === 'loading' || (camera === 'on' && !head.pose);
    if (source === 'mic' && waitingForFace) return;
    calibrateNow();
    startGame(freshGameAfterCalibrate);
  } else if (state === 'playing') {
    game.fire();
  }
}

mic.onFire = () => onFire('mic');
sfx.onPlay = (ms) => {
  if (settings.speakerGuard) mic.muteFor(ms + 60);
};

function onVoice(cmd: VoiceCommand): void {
  if (settingsOpen) return;
  if (cmd === 'pause') togglePause();
  else if (state !== 'playing') return;
  else if (cmd === 'shield') game.shield();
  else game.reload();
}
voice.onCommand = onVoice;

function syncVoice(): void {
  if (settings.voiceEnabled && VoiceCommands.supported) void voice.start();
  else voice.stop();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'escape' && settingsOpen) return closeSettings();
  if (settingsOpen) return;

  if (key === ' ' && (state === 'calibrate' || state === 'playing')) {
    e.preventDefault();
    onFire('space');
  } else if (key === 'p' || key === 'escape') {
    togglePause();
  } else if (key === 'v') {
    settings.showPreview = !settings.showPreview;
    saveSettings(settings);
    fillSettingsForm();
  } else if (state === 'playing') {
    if (key === 'r') toast(calibrateNow() ? 'Recentred' : 'No face to recentre on');
    else if (key === 's') onVoice('shield');
    else if (key === 'q') onVoice('reload');
  }
});

const canvas = $('game');
window.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener('pointerdown', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  if (state === 'playing') onFire('click');
});
window.addEventListener('resize', () => game.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') setState('paused');
});

$('btn-enable').onclick = () => void enableCameraAndMic();
$('btn-mouse').onclick = playWithMouse;
$('btn-resume').onclick = () => setState('playing');
$('btn-recal').onclick = () => {
  freshGameAfterCalibrate = false;
  setState('calibrate');
};
$('btn-quit').onclick = () => setState('start');
$('btn-again').onclick = () => startGame(true);

// ----------------------------------------------------------------- settings

const RANGES = ['sensitivity', 'smoothing', 'deadZone', 'micThreshold', 'volume'] as const;
const CHECKS = ['invertPitch', 'invertYaw', 'showPreview', 'speakerGuard', 'voiceEnabled'] as const;

const FORMAT: Record<(typeof RANGES)[number], (v: number) => string> = {
  sensitivity: (v) => `${v.toFixed(2)}×`,
  smoothing: (v) => `${Math.round(v * 100)}%`,
  deadZone: (v) => `${v.toFixed(2)}°`,
  micThreshold: (v) => `${Math.round(v * 60)} dB`,
  volume: (v) => `${Math.round(v * 100)}%`,
};

function fillSettingsForm(): void {
  for (const k of RANGES) {
    $<HTMLInputElement>(`s-${k}`).value = String(settings[k]);
    $(`o-${k}`).textContent = FORMAT[k](settings[k]);
  }
  for (const k of CHECKS) $<HTMLInputElement>(`s-${k}`).checked = settings[k];
  applySettings();
}

function applySettings(): void {
  mic.threshold = settings.micThreshold;
  sfx.volume = settings.volume;
}

for (const k of RANGES) {
  $<HTMLInputElement>(`s-${k}`).oninput = (e) => {
    settings[k] = Number((e.target as HTMLInputElement).value);
    $(`o-${k}`).textContent = FORMAT[k](settings[k]);
    applySettings();
    saveSettings(settings);
  };
}
for (const k of CHECKS) {
  $<HTMLInputElement>(`s-${k}`).onchange = (e) => {
    settings[k] = (e.target as HTMLInputElement).checked;
    saveSettings(settings);
    if (k === 'voiceEnabled') syncVoice();
  };
}

function openSettings(): void {
  settingsOpen = true;
  $('screen-settings').hidden = false;
}
function closeSettings(): void {
  settingsOpen = false;
  $('screen-settings').hidden = true;
}
document.querySelectorAll('[data-open-settings]').forEach((b) => b.addEventListener('click', openSettings));
$('btn-settings-done').onclick = closeSettings;
$('btn-settings-reset').onclick = () => {
  Object.assign(settings, DEFAULTS);
  saveSettings(settings);
  fillSettingsForm();
  syncVoice();
};

function describeVoice(): void {
  const note = $('voice-note');
  if (!VoiceCommands.supported) {
    $<HTMLInputElement>('s-voiceEnabled').disabled = true;
    note.textContent = 'Not available in this browser. The S, Q and P keys do the same things.';
  } else if (voice.status === 'listening' && voice.onDevice) {
    note.textContent = 'On, and running on this device. The S, Q and P keys do the same things.';
  } else {
    note.textContent =
      'Off by default: this uses your browser’s built-in speech service, and in Chrome ' +
      'that usually sends microphone audio to Google while it is switched on. ' +
      'The S, Q and P keys do the same things without it.';
  }
}
voice.onStatus = () => {
  describeVoice();
  if (voice.status === 'blocked') toast('Voice commands were blocked by the browser');
};

// --------------------------------------------------------------- per frame

function updateMeter(el: HTMLElement): void {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fill = el.querySelector<HTMLElement>('.fill')!;
  fill.style.width = pct(mic.level);
  fill.classList.toggle('hot', mic.level >= mic.triggerLevel);
  el.querySelector<HTMLElement>('.floor')!.style.left = pct(mic.floor);
  el.querySelector<HTMLElement>('.trig')!.style.left = pct(mic.triggerLevel);
}

const previewCanvas = $<HTMLCanvasElement>('preview-canvas');
const pctx = previewCanvas.getContext('2d')!;

function drawPreview(): void {
  const { width: w, height: h } = previewCanvas;
  // Mirrored, like a mirror: turn left and the picture turns left.
  pctx.save();
  pctx.translate(w, 0);
  pctx.scale(-1, 1);
  pctx.drawImage(head.video, 0, 0, w, h);
  const lm = head.landmarks;
  if (lm) {
    pctx.strokeStyle = '#7fdbff';
    pctx.lineWidth = 2;
    pctx.beginPath();
    for (const { start, end } of FACE_OVAL) {
      pctx.moveTo(lm[start].x * w, lm[start].y * h);
      pctx.lineTo(lm[end].x * w, lm[end].y * h);
    }
    pctx.stroke();
  }
  pctx.restore();
  const pose = head.pose;
  $('preview-label').textContent = pose
    ? `turn ${pose.yaw.toFixed(0)}°  nod ${pose.pitch.toFixed(0)}°`
    : camera === 'loading'
      ? 'loading head tracking…'
      : 'face not found';
}

function updateCalibrateText(): void {
  const say = mic.active ? 'say “pew!” or press Space' : 'press Space';
  let title = `Look at the dot and ${mic.active ? 'say “pew!”' : 'press Space'}`;
  let text = `Sit comfortably, face the middle of the screen, then ${say}.`;
  if (camera === 'failed' || camera === 'off') {
    title = 'Mouse aiming';
    text = `No camera available, so the mouse aims and a click fires. To begin, ${say}.`;
  } else if (camera === 'loading') {
    title = 'Loading head tracking…';
    text = 'This takes a few seconds the first time.';
  } else if (!head.pose) {
    title = 'Face not found';
    text = 'Check your face is well lit and in view of the webcam. Or press Space to play with the mouse.';
  }
  $('cal-title').textContent = title;
  $('cal-text').textContent = text;
}

function updateOverlays(headAiming: boolean): void {
  const cameraWanted = camera === 'on' || camera === 'loading';
  const inGame = state === 'playing' || state === 'calibrate';

  const banner = $('banner');
  let message = '';
  if (camera === 'on' && inGame && !head.pose) {
    message = 'Face not found — the mouse aims and a click fires until you’re back in view';
  } else if (camera === 'on' && state === 'playing' && !aim.calibrated) {
    message = 'Face found — look at the centre of the screen and press R to aim with your head';
  }
  banner.textContent = message;
  banner.hidden = !message;

  const fire = mic.active ? 'Mic + Space' : 'Space + Click';
  const speech =
    voice.status === 'listening' ? ` · Voice: <b>${voice.onDevice ? 'on (on-device)' : 'on'}</b>` : '';
  $('source').innerHTML =
    `Aim: <b>${headAiming ? 'Head (webcam)' : 'Mouse'}</b> · Fire: <b>${fire}</b>${speech}`;

  $('hud-meter-row').hidden = !mic.active;
  if (mic.active) {
    updateMeter($('hud-meter'));
    if (settingsOpen) updateMeter($('set-meter'));
  }
  $('mic-hint').hidden = !mic.active;
  $('set-meter').hidden = !mic.active;

  const showPreview = cameraWanted && settings.showPreview && state !== 'start';
  $('preview').hidden = !showPreview;
  if (showPreview) drawPreview();
  if (state === 'calibrate') updateCalibrateText();
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  head.tick(now);
  mic.poll(now);

  const pose = head.pose;
  const headAiming = pose !== null && aim.calibrated;
  if (headAiming) game.setAim(aim.update(pose, dt, settings));
  else game.setAimPixels(mouse.x, mouse.y);

  if (state === 'playing' && !settingsOpen) game.update(dt);
  game.render(state === 'playing' || state === 'paused');
  updateOverlays(headAiming);

  requestAnimationFrame(frame);
}

fillSettingsForm();
describeVoice();
setState('start');
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  // Handy in the browser console while tuning.
  Object.assign(window, { vt: { game, head, aim, mic, voice, settings, state: () => state } });
}
