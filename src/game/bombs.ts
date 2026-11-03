import { body, moveBody, PHYSICS } from './physics.ts';
import type { Bomb } from './types.ts';

// Data.mt, Player.kickBomb/upKickBomb, PlayerBomb.onKick and Mover.onHitGround.
export const BOMB_RULES = Object.freeze({
  kickX: 3.5, kickY: 7.4, upKick: 18, airJump: 7,
  groundReach: 20, airReach: 30, kickCooldown: 2,
  bounceFactor: 0.5, minBounce: 2,
});

export function createBomb(x: number, y: number, id: number): Bomb {
  return { ...body(x,y), id, fuse: PHYSICS.bombFuse, age: 0,
    airKick: true, bounces: false, lastKickTick: -3, nextBounce: null };
}

export function kickBomb(b: Bomb, direction: number, tick: number, upward = false): boolean {
  if (tick-b.lastKickTick <= BOMB_RULES.kickCooldown || (!b.airKick && !b.grounded)) return false;
  // A bomb can be kicked in the air once; grounded kicks remain available.
  if (!b.grounded) b.airKick = false;
  if (upward) {
    b.vx *= 2;
    if (Math.abs(b.vx) <= 1.5) b.vx = 0.5 * direction;
    b.vy = -BOMB_RULES.upKick;
  } else {
    b.vx = direction * BOMB_RULES.kickX;
    b.vy = -BOMB_RULES.kickY;
  }
  b.grounded = false; b.bounces = true; b.nextBounce = null; b.lastKickTick = tick;
  return true;
}

export function moveBomb(b: Bomb, map: number[][]) {
  // Physics skips gravity on creation and on the queued tick after a rebound.
  const skipGravity = b.age === 0 || b.nextBounce !== null;
  if (b.nextBounce) {
    b.vx = b.nextBounce.vx; b.vy = b.nextBounce.vy;
    b.grounded = false; b.nextBounce = null;
  }
  b.age++;
  const wasGrounded = b.grounded;
  const impactX = b.vx;
  const impactSpeed = b.vy + (!wasGrounded && !skipGravity ? (b.vy < 0 ? PHYSICS.gravity : PHYSICS.fall) : 0);
  // Ordinary bombs stop against walls; ground contact uses the normal X friction.
  const hitWall = moveBody(b,map,{ slide: PHYSICS.airX, skipGravity });
  if (!wasGrounded && b.grounded && b.bounces) {
    const rebound = Math.abs(impactSpeed) * BOMB_RULES.bounceFactor;
    // Mover captures both velocities before the landing tick's friction.
    if (rebound >= BOMB_RULES.minBounce) b.nextBounce = { vx: hitWall ? 0 : impactX, vy: -rebound };
  }
}

/** GameMode.getClose includes the radius edge and limits a grounded blast below it. */
export function withinBlast(b: Bomb, x: number, y: number): boolean {
  return Math.hypot(x-b.x,y-b.y) <= PHYSICS.bombRadius && (!b.grounded || y <= b.y+PHYSICS.tile);
}
