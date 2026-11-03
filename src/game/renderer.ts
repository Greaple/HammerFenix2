import { loadImage, loadJson } from './assets.ts';
import type { Atlas } from './assets.ts';
import type { Body } from './types.ts';
import type { World } from './world.ts';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas!: Atlas;
  private image!: HTMLImageElement;
  private bg!: HTMLImageElement;
  private tiles = new Map<number, HTMLImageElement>();
  private ends = new Map<number, HTMLImageElement>();
  private backdrop = document.createElement('canvas');
  private room = -1;
  private scale = 1;
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Your browser could not create the game display.');
    this.ctx = ctx;
    this.backdrop.width = 400; this.backdrop.height = 500;
    this.resize();
  }
  async load() {
    const [atlas,image,bg] = await Promise.all([loadJson<Atlas>('atlas.json'),loadImage('atlas.png'),loadImage('original/bg01.jpg')]);
    this.atlas = atlas; this.image = image; this.bg = bg;
    for (const n of [1,7,9]) {
      const id = String(n).padStart(2,'0');
      const [tile,end] = await Promise.all([loadImage(`original/tiles/tile_${id}.png`),loadImage(`original/tiles/end_${id}.png`)]);
      this.tiles.set(n,tile); this.ends.set(n,end);
    }
  }
  resize() {
    // Fixed world coordinates; the backing store follows actual CSS size and DPR.
    this.scale = Math.min(3, Math.max(1, this.canvas.clientWidth / 400 * (window.devicePixelRatio || 1)));
    this.canvas.width = Math.round(400 * this.scale);
    this.canvas.height = Math.round(500 * this.scale);
  }
  private buildRoom(world: World) {
    const c = this.backdrop.getContext('2d')!;
    c.fillStyle = c.createPattern(this.bg,'repeat')!; c.fillRect(0,0,400,500);
    const shade = c.createLinearGradient(0,0,0,500);
    shade.addColorStop(0,'#140e0e66'); shade.addColorStop(0.5,'#00000000'); shade.addColorStop(1,'#08080a77');
    c.fillStyle = shade; c.fillRect(0,0,400,500);
    const map = world.level.$map;
    const id = world.level.$skinTiles;
    const tile = this.tiles.get(id) ?? this.tiles.get(1)!;
    const end = this.ends.get(id) ?? this.ends.get(1)!;
    for (let y=0;y<25;y++) {
      for (let x=0;x<20;x++) {
        if (map[x]?.[y] <= 0) continue;
        const start = x;
        while (x+1<20 && map[x+1][y]>0) x++;
        const width = (x-start+1)*20;
        c.fillStyle = '#130d0d50'; c.fillRect(start*20+3,y*20+5,width,20);
        c.drawImage(tile,0,0,width-5,20,start*20,y*20,width-5,20);
        c.drawImage(end,start*20+width-5,y*20);
      }
    }
    this.room = world.room;
  }
  private sprite(name: string, frame: number, x: number, y: number, direction = 1, scale = 1, loop = true) {
    const frames = this.atlas.animations[name];
    if (!frames?.length) return;
    const index = loop ? Math.floor(frame) % frames.length : Math.min(frames.length-1,Math.floor(frame));
    const f = this.atlas.frames[frames[Math.max(0,index)]];
    const c = this.ctx; c.save(); c.translate(x,y); c.scale(direction*scale,scale);
    c.drawImage(this.image,f.x,f.y,f.w,f.h,-f.ox,-f.oy,f.w,f.h); c.restore();
  }
  draw(world: World, alpha: number, time: number, reducedMotion: boolean) {
    if (!this.image) return;
    if (this.room !== world.room) this.buildRoom(world);
    const c = this.ctx;
    c.setTransform(this.scale,0,0,this.scale,0,0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.backdrop,0,0);
    const point = (b: Body) => ({x:b.px+(b.x-b.px)*alpha,y:b.py+(b.y-b.py)*alpha});
    const frame = world.phase === 'ready' ? time * 24 : world.tick + alpha;
    // A few ambient motes, with no effect on simulation or random state.
    if (!reducedMotion) {
      c.fillStyle = '#f8e2b0';
      for(let i=0;i<14;i++) { c.globalAlpha = 0.08+0.08*Math.sin(time+i); c.fillRect((i*83+Math.sin(time*.3+i)*9)%400,(i*47+time*3)%500,1,1); }
      c.globalAlpha=1;
    }
    for(const item of world.items) {
      const p=point(item);
      this.sprite(`item-${item.item}`,0,p.x,p.y,1,0.85);
    }
    for(const b of world.bombs) {
      const p=point(b);
      this.sprite(b.age<17?'bomb-drop':'bomb-idle', b.age<17?b.age:b.age-17,p.x,p.y);
      c.fillStyle=b.fuse<12?'#ffd39b':'#bdeaff';c.globalAlpha=.8;
      c.fillRect(p.x-8,p.y+3,16*b.fuse/45,1);c.globalAlpha=1;
    }
    for(const e of world.enemies) {
      if(e.dead)continue;
      const p=point(e);
      const anim=e.frozen>0?'frozen':world.roomTicks>1120?'angry':'walk';
      this.sprite(`${e.kind}-${anim}`, frame*.65,p.x,p.y,e.dir,e.kind==='orange'?1:.7);
      if(e.frozen>0) {
        c.strokeStyle='#b2f2ffb0';c.fillStyle='#6bd4f52a';
        c.beginPath();c.roundRect(p.x-13,p.y-25,26,25,4);c.fill();c.stroke();
        c.fillStyle='#e2fbff';c.fillRect(p.x-8,p.y-21,5,2);
      }
    }
    for(const s of world.shots) {
      c.fillStyle='#e7c999';c.beginPath();c.ellipse(s.x,s.y,4,2,-.5,0,Math.PI*2);c.fill();
    }
    const p=world.player, pos=point(p);
    if(p.invincible===0 || Math.floor(p.invincible/3)%2===0 || world.phase==='ready') {
      const anim=p.dead?'die':p.action>0?'kick':!p.grounded?(p.vy<0?'up':'down'):Math.abs(p.vx)>.3?'walk':'idle';
      this.sprite(`igor-${anim}`,frame,pos.x,pos.y,p.dir,.7);
    }
    for(const e of world.effects) {
      const age=e.age+alpha;
      if(e.type==='burst') this.sprite('bomb-explode',age,e.x,e.y+10,1,1,false);
      if(e.type==='score') {
        c.globalAlpha=Math.min(1,(40-age)/12);c.font='bold 12px monospace';c.textAlign='center';
        c.fillStyle='#160e12';c.fillText(e.text??'',e.x+1,e.y-age*.65+1);
        c.fillStyle='#fff4c0';c.fillText(e.text??'',e.x,e.y-age*.65);c.globalAlpha=1;
      }
      if(e.type==='ice' && !reducedMotion) {
        c.fillStyle='#b8edff';c.globalAlpha=Math.max(0,1-age/22);
        for(let i=0;i<9;i++) {const a=i*2.4;c.fillRect(e.x+Math.cos(a)*age*1.9,e.y+Math.sin(a)*age*1.5+age*age*.03,2+i%2,3);}
        c.globalAlpha=1;
      }
    }
    if(world.cleared && !world.player.dead) {
      c.textAlign='center';c.font='bold 10px monospace';c.fillStyle='#fff1bc';
      c.fillText('ROOM CLEAR',200,429);
      c.font='10px monospace';c.fillStyle='#dfcdb9';c.fillText('Drop down to continue',200,446);
      const dy=reducedMotion?0:Math.sin(time*4)*3;
      c.strokeStyle='#fff1bc';c.lineWidth=2;c.beginPath();c.moveTo(194,462+dy);c.lineTo(200,468+dy);c.lineTo(206,462+dy);c.stroke();
    }
  }
}
