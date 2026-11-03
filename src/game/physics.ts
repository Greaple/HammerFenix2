import type { Body } from './types.ts';

// Values are in original 32 Hz game cycles, from Motion Twin's Data.mt.
export const PHYSICS = Object.freeze({
  hz: 32, width: 400, height: 500, tile: 20,
  speed: 4.3, jump: 18.7, gravity: 1, fall: 0.9,
  airX: 0.93, airY: 0.86, slide: 0.97,
  bombFuse: 45, bombRadius: 60, bombPower: 30, freeze: 160,
});

export function body(x: number, y: number): Body {
  return { x, y, px: x, py: y, vx: 0, vy: 0, grounded: false };
}
export function solid(map: number[][], col: number, row: number): boolean {
  return col >= 0 && col < 20 && row >= 0 && row < 25 && (map[col]?.[row] ?? 0) > 0;
}

/** One-way platform tops, solid sides, no ceiling collision, swept in <=4 px steps. */
export function moveBody(b: Body, map: number[][], options: { fall?: number; friction?: boolean; slide?: number; bounce?: boolean; skipGravity?: boolean } = {}): boolean {
  b.px = b.x; b.py = b.y;
  if (b.grounded && (b.vy !== 0 || !solid(map, Math.floor(b.x / 20), Math.floor((b.y + 0.1) / 20)))) b.grounded = false;
  if (!b.grounded && !options.skipGravity) b.vy += b.vy < 0 ? PHYSICS.gravity : PHYSICS.fall * (options.fall ?? 1);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / 4));
  let sx = b.vx / steps, sy = b.vy / steps;
  let wall = false;
  for (let n = 0; n < steps; n++) {
    const nx = b.x + sx;
    if (nx < 10 || nx > 390 || (sx !== 0 && solid(map, Math.floor((nx + Math.sign(sx) * 7) / 20), Math.floor((b.y - 10) / 20)))) {
      wall = true; sx = 0;
      b.vx = options.bounce ? -b.vx * 0.75 : 0;
    } else b.x = nx;
    const ny = b.y + sy;
    if (sy >= 0) {
      const row = Math.floor((ny + 0.01) / 20);
      const top = row * 20;
      if (b.y <= top + 0.01 && ny >= top && solid(map, Math.floor(b.x / 20), row)) {
        b.y = top; b.vy = 0; sy = 0; b.grounded = true;
      } else { b.y = ny; if (sy > 0) b.grounded = false; }
    } else { b.y = ny; b.grounded = false; }
  }
  if (options.friction !== false) {
    if (b.grounded) b.vx *= options.slide ?? PHYSICS.slide;
    else { b.vx *= PHYSICS.airX; b.vy *= PHYSICS.airY; }
    if (Math.abs(b.vx) <= 0.2) b.vx = 0;
    if (Math.abs(b.vy) <= 0.2) b.vy = 0;
  }
  return wall;
}

/** Bounded accumulator: a suspended browser never replays minutes of game time. */
export class FixedClock {
  accumulator = 0;
  reset() { this.accumulator = 0; }
  advance(seconds: number, tick: () => void): number {
    this.accumulator += Math.min(0.25, Math.max(0, seconds));
    const step = 1 / PHYSICS.hz;
    while (this.accumulator + 1e-10 >= step) { tick(); this.accumulator -= step; }
    return Math.max(0, this.accumulator / step);
  }
}
