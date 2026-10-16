import {mountHuntTools} from '../ui/HuntTools';
import {mountForgeTools} from '../ui/ForgeTools';
import {mountSaveTools} from '../ui/SaveTools';
import type Phaser from 'phaser';
import {audio,type MusicMood} from './AudioDirector';
/** DOM controls remain readable at every canvas zoom. Opening settings pauses scene updates. */
export function installAudio(game:Phaser.Game):void{
 const style=document.createElement('style');style.textContent=`
 .rift-audio-button{position:fixed;right:12px;bottom:10px;z-index:1000;border:1px solid #bfa56c;background:#10252bef;color:#eee4c9;padding:8px 12px;border-radius:8px;cursor:pointer;font:14px sans-serif}
 .rift-audio-dialog{position:fixed;inset:0;z-index:1001;background:#020e14c9;display:grid;place-items:center;font:16px sans-serif;color:#eee4c9}
 .rift-audio-dialog[hidden]{display:none}.rift-audio-card{width:min(560px,86vw);max-height:82vh;overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #bfa56c;border-radius:14px;background:#10252b;box-shadow:0 20px 80px #0008}
 .rift-audio-card h2{margin-top:0}.rift-audio-card label{display:grid;grid-template-columns:80px 1fr 42px;gap:8px;margin:22px 0;align-items:center}.rift-audio-card input{width:100%;accent-color:#d7bd80}.rift-audio-card button{background:#284a47;color:#eee4c9;border:1px solid #829789;border-radius:6px;padding:9px 14px;cursor:pointer;margin-right:10px}.rift-audio-card small{display:block;color:#a2b7aa;line-height:1.6;margin:20px 0}.rift-audio-card pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px sans-serif;line-height:1.6;background:#193238;padding:12px}.rift-audio-card p{font-size:14px;line-height:1.6}.rift-audio-card select{width:100%;margin-top:8px;padding:9px;background:#193238;color:#eee4c9;border:1px solid #829789;border-radius:5px}.rift-audio-card button:disabled{opacity:.45;cursor:not-allowed}#forge-status{color:#e5c987}#forge-confirmation{border:1px solid #c99d62;padding:12px}.rift-audio-card nav{position:sticky;top:-24px;z-index:2;background:#10252b;padding:8px 0;border-bottom:1px solid #64796b}.rift-audio-card button{margin-bottom:8px}.rift-audio-card .rift-file-label{display:block}.rift-file-label input{display:block;margin-top:12px}.rift-audio-card [hidden]{display:none}.rift-audio-card dt{color:#e3c888;margin-top:12px}.rift-audio-card dd{margin:5px 0 10px;line-height:1.5;font-size:14px}.rift-system-button{right:auto;left:12px}#save-status{color:#e5c987}#save-confirmation{border:1px solid #c99d62;padding:12px;margin-top:12px}`;document.head.append(style);
 const toggle=document.createElement('button');toggle.className='rift-audio-button';toggle.textContent='♫ 声音设置';toggle.setAttribute('aria-haspopup','dialog');document.body.append(toggle);
 const overlay=document.createElement('div');overlay.className='rift-audio-dialog';overlay.hidden=true;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','声音设置');
 overlay.innerHTML=`<section class="rift-audio-card">
 <nav aria-label="设置分类"><button id="tab-audio">声音</button><button id="tab-saves">存档</button><button id="tab-forge">工坊</button><button id="tab-hunts">讨伐</button><button id="tab-help">操作帮助</button><button id="rift-audio-close">返回游戏</button></nav>
 <div id="panel-audio"><h2>声音与音乐</h2><p>暂停片刻，调整旅途的声音。</p><div id="rift-audio-sliders"></div><small>原创合成配乐 · 无外部音频请求<br>首次点击或按键后播放，切到后台自动暂停。<br>设置仅保存在当前浏览器。</small><button id="rift-mute">静音</button></div>
 <div id="panel-saves" hidden></div><div id="panel-forge" hidden></div><div id="panel-hunts" hidden></div>
 <div id="panel-help" hidden><h2>旅人操作手册</h2><dl>
 <dt>WASD 移动 · J 挥砍 · Space 闪避</dt><dd>地表直接打怪。按住 J，静止时会靠近附近敌人；走出红色预警圈可躲避攻击。Z 切换原地自动攻击。</dd>
 <dt>1–4 技能 · G 学习与装配</dt><dd>先升级获得技能点，再学习主动技能并装入技能栏。空槽不能施法；技能消耗魔力或耐力，有独立冷却。</dd>
 <dt>H / M 药剂 · E 互动 · F 讨伐</dt><dd>H 治疗，M 回魔。靠近 NPC、商人或地牢入口按 E。主线解锁金色旗帜后，靠近按 F 主动接受精英讨伐；推荐先准备装备与药剂。“讨伐”页可查看全部六处挑战的解锁条件、位置与完整奖励，不会远程接受挑战。</dd>
 <dt>Q 任务 · I 背包 · C 装备 · R 声望</dt><dd>任务面板可选追踪，B/N 翻页，V 查看详情。Esc 关闭面板。对话时数字键选择、空格继续。</dd>
 <dt>营地装备工坊</dt><dd>在起始营地商人附近打开“工坊”：可对比装备、精炼至 +5、重铸非隐藏词条、分解背包中的多余装备。同款共享图谱，碎片也是任务材料，操作前请看确认提示。</dd>
 <dt>K 存档 · 存档面板备份</dt><dd>导出的是最近成功保存的检查点。切换设备前先保存、再下载 JSON，在新设备标题界面导入；不需要清理浏览器数据。</dd>
 <dt>U 灰烬熔炉</dt><dd>完成第二章后，在营地商人附近十格内脱战按 U。地图点击房间选择路线，E 战斗/最终宝匣，阀室 1–3 按铭文顺序操作；误操作提高 Boss 攻击。可选精英支库使 Boss 生命降低 20%，通关余烬从 3 增至 5。大厅每件灰烬套装消耗 3 余烬，重复选择确认兑换；H/M 药剂、K 保存、L 暂离、X 二次确认放弃。不能同时保留塔和熔炉挑战。</dd>
 <dt>Y 裂隙试炼塔</dt><dd>在起始营地商人附近十格内脱战后按 Y。30 层，每层胜利后三选一临时强化；每五层可撤离领取暂存奖励，战败或放弃失去暂存奖励。E 挑战、1–3 选强化、H/M 层间药剂、L 撤离/暂离、K 保存、X 二次确认放弃。第 10/20/30 层有带预警的落火、封线、双重裂隙；离开危险区或闪避可规避。临时强化仅塔内生效，药剂正常消耗。</dd>
 <dt>地牢与试炼</dt><dd>地牢数字键移动房间，E 探索、L 返回地表、K 保存。地牢和 T 试炼仍使用独立战斗界面；在战斗结束前不能通过此面板返回标题。</dd>
 <dt>安全与暂停</dt><dd>营地和 NPC 周围有安全区。地表倒下会被救回起始营地。设置面板打开时暂停操作与战斗；目前以键盘和鼠标为主，尚无完整手机触控方案。</dd>
 </dl></div></section>`;
 document.body.append(overlay);
 const saveTools=mountSaveTools(overlay.querySelector<HTMLElement>('#panel-saves')!,game);
 const forgeTools=mountForgeTools(overlay.querySelector<HTMLElement>('#panel-forge')!,game);
 const huntTools=mountHuntTools(overlay.querySelector<HTMLElement>('#panel-hunts')!,game);
 const systemToggle=document.createElement('button');systemToggle.className='rift-audio-button rift-system-button';systemToggle.textContent='存档 / 帮助';systemToggle.setAttribute('aria-haspopup','dialog');document.body.append(systemToggle);
 const selectTab=(tab:'audio'|'saves'|'help'|'forge'|'hunts')=>{
  saveTools.cancel();forgeTools.cancel();
  for(const id of ['audio','saves','help','forge','hunts']){overlay.querySelector<HTMLElement>('#panel-'+id)!.hidden=id!==tab;overlay.querySelector('#tab-'+id)!.setAttribute('aria-pressed',String(id===tab));}
  overlay.setAttribute('aria-label',tab==='audio'?'声音设置':tab==='saves'?'存档管理':tab==='forge'?'装备工坊':tab==='hunts'?'讨伐手册':'操作帮助');
  if(tab==='saves')saveTools.open();
  if(tab==='forge')forgeTools.open();
  if(tab==='hunts')huntTools.open();
  overlay.querySelector<HTMLElement>('.rift-audio-card')!.scrollTop=0;
 };
 for(const tab of ['audio','saves','help','forge','hunts'] as const)overlay.querySelector<HTMLButtonElement>('#tab-'+tab)!.onclick=()=>selectTab(tab);
 selectTab('audio');
 for(const [key,label]of [['master','总音量'],['music','背景音乐'],['sfx','音效']] as const){
  const row=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input'),out=document.createElement('output');name.textContent=label;input.type='range';input.min='0';input.max='100';input.value=String(Math.round(audio.settings[key]*100));input.setAttribute('aria-label',label);out.textContent=input.value+'%';
  input.oninput=()=>{out.textContent=input.value+'%';audio.updateSettings({[key]:Number(input.value)/100});};row.append(name,input,out);overlay.querySelector('#rift-audio-sliders')!.append(row);
 }
 const mute=overlay.querySelector<HTMLButtonElement>('#rift-mute')!,close=overlay.querySelector<HTMLButtonElement>('#rift-audio-close')!;
 const refresh=()=>{mute.textContent=audio.settings.muted?'取消静音':'全部静音';mute.setAttribute('aria-pressed',String(audio.settings.muted));};refresh();
 let opener:HTMLButtonElement=toggle;
 const hide=()=>{saveTools.cancel();forgeTools.cancel();overlay.hidden=true;audio.panelOpen=false;game.scene.getScenes(true).forEach(s=>s.input.keyboard?.resetKeys());if(game.canvas){game.canvas.setAttribute('tabindex','0');game.canvas.focus({preventScroll:true});}else opener.focus();};
 const show=(tab:'audio'|'saves'|'forge',button:HTMLButtonElement)=>{opener=button;void audio.unlock();selectTab(tab);overlay.hidden=false;audio.panelOpen=true;game.scene.getScenes(true).forEach(s=>s.input.keyboard?.resetKeys());overlay.querySelector<HTMLElement>('#tab-'+tab)!.focus();};toggle.onclick=()=>show('audio',toggle);systemToggle.onclick=()=>show('saves',systemToggle);window.addEventListener('rift-open-workshop',()=>show('forge',systemToggle));close.onclick=hide;mute.onclick=()=>{audio.updateSettings({muted:!audio.settings.muted});refresh();};
 overlay.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();hide();}if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll<HTMLElement>('input,button,select')].filter(n=>n.getClientRects().length>0&&!n.matches(':disabled')),i=nodes.indexOf(document.activeElement as HTMLElement);e.preventDefault();nodes[(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus();}});
 overlay.addEventListener('keyup',e=>e.stopPropagation());
 window.addEventListener('pointerdown',()=>void audio.unlock(),{passive:true});window.addEventListener('keydown',()=>void audio.unlock());
 document.addEventListener('visibilitychange',()=>audio.visibility());
 let last=0;game.events.on('step',(time:number)=>{if(time-last<500)return;last=time;
  let mood:MusicMood='title';
  if(game.scene.isActive('OverworldScene')){const s=game.scene.getScene('OverworldScene') as Phaser.Scene&{surface?:{engaged:boolean;targets:()=>{engaged:boolean;elite?:boolean;boss?:boolean}[]}};mood=s.surface?.targets().some(e=>e.engaged&&(e.elite||e.boss))?'boss':s.surface?.engaged?'battle':'explore';}
  else if(game.scene.isActive('DungeonScene')||game.scene.isActive('TowerScene')||game.scene.isActive('AshForgeScene'))mood='dungeon';
  else if(game.scene.isActive('TestRoomScene')){const s=game.scene.getScene('TestRoomScene') as Phaser.Scene&{encounter?:{forge?:{room:string};dungeon?:{boss?:boolean};tower?:{floor:number}}};mood=s.encounter?.forge?.room==='boss'||s.encounter?.dungeon?.boss||(s.encounter?.tower?.floor??0)>0&&(s.encounter!.tower!.floor%5===0)?'boss':'battle';}
  audio.setMood(mood);
 });
 (window as unknown as {__audio:typeof audio}).__audio=audio;
}
