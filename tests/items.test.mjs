import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { World } from '../src/game/world.ts';
import { NO_INPUT } from '../src/game/types.ts';
import { solid } from '../src/game/physics.ts';

const asset = path => readFileSync(new URL(`../public/assets/${path}`, import.meta.url));
const rooms = JSON.parse(asset('data/adventure.json')).slice(2,12);

test('pickup artwork meets the floor and is centered despite transparent padding', () => {
  const atlas = JSON.parse(asset('atlas.json'));
  const png = asset('atlas.png'), chunks = [];
  const stride = png.readUInt32BE(16) * 4 + 1;
  assert.equal(png[24],8); assert.equal(png[25],6); // Exporter writes 8-bit RGBA.
  for(let offset=8; offset<png.length;) {
    const length=png.readUInt32BE(offset);
    if(png.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));
    offset+=length+12;
  }
  const pixels=inflateSync(Buffer.concat(chunks));
  for(const [name,frames] of Object.entries(atlas.animations)) {
    if(!name.startsWith('item-'))continue;
    const f=atlas.frames[frames[0]];
    let left=Infinity, right=-Infinity, bottom=-Infinity;
    for(let y=0;y<f.h;y++) {
      const row=(f.y+y)*stride;
      assert.equal(pixels[row],0,'Atlas export uses unfiltered rows');
      for(let x=0;x<f.w;x++)if(pixels[row+1+(f.x+x)*4+3]) {
        left=Math.min(left,x);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
      }
    }
    assert.ok(Number.isFinite(bottom),`${name} must be visible`);
    assert.equal(bottom-f.oy,0,`${name} must touch, without overlapping, the platform`);
    assert.equal(left-f.ox,-(right-f.ox),`${name} must be centered on its slot`);
  }
});

test('pickups settle on platforms in all ten rooms, including airborne slots', () => {
  const world=new World(rooms);
  for(let room=0;room<rooms.length;room++) {
    world.start(room,true);
    world.player.dead=1000; // Prevent collection while observing the pickup positions.
    for(let tick=0;tick<120;tick++)world.step(NO_INPUT);
    assert.equal(world.items.length,world.level.$scoreSlots.length);
    for(const [i,item] of world.items.entries()) {
      assert.equal(item.x,world.level.$scoreSlots[i].$x*20+10);
      assert.equal(item.y%20,0);
      assert.ok(item.grounded,`Room ${room+1}: pickup ${i} must land`);
      assert.ok(solid(world.level.$map,Math.floor(item.x/20),item.y/20));
    }
    const positions=world.items.map(({x,y})=>({x,y}));
    for(let tick=0;tick<32;tick++)world.step(NO_INPUT);
    assert.deepEqual(world.items.map(({x,y})=>({x,y})),positions,'Grounded pickups stay put');
  }
});

test('walking into a grounded pickup awards its points exactly once', () => {
  const world=new World(rooms);
  world.start();
  const item=world.items[0];
  Object.assign(world.player,{x:item.x,px:item.x,y:item.y,py:item.y,grounded:true});
  world.step(NO_INPUT);
  assert.equal(world.items.length,0);
  assert.equal(world.score,item.points);
  assert.ok(world.events.includes('item_score'));
  world.step(NO_INPUT);
  assert.equal(world.score,item.points);
});
