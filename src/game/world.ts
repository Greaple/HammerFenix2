import { body, moveBody, PHYSICS, solid } from './physics.ts';
import type { Bomb, Collectible, Effect, Enemy, Input, OriginalLevel, Phase, Player, Shot } from './types.ts';

export const ROOM_NAMES = ['First footsteps', 'Down the rabbit hole', 'A bitter encounter', 'Orange you glad?', 'Cold company', 'An apple a day', 'Mind the gap', 'The orchard below', 'Four is a crowd', 'One more descent'];

export class World {
  levels: OriginalLevel[];
  phase: Phase = 'ready';
  player: Player;
  enemies: Enemy[] = [];
  bombs: Bomb[] = [];
  items: Collectible[] = [];
  effects: Effect[] = [];
  shots: Shot[] = [];
  events: string[] = [];
  room = 0;
  score = 0;
  lives = 3;
  tick = 0;
  roomTicks = 0;
  clearTicks = 0;
  cleared = false;
  kills = 0;
  bestCombo = 0;
  practice = false;
  private nextId = 0;
  private randomState = 0x48464e58;
  constructor(levels: OriginalLevel[]) {
    this.levels = levels;
    this.player = { ...body(150, 160), dir: 1, invincible: 0, dead: 0, action: 0 };
    this.loadRoom(0);
  }
  get level() { return this.levels[this.room]; }
  get remaining() { return this.enemies.filter(e => !e.dead).length; }
  random() {
    let x = this.randomState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 4294967296;
  }
  start(room = 0, practice = false) {
    if (!Number.isInteger(room) || room < 0 || room >= this.levels.length) return;
    this.randomState = 0x48464e58;
    this.nextId = 0; this.score = 0; this.lives = 3; this.tick = 0;
    this.kills = 0; this.bestCombo = 0; this.practice = practice || room !== 0;
    this.loadRoom(room); this.phase = 'playing';
    this.events.push('start');
  }
  loadRoom(index: number) {
    this.room = index;
    const l = this.level;
    this.player = { ...body(l.$playerX * 20 + 10, l.$playerY * 20), dir: 1, invincible: 64, dead: 0, action: 0 };
    this.enemies = l.$badList.map(e => {
      if (![0,1,9].includes(e.$id)) throw new Error(`Unsupported enemy ${e.$id} in room ${index}`);
      return { ...body(e.$x * 20 + 10, (e.$y + 1) * 20), id: this.nextId++, kind: e.$id === 1 ? 'cherry' : e.$id === 9 ? 'orange' : 'apple', dir: this.random() < 0.5 ? -1 : 1, frozen: 0, dead: false, age: 0, cooldown: 64 + Math.floor(this.random() * 64) };
    });
    this.items = l.$scoreSlots.map((s,i) => ({ ...body(s.$x * 20 + 10, (s.$y + 1) * 20), item: 1 + (index + i) % 10, points: 500, age: 0 }));
    this.bombs = []; this.effects = []; this.shots = []; this.events = [];
    this.roomTicks = 0; this.clearTicks = 0; this.cleared = false;
  }
  pause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }
  private emit(type: Effect['type'], x: number, y: number, text?: string) {
    this.effects.push({ type, x, y, age: 0, text });
    if (this.effects.length > 64) this.effects.shift();
  }
  private addScore(points: number, x: number, y: number) {
    this.score += points; this.emit('score', x, y, points.toLocaleString('en-US'));
  }
  private kill(enemy: Enemy, combo = 1) {
    if (enemy.dead) return;
    enemy.dead = true; this.kills++;
    this.bestCombo = Math.max(this.bestCombo, combo);
    this.addScore(1000 * combo, enemy.x, Math.min(460, enemy.y - 15));
    this.emit('ice', enemy.x, Math.min(490, enemy.y - 10));
    this.events.push('bad_death');
  }
  private attack(input: Input) {
    const p = this.player;
    const near = this.bombs.find(b => Math.hypot(p.x - b.x, p.y - b.y) < (p.grounded ? 20 : 30));
    if (near) {
      near.vx = input.down ? 0 : p.dir * (PHYSICS.speed + 3.5);
      near.vy = input.down ? -18 : -7.4;
      near.grounded = false;
      p.action = 10; this.events.push('kick');
    } else if (this.bombs.length < 1) {
      const b: Bomb = { ...body(p.x, p.y), id: this.nextId++, fuse: PHYSICS.bombFuse, age: 0 };
      b.grounded = p.grounded;
      if (!p.grounded) { p.vy = Math.min(p.vy, -7); b.vx = p.dir * 7.8; b.vy = -7.4; }
      this.bombs.push(b); p.action = 10; this.events.push('bomb_drop');
    }
  }
  explode(bomb: Bomb) {
    this.events.push('bomb'); this.emit('burst', bomb.x, bomb.y - 10);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const distance = Math.hypot(e.x - bomb.x, e.y - bomb.y);
      if (distance >= PHYSICS.bombRadius) continue;
      const power = (1 - distance / PHYSICS.bombRadius) * PHYSICS.bombPower;
      const angle = Math.atan2(e.y - bomb.y, e.x - bomb.x);
      e.vx = Math.cos(angle) * power;
      e.vy = e.grounded ? -5 : Math.max(-10, e.vy + Math.sin(angle) * power);
      e.frozen = PHYSICS.freeze; e.grounded = false;
      this.emit('ice', e.x, e.y - 10); this.events.push('freeze');
    }
  }
  private hurt() {
    const p = this.player;
    if (p.invincible > 0 || p.dead > 0) return;
    this.lives--; p.dead = 40; p.vy = -12; p.vx = -p.dir * 3;
    this.events.push('player_death');
  }
  step(input: Input) {
    if (this.phase !== 'playing') return;
    this.tick++; this.roomTicks++;
    this.effects.forEach(e => e.age++);
    this.effects = this.effects.filter(e => e.age < (e.type === 'score' ? 40 : 22));
    const p = this.player;
    if (p.dead > 0) {
      p.px = p.x; p.py = p.y; p.x += p.vx; p.y += p.vy; p.vy += 0.7;
      if (--p.dead === 0) {
        if (this.lives <= 0) { this.phase = 'gameover'; this.events.push('end'); return; }
        Object.assign(p, body(this.level.$playerX * 20 + 10, this.level.$playerY * 20), { invincible: 160 });
      }
    } else {
      if (p.invincible > 0) p.invincible--;
      if (p.action > 0) p.action--;
      if (input.left !== input.right) { p.dir = input.left ? -1 : 1; p.vx = p.dir * PHYSICS.speed; }
      else p.vx *= 0.7 * 0.8;
      if (input.jump && p.grounded) { p.vy = -PHYSICS.jump; this.events.push('jump'); }
      if (input.bomb) this.attack(input);
      const grounded = p.grounded;
      moveBody(p, this.level.$map, { fall: 1.1 });
      if (!grounded && p.grounded) this.events.push('land');
      if (p.y > PHYSICS.height + 25) {
        if (this.cleared) {
          if (this.room + 1 === this.levels.length) { this.phase = 'complete'; this.events.push('end'); return; }
          this.loadRoom(this.room + 1); this.events.push('next'); return;
        }
        p.y = -20; p.py = p.y; p.vy = 0;
      }
    }
    for (const b of this.bombs) {
      b.age++; moveBody(b, this.level.$map, { slide: 0.7, bounce: true });
      b.fuse--;
      if (b.fuse === 0) this.explode(b);
    }
    this.bombs = this.bombs.filter(b => b.fuse > 0 && b.y < 560);
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.age++;
      if (e.frozen > 0) {
        e.frozen--;
        moveBody(e, this.level.$map, { fall: 2.3, bounce: true });
        if (e.frozen === 0) { e.dir = e.x < p.x ? 1 : -1; e.vx = 0; }
      } else {
        e.cooldown--;
        const angry = this.roomTicks > 35 * 32;
        e.vx = e.dir * (angry ? 3 : 2);
        if (e.grounded) {
          const ahead = Math.floor((e.x + e.dir * 16) / 20);
          const floorRow = Math.floor((e.y + 1) / 20);
          if (!solid(this.level.$map, ahead, floorRow)) {
            if (e.kind === 'orange' || e.kind === 'apple') {
              const landing = ahead + e.dir * 2;
              if (solid(this.level.$map, landing, floorRow)) { e.vx = e.dir * 5.5; e.vy = -8.5; }
              else e.dir *= -1;
            } else e.dir *= -1;
          }
          if (e.kind === 'apple' && e.cooldown <= 0) {
            e.dir = p.x < e.x ? -1 : 1;
            if (this.shots.length < 24) this.shots.push({ x: e.x, y: e.y - 12, vx: e.dir * 5, age: 0 });
            e.cooldown = 85 + Math.floor(this.random() * 64);
          }
        }
        if (moveBody(e, this.level.$map, { friction: false })) e.dir *= -1;
      }
      if (e.y > 525) { if (e.frozen > 0) this.kill(e); else { e.y = -20; e.py = -20; e.vy = 0; } }
      if (!p.dead && !e.dead && Math.abs(e.x - p.x) < 17 && Math.abs(e.y - p.y) < 23) {
        if (e.frozen > 0) {
          e.vx = p.dir * 10; e.vy = -3; e.grounded = false;
          if (this.tick % 8 === 0) this.events.push('kick');
        } else this.hurt();
      }
    }
    for (const ice of this.enemies) {
      if (ice.dead || ice.frozen === 0 || Math.abs(ice.vx) + Math.abs(ice.vy) < 4) continue;
      let combo = 1;
      for (const target of this.enemies) {
        if (target.id !== ice.id && !target.dead && Math.hypot(ice.x - target.x, ice.y - target.y) < 22) {
          this.kill(target, ++combo);
        }
      }
      if (combo > 1) this.kill(ice, combo);
    }
    for (const s of this.shots) {
      s.x += s.vx; s.age++;
      if (!p.dead && Math.hypot(s.x - p.x, s.y - (p.y - 12)) < 13) { this.hurt(); s.age = 1000; }
    }
    this.shots = this.shots.filter(s => s.age < 120 && s.x > 0 && s.x < 400 && !solid(this.level.$map, Math.floor(s.x / 20), Math.floor(s.y / 20)));
    for (const item of this.items) {
      item.age++;
      moveBody(item, this.level.$map);
      if (item.y > PHYSICS.height + 25) { item.y = -30; item.py = item.y; item.vy = 0; }
      if (!p.dead && Math.hypot(item.x - p.x, item.y - p.y) < 22) {
        this.addScore(item.points, item.x, item.y - 12); item.age = -1; this.events.push('item_score');
      }
    }
    this.items = this.items.filter(i => i.age >= 0);
    if (!this.cleared && this.remaining === 0) {
      this.cleared = true; this.addScore(2000, 200, 105); this.events.push('level_clear');
    }
    if (this.cleared) this.clearTicks++;
    if (this.roomTicks === 35 * 32 && !this.cleared) this.events.push('hurry');
  }
}
