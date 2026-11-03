export interface OriginalLevel {
  $map: number[][];
  $playerX: number;
  $playerY: number;
  $skinBg: number;
  $skinTiles: number;
  $badList: { $x: number; $y: number; $id: number }[];
  $scoreSlots: { $x: number; $y: number }[];
  $specialSlots: { $x: number; $y: number }[];
  $script: string;
}
export interface Body {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; grounded: boolean;
}
export interface Player extends Body {
  dir: number; invincible: number; dead: number; action: number;
}
export interface Enemy extends Body {
  id: number; kind: 'cherry' | 'orange' | 'apple'; dir: number;
  frozen: number; dead: boolean; age: number; cooldown: number;
}
export interface Bomb extends Body { id: number; fuse: number; age: number }
export interface Collectible { x: number; y: number; item: number; points: number; age: number }
export interface Effect { x: number; y: number; age: number; type: 'ice' | 'score' | 'burst'; text?: string }
export interface Shot { x: number; y: number; vx: number; age: number }
export interface Input { left: boolean; right: boolean; jump: boolean; down: boolean; bomb: boolean }
export type Phase = 'ready' | 'playing' | 'paused' | 'gameover' | 'complete';
export const NO_INPUT: Input = { left: false, right: false, jump: false, down: false, bomb: false };
