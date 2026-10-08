import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = (file) =>
  ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const data = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const physicsUrl = data(compile('../lib/orbit-physics.ts'));
const physics = await import(physicsUrl);
const { initialShip, integrate, ORBIT_RADIUS, LIMIT_RADIUS, MU, STEP, gravity, sweptCollision } =
  physics;
const layoutUrl = data(compile('../lib/arena-layout.ts'));
const { arenaLayout, boundaryClearance } = await import(layoutUrl);
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 600],
  [1024, 450],
  [800, 900],
  [390, 844],
  [375, 667],
  [320, 568],
]) {
  const view = arenaLayout(width, height, LIMIT_RADIUS);
  const edgeX = view.halfWidth * view.scale,
    edgeY = view.halfHeight * view.scale;
  assert.ok(
    Math.abs(width / 2 - edgeX - 16) < 1e-6 && Math.abs(width / 2 + edgeX - (width - 16)) < 1e-6,
    'Flight field reaches both side edges',
  );
  assert.ok(
    Math.abs(view.centerY - edgeY - 16) < 1e-6 &&
      Math.abs(view.centerY + edgeY - (height - 16)) < 1e-6,
    'Flight field reclaims the former header and footer',
  );
  assert.ok(
    boundaryClearance({ x: 0, y: (40 - view.centerY) / view.scale }, view) > 0,
    'Former header is playable',
  );
  assert.ok(
    boundaryClearance({ x: 0, y: (height - 40 - view.centerY) / view.scale }, view) > 0,
    'Former footer is playable',
  );
  assert.ok(view.scale > 0, 'Short windows retain a positive game scale');
}
const ship = initialShip();
const energy = (b) => (b.vx ** 2 + b.vy ** 2) / 2 - MU / Math.hypot(b.x, b.y);
const initialEnergy = energy(ship);
for (let i = 0; i < 120 * 600; i++) integrate(ship, STEP);
assert.ok(
  Math.abs(Math.hypot(ship.x, ship.y) - ORBIT_RADIUS) < 0.1,
  '10-minute orbit remains stable',
);
assert.ok(
  Math.abs((energy(ship) - initialEnergy) / initialEnergy) < 1e-5,
  'Orbital energy conserved',
);
assert.ok(gravity(100, 0).x < gravity(200, 0).x, 'Gravity strengthens nearer the planet');
assert.ok(gravity(100, 0).y === 0);
const p = { x: 200, y: 0, vx: 0, vy: 0 },
  q = { ...p };
