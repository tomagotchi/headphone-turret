import type { AimPoint } from '../input/types';
import type { Sfx } from '../sfx';

type TargetKind = 'balloon' | 'drone' | 'asteroid';

interface Target {
  kind: TargetKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  points: number;
  color: string;
  age: number;
  seed: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

const MAG_SIZE = 12;
const AUTO_RELOAD_S = 1.5; // ran dry: slow
const QUICK_RELOAD_S = 0.6; // asked for it: fast
const SHIELD_ACTIVE_S = 3;
const SHIELD_COOLDOWN_S = 15;
const SHOT_SPEED = 1500;
const GROUND = 46;
const BARREL = 46;
const BALLOON_COLORS = ['#ff6b81', '#ffd166', '#7bed9f', '#70a1ff', '#e599f7'];

/**
 * The whole game world. It knows nothing about cameras, microphones or the
 * DOM beyond the canvas it draws on: it is told where to aim (-1..1 on each
 * axis) and when to fire, shield or reload.
 */
export class Game {
  score = 0;
  lives = 3;
  wave = 0;
  over = false;
  ammo = MAG_SIZE;
  reloading = 0;
  shieldActive = 0;
  shieldCooldown = 0;
  onGameOver: () => void = () => {};

  private w = 800;
  private h = 600;
  private aimX = 400;
  private aimY = 250;
  private targets: Target[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private stars: { x: number; y: number; s: number }[] = [];
  private toSpawn = 0;
  private spawnTimer = 0;
  private intermission = 0;
  private banner = '';
  private bannerTime = 0;
  private flash = 0;
  private recoil = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private sfx: Sfx,
  ) {
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 1.5 + 0.3 });
    }
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  reset(): void {
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.over = false;
    this.ammo = MAG_SIZE;
    this.reloading = 0;
    this.shieldActive = 0;
    this.shieldCooldown = 0;
    this.targets = [];
    this.shots = [];
    this.particles = [];
    this.toSpawn = 0;
    this.intermission = 0.8;
  }

  private get turretX(): number {
    return this.w / 2;
  }
  private get turretY(): number {
    return this.h - GROUND - 14;
  }
  private get groundY(): number {
    return this.h - GROUND;
  }

  /** Aim from a normalised point: (0,0) is where the player looked when calibrating. */
  setAim(p: AimPoint): void {
    const margin = 24;
    const cy = this.h * 0.42;
    const up = cy - margin;
    const down = this.turretY - 90 - cy;
    this.aimX = this.w / 2 + p.x * (this.w / 2 - margin);
    this.aimY = cy - p.y * (p.y > 0 ? up : down);
  }

  /** Aim at a screen position (mouse fallback). */
  setAimPixels(x: number, y: number): void {
    this.aimX = Math.min(this.w - 8, Math.max(8, x));
    this.aimY = Math.min(this.turretY - 40, Math.max(8, y));
  }

  private get angle(): number {
    return Math.atan2(this.aimY - this.turretY, this.aimX - this.turretX);
  }

  fire(): void {
    if (this.over) return;
    if (this.reloading > 0 || this.ammo <= 0) {
      this.sfx.empty();
      return;
    }
    const a = this.angle;
    this.shots.push({
      x: this.turretX + Math.cos(a) * BARREL,
      y: this.turretY + Math.sin(a) * BARREL,
      vx: Math.cos(a) * SHOT_SPEED,
      vy: Math.sin(a) * SHOT_SPEED,
    });
    this.recoil = 1;
    this.sfx.pew();
    if (--this.ammo <= 0) this.reloading = AUTO_RELOAD_S;
  }

  reload(): void {
    if (this.over || this.reloading > 0 || this.ammo === MAG_SIZE) return;
    this.ammo = 0;
    this.reloading = QUICK_RELOAD_S;
    this.sfx.reload();
  }

  shield(): void {
    if (this.over || this.shieldActive > 0 || this.shieldCooldown > 0) return;
    this.shieldActive = SHIELD_ACTIVE_S;
    this.sfx.shieldUp();
  }

  update(dt: number): void {
    if (this.over) return;
    this.updateWaves(dt);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = MAG_SIZE;
        this.sfx.reload();
      }
    }
    if (this.shieldActive > 0) {
      this.shieldActive -= dt;
      if (this.shieldActive <= 0) {
        this.shieldActive = 0;
        this.shieldCooldown = SHIELD_COOLDOWN_S;
      }
    } else if (this.shieldCooldown > 0) {
      this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
    }
    this.bannerTime = Math.max(0, this.bannerTime - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.recoil = Math.max(0, this.recoil - dt * 8);

    for (const t of this.targets) {
      t.age += dt;
      t.x += t.vx * dt + (t.kind === 'balloon' ? Math.sin(t.age * 2 + t.seed) * 18 * dt : 0);
      t.y += t.vy * dt;
      // Keep side-drifters on screen once they've arrived.
      if (t.x < t.r && t.vx < 0) t.vx = -t.vx;
      if (t.x > this.w - t.r && t.vx > 0) t.vx = -t.vx;
    }

    for (const s of this.shots) {
      const px = s.x;
      const py = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const t of this.targets) {
        if (t.hp > 0 && segmentHitsCircle(px, py, s.x, s.y, t.x, t.y, t.r + 3)) {
          s.y = -9999; // spend the shot
          if (--t.hp <= 0) {
            this.score += t.points;
            this.burst(t.x, t.y, t.color, 16);
            this.sfx.pop();
          } else {
            this.burst(s.x, py, '#ffffff', 5);
            t.r *= 0.82;
          }
          break;
        }
      }
    }
    this.shots = this.shots.filter(
      (s) => s.y > -50 && s.y < this.h + 50 && s.x > -50 && s.x < this.w + 50,
    );

    for (const t of this.targets) {
      if (t.hp > 0 && t.y + t.r >= this.groundY) {
        t.hp = 0;
        if (this.shieldActive > 0) {
          this.burst(t.x, t.y, '#7fdbff', 14);
          this.sfx.shieldBlock();
        } else {
          this.burst(t.x, t.y, '#ff4757', 22);
          this.flash = 1;
          this.sfx.thud();
          if (--this.lives <= 0) {
            this.over = true;
            this.sfx.gameOver();
            this.onGameOver();
          }
        }
      }
    }
    this.targets = this.targets.filter((t) => t.hp > 0);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateWaves(dt: number): void {
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.wave++;
        this.toSpawn = 5 + this.wave * 2;
        this.spawnTimer = 0.8;
        this.banner = `Wave ${this.wave}`;
        this.bannerTime = 1.8;
        this.sfx.wave();
      }
      return;
    }
    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.toSpawn--;
        // Denser each wave.
        this.spawnTimer = Math.max(0.4, 1.5 - this.wave * 0.09) * (0.7 + Math.random() * 0.6);
      }
    } else if (this.targets.length === 0) {
      this.intermission = 2;
    }
  }

  private spawn(): void {
    // Faster each wave. Speeds scale with screen height so every display plays alike.
    const speed = (this.h / 10) * Math.min(2.5, 1 + (this.wave - 1) * 0.1);
    const roll = Math.random();
    const seed = Math.random() * 10;
    const base = { age: 0, seed, hp: 1 };

    if (this.wave >= 3 && roll < 0.2) {
      const x = 60 + Math.random() * (this.w - 120);
      this.targets.push({
        ...base, kind: 'asteroid', x, y: -30, vx: (Math.random() - 0.5) * 40,
        vy: speed * 1.25, r: 28, hp: 2, points: 25, color: '#b8a48c',
      });
    } else if (this.wave >= 2 && roll < 0.5) {
      // Drones come in from the sides and cut diagonally towards the base.
      const fromLeft = Math.random() < 0.5;
      const y = this.h * (0.05 + Math.random() * 0.3);
      const destX = this.w * (0.2 + Math.random() * 0.6);
      const x = fromLeft ? -24 : this.w + 24;
      const time = (this.groundY - y) / (speed * 0.9);
      this.targets.push({
        ...base, kind: 'drone', x, y, vx: (destX - x) / time, vy: speed * 0.9,
        r: 20, points: 15, color: '#ff9f43',
      });
    } else {
      const x = 50 + Math.random() * (this.w - 100);
      this.targets.push({
        ...base, kind: 'balloon', x, y: -30, vx: 0, vy: speed * 0.8, r: 24, points: 10,
        color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      });
    }
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 260;
      const life = 0.3 + Math.random() * 0.4;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life, max: life, color,
      });
    }
  }

  // ---------------------------------------------------------------- drawing

  render(showCrosshair: boolean): void {
    const c = this.canvas.getContext('2d')!;
    const { w, h } = this;

    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0b1026');
    sky.addColorStop(1, '#1b2a4a');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (const s of this.stars) c.fillRect(s.x * w, s.y * (h - GROUND), s.s, s.s);

    c.fillStyle = '#0f1a30';
    c.fillRect(0, this.groundY, w, GROUND);
    c.fillStyle = '#35507f';
    c.fillRect(0, this.groundY, w, 2);

    if (showCrosshair) {
      c.strokeStyle = 'rgba(127,219,255,0.22)';
      c.lineWidth = 1.5;
      c.setLineDash([6, 8]);
      c.beginPath();
      c.moveTo(this.turretX, this.turretY);
      c.lineTo(this.aimX, this.aimY);
      c.stroke();
      c.setLineDash([]);
    }

    for (const t of this.targets) this.drawTarget(c, t);

    c.strokeStyle = '#fff3b0';
    c.lineWidth = 4;
    c.lineCap = 'round';
    for (const s of this.shots) {
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x - s.vx * 0.014, s.y - s.vy * 0.014);
      c.stroke();
    }

    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    c.globalAlpha = 1;

    this.drawTurret(c);
    if (this.shieldActive > 0) this.drawShield(c);
    if (showCrosshair) this.drawCrosshair(c);
    this.drawHud(c);

    if (this.bannerTime > 0) {
      c.globalAlpha = Math.min(1, this.bannerTime);
      c.fillStyle = '#ffffff';
      c.font = '700 44px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(this.banner, w / 2, h * 0.3);
      c.globalAlpha = 1;
    }
    if (this.flash > 0) {
      c.fillStyle = `rgba(255,71,87,${this.flash * 0.3})`;
      c.fillRect(0, 0, w, h);
    }
  }

  private drawTarget(c: CanvasRenderingContext2D, t: Target): void {
    c.save();
    c.translate(t.x, t.y);
    c.fillStyle = t.color;
    if (t.kind === 'balloon') {
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, t.r);
      c.quadraticCurveTo(6, t.r + 12, 0, t.r + 24);
      c.stroke();
      c.beginPath();
      c.ellipse(0, 0, t.r * 0.86, t.r, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.ellipse(-t.r * 0.3, -t.r * 0.35, t.r * 0.18, t.r * 0.28, -0.4, 0, Math.PI * 2);
      c.fill();
    } else if (t.kind === 'drone') {
      c.strokeStyle = '#dfe6f1';
      c.lineWidth = 3;
      const spin = Math.sin(t.age * 40) * t.r * 0.5;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.moveTo(side * t.r * 0.5, -2);
        c.lineTo(side * t.r, -t.r * 0.6);
        c.moveTo(side * t.r - spin, -t.r * 0.6);
        c.lineTo(side * t.r + spin, -t.r * 0.6);
        c.stroke();
      }
      c.beginPath();
      c.roundRect(-t.r * 0.7, -t.r * 0.4, t.r * 1.4, t.r * 0.9, 6);
      c.fill();
      c.fillStyle = '#ff4757';
      c.beginPath();
      c.arc(0, 2, 4, 0, Math.PI * 2);
      c.fill();
    } else {
      c.rotate(t.age * 0.8 + t.seed);
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = t.r * (0.78 + 0.22 * Math.sin(t.seed * 7 + i * 2.3));
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.2)';
      c.beginPath();
      c.arc(t.r * 0.25, -t.r * 0.15, t.r * 0.22, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawTurret(c: CanvasRenderingContext2D): void {
    c.save();
    c.translate(this.turretX, this.turretY);
    c.save();
    c.rotate(this.angle);
    c.fillStyle = '#9fb3d1';
    c.fillRect(-this.recoil * 6, -6, BARREL, 12);
    c.fillStyle = '#7fdbff';
    c.fillRect(BARREL - 8 - this.recoil * 6, -7, 8, 14);
    c.restore();
    c.fillStyle = '#5b7db1';
    c.beginPath();
    c.arc(0, 0, 22, Math.PI, 0);
    c.fill();
    c.fillRect(-34, 0, 68, 14);
    c.restore();
  }

  private drawShield(c: CanvasRenderingContext2D): void {
    const fading = this.shieldActive < 0.6 ? this.shieldActive / 0.6 : 1;
    c.save();
    c.globalAlpha = fading;
    c.fillStyle = 'rgba(127,219,255,0.14)';
    c.fillRect(0, this.groundY - 18, this.w, 18);
    c.strokeStyle = '#7fdbff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, this.groundY - 18);
    c.lineTo(this.w, this.groundY - 18);
    c.stroke();
    c.restore();
  }

  private drawCrosshair(c: CanvasRenderingContext2D): void {
    const { aimX: x, aimY: y } = this;
    c.strokeStyle = '#7fdbff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 14, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      c.moveTo(x + dx * 8, y + dy * 8);
      c.lineTo(x + dx * 22, y + dy * 22);
    }
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(x - 1.5, y - 1.5, 3, 3);
  }

  private drawHud(c: CanvasRenderingContext2D): void {
    if (this.wave === 0 && this.score === 0 && this.intermission <= 0) return; // backdrop only
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff';
    c.font = '700 26px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(String(this.score), 20, 38);
    c.font = '500 13px system-ui, sans-serif';
    c.fillStyle = '#9fb3d1';
    c.fillText(`WAVE ${Math.max(1, this.wave)}`, 20, 58);

    c.textAlign = 'right';
    c.font = '24px system-ui, sans-serif';
    c.fillStyle = '#ff6b81';
    c.fillText('♥'.repeat(Math.max(0, this.lives)), this.w - 20, 38);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillText('♥'.repeat(3), this.w - 20, 38);

    // Ammo and shield sit either side of the turret, on the ground strip.
    const y = this.groundY + 28;
    c.font = '600 13px system-ui, sans-serif';
    c.textAlign = 'right';
    if (this.reloading > 0) {
      c.fillStyle = '#ffd166';
      c.fillText('RELOADING…', this.turretX - 50, y);
    } else {
      for (let i = 0; i < MAG_SIZE; i++) {
        c.fillStyle = i < this.ammo ? '#fff3b0' : 'rgba(255,255,255,0.15)';
        c.fillRect(this.turretX - 56 - i * 8, y - 12, 5, 14);
      }
    }
    c.textAlign = 'left';
    if (this.shieldActive > 0) {
      c.fillStyle = '#7fdbff';
      c.fillText(`SHIELD ${this.shieldActive.toFixed(1)}s`, this.turretX + 50, y);
    } else if (this.shieldCooldown > 0) {
      c.fillStyle = '#6b7f9e';
      c.fillText(`SHIELD in ${Math.ceil(this.shieldCooldown)}s`, this.turretX + 50, y);
    } else {
      c.fillStyle = '#7bed9f';
      c.fillText('SHIELD READY', this.turretX + 50, y);
    }
  }
}

function segmentHitsCircle(
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  return px * px + py * py <= r * r;
}
