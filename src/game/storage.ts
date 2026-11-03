export interface Save { version: 1; best: number; furthest: number; muted: boolean }
const defaults: Save = {version:1,best:0,furthest:0,muted:false};
export function readSave(storage?: Pick<Storage,'getItem'>): Save {
  try {
    const s=storage??window.localStorage;
    const data=JSON.parse(s.getItem('hammerfenix.v1')??'null');
    if(data?.version!==1)return {...defaults};
    return {version:1,best:Number.isSafeInteger(data.best)&&data.best>=0?data.best:0,furthest:Number.isInteger(data.furthest)?Math.max(0,Math.min(9,data.furthest)):0,muted:data.muted===true};
  } catch { return {...defaults}; }
}
export function writeSave(save: Save) {
  try { window.localStorage.setItem('hammerfenix.v1',JSON.stringify(save)); } catch { /* Private browsing can disable storage. */ }
}