integrate(p, 0.1);
integrate(q, 0.1, 100, 0);
assert.ok(q.vx > p.vx && q.x > p.x, 'Thrust changes velocity');
assert.ok(
  sweptCollision({ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 5),
  'Fast crossing detected',
);
assert.ok(
  !sweptCollision({ x: -100, y: 20 }, { x: 100, y: 20 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 5),
  'Near miss is not a collision',
);
const listeners = new Map(),
  storage = new Map();
globalThis.window = {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener: (n, f) => listeners.set(n, f),
  removeEventListener: (n) => listeners.delete(n),
};
globalThis.document = {
  hidden: false,
  addEventListener: (n, f) => listeners.set(n, f),
  removeEventListener: (n) => listeners.delete(n),
};
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v),
};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  width = 1254;
  height = 1254;
  set src(value) {
    queueMicrotask(() => this.onload());
  }
};
const ctx = new Proxy(
  {},
  { get: (_, key) => (key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}) },
);
let dimensions = { width: 1440, height: 900 };
const canvas = { getContext: () => ctx, getBoundingClientRect: () => dimensions };
const { OrbitGame } = await import(
  data(
    compile('../lib/orbit-game.ts')
      .replace("'./orbit-physics'", JSON.stringify(physicsUrl))
      .replace("'./arena-layout'", JSON.stringify(layoutUrl)),
  )
);
let latest;
const flightEvents = [];
let simulated = 0;
const game = new OrbitGame(canvas, (s) => (latest = s), {
  onEvent: (e) => flightEvents.push(e),
  onSimulation: (dt) => (simulated += dt),
});
await game.load();
assert.equal(latest.mode, 'ready');
game.start();
assert.equal(latest.mode, 'playing');
game.tick(1000);
game.tick(1100);
assert.ok(game.snapshot().time > 0);
game.input('thrust', true);
game.togglePause();
const pausedTime = game.snapshot().time;
game.tick(1500);
assert.equal(game.snapshot().time, pausedTime, 'Pause freezes physics and time');
assert.equal(game.snapshot().thrust, false);
game.togglePause();
game.tick(1600);
game.tick(1700);
assert.ok(game.snapshot().time > pausedTime);
listeners.get('blur')();
assert.equal(game.snapshot().mode, 'paused', 'Switching apps pauses safely');
game.start();
assert.equal(game.snapshot().time, 0);
assert.equal(game.rocks.length, 0);
assert.equal(game.particles.length, 0);
game.ship.x = 77;
game.ship.y = 0;
game.ship.vx = 0;
game.ship.vy = 0;
game.update(STEP);
assert.equal(game.snapshot().mode, 'over');
assert.match(game.snapshot().reason, /星球/);
game.start();
game.ship.x = 440;
game.ship.y = 0;
game.update(STEP);
assert.equal(
  game.snapshot().mode,
  'playing',
  'Old outer edge now provides usable maneuvering space',
);
game.ship.x = LIMIT_RADIUS + 10;
game.update(STEP);
assert.equal(
  game.snapshot().mode,
  'playing',
  'The old circular limit no longer blocks wide-screen space',
);
game.ship.x = game.view.halfWidth + 10;
game.update(STEP);
assert.equal(game.snapshot().mode, 'over');
assert.match(game.snapshot().reason, /边界/);
game.start();
game.ship.y = game.view.halfHeight + 10;
game.update(STEP);
assert.equal(game.snapshot().mode, 'over', 'Vertical viewport edge remains enforced');
game.start();
game.ship.x = game.view.halfWidth * 0.9;
dimensions = { width: 390, height: 844 };
game.resize();
game.update(STEP);
assert.equal(
  game.snapshot().mode,
  'playing',
  'Rotating or resizing cannot put a live ship beyond the boundary',
);
dimensions = { width: 1440, height: 900 };
game.start();
game.rocks.push({ ...game.ship, radius: 16, angle: 0, spin: 0, trail: [], age: 0 });
game.update(STEP);
assert.equal(game.snapshot().mode, 'over');
assert.match(game.snapshot().reason, /陨石/);
game.start();
game.spawn();
const r0 = Math.hypot(game.rocks[0].x, game.rocks[0].y);
integrate(game.rocks[0], 0.1);
assert.ok(Math.hypot(game.rocks[0].x, game.rocks[0].y) < r0, 'Asteroid falls toward planet');
game.update(STEP);
assert.equal(
  game.rocks.length,
  1,
  'Asteroids entering from new distant screen edges are not culled by the old radius',
);
// Stages are engine events, one per run, even when frames skip a threshold.
game.start();
const stageRun = game.snapshot().runId;
game.state.time = 29.99;
game.rocks = [];
game.update(0.02);
assert.deepEqual(game.snapshot().achieved, [30]);
game.update(0.02);
assert.equal(
  flightEvents.filter((e) => e.type === 'milestone' && e.data.run_id === stageRun).length,
  1,
);
game.togglePause();
const before = simulated;
game.update(5);
assert.equal(simulated, before);
game.togglePause();
document.hidden = true;
game.tick(99999);
assert.equal(game.snapshot().mode, 'paused');
assert.equal(simulated, before);
document.hidden = false;
game.start();
assert.notEqual(game.snapshot().runId, stageRun);
assert.deepEqual(game.snapshot().achieved, []);
assert.ok(flightEvents.some((e) => e.type === 'run_abandon' && e.data.run_id === stageRun));
game.state.time = 119.99;
game.rocks = [];
game.update(0.02);
assert.deepEqual(game.snapshot().achieved, [30, 60, 120]);
game.state.best = 100;
game.end('test', 'planet');
assert.equal(game.snapshot().newRecord, true);
game.start();
game.end('test', 'planet');
assert.equal(game.snapshot().newRecord, false);
game.start();
// Contract checks with a test registry; no supported browser registry is available here.
const registry = new Map();
document.modelContext = { registerTool: (tool) => registry.set(tool.name, tool) };
const { registerGameTools } = await import(data(compile('../lib/game-tools.ts')));
const unregister = registerGameTools(game);
assert.equal(registry.size, 2);
const control = registry.get('control_flight_session');
assert.equal(control.execute({ action: 'pause' }).mode, 'paused');
assert.equal(control.execute({ action: 'resume' }).mode, 'playing');
assert.equal(control.execute({ action: 'restart' }).time, 0);
assert.throws(() => control.execute({ action: 'fly' }));
assert.throws(() => control.execute({ action: 'resume' }));
assert.equal(registry.get('read_flight_state').execute({}).mode, 'playing');
assert.equal(registry.get('read_flight_state').annotations.readOnlyHint, true);
unregister();
game.destroy();
assert.equal(listeners.size, 0);
console.log(
  'PASS: stable 10-minute orbit, energy, gravity, thrust, swept collisions, pause/resume, blur, restart, all loss conditions, asteroid attraction, optional tool contracts.',
);
