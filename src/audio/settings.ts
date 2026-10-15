export interface AudioSettings {master:number;music:number;sfx:number;muted:boolean}
export const AUDIO_KEY='rift-audio-v1';
export const DEFAULT_AUDIO:AudioSettings={master:.55,music:.5,sfx:.65,muted:false};
export function parseAudioSettings(raw:string|null):AudioSettings {
  try{const d=JSON.parse(raw??'null');if(!d||typeof d!=='object')return {...DEFAULT_AUDIO};
    const volume=(key:'master'|'music'|'sfx')=>typeof d[key]==='number'&&Number.isFinite(d[key])?Math.max(0,Math.min(1,d[key])):DEFAULT_AUDIO[key];
    return {master:volume('master'),music:volume('music'),sfx:volume('sfx'),muted:typeof d.muted==='boolean'?d.muted:false};
  }catch{return {...DEFAULT_AUDIO};}
}
