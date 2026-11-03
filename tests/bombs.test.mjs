import test from 'node:test';
import assert from 'node:assert/strict';
import { createBomb, kickBomb, moveBomb, withinBlast } from '../src/game/bombs.ts';
import { World } from '../src/game/world.ts';
import { NO_INPUT } from '../src/game/types.ts';

function room() {
  const map=Array.from({length:20},()=>Array(25).fill(0));
  for(let x=0;x<20;x++)map[x][15]=1;
  return {$map:map,$playerX:5,$playerY:15,$skinBg:1,$skinTiles:1,
    $badList:[{$x:15,$y:14,$id:1}],$scoreSlots:[],$specialSlots:[],$script:''};
}
function game() { const w=new World([room()]); w.start(); w.step(NO_INPUT); return w; }
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('a moving player kicks at the original 3.5 impulse without adding walking speed',()=>{
  for(const dir of [-1,1]) {
    const w=game(),p=w.player;
    w.step({...NO_INPUT,bomb:true});
    const b=w.bombs[0],x=b.x;
    w.step({...NO_INPUT,bomb:true,left:dir<0,right:dir>0});
    close(b.x-x,3.5*dir);
    close(b.vx,3.5*dir*0.93);
    close(b.vy,(-7.4+1)*0.86);
    assert.equal(p.dir,dir);
    assert.ok(w.events.includes('kick'));
  }
});

test('air drops kick the bomb and boost a falling player without slowing an ascending jump',()=>{
  for(const [initial,expected] of [[5,-5.16],[-12,-9.46]]) {
    const w=game();
    Object.assign(w.player,{y:200,py:200,vy:initial,grounded:false});
    const x=w.player.x;
    w.step({...NO_INPUT,bomb:true});
    const b=w.bombs[0];
    close(b.x,x+3.5);close(b.y,192.6);close(b.vy,-7.4*0.86);
    close(w.player.vy,expected);
    assert.equal(b.airKick,false);
    assert.ok(w.events.includes('bomb_drop'));assert.ok(w.events.includes('kick'));
  }
});

test('bomb reach includes the exact ground and air distance boundaries',()=>{
  for(const [grounded,reach] of [[true,20],[false,30]]) {
    for(const extra of [0,0.01]) {
      const w=game();w.events=[];
      Object.assign(w.player,{grounded,y:grounded?300:200});
      const b=createBomb(w.player.x+reach+extra,w.player.y,100);b.grounded=grounded;
      w.bombs=[b];w.step({...NO_INPUT,bomb:true});
      assert.equal(w.events.includes('kick'),extra===0);
      assert.equal(w.bombs.length,1);
    }
  }
});

test('an upward kick preserves horizontal momentum and gives a stationary bomb a small nudge',()=>{
  const moving=createBomb(100,300,1);moving.grounded=true;moving.vx=2;
  assert.equal(kickBomb(moving,-1,1,true),true);
  assert.equal(moving.vx,4);assert.equal(moving.vy,-18);
  const still=createBomb(100,300,2);still.grounded=true;
  kickBomb(still,-1,1,true);
  assert.equal(still.vx,-0.5);assert.equal(still.vy,-18);
});

test('kicks respect the two-tick cooldown and allow only one air kick before landing',()=>{
  const b=createBomb(100,300,1);b.grounded=true;
  assert.equal(kickBomb(b,1,1),true);
  assert.equal(kickBomb(b,-1,2),false);
  assert.equal(kickBomb(b,-1,3),false);
  assert.equal(kickBomb(b,-1,4),true);
  assert.equal(b.airKick,false);
  assert.equal(kickBomb(b,1,7),false);
  b.grounded=true;
  assert.equal(kickBomb(b,1,7),true);
});

test('kicked bombs queue a half-speed rebound and skip gravity on its first tick',()=>{
  const b=createBomb(100,299,1);b.age=1;b.vx=3;b.vy=8;b.bounces=true;
  moveBomb(b,room().$map);
  assert.equal(b.y,300);assert.equal(b.grounded,true);
  assert.deepEqual(b.nextBounce,{vx:3,vy:-4.45});
  moveBomb(b,room().$map);
  close(b.x,106);close(b.y,295.55);close(b.vy,-4.45*0.86);
  assert.equal(b.grounded,false);assert.equal(b.nextBounce,null);
});

test('unkicked bombs and rebounds below two pixels per tick settle on the floor',()=>{
  for(const [bounces,vy] of [[false,8],[true,3]]) {
    const b=createBomb(100,299,1);Object.assign(b,{age:1,vy,bounces});
    moveBomb(b,room().$map);moveBomb(b,room().$map);
    assert.equal(b.y,300);assert.equal(b.vy,0);assert.equal(b.nextBounce,null);
    assert.equal(b.grounded,true);
  }
});

test('ordinary bombs stop against walls instead of ricocheting',()=>{
  const map=room().$map;map[8][14]=1;
  const b=createBomb(150,300,1);Object.assign(b,{age:1,vx:6,grounded:true,bounces:true});
  moveBomb(b,map);
  assert.equal(b.vx,0);assert.equal(b.x,150);
});

test('grounded blasts include the radius edge but cannot reach more than one tile below',()=>{
  const b=createBomb(100,300,1);b.grounded=true;
  assert.equal(withinBlast(b,160,300),true);
  assert.equal(withinBlast(b,160.01,300),false);
  assert.equal(withinBlast(b,100,320),true);
  assert.equal(withinBlast(b,100,320.01),false);
  assert.equal(withinBlast(b,100,240),true);
  b.grounded=false;
  assert.equal(withinBlast(b,100,340),true);
});

test('the blast rules govern actual freezing, including zero impulse at the radius edge',()=>{
  const w=game(),e=w.enemies[0],b=createBomb(100,300,99);b.grounded=true;
  Object.assign(e,{x:100,y:340,grounded:true});
  w.explode(b);assert.equal(e.frozen,0);
  Object.assign(e,{x:160,y:300});
  w.explode(b);assert.equal(e.frozen,160);assert.equal(e.vx,0);assert.equal(e.vy,-5);
});
