# Voice Turret

A browser game: aim a turret by turning your head (tracked by your webcam) and fire by saying "pew!".

## Run it on your computer

You need [Node.js](https://nodejs.org) (the "LTS" download). Then, in a terminal opened in this folder:

```bash
npm install
```

```bash
npm run dev
```

Open the address it prints (normally http://localhost:5173) in Chrome. Click **Turn on camera & microphone** and choose **Allow** when Chrome asks. `npm install` is only needed the first time.

## Controls

| Do this | To |
| --- | --- |
| Turn / nod your head | Aim |
| Say "pew!", clap, click your tongue | Fire |
| Space, or a mouse click | Fire (always works) |
| R | Recentre: makes where you're looking now the middle |
| S, or say "shield" | Shield: blocks hits for 3 s, then 15 s to recharge |
| Q, or say "reload" | Quick reload (running dry reloads by itself, but slower) |
| P or Esc, or say "pause" | Pause / resume |
| V | Show or hide the webcam preview |

If the camera can't see your face, the mouse takes over aiming until it can. The pill at the bottom left always shows what is aiming and what is firing.

**Tuning.** Open Settings (start screen or pause menu). If the turret fires by itself, raise *Trigger threshold*; if "pew" doesn't register, lower it. The meter shows your mic level against the line it has to cross. Headphones give the cleanest result, because the game's own sounds can't reach the mic.

**Voice commands** are off by default. They use the browser's built-in speech recognition, which in Chrome usually sends audio to Google. Everything else (camera and mic level) is processed inside the tab and never leaves it.

## Put it online

```bash
npm run build
```

This creates a `dist` folder. Upload that folder to any static host (Netlify, Vercel, GitHub Pages, S3). The site must be served over **https**, or browsers refuse camera and mic access.

## How the code is laid out (and the Mac port)

```
src/
  main.ts              screens, keyboard/mouse, the per-frame loop
  settings.ts          settings, saved in the browser
  sfx.ts               placeholder sounds, synthesised
  game/game.ts         the whole game: targets, shots, waves, drawing
  input/types.ts       HeadPose = { yaw, pitch } — the contract for head tracking
  input/webcamHead.ts  webcam + MediaPipe → HeadPose   (the only camera code)
  input/headAim.ts     HeadPose → aim point: calibration, dead zone, smoothing
  input/micTrigger.ts  mic loudness → "fire"
  input/voice.ts       speech → shield / reload / pause
```

The game is only ever told "aim here, between -1 and 1" and "fire". For the native Mac app, `webcamHead.ts` is the one file to replace: AirPods head tracking reports the same yaw and pitch angles, and `headAim.ts` and `game.ts` are plain maths that translate directly.

The head-tracking model (`public/models/face_landmarker.task`) and MediaPipe's runtime are served by the game itself, so it works without any third-party server.
