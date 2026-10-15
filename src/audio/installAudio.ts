import type Phaser from 'phaser';
import {audio,type MusicMood} from './AudioDirector';
/** DOM controls remain readable at every canvas zoom. Opening settings pauses scene updates. */
export function installAudio(game:Phaser.Game):void{
 const style=document.createElement('style');style.textContent=`
 .rift-audio-button{position:fixed;right:12px;bottom:10px;z-index:1000;border:1px solid #bfa56c;background:#10252bef;color:#eee4c9;padding:8px 12px;border-radius:8px;cursor:pointer;font:14px sans-serif}
 .rift-audio-dialog{position:fixed;inset:0;z-index:1001;background:#020e14c9;display:grid;place-items:center;font:16px sans-serif;color:#eee4c9}
 .rift-audio-dialog[hidden]{display:none}.rift-audio-card{width:min(360px,80vw);padding:28px;border:1px solid #bfa56c;border-radius:14px;background:#10252b;box-shadow:0 20px 80px #0008}
 .rift-audio-card h2{margin-top:0}.rift-audio-card label{display:grid;grid-template-columns:80px 1fr 42px;gap:8px;margin:22px 0;align-items:center}.rift-audio-card input{width:100%;accent-color:#d7bd80}.rift-audio-card button{background:#284a47;color:#eee4c9;border:1px solid #829789;border-radius:6px;padding:9px 14px;cursor:pointer;margin-right:10px}.rift-audio-card small{display:block;color:#a2b7aa;line-height:1.6;margin:20px 0}`;document.head.append(style);
 const toggle=document.createElement('button');toggle.className='rift-audio-button';toggle.textContent='♫ 声音设置';toggle.setAttribute('aria-haspopup','dialog');document.body.append(toggle);
 const overlay=document.createElement('div');overlay.className='rift-audio-dialog';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','声音设置');
 overlay.innerHTML='<section class="rift-audio-card"><h2>声音与音乐</h2><p>暂停片刻，调整旅途的声音。</p><div id="rift-audio-sliders"></div><small>原创合成配乐 · 无外部音频请求<br>首次点击或按键后播放，切到后台自动暂停。<br>设置仅保存在当前浏览器。</small><button id="rift-mute">静音</button><button id="rift-audio-close">返回游戏</button></section>';
 document.body.append(overlay);
 for(const [key,label]of [['master','总音量'],['music','背景音乐'],['sfx','音效']] as const){
  const row=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input'),out=document.createElement('output');name.textContent=label;input.type='range';input.min='0';input.max='100';input.value=String(Math.round(audio.settings[key]*100));input.setAttribute('aria-label',label);out.textContent=input.value+'%';
  input.oninput=()=>{out.textContent=input.value+'%';audio.updateSettings({[key]:Number(input.value)/100});};row.append(name,input,out);overlay.querySelector('#rift-audio-sliders')!.append(row);
 }
 const mute=overlay.querySelector<HTMLButtonElement>('#rift-mute')!,close=overlay.querySelector<HTMLButtonElement>('#rift-audio-close')!;
 const refresh=()=>{mute.textContent=audio.settings.muted?'取消静音':'全部静音';mute.setAttribute('aria-pressed',String(audio.settings.muted));};refresh();
 const hide=()=>{overlay.hidden=true;audio.panelOpen=false;game.scene.getScenes(true).forEach(s=>s.input.keyboard?.resetKeys());toggle.focus();};
 toggle.onclick=()=>{void audio.unlock();overlay.hidden=false;audio.panelOpen=true;game.scene.getScenes(true).forEach(s=>s.input.keyboard?.resetKeys());close.focus();};close.onclick=hide;mute.onclick=()=>{audio.updateSettings({muted:!audio.settings.muted});refresh();};
 overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();hide();}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll<HTMLElement>('input,button')],i=nodes.indexOf(document.activeElement as HTMLElement);e.preventDefault();nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus();}});
 overlay.addEventListener('keyup',e=>e.stopPropagation());
 window.addEventListener('pointerdown',()=>void audio.unlock(),{passive:true});window.addEventListener('keydown',()=>void audio.unlock());
 document.addEventListener('visibilitychange',()=>audio.visibility());
 let last=0;game.events.on('step',(time:number)=>{if(time-last<500)return;last=time;
  let mood:MusicMood='title';
  if(game.scene.isActive('OverworldScene')){const s=game.scene.getScene('OverworldScene') as Phaser.Scene&{surface?:{engaged:boolean;targets:()=>{engaged:boolean;elite?:boolean;boss?:boolean}[]}};mood=s.surface?.targets().some(e=>e.engaged&&(e.elite||e.boss))?'boss':s.surface?.engaged?'battle':'explore';}
  else if(game.scene.isActive('DungeonScene'))mood='dungeon';
  else if(game.scene.isActive('TestRoomScene')){const s=game.scene.getScene('TestRoomScene') as Phaser.Scene&{encounter?:{dungeon?:{boss?:boolean}}};mood=s.encounter?.dungeon?.boss?'boss':'battle';}
  audio.setMood(mood);
 });
 (window as unknown as {__audio:typeof audio}).__audio=audio;
}
