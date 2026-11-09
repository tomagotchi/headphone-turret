// Copies MediaPipe's WebAssembly runtime out of node_modules into public/,
// so the game serves it itself instead of loading it from a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const to = resolve(root, 'public/mediapipe/wasm');

if (!existsSync(from)) {
  console.error('MediaPipe is not installed yet. Run "npm install" first.');
  process.exit(1);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
