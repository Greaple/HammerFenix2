import './styles.css';
import { loadJson } from './game/assets.ts';
import { Renderer } from './game/renderer.ts';
import { World, ROOM_NAMES } from './game/world.ts';
import { Controls } from './game/input.ts';
import { FixedClock } from './game/physics.ts';
import { GameAudio } from './game/audio.ts';
import { readSave, writeSave } from './game/storage.ts';
import type { OriginalLevel, Phase } from './game/types.ts';

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('game');
const renderer=new Renderer(canvas);
const sound=new GameAudio();
const save=readSave();
const clock=new FixedClock();
let world:World;
let currentPhase:Phase|undefined;
let reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastTime=0, toastUntil=0;
const controls=new Controls(()=>pause());
const formatScore=(n:number)=>String(n).padStart(6,'0');
const setText=(id:string,text:string)=>{const node=el(id);if(node.textContent!==text)node.textContent=text;};
sound.muted=save.muted;
el<HTMLInputElement>('reduced-motion').checked=reduced;
el<HTMLInputElement>('reduced-motion').addEventListener('change',e=>{reduced=(e.target as HTMLInputElement).checked;});

function soundButton() {
  el('sound').classList.toggle('muted',sound.muted);
  el('sound').setAttribute('aria-label',sound.muted?'Unmute sound':'Mute sound');
  el('sound').setAttribute('aria-pressed',String(sound.muted));
}
soundButton();
el('sound').addEventListener('click',()=>{
  sound.muted=!sound.muted;save.muted=sound.muted;writeSave(save);soundButton();
  if(!sound.muted)void sound.unlock();
  sound.setPlaying(world?.phase==='playing');
  canvas.focus({preventScroll:true});
});
function pause() {
  if(!world || document.querySelector('dialog[open]'))return;
  world.pause();controls.clear();clock.reset();updatePhase();
}
el('pause').addEventListener('click',pause);
function start(room=0,practice=false) {
  if(!world)return;
  world.start(room,practice);controls.enabled=true;controls.clear();clock.reset();
  void sound.unlock();updatePhase();canvas.focus({preventScroll:true});
}
el('start').addEventListener('click',()=>{
  if(world?.phase==='paused') {world.pause();controls.clear();clock.reset();updatePhase();canvas.focus({preventScroll:true});}
  else start();
});
el('restart').addEventListener('click',()=>start());
el('restart-help').addEventListener('click',()=>{el<HTMLDialogElement>('help-dialog').close();start();});
el('play-nav').addEventListener('click',()=>{canvas.focus({preventScroll:true});el('playfield').scrollIntoView({block:'nearest',behavior:reduced?'instant':'smooth'});});
el('fullscreen').addEventListener('click',async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.querySelector<HTMLElement>('.game-cabinet')!.requestFullscreen();
  } catch {setText('room-toast','Fullscreen is unavailable in this browser.');toastUntil=performance.now()+3500;}
});
document.addEventListener('fullscreenchange',()=>{
  renderer.resize();
  el('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');
});
new ResizeObserver(()=>renderer.resize()).observe(canvas);

for(const button of document.querySelectorAll<HTMLElement>('[data-dialog]')) {
  button.addEventListener('click',()=>{
    if(world?.phase==='playing') {world.pause();controls.clear();updatePhase();}
    button.closest('dialog')?.close();
    el<HTMLDialogElement>(button.dataset.dialog!).showModal();
  });
}
for(const button of document.querySelectorAll<HTMLElement>('[data-close]'))button.addEventListener('click',()=>button.closest('dialog')!.close());
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{controls.clear();if(world)canvas.focus({preventScroll:true});});
const autoPause=()=>{controls.clear();if(world?.phase==='playing'){world.pause();clock.reset();updatePhase();}};
window.addEventListener('blur',autoPause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();lastTime=0;});

