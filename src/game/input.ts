import type { Input } from './types.ts';

export class Controls {
  private keys = new Set<string>();
  private pointers = new Map<number,string>();
  private bombQueued = false;
  private padBomb = false;
  private padPause = false;
  enabled = false;
  private relevant = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyZ','KeyQ','KeyS','Space','ControlLeft','ControlRight','KeyX'];
  constructor(private onPause: () => void) {
    window.addEventListener('keydown',e=>{
      if (!this.enabled || (e.target instanceof HTMLElement && e.target.closest('dialog,input,select,textarea'))) return;
      if(e.code==='Escape'||e.code==='KeyP') {e.preventDefault();if(!e.repeat)this.onPause();return;}
      if(this.relevant.includes(e.code)) {
        e.preventDefault();
        if(['Space','ControlLeft','ControlRight','KeyX'].includes(e.code) && !this.keys.has(e.code) && !e.repeat) this.bombQueued=true;
        this.keys.add(e.code);
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();if(!this.enabled)return;
        button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId,button.dataset.control!);
        if(button.dataset.control==='bomb')this.bombQueued=true;
        button.classList.add('pressed');
      });
      const release=(e:PointerEvent)=>{this.pointers.delete(e.pointerId);button.classList.remove('pressed');};
      button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    }
  }
  clear() {this.keys.clear();this.pointers.clear();this.bombQueued=false;document.querySelectorAll('.pressed').forEach(e=>e.classList.remove('pressed'));}
  read(): Input {
    const pad=navigator.getGamepads?.()?.[0];
    const padBomb=!!pad?.buttons[1]?.pressed;
    const pause=!!pad?.buttons[9]?.pressed;
    if(this.enabled && pause && !this.padPause)this.onPause();
    this.padPause=pause;
    if(this.enabled && padBomb&&!this.padBomb)this.bombQueued=true;
    this.padBomb=padBomb;
    const held=(codes:string[],control:string)=>codes.some(k=>this.keys.has(k))||[...this.pointers.values()].includes(control);
    const bomb=this.bombQueued;this.bombQueued=false;
    return {
      left:held(['ArrowLeft','KeyA','KeyQ'],'left')||!!pad?.buttons[14]?.pressed||(pad?.axes[0]??0)<-.3,
      right:held(['ArrowRight','KeyD'],'right')||!!pad?.buttons[15]?.pressed||(pad?.axes[0]??0)>.3,
      jump:held(['ArrowUp','KeyW','KeyZ'],'jump')||!!pad?.buttons[0]?.pressed||!!pad?.buttons[12]?.pressed,
      down:held(['ArrowDown','KeyS'],'down')||!!pad?.buttons[13]?.pressed,
      bomb,
    };
  }
}
