import { assetUrl } from './assets.ts';

export class GameAudio {
  private context?: AudioContext;
  private buffers = new Map<string,AudioBuffer>();
  private music = new Audio(assetUrl('audio/music.mp3'));
  private loading = false;
  muted = false;
  volume = 0.35;
  constructor() { this.music.loop=true; this.music.preload='none'; }
  async unlock() {
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      if(this.loading)return;
      this.loading=true;
      await Promise.all(['jump','land','bomb_drop','bomb','freeze','kick','bad_death','player_death','level_clear','item_score','hurry'].map(async name=>{
        try {
          const r=await fetch(assetUrl(`audio/sound_${name}.mp3`));
          if(r.ok)this.buffers.set(name,await this.context!.decodeAudioData(await r.arrayBuffer()));
        } catch { /* A missing sound must not interrupt gameplay. */ }
      }));
    } catch { /* Audio is optional on browsers without a usable output device. */ }
  }
  setPlaying(playing:boolean) {
    this.music.volume=this.volume*.45;
    if(playing&&!this.muted)void this.music.play().catch(()=>{});else this.music.pause();
  }
  play(name:string) {
    if(this.muted||!this.context)return;
    const buffer=this.buffers.get(name);if(!buffer)return;
    const source=this.context.createBufferSource();const gain=this.context.createGain();
    source.buffer=buffer;gain.gain.value=this.volume;
    source.connect(gain);gain.connect(this.context.destination);source.start();
    source.onended=()=>{source.disconnect();gain.disconnect();};
  }
}