function updatePhase() {
  if(!world || currentPhase===world.phase)return;
  currentPhase=world.phase;
  controls.enabled=world.phase==='playing'||world.phase==='paused';
  const playing=world.phase==='playing';
  el('overlay').hidden=playing;
  sound.setPlaying(playing);
  el('pause').setAttribute('aria-label',world.phase==='paused'?'Resume game':'Pause game');
  if(world.phase!=='playing') {
    const copy:Record<Exclude<Phase,'playing'>,string[]>={
      ready:['WELCOME BACK, ADVENTURER','The caverns await.','Freeze the fruit. Find your footing.\nSee how far down you can go.','Start adventure','Original art. Original music. A new beginning.'],
      paused:['NO RUSH, LITTLE SNOWMAN','Take a breather.','Your adventure is right where you left it.','Resume adventure','P or Esc to jump back in.'],
      gameover:['EVERY DESCENT TEACHES YOU SOMETHING','One more try? ',`You reached room ${world.room+1} with ${world.score.toLocaleString()} points.`,'Try again','The caverns will be waiting.'],
      complete:['TEN ROOMS. ONE DETERMINED SNOWMAN.','A beautiful beginning.',`${world.score.toLocaleString()} points. ${world.kills} fruit defeated.\nYou have completed the preview.`,'Play again','There is a much bigger world still to bring back.'],
    };
    const [label,title,description,cta,hint]=copy[world.phase];
    setText('overlay-label',label);setText('overlay-title',title);setText('overlay-description',description);setText('start-label',cta);setText('overlay-hint',hint);
  }
  const status={ready:'Ready for a little adventure',playing:world.practice?'Practice run':'Adventure in progress',paused:'Adventure paused',gameover:'Until the next descent',complete:'Preview completed'};
  setText('status',status[world.phase]);
}
function updateHud() {
  setText('score',formatScore(world.score));
  setText('lives',Array.from({length:3},(_,i)=>i<world.lives?'◆':'◇').join(' '));
  el('lives').setAttribute('aria-label',`${world.lives} lives`);
  const roomLabel=`${String(world.room+1).padStart(2,'0')} / 10`;
  if(el('room-number').textContent?.replace(/\s+/g,' ')!==roomLabel)el('room-number').innerHTML=`${String(world.room+1).padStart(2,'0')}<span> / 10</span>`;
  let changed=false;
  if(!world.practice && world.score>save.best){save.best=world.score;changed=true;}
  if(!world.practice && world.room>save.furthest){save.furthest=world.room;changed=true;}
  if(changed)writeSave(save);
  setText('best-score',formatScore(save.best));setText('furthest',String(save.furthest+1).padStart(2,'0'));
  const seconds=Math.floor(world.tick/32);
  setText('run-time',`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);
  setText('run-caption',world.phase==='ready'?'READY WHEN YOU ARE':world.cleared?'ROOM CLEAR':`${world.remaining} FRUIT REMAINING`);
  document.querySelectorAll<HTMLElement>('#room-path li').forEach((node,i)=>{
    node.classList.toggle('current',i===world.room);node.classList.toggle('done',i<world.room);
    if(i===world.room)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');
  });
}

async function boot() {
  try {
    const [archive]=await Promise.all([loadJson<OriginalLevel[]>('data/adventure.json'),renderer.load()]);
    // Records 0 and 1 are scripted exterior/intro scenes; records 2–11 are the opening combat rooms.
    world=new World(archive.slice(2,12));
    el('room-path').innerHTML=ROOM_NAMES.map((name,i)=>`<li title="Room ${i+1}: ${name}">${String(i+1).padStart(2,'0')}</li>`).join('');
    el('room-selection').innerHTML=ROOM_NAMES.map((name,i)=>`<button data-room="${i}"><span>ROOM ${String(i+1).padStart(2,'0')}</span>${name}</button>`).join('');
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-room]'))button.addEventListener('click',()=>{el<HTMLDialogElement>('rooms-dialog').close();start(Number(button.dataset.room),true);});
    el<HTMLButtonElement>('start').disabled=false;updatePhase();updateHud();
    const frame=(now:number)=>{
      const delta=lastTime?(now-lastTime)/1000:0;lastTime=now;
      const alpha=clock.advance(delta,()=>{
        world.step(controls.read());
        for(const event of world.events) {
          sound.play(event);
          if(event==='next') {setText('room-toast',`ROOM ${String(world.room+1).padStart(2,'0')} · ${ROOM_NAMES[world.room]}`);toastUntil=now+2400;}
          if(event==='level_clear') {setText('room-toast','Every fruit defeated. Keep going down.');toastUntil=now+3500;}
          if(event==='hurry') {setText('room-toast','Hurry up! The fruit is getting restless.');toastUntil=now+3000;}
        }
        world.events=[];
      });
      if(now>toastUntil)setText('room-toast','');
      updatePhase();updateHud();
      renderer.draw(world,world.phase==='playing'?alpha:1,world.phase==='ready'?now/1000:world.tick/32,reduced);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  } catch(error) {
    console.error(error);setText('overlay-title','A small cave-in.');setText('overlay-description','Some game assets could not load. Reload the page to try again.');
    setText('start-label','Reload game');setText('status','Asset loading interrupted');
    const retry=el<HTMLButtonElement>('start');retry.disabled=false;retry.addEventListener('click',()=>location.reload(),{once:true});
  }
}
void boot();
