export const MU = 4_800_000;
export const PLANET_RADIUS = 76;
export const ORBIT_RADIUS = 226;
export const LIMIT_RADIUS = 520;
export const SHIP_RADIUS = 9;
export const STEP = 1 / 120;
export type Body = { x: number; y: number; vx: number; vy: number };
export function gravity(x: number, y: number) {
  const r2 = Math.max(40 * 40, x * x + y * y);
  const factor = -MU / (r2 * Math.sqrt(r2));
  return { x: x * factor, y: y * factor };
}
// Velocity Verlet preserves an unpowered orbit without artificial drag.
export function integrate(body: Body, dt: number, ax = 0, ay = 0) {
  const a = gravity(body.x, body.y);
  body.x += body.vx * dt + ((a.x + ax) * dt * dt) / 2;
  body.y += body.vy * dt + ((a.y + ay) * dt * dt) / 2;
  const b = gravity(body.x, body.y);
  body.vx += ((a.x + b.x + 2 * ax) * dt) / 2;
  body.vy += ((a.y + b.y + 2 * ay) * dt) / 2;
}
export function initialShip(): Body & { angle: number } {
  const t = -0.9,
    v = Math.sqrt(MU / ORBIT_RADIUS);
  return {
    x: Math.cos(t) * ORBIT_RADIUS,
    y: Math.sin(t) * ORBIT_RADIUS,
    vx: -Math.sin(t) * v,
    vy: Math.cos(t) * v,
    angle: t + Math.PI,
  };
}
export function sweptCollision(a0: Body, a1: Body, b0: Body, b1: Body, radius: number) {
  const x = a0.x - b0.x,
    y = a0.y - b0.y;
  const dx = a1.x - b1.x - x,
    dy = a1.y - b1.y - y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, -(x * dx + y * dy) / length)) : 0;
  return Math.hypot(x + dx * t, y + dy * t) < radius;
}
