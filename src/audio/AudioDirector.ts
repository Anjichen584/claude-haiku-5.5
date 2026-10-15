import {AUDIO_KEY,parseAudioSettings,type AudioSettings} from './settings';
export type MusicMood='title'|'explore'|'battle'|'dungeon'|'boss';
export type SoundCue='swing'|'hit'|'hurt'|'skill'|'dodge'|'pickup'|'level'|'save'|'defeat'|'ui';
const THEMES:Record<MusicMood,{tempo:number;root:number;melody:number[]}>= {
 title:{tempo:76,root:50,melody:[12,19,16,14,12,7,9,14,16,19,21,19,16,14,9,7]},
 explore:{tempo:94,root:55,melody:[12,14,19,16,21,19,14,12,7,12,16,14,19,16,12,9]},
 battle:{tempo:132,root:50,melody:[0,12,7,10,0,15,12,7,3,12,10,7,0,7,15,12]},
 dungeon:{tempo:68,root:45,melody:[12,7,15,10,19,15,7,3,12,10,7,15,3,7,10,0]},
 boss:{tempo:146,root:43,melody:[0,12,3,15,7,19,10,15,0,7,12,15,10,7,3,12]},
};
/** Original procedural scores: layered pentatonic motifs, bass, pad and percussion.
 * One context/scheduler for the entire game; no external assets, requests or licenses.
 */
export class AudioDirector {
 settings:AudioSettings;
 mood:MusicMood='title';
 panelOpen=false;
 private context:AudioContext|null=null;
 private master:GainNode|null=null;private music:GainNode|null=null;private effects:GainNode|null=null;
 private timer:ReturnType<typeof setInterval>|null=null;
 private beat=0;private next=0;private transition=0;
 private weather='clear';private lastSfx=new Map<string,number>();
 constructor(){let raw=null;try{raw=localStorage.getItem(AUDIO_KEY);}catch{}this.settings=parseAudioSettings(raw);}
 get state():string{return this.context?.state??'locked';}
 async unlock():Promise<void>{
  try{
   if(!this.context){
    this.context=new AudioContext();this.master=this.context.createGain();this.music=this.context.createGain();this.effects=this.context.createGain();
    this.music.connect(this.master);this.effects.connect(this.master);this.master.connect(this.context.destination);
    this.applyVolumes();
   }
   if(document.hidden)return;
   await this.context.resume();
   if(!this.timer){this.next=this.context.currentTime+.1;this.timer=setInterval(()=>this.schedule(),100);}
  }catch{/* Unsupported/blocked audio must never prevent playing. */}
 }
 setMood(mood:MusicMood):void{if(this.mood===mood)return;this.mood=mood;this.beat=0;this.transition=2;if(this.context)this.next=this.context.currentTime+.25;}
 setWeather(weather:string):void{this.weather=weather;}
 updateSettings(patch:Partial<AudioSettings>):void{
  this.settings=parseAudioSettings(JSON.stringify({...this.settings,...patch}));this.applyVolumes();
  try{localStorage.setItem(AUDIO_KEY,JSON.stringify(this.settings));}catch{}
 }
 private applyVolumes():void{if(!this.context)return;const t=this.context.currentTime;
  this.master?.gain.setTargetAtTime(this.settings.muted?0:this.settings.master,t,.08);
  this.music?.gain.setTargetAtTime(this.settings.music,t,.15);this.effects?.gain.setTargetAtTime(this.settings.sfx,t,.04);
 }
 visibility():void{if(document.hidden){void this.context?.suspend();}else if(this.context){this.next=this.context.currentTime+.1;void this.unlock();}}
 private tone(freq:number,time:number,duration:number,volume:number,type:OscillatorType,bus:GainNode):void{
  const c=this.context;if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=freq;
  g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.025);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
  o.connect(g);g.connect(bus);o.start(time);o.stop(time+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 private noise(time:number,duration:number,volume:number,bus:GainNode,frequency=900):void{
  const c=this.context;if(!c)return;const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=frequency;g.gain.value=volume;
  source.connect(filter);filter.connect(g);g.connect(bus);source.start(time);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};
 }
 private schedule():void{
  const c=this.context,bus=this.music;if(!c||!bus||c.state!=='running'||document.hidden)return;
  if(this.next<c.currentTime)this.next=c.currentTime+.05;
  const theme=THEMES[this.mood],step=60/theme.tempo/2;
  while(this.next<c.currentTime+.25){
   const t=this.next,b=this.beat++,fade=this.transition>0?.35:1;this.transition=Math.max(0,this.transition-1);
   const midi=theme.root+theme.melody[b%theme.melody.length],hz=(n:number)=>440*2**((n-69)/12);
   this.tone(hz(midi),t,step*1.8,.065*fade,this.mood==='battle'||this.mood==='boss'?'triangle':'sine',bus);
   if(b%4===0){const root=theme.root+[0,-2,3,-5][Math.floor(b/8)%4];this.tone(hz(root-12),t,step*3.8,.09,'triangle',bus);
    for(const interval of [0,7,12])this.tone(hz(root+interval),t,step*3.8,.018,'sine',bus);}
   if(this.mood==='battle'||this.mood==='boss'){
    if(b%2===0)this.tone(b%4===0?65:95,t,.14,.1,'sine',bus);
    this.noise(t,.07,.024,bus,3800);
   }else if(b%8===0)this.noise(t,step*4,.013,bus,this.weather==='clear'?450:1600);
   this.next+=step;
  }
 }
 play(cue:SoundCue):void{
  const c=this.context,bus=this.effects;if(!c||!bus||c.state!=='running')return;
  const now=c.currentTime;if(now-(this.lastSfx.get(cue)??-100)<.065)return;this.lastSfx.set(cue,now);
  if(cue==='swing'||cue==='hit'||cue==='hurt'||cue==='dodge'){
   this.noise(now,cue==='dodge'?.22:.12,cue==='hurt'?.18:.1,bus,cue==='hit'?1400:2800);
   if(cue==='hurt'||cue==='hit')this.tone(cue==='hurt'?95:180,now,.13,.13,'triangle',bus);return;
  }
  const notes:Record<string,number[]>={skill:[440,660,880],pickup:[880,1175],level:[523,659,784,1047],save:[660,880],defeat:[330,277,220,165],ui:[540]};
  (notes[cue]??[660]).forEach((f,i)=>this.tone(f,now+i*.09,.22,.1,'sine',bus));
 }
}
export const audio=new AudioDirector();
