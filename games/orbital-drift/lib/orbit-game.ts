import {
  integrate,
  initialShip,
  sweptCollision,
  PLANET_RADIUS,
  LIMIT_RADIUS,
  SHIP_RADIUS,
  ORBIT_RADIUS,
  STEP,
  type Body,
} from './orbit-physics';
import { arenaLayout, boundaryClearance } from './arena-layout';
import type { FlightAudio } from './flight-audio';
export type GameSnapshot = {
  mode: 'ready' | 'playing' | 'paused' | 'over';
  time: number;
  best: number;
  speed: number;
  altitude: number;
  danger: string;
  thrust: boolean;
  reason: string;
  cause: '' | 'planet' | 'boundary' | 'asteroid';
  warning: '' | 'planet' | 'boundary';
  runId: string;
  achieved: number[];
  newRecord: boolean;
};
type Rock = Body & {
  radius: number;
  angle: number;
  spin: number;
  trail: { x: number; y: number }[];
  age: number;
};
type Particle = Body & { life: number; max: number; radius: number; color: string };
export const MILESTONES = [30, 60, 120] as const;
export type FlightEvent = {
  type: 'run_start' | 'run_abandon' | 'pause' | 'resume' | 'milestone' | 'death';
  data: {
    run_id: string;
    score_ms: number;
    index?: number;
    milestone?: number;
    cause?: string;
    new_record?: boolean;
    reason?: string;
  };
};
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class OrbitGame {
  showGuide = true;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private notify: (state: GameSnapshot) => void;
  private state: GameSnapshot = {
    mode: 'ready',
    time: 0,
    best: 0,
    speed: 0,
    altitude: 150,
    danger: '',
    thrust: false,
    reason: '',
    cause: '',
    warning: '',
    runId: '',
    achieved: [],
    newRecord: false,
  };
  private ship = initialShip();
  private rocks: Rock[] = [];
  private particles: Particle[] = [];
  private trail: { x: number; y: number }[] = [];
  private keys = { left: false, right: false, thrust: false };
  private images: Record<string, HTMLImageElement> = {};
  private ready = false;
  private disposed = false;
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private hudTimer = 0;
  private spawnTimer = 3.5;
  private trailTimer = 0;
  private demoTime = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private centerX = 0;
  private centerY = 0;
  private scale = 1;
  private view = arenaLayout(1440, 900, LIMIT_RADIUS);
  private shake = 0;
  private reduced = false;
  private observer: ResizeObserver;
  language: 'en' | 'zh' = 'zh';
  controlsBlocked = false;
  private audio?: FlightAudio;
  private assetBase: string;
  private runIndex = 0;
  private onEvent?: (event: FlightEvent) => void;
  private onSimulation?: (seconds: number) => void;
  private report(type: FlightEvent['type'], extra: Partial<FlightEvent['data']> = {}) {
    try {
      this.onEvent?.({
        type,
        data: { run_id: this.state.runId, score_ms: Math.round(this.state.time * 1000), ...extra },
      });
    } catch {}
  }

  constructor(
    canvas: HTMLCanvasElement,
    notify: (state: GameSnapshot) => void,
    options: {
      audio?: FlightAudio;
      assetBase?: string;
      onEvent?: (event: FlightEvent) => void;
      onSimulation?: (seconds: number) => void;
    } = {},
  ) {
    this.onEvent = options.onEvent;
    this.onSimulation = options.onSimulation;
    this.audio = options.audio;
    this.assetBase = options.assetBase ?? './assets/';
    this.canvas = canvas;
    this.notify = notify;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    this.ctx = ctx;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      const saved = Number(localStorage.getItem('orbital-drift-best'));
      this.state.best = Number.isFinite(saved) ? Math.max(0, saved) : 0;
    } catch {
      /* Storage can be disabled. */
    }
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.resize();
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.autoPause);
    document.addEventListener('visibilitychange', this.visibility);
    this.emit();
    this.frame = requestAnimationFrame(this.tick);
  }
  async load() {
    const names = {
      background: 'space-background.jpg',
      planet: 'planet.png',
      ship: 'ship.png',
      asteroid: 'asteroid.png',
    };
    await Promise.all(
      Object.entries(names).map(
        ([key, file]) =>
          new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              this.images[key] = image;
              resolve();
            };
            image.onerror = () => reject(new Error(`Asset failed: ${file}`));
            const embedded = (window as unknown as { __ORBITAL_ASSETS__?: Record<string, string> })
              .__ORBITAL_ASSETS__;
            image.src = embedded?.[this.assetBase + file] ?? this.assetBase + file;
          }),
      ),
    );
    if (this.disposed) return;
    this.ready = true;
    this.emit();
  }
  start() {
    if (!this.ready) return;
    if (this.state.mode === 'playing' || this.state.mode === 'paused')
      this.report('run_abandon', { reason: 'restart' });
    this.runIndex++;
    this.ship = initialShip();
    this.rocks = [];
    this.particles = [];
    this.trail = [];
    this.resize();
    this.state = {
      ...this.state,
      mode: 'playing',
      time: 0,
      danger: '',
      reason: '',
      cause: '',
      warning: '',
      thrust: false,
      runId: crypto.randomUUID(),
      achieved: [],
      newRecord: false,
    };
    this.spawnTimer = 2.8;
    this.accumulator = 0;
    this.trailTimer = 0;
    this.shake = 0;
    this.last = 0;
    this.clearKeys();
    this.audio?.start();
    this.report('run_start', { index: this.runIndex });
    this.emit();
  }
  togglePause(reason = 'manual') {
    if (this.state.mode === 'playing') {
      this.state.mode = 'paused';
      this.audio?.pause();
      this.report('pause', { reason });
    } else if (this.state.mode === 'paused') {
      this.state.mode = 'playing';
      this.audio?.start(false);
      this.last = 0;
      this.report('resume');
    } else return;
    this.clearKeys();
    this.accumulator = 0;
    this.emit();
  }
  input(key: 'left' | 'right' | 'thrust', value: boolean) {
    this.keys[key] = value && this.state.mode === 'playing';
  }
  snapshot() {
    return { ...this.state, achieved: [...this.state.achieved] };
  }
  setSound(enabled: boolean) {
    this.audio?.setMuted(!enabled);
  }
  private clearKeys() {
    this.keys = { left: false, right: false, thrust: false };
    this.state.thrust = false;
  }
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.view = arenaLayout(rect.width, rect.height, LIMIT_RADIUS, this.ship);
    this.scale = this.view.scale;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (this.controlsBlocked || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.matches('input,textarea,select,[contenteditable=true]')) return;
    const mapping: Record<string, 'left' | 'right' | 'thrust'> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'thrust',
      KeyW: 'thrust',
    };
    if (mapping[event.code]) {
      event.preventDefault();
      this.input(mapping[event.code], true);
    }
    if (event.repeat) return;
    if ((event.code === 'Space' || event.code === 'Enter') && target.closest('button,a')) return;
    if (event.code === 'KeyP' || event.code === 'Space') {
      event.preventDefault();
      if (this.state.mode === 'ready') this.start();
      else this.togglePause();
    }
    if (event.code === 'Enter' && (this.state.mode === 'ready' || this.state.mode === 'over')) {
      event.preventDefault();
      this.start();
    }
    if (event.code === 'KeyR') {
      event.preventDefault();
      this.start();
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') this.keys.right = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this.keys.thrust = false;
  };
  private autoPause = () => {
    this.audio?.pause();
    this.clearKeys();
    if (this.state.mode === 'playing') this.togglePause('background');
  };
  private visibility = () => {
    if (document.hidden) this.autoPause();
  };
  private emit() {
    const r = Math.hypot(this.ship.x, this.ship.y);
    this.state.speed = Math.hypot(this.ship.vx, this.ship.vy);
    this.state.altitude = Math.max(0, r - PLANET_RADIUS);
    this.state.thrust = this.state.mode === 'playing' && this.keys.thrust;
    this.notify({ ...this.state });
  }
  private end(reason: string, cause: GameSnapshot['cause']) {
    if (this.state.mode !== 'playing') return;
    this.state.mode = 'over';
    this.state.reason = reason;
    this.state.cause = cause;
    this.state.danger = '';
    this.state.warning = '';
    this.clearKeys();
    this.state.newRecord = this.state.time > this.state.best;
    this.state.best = Math.max(this.state.best, this.state.time);
    this.report('death', { cause, new_record: this.state.newRecord });
    try {
      localStorage.setItem('orbital-drift-best', String(this.state.best));
    } catch {
      /* Optional device record. */
    }
    this.burst(this.ship.x, this.ship.y, 70, '#ffc194');
    this.shake = this.reduced ? 0 : 8;
    this.audio?.end();
    this.emit();
  }
  private burst(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU),
        speed = rand(15, 110),
        life = rand(0.25, 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life,
        max: life,
        radius: rand(0.8, 2.4),
        color,
      });
    }
  }
  private spawn() {
    const a = rand(0, TAU);
    const r =
      Math.min(
        this.view.halfWidth / Math.max(0.00001, Math.abs(Math.cos(a))),
        this.view.halfHeight / Math.max(0.00001, Math.abs(Math.sin(a))),
      ) + 35;
    const inward = rand(30, 75) * Math.max(1, r / (LIMIT_RADIUS + 35)),
      tangent = rand(-72, 72);
    this.rocks.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      vx: -Math.cos(a) * inward - Math.sin(a) * tangent,
      vy: -Math.sin(a) * inward + Math.cos(a) * tangent,
      radius: rand(9, 19),
      angle: rand(0, TAU),
      spin: rand(-1, 1),
      trail: [],
      age: 0,
    });
  }
  private update(dt: number) {
    if (this.state.mode !== 'playing' || document.hidden) return;
    this.state.time += dt;
    try {
      this.onSimulation?.(dt);
    } catch {}
    for (const milestone of MILESTONES) {
      if (this.state.time + 1e-8 >= milestone && !this.state.achieved.includes(milestone)) {
        this.state.achieved.push(milestone);
        this.report('milestone', { milestone });
        this.emit();
      }
    }
    this.ship.angle += ((this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)) * 3 * dt;
    const oldShip = { ...this.ship },
      thrust = this.keys.thrust ? 130 : 0;
    integrate(
      this.ship,
      dt,
      Math.sin(this.ship.angle) * thrust,
      -Math.cos(this.ship.angle) * thrust,
    );
    if (thrust && Math.random() < 0.65) {
      const a = this.ship.angle,
        life = rand(0.15, 0.38),
        back = rand(35, 85);
      const halfSize = Math.max(22, 13 / this.scale),
        nozzle = halfSize * 0.8,
        side = halfSize * 0.24 * (Math.random() < 0.5 ? -1 : 1);
      this.particles.push({
        x: this.ship.x - Math.sin(a) * nozzle + Math.cos(a) * side,
        y: this.ship.y + Math.cos(a) * nozzle + Math.sin(a) * side,
        vx: this.ship.vx - Math.sin(a) * back + rand(-12, 12),
        vy: this.ship.vy + Math.cos(a) * back + rand(-12, 12),
        life,
        max: life,
        radius: rand(1, 3),
        color: '#ffc58a',
      });
    }
    const radius = Math.hypot(this.ship.x, this.ship.y);
    if (radius < PLANET_RADIUS + SHIP_RADIUS) {
      this.end('飞船撞上了星球。提前转向，朝远离地表的方向轻点推进。', 'planet');
      return;
    }
    const edgeDistance = boundaryClearance(this.ship, this.view);
    if (edgeDistance < 0) {
      this.end('飞船飞出了画面边界。试着把船头转向星球，轻点推进。', 'boundary');
      return;
    }
    this.state.warning = radius < 126 ? 'planet' : edgeDistance < 75 ? 'boundary' : '';
    this.state.danger =
      radius < 126 ? '正在接近地表 · 向外推进' : edgeDistance < 75 ? '正在接近边界 · 调整航向' : '';
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = Math.max(0.43, 1.85 - this.state.time * 0.009);
    }
    this.trailTimer += dt;
    const addTrail = this.trailTimer > 0.06;
    if (addTrail) {
      this.trailTimer = 0;
      this.trail.push({ x: this.ship.x, y: this.ship.y });
      if (this.trail.length > 65) this.trail.shift();
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i],
        old = { ...rock };
      integrate(rock, dt);
      rock.angle += rock.spin * dt;
      rock.age += dt;
      if (addTrail) {
        rock.trail.push({ x: rock.x, y: rock.y });
        if (rock.trail.length > 12) rock.trail.shift();
      }
      if (sweptCollision(oldShip, this.ship, old, rock, SHIP_RADIUS + rock.radius * 0.83)) {
        this.end('飞船被陨石击中了。留意陨石的尾迹，用短促推进改变航线。', 'asteroid');
        return;
      }
      if (Math.hypot(rock.x, rock.y) < PLANET_RADIUS + rock.radius * 0.7) {
        this.burst(rock.x, rock.y, 18, '#e8b98a');
        this.rocks.splice(i, 1);
      } else if (rock.age > 40 || boundaryClearance(rock, this.view) < -200)
        this.rocks.splice(i, 1);
    }
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    if (document.hidden && this.state.mode === 'playing') this.autoPause();
    const delta = this.last ? Math.min((now - this.last) / 1000, 0.08) : 0;
    this.last = now;
    if (this.state.mode === 'playing') {
      this.accumulator += delta;
      while (this.accumulator >= STEP && this.state.mode === 'playing') {
        this.update(STEP);
        this.accumulator -= STEP;
      }
    }
    if (this.state.mode === 'ready' && !this.reduced) this.demoTime += delta;
    if (this.state.mode !== 'paused') {
      for (const p of this.particles) {
        p.x += p.vx * delta;
        p.y += p.vy * delta;
        p.life -= delta;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      this.shake *= Math.exp(-delta * 6);
    }
    this.audio?.setThrust(this.state.mode === 'playing' && this.keys.thrust);
    this.hudTimer += delta;
    if (this.hudTimer > 0.1) {
      this.emit();
      this.hudTimer = 0;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };
  private draw() {
    const c = this.ctx,
      w = this.width,
      h = this.height;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#060e14';
    c.fillRect(0, 0, w, h);
    const bg = this.images.background;
    if (bg) {
      const cover = Math.max(w / bg.width, h / bg.height);
      c.globalAlpha = 0.7;
      c.drawImage(
        bg,
        (w - bg.width * cover) / 2,
        (h - bg.height * cover) / 2,
        bg.width * cover,
        bg.height * cover,
      );
      c.globalAlpha = 1;
    }
    const layout = this.view;
    this.centerX = w / 2;
    this.centerY = layout.centerY;
    this.scale = layout.scale;
    c.save();
    c.translate(
      this.centerX + (Math.random() - 0.5) * this.shake,
      this.centerY + (Math.random() - 0.5) * this.shake,
    );
    c.scale(this.scale, this.scale);
    // Navigation rings and course markings are functional geometry.
    c.lineWidth = 0.8 / this.scale;
    for (const r of [140, ORBIT_RADIUS, 305]) {
      c.beginPath();
      c.arc(0, 0, r, 0, TAU);
      c.strokeStyle = '#8caeac1c';
      c.stroke();
    }
    c.strokeStyle = '#bbc9bf30';
    c.setLineDash([3 / this.scale, 7 / this.scale]);
    c.strokeRect(
      -layout.halfWidth,
      -layout.halfHeight,
      layout.halfWidth * 2,
      layout.halfHeight * 2,
    );
    c.setLineDash([]);
    if (this.ready) {
      const halo = c.createRadialGradient(0, 0, 60, 0, 0, 125);
      halo.addColorStop(0, '#5ebfc528');
      halo.addColorStop(1, '#5ebfc500');
      c.fillStyle = halo;
      c.beginPath();
      c.arc(0, 0, 125, 0, TAU);
      c.fill();
      c.drawImage(this.images.planet, -85, -85, 170, 170);
      c.textAlign = 'center';
      c.fillStyle = '#a8c3bb';
      c.font = '12px monospace';
      c.fillText('K E P L E R  –  0 1', 0, 112);
      const demo = this.state.mode === 'ready';
      const ship = demo
        ? {
            x: Math.cos(-0.9 + this.demoTime * 0.1) * ORBIT_RADIUS,
            y: Math.sin(-0.9 + this.demoTime * 0.1) * ORBIT_RADIUS,
            angle: -0.9 + this.demoTime * 0.1 + Math.PI,
            vx: this.ship.vx,
            vy: this.ship.vy,
          }
        : this.ship;
      if (this.showGuide && this.state.mode !== 'over') {
        if (!demo) {
          c.beginPath();
          this.trail.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
          c.strokeStyle = '#c7ed9045';
          c.lineWidth = 1.2;
          c.stroke();
          const predicted = { ...this.ship };
          c.beginPath();
          c.moveTo(predicted.x, predicted.y);
          for (let i = 0; i < 150; i++) {
            integrate(predicted, 0.024);
            if (
              Math.hypot(predicted.x, predicted.y) < PLANET_RADIUS ||
              boundaryClearance(predicted, layout) < 0
            )
              break;
            c.lineTo(predicted.x, predicted.y);
          }
          c.strokeStyle = '#d1ef9575';
          c.lineWidth = 1;
          c.setLineDash([3, 7]);
          c.stroke();
          c.setLineDash([]);
        } else {
          c.beginPath();
          c.arc(0, 0, ORBIT_RADIUS, -0.9 + this.demoTime * 0.1, 2 + this.demoTime * 0.1);
          c.strokeStyle = '#d1ef9566';
          c.setLineDash([3, 7]);
          c.stroke();
          c.setLineDash([]);
        }
      }
      if (demo) {
        for (let i = 0; i < 4; i++) {
          const a = i * 1.6 + 0.4 + this.demoTime * 0.012,
            r = 290 + i * 21;
          c.save();
          c.translate(Math.cos(a) * r, Math.sin(a) * r);
          c.rotate(i * 2 + this.demoTime * 0.1);
          c.globalAlpha = 0.7;
          c.drawImage(this.images.asteroid, -14 - i * 2, -14 - i * 2, 28 + i * 4, 28 + i * 4);
          c.restore();
        }
      }
      for (const rock of this.rocks) {
        c.beginPath();
        rock.trail.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.strokeStyle = '#f1b98a30';
        c.lineWidth = Math.max(1, rock.radius * 0.15);
        c.stroke();
        c.save();
        c.translate(rock.x, rock.y);
        c.rotate(rock.angle);
        const size = Math.max(rock.radius * 2.25, 12 / this.scale);
        c.drawImage(this.images.asteroid, -size / 2, -size / 2, size, size);
        c.restore();
      }
      for (const p of this.particles) {
        c.globalAlpha = Math.max(0, p.life / p.max);
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.radius * Math.max(0.15, p.life / p.max), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
      if (this.state.mode !== 'over') {
        const shipSize = Math.max(44, 26 / this.scale);
        c.save();
        c.translate(ship.x, ship.y);
        c.rotate(ship.angle);
        c.shadowColor = '#a1e3dc';
        c.shadowBlur = 6;
        c.drawImage(this.images.ship, -shipSize / 2, -shipSize / 2, shipSize, shipSize);
        c.restore();
        if (demo) {
          c.fillStyle = '#bbd695';
          c.textAlign = 'left';
          c.font = '12px monospace';
          c.fillText(this.language === 'zh' ? '你的飞船' : 'YOUR SHIP', ship.x + 29, ship.y - 12);
          c.strokeStyle = '#c9e8a540';
          c.beginPath();
          c.moveTo(ship.x + 18, ship.y - 4);
          c.lineTo(ship.x + 25, ship.y - 12);
          c.stroke();
        }
      }
    }
    c.restore();
  }
  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.autoPause);
    document.removeEventListener('visibilitychange', this.visibility);
    this.audio?.destroy();
  }
}
