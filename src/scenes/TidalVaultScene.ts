import {expeditionPreparation} from '../dungeon/preparation';
import Phaser from 'phaser';
import {audio} from '../audio/AudioDirector';
import {loadGameData} from '../data/loader';
import {getSession,persistSession} from '../state/sessionStore';
import type {GameSession} from '../state/session';
import {combatProfile} from '../combat/profile';
import {useConsumable} from '../state/consumables';
import {bufferSceneKeys,pressed} from '../input/bufferedKeys';
import {panel,text,button} from '../ui/theme';
import {newVault,startVault,enterVaultRoom,chooseVault,claimVault,retreatVault,exchangeVault,vaultUnlocked,vaultTide,vaultReward,vaultEnemies,VAULT_NAMES,VAULT_GEAR,VAULT_WINGS,type VaultWing} from '../dungeon/tidalVault';

export class TidalVaultScene extends Phaser.Scene{
 private session!:GameSession;
 private objects:Phaser.GameObjects.GameObject[]=[];
 private keys!:Phaser.Input.Keyboard.Key[];
 private message!:Phaser.GameObjects.Text;
 private busy=false;
 private armed:'retreat'|'abandon'|null=null;
 private pendingGear:string|null=null;
 constructor(){super('TidalVaultScene');}
 create():void{
  const s=getSession();if(!s){this.scene.start('TitleScene');return;}this.session=s;s.vault??=newVault();
  this.objects=[];this.busy=false;this.armed=null;this.pendingGear=null;
  this.cameras.main.setBackgroundColor('#0c202d');
  const g=this.add.graphics();g.fillGradientStyle(0x10293c,0x10293c,0x204c50,0x204c50,1).fillRect(0,0,1280,720);
  for(let i=0;i<14;i++){g.lineStyle(1,0x8fd4e4,.12);g.strokeEllipse(640,380+i*22,900-i*30,180+i*18);}
  text(this,42,24,'霜潮档案馆 / 封存与搜掠',30,'#b9e1eb');
  this.message=text(this,42,644,'',14,'#e9d59e').setWordWrapWidth(1190);
  const kb=this.input.keyboard!;this.keys=['E','L','K','R','X','H','M',1,2,3,4,5,6].map(k=>kb.addKey(typeof k==='number'?48+k:k));bufferSceneKeys(this);this.render();
 }
 update():void{
  if(audio.panelOpen||this.busy)return;
  if(pressed(this.keys[0]))this.interact();if(pressed(this.keys[1]))this.leave();if(pressed(this.keys[2]))this.saveCheckpoint();
  if(pressed(this.keys[3]))this.endRun('retreat');if(pressed(this.keys[4]))this.endRun('abandon');
  if(pressed(this.keys[5]))this.supply('health_potion');if(pressed(this.keys[6]))this.supply('mana_potion');
  for(let i=0;i<6;i++)if(pressed(this.keys[7+i]))this.digit(i);
 }
 saveCheckpoint():boolean{const ok=persistSession(this.session);this.message.setText(ok?'档案检查点已保存':'保存失败，请勿刷新，按 K 重试');return ok;}
 private profile(){const d=loadGameData();return combatProfile(this.session.player.equipment,d.items,d.affixes,d.itemSets,this.session.player.crafting);}
 private draw(o:Phaser.GameObjects.GameObject){this.objects.push(o);}
 private render():void{
  this.objects.forEach(o=>o.destroy());this.objects=[];
  const p=this.session.vault!,r=p.run,d=loadGameData(),profile=this.profile();
  this.draw(text(this,44,76,`通关 ${p.clears} · 提前撤离 ${p.retreats} · 档案残页 ${p.pages} · 生命 ${Math.ceil(this.session.player.hp)}/${profile.maxHp} · 魔力 ${Math.floor(this.session.player.mana??profile.maxMana)}/${profile.maxMana}`,16,'#b2cbd1'));
  this.draw(panel(this,28,112,1224,510,0));
  if(!r){
   this.draw(text(this,52,139,vaultUnlocked(this.session)?'两个侧翼，自选顺序；每次胜利后决定档案的命运':'完成第三章「灰烬之路的哨兵」后解锁',23,'#b9e1eb'));
   this.draw(text(this,52,198,'书库与水闸 → 各选封存或搜掠 → 封冻中枢 → 终匣结算。\n封存压住潮位；搜掠增加残页与金币，却提高后续潮位、增援与冰潮频率。\n两翼都处理后才能挑战 Boss；高潮位会使第二侧翼和 Boss 更危险。\n完成侧翼后可 R 二次确认提前撤离，只获少量经验/金币，不得残页、不计通关。\n终匣奖励 2–4 残页；每 3 残页兑换一件学者套装。进入不免费回血，建议护甲、技能和药剂。',17,'#b2cbd1').setLineSpacing(8));
   this.draw(text(this,52,369,expeditionPreparation(this.session),15,'#e9d59e'));
   VAULT_GEAR.forEach((id,i)=>this.draw(button(this,235+(i%3)*400,420+Math.floor(i/3)*55,355,`${i+1} ${this.pendingGear===id?'确认：':''}${d.items.find(x=>x.id===id)!.name} · 3 残页`,()=>this.digit(i))));
   this.draw(button(this,270,556,380,'E  开始档案远征',()=>this.interact()));
  }else{
   const reward=vaultReward(r);
   this.draw(text(this,52,140,`${VAULT_NAMES[r.room]} · 潮位 ${vaultTide(r)}/4 · 两翼 ${r.decisions.length}/2 · 终匣 ${reward.pages} 残页 / ${reward.gains.gold} 金币`,24,'#b9e1eb'));
   const pending=r.room!=='hub'&&VAULT_WINGS.includes(r.room as VaultWing)&&r.cleared.includes(r.room as VaultWing);
   const history=r.decisions.map(x=>`${VAULT_NAMES[x.wing]}：${x.choice==='seal'?'封存':'搜掠'}`).join(' / ');
   this.draw(text(this,52,190,history||'尚未决定档案的命运。',16,'#d2d6b9'));
   if(r.room==='hub'){
    this.draw(text(this,52,239,'选择尚未清理的侧翼。两翼都处理后，中枢开放。\n封存：抵消该侧翼的潮位上升；搜掠：潮位 +2，终匣 +1 残页、+80 经验/金币。\n潮位 ≥2 加入增援；≥4 Boss 再加一只霜狼，冰潮更频繁。\nR 可提前结算少量收益；L 只暂离，保留进度，不发奖。',17,'#b2cbd1').setLineSpacing(10));
    VAULT_WINGS.forEach((wing,i)=>this.draw(button(this,280+i*420,425,380,`${i+1} ${VAULT_NAMES[wing]}${r.cleared.includes(wing)?' ✓':''}`,()=>this.digit(i))));
    this.draw(button(this,1080,425,280,`${r.decisions.length===2?'E':'锁定'} 封冻中枢`,()=>this.interact()));
    if(r.decisions.length)this.draw(button(this,340,505,520,this.armed==='retreat'?'R  再次确认提前撤离':'R  提前撤离：仅少量经验/金币，无残页',()=>this.endRun('retreat')));
   }else if(pending){
    this.draw(text(this,52,242,'战斗已结束，必须选择一次：\n封存档案：抵消本侧翼潮位，不增加搜掠奖励。\n搜掠档案：潮位总计 +2，提高后续战斗风险，最终额外 +1 残页和 +80 经验/金币。\n选择后返回回廊，不可反悔；刷新不会重复选择。',18,'#b2cbd1').setLineSpacing(12));
    this.draw(button(this,300,435,460,'1  封存 · 控制潮位',()=>this.digit(0)));
    this.draw(button(this,900,435,460,'2  搜掠 · 更高风险与收益',()=>this.digit(1)));
   }else if(r.room==='exit'){
    this.draw(text(this,52,255,`最终宝匣：${reward.gains.exp} 经验 / ${reward.gains.gold} 金币 / ${reward.pages} 档案残页。\n击杀不单独发放经验、金币、掉落或任务进度；按 E 领取才计通关。`,20,'#b2cbd1').setLineSpacing(14));
    this.draw(button(this,350,430,520,'E  领取终匣并结束远征',()=>this.interact()));
   }else{
    this.draw(text(this,52,249,'本室敌人：'+vaultEnemies(r,d.enemies).map(e=>e.name).join(' / ')+(r.room==='boss'?'\n霜潮封线：蓝色纵向冰潮预警，离开封锁带或闪避。':''),18,'#b2cbd1').setLineSpacing(14));
    this.draw(button(this,320,425,460,'E  开始本室战斗',()=>this.interact()));
   }
   this.draw(button(this,1020,556,400,this.armed==='abandon'?'X  再次确认放弃':'X  放弃未结算收益',()=>this.endRun('abandon')));
  }
  this.draw(button(this,650,556,300,'L  暂离 / 返回地表',()=>this.leave()));
  this.draw(button(this,280,682,310,`H  治疗 ×${this.session.world.getItemCount('health_potion')}`,()=>this.supply('health_potion')));
  this.draw(button(this,650,682,310,`M  回魔 ×${this.session.world.getItemCount('mana_potion')}`,()=>this.supply('mana_potion')));
  this.draw(button(this,1040,682,240,'K  保存 / 重试',()=>this.saveCheckpoint()));
 }
 private digit(index:number):void{
  if(this.busy||audio.panelOpen)return;const p=this.session.vault!,r=p.run;this.armed=null;
  if(r){
   if(index>1)return;
   const ok=r.room==='hub'?enterVaultRoom(r,VAULT_WINGS[index]):chooseVault(r,index===0?'seal':'loot');
   if(!ok){this.message.setText('先清理本室，或选择尚未处理的侧翼。');return;}
   this.saveCheckpoint();this.render();return;
  }
  const id=VAULT_GEAR[index];if(!id)return;
  if(this.pendingGear!==id){this.pendingGear=id;this.render();this.message.setText('再次选择同一件确认兑换，离开或开始远征取消预选。');return;}
  this.pendingGear=null;if(!exchangeVault(this.session,id)){this.message.setText('兑换失败：需已解锁、无活动远征且至少 3 残页。');this.render();return;}
  const saved=this.saveCheckpoint();this.render();this.message.setText(saved?'兑换成功，装备已入背包并保存':'已兑换，但保存失败；请勿刷新，按 K 重试');
 }
 private interact():void{
  if(this.busy||audio.panelOpen)return;this.pendingGear=null;this.armed=null;const p=this.session.vault!;
  if(!p.run){if(!startVault(this.session)){this.message.setText('需完成第三章、回到营地十格内，并结束其他活动挑战。');return;}this.saveCheckpoint();this.render();return;}
  const r=p.run;
  if(r.room==='exit'){if(claimVault(this.session)){const saved=this.saveCheckpoint();this.render();this.message.setText(saved?'终匣奖励已结算保存':'奖励已结算但保存失败；请勿刷新，按 K 重试');}return;}
  if(r.room==='hub'){if(!enterVaultRoom(r,'boss')){this.message.setText('请先完成两个侧翼及封存/搜掠选择。');return;}this.saveCheckpoint();this.render();return;}
  if(r.cleared.includes(r.room as VaultWing)){this.message.setText('请按 1 封存或 2 搜掠。');return;}
  if(!this.saveCheckpoint())return;
  const enemies=vaultEnemies(r,loadGameData().enemies);this.busy=true;
  this.scene.start('TestRoomScene',{encounter:{spawnKey:`vault:${r.id}:${r.room}`,enemyIds:enemies.map(e=>e.id),vault:{id:r.id,room:r.room}}});
 }
 private endRun(kind:'retreat'|'abandon'):void{
  if(this.busy||audio.panelOpen)return;const p=this.session.vault!,r=p.run;if(!r)return;
  if(kind==='retreat'&&(r.room!=='hub'||!r.decisions.length)){this.message.setText('需在侧翼处理完毕后的回廊才能提前撤离。');return;}
  if(this.armed!==kind){this.armed=kind;this.render();this.message.setText('再次按相同按键确认；原有残页保留。');return;}
  if(kind==='retreat')retreatVault(this.session);else p.run=null;
  this.armed=null;this.saveCheckpoint();this.render();
 }
 private supply(id:'health_potion'|'mana_potion'):void{
  if(this.busy||audio.panelOpen)return;const d=loadGameData(),p=this.profile(),result=useConsumable(this.session,d.items.find(i=>i.id===id)!,p,{hp:this.session.player.hp,mana:this.session.player.mana??p.maxMana});
  if(!result.ok){this.message.setText(result.message);return;}
  this.session.player.hp=result.hp;this.session.player.mana=result.mana;this.armed=null;const saved=this.saveCheckpoint();this.render();this.message.setText(result.message+(saved?' · 已保存':' · 保存失败，按 K 重试'));
 }
 private leave():void{if(this.busy||audio.panelOpen)return;this.pendingGear=null;this.armed=null;if(!this.saveCheckpoint()){this.render();return;}this.busy=true;this.scene.start('OverworldScene');}
}
