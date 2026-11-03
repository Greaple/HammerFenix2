import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { body, moveBody, FixedClock, PHYSICS } from '../src/game/physics.ts';
import { World } from '../src/game/world.ts';
import { NO_INPUT } from '../src/game/types.ts';
import { readSave } from '../src/game/storage.ts';
import { decodePersist } from '../scripts/persist-codec.mjs';

const archive = JSON.parse(readFileSync(new URL('../public/assets/data/adventure.json', import.meta.url)));
function level() {
  const map=Array.from({length:20},()=>Array(25).fill(0));
  for(let x=2;x<18;x++)map[x][15]=1;
  return {$map:map,$playerX:5,$playerY:15,$skinBg:1,$skinTiles:1,$badList:[{$x:15,$y:14,$id:1}],$scoreSlots:[],$specialSlots:[],$script:''};
}
function game(count=2) {const world=new World(Array.from({length:count},level));world.start();return world;}

test('legacy decoder recovers every shipped adventure record exactly',()=>{
  const encoded=readFileSync(new URL('../vendor/hammerfest/xml/levels/adventure.xml',import.meta.url),'utf8');
  const decoded=encoded.trim().split(':').filter(Boolean).map(decodePersist);
  assert.equal(decoded.length,107);
  assert.equal(JSON.stringify(decoded),JSON.stringify(archive));
  assert.equal(decoded[2].$map[3][9],1);
  assert.deepEqual({...decoded[2].$badList[0]},{$y:14,$x:11,$id:1});
});
test('decoder rejects corrupted input instead of hanging',()=>{
  assert.throws(()=>decodePersist('!'),/Invalid/);
  assert.throws(()=>decodePersist('S3jo'),/truncated/);
});
test('every preview room fits the playfield and uses implemented enemy types',()=>{
  for(const l of archive.slice(2,12)) {
    assert.equal(l.$map.length,20);
    for(const column of l.$map)assert.equal(column.length,25);
    for(const enemy of l.$badList)assert.ok([0,1,9].includes(enemy.$id));
    assert.ok(l.$playerX>=0&&l.$playerX<20);
  }
});
test('the tutorial archive is decoded without losing records',()=>{
  const original=readFileSync(new URL('../vendor/hammerfest/xml/levels/tutorial.xml',import.meta.url),'utf8');
  const decoded=original.trim().split(':').filter(Boolean).map(decodePersist);
  assert.equal(decoded.length,24);
  assert.equal(JSON.stringify(decoded),readFileSync(new URL('../public/assets/data/tutorial.json',import.meta.url),'utf8'));
});
test('packed animation frames stay within the texture and required sounds exist',()=>{
  const atlas=JSON.parse(readFileSync(new URL('../public/assets/atlas.json',import.meta.url)));
  const png=readFileSync(new URL('../public/assets/atlas.png',import.meta.url));
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  for(const f of atlas.frames){assert.ok(f.x>=0&&f.y>=0&&f.x+f.w<=width&&f.y+f.h<=height);}
  for(const name of ['igor-idle','igor-walk','igor-up','igor-down','igor-die','igor-kick','bomb-drop','bomb-idle','bomb-explode','apple-walk','cherry-walk','orange-walk'])assert.ok(atlas.animations[name].length>0,name);
  for(const name of ['jump','land','bomb_drop','bomb','freeze','kick','bad_death','player_death','level_clear','item_score','hurry'])assert.ok(existsSync(new URL(`../public/assets/audio/sound_${name}.mp3`,import.meta.url)),name);
});
test('fixed clock executes exactly 32 game ticks per second at 60, 120, and 144 Hz',()=>{
  for(const hz of [60,120,144]) {
    const clock=new FixedClock();let ticks=0;
    for(let frame=0;frame<hz*10;frame++)clock.advance(1/hz,()=>ticks++);
    assert.equal(ticks,320,`display ${hz} Hz`);
  }
});
test('suspended tabs have bounded catch-up work',()=>{
  const clock=new FixedClock();let ticks=0;
  clock.advance(120,()=>ticks++);assert.equal(ticks,8);
  clock.reset();assert.equal(clock.accumulator,0);
});
test('fast falling bodies cannot tunnel through a platform',()=>{
  const b=body(100,200);b.vy=150;
  moveBody(b,level().$map);
  assert.equal(b.y,300);assert.equal(b.vy,0);assert.equal(b.grounded,true);
});
test('platforms allow jumping through from below',()=>{
  const b=body(100,320);b.vy=-30;
  moveBody(b,level().$map);
  assert.ok(b.y<300);assert.ok(b.vy<0);assert.equal(b.grounded,false);
});
test('jump follows the original damped trajectory and returns to the floor',()=>{
  const b=body(100,300);b.grounded=true;b.vy=-PHYSICS.jump;
  let top=300;
  for(let i=0;i<100;i++){moveBody(b,level().$map,{fall:1.1});top=Math.min(top,b.y);}
  // The damped jump clears a 60 px ledge, but not an 80 px ledge.
  assert.ok(top>220&&top<240,`apex was ${top}`);
  assert.equal(b.y,300);assert.equal(b.grounded,true);
});
test('walls stop a fast body without leaving the playfield',()=>{
  const b=body(380,100);b.vx=80;
  assert.equal(moveBody(b,level().$map),true);assert.ok(b.x<=390);assert.equal(b.vx,0);
});
test('bomb detonates after 45 original game ticks and enforces one active bomb',()=>{
  const w=game();
  w.step({...NO_INPUT,bomb:true});assert.equal(w.bombs.length,1);
  w.player.x=50;
  w.step({...NO_INPUT,bomb:true});assert.equal(w.bombs.length,1);
  for(let i=2;i<44;i++)w.step(NO_INPUT);
  assert.equal(w.bombs.length,1);
  w.step(NO_INPUT);assert.equal(w.bombs.length,0);assert.ok(w.events.includes('bomb'));
});
test('ice blast freezes nearby fruit and applies outward momentum',()=>{
  const w=game();const e=w.enemies[0];e.x=150;e.y=300;e.grounded=true;
  w.explode({...body(120,300),id:123,fuse:0,age:45});
  assert.equal(e.frozen,160);assert.equal(e.vx,15);assert.equal(e.vy,-5);
});
test('ice blast does not hit fruit beyond its radius',()=>{
  const w=game();w.enemies[0].x=181;
  w.explode({...body(120,300),id:123,fuse:0,age:45});
  assert.equal(w.enemies[0].frozen,0);
});
test('sliding frozen fruit triggers a scored chain collision',()=>{
  const w=game();const a=w.enemies[0];
  Object.assign(a,{x:120,y:300,vx:8,vy:0,grounded:true,frozen:100});
  w.enemies.push({...a,id:2,x:140,px:140,frozen:0,dir:-1});
  w.player.x=50;w.step(NO_INPUT);
  assert.equal(w.remaining,0);assert.equal(w.kills,2);assert.equal(w.bestCombo,2);assert.ok(w.score>=4000);
});
test('pause preserves all simulation state and consumes no game time',()=>{
  const w=game();w.step(NO_INPUT);w.pause();
  const before=JSON.stringify(w);
  for(let i=0;i<100;i++)w.step({...NO_INPUT,right:true,bomb:true});
  assert.equal(JSON.stringify(w),before);
  w.pause();w.step(NO_INPUT);assert.equal(w.tick,2);
});
test('falling out of an uncleared room wraps to the top without losing a life',()=>{
  const w=game();w.player.y=540;w.player.py=540;w.step(NO_INPUT);
  assert.equal(w.room,0);assert.equal(w.lives,3);assert.equal(w.player.y,-20);
});
test('clearing then descending advances the room and preserves the score',()=>{
  const w=game();w.enemies=[];w.step(NO_INPUT);assert.equal(w.cleared,true);
  const score=w.score;w.player.y=540;w.player.py=540;w.step(NO_INPUT);
  assert.equal(w.room,1);assert.equal(w.score,score);assert.equal(w.cleared,false);assert.equal(w.bombs.length,0);
});
test('the final exit completes the preview',()=>{
  const w=game(1);w.enemies=[];w.step(NO_INPUT);w.player.y=540;w.step(NO_INPUT);
  assert.equal(w.phase,'complete');
});
test('practice mode also excludes a run starting at room one',()=>{
  const w=game();w.start(0,true);assert.equal(w.practice,true);
  w.start();assert.equal(w.practice,false);
});
test('enemy contact removes one life and respawns with temporary protection',()=>{
  const w=game();w.player.invincible=0;
  Object.assign(w.enemies[0],{x:w.player.x,y:w.player.y,px:w.player.x,py:w.player.y});
  w.step(NO_INPUT);assert.equal(w.lives,2);assert.ok(w.player.dead>0);
  for(let i=0;i<40;i++)w.step(NO_INPUT);
  assert.equal(w.player.dead,0);assert.ok(w.player.invincible>0);assert.equal(w.lives,2);
});
test('losing the final life ends the run and restart clears transient state',()=>{
  const w=game();w.lives=1;w.player.invincible=0;
  Object.assign(w.enemies[0],{x:w.player.x,y:w.player.y});w.step(NO_INPUT);
  for(let i=0;i<40;i++)w.step(NO_INPUT);
  assert.equal(w.phase,'gameover');
  w.start();assert.equal(w.phase,'playing');assert.equal(w.score,0);assert.equal(w.lives,3);assert.equal(w.bombs.length,0);assert.equal(w.tick,0);
});
test('seeded input replay has identical results at different rendering rates',()=>{
  function run(hz) {
    const w=game(),clock=new FixedClock();
    for(let i=0;i<hz*8;i++)clock.advance(1/hz,()=>w.step({...NO_INPUT,right:w.tick%100<50,left:w.tick%100>=50,jump:w.tick%31<10,bomb:w.tick%48===0}));
    return JSON.stringify(w);
  }
  assert.equal(run(60),run(144));
});
test('save loading tolerates blocked storage, malformed JSON and invalid scores',()=>{
  assert.equal(readSave({getItem(){throw new Error('Denied');}}).best,0);
  assert.equal(readSave({getItem(){return 'not json';}}).best,0);
  assert.deepEqual(readSave({getItem(){return '{"version":1,"best":-20,"furthest":900,"muted":"yes"}';}}),{version:1,best:0,furthest:9,muted:false});
});
