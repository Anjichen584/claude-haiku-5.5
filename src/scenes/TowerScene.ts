import {towerHazardRule} from '../tower/hazards';
import {towerLobbyProfile,useTowerSupply,nextTowerCheckpoint} from '../tower/supplies';
import Phaser from 'phaser';
import {audio} from '../audio/AudioDirector';
import {loadGameData} from '../data/loader';
import {getSession,persistSession} from '../state/sessionStore';
import type {GameSession} from '../state/session';
import {combatProfile} from '../combat/profile';
import {panel,text,button} from '../ui/theme';
import {bufferSceneKeys,pressed} from '../input/bufferedKeys';
import {newTower,startTower,boonChoices,chooseBoon,BOONS,towerEnemies,towerReward,towerRule,canCashOut,cashOutTower,TOWER_FLOORS} from '../tower/run';

/** A short inter-floor hub. All combat remains in the existing action battle scene. */
export class TowerScene extends Phaser.Scene {
 private session!:GameSession;
 private objects:Phaser.GameObjects.GameObject[]=[];
 private message!:Phaser.GameObjects.Text;
 private keys!:Phaser.Input.Keyboard.Key[];
 private busy=false;
 private abandonArmed=false;
 constructor(){super('TowerScene');}
 create():void{
  const s=getSession();if(!s){this.scene.start('TitleScene');return;}this.session=s;
  s.tower??=newTower();this.busy=false;this.abandonArmed=false;this.objects=[];
  this.cameras.main.setBackgroundColor('#091a26');
  const g=this.add.graphics();g.fillGradientStyle(0x14273e,0x14273e,0x254b48,0x254b48,1).fillRect(0,0,1280,720);
  for(let i=0;i<9;i++){g.lineStyle(2,0x779b9a,.15);g.strokeRect(460+i*17,110+i*22,360-i*34,550-i*44);}
  text(this,48,30,'裂隙试炼塔',32,'#efd5a0');
  text(this,48,79,'30 层行动试炼 · 临时构筑 · 五层撤离节点 · 战败失去未结算奖励',16,'#b1c8bf');
  this.message=text(this,48,665,'',15,'#e8c68a');
  const kb=this.input.keyboard!;this.keys=['E','L','K','1','2','3','X','H','M'].map(k=>kb.addKey(/^[1-3]$/.test(k)?k.charCodeAt(0):k));bufferSceneKeys(this);
  this.render();
 }
 update():void{
  if(audio.panelOpen||this.busy)return;
  if(pressed(this.keys[0]))this.fight();
  if(pressed(this.keys[1]))this.leave();
  if(pressed(this.keys[2]))this.saveCheckpoint();
  for(let i=0;i<3;i++)if(pressed(this.keys[3+i]))this.choose(i);
  if(pressed(this.keys[6]))this.abandon();
  if(pressed(this.keys[7]))this.useSupply(0);
  if(pressed(this.keys[8]))this.useSupply(1);
 }
 saveCheckpoint():boolean{
  const ok=persistSession(this.session);this.message.setText(ok?'检查点已保存。':'保存失败：请勿刷新，按 K 重试。');return ok;
 }
 private draw(obj:Phaser.GameObjects.GameObject):void{this.objects.push(obj);}
 private render():void{
  this.objects.forEach(o=>o.destroy());this.objects=[];
  const p=this.session.tower!,r=p.run,profile=towerLobbyProfile(this.session);
  this.draw(panel(this,32,118,1216,510,0));
  this.draw(text(this,62,144,`历史最高 ${p.best}/${TOWER_FLOORS} 层 · 挑战次数 ${p.attempts}`,17,'#c6cdb1'));
  if(!r){
   this.draw(text(this,62,208,'准备好迎接下一次裂隙试炼了吗？',25,'#efd5a0'));
   this.draw(text(this,62,262,'建议 Lv.5 以上、准备装备与药剂。每层胜利后三选一临时强化。\n每 5 层精英，每 10 层 Boss；奖励仅在每五层节点撤离领取。\n战败或放弃会失去全部未结算奖励，最高层记录保留。\n药剂消耗沿用背包；进入时不免费恢复生命或魔力。\n刷新恢复当前层战前检查点，不重抽敌人与强化。',18,'#b3c8bf').setLineSpacing(14));
   this.draw(text(this,62,452,`生命 ${Math.ceil(this.session.player.hp)}/${profile.maxHp} · 魔力 ${Math.floor(this.session.player.mana??profile.maxMana)}/${profile.maxMana} · H/M 可先补给，正常消耗药剂`,16,'#b3c8bf'));
   this.draw(button(this,270,542,340,'E  开始挑战',()=>this.fight()));
  }else{
   const reward=towerReward(r.cleared),floor=r.cleared+1;
   this.draw(text(this,62,193,r.phase==='complete'?'登顶成功 · 30 层完成':`已通过 ${r.cleared} 层 · 下一层 ${floor}${floor%10===0?' / Boss':floor%5===0?' / 精英':''}`,25,'#efd5a0'));
   const checkpoint=canCashOut(r)?'当前可撤离结算':`下个结算点：${nextTowerCheckpoint(r.cleared)} 层`;
   const hazard=towerHazardRule(floor);
   this.draw(text(this,62,238,`暂存：${reward.exp} 经验 / ${reward.gold} 金币 / ${reward.items.length} 碎片\n生命 ${Math.ceil(this.session.player.hp)}/${profile.maxHp} · 魔力 ${Math.floor(this.session.player.mana??profile.maxMana)}/${profile.maxMana} · ${checkpoint}\n${r.phase==='complete'?'登顶成功，请撤离领取奖励':towerRule(floor)+(hazard?` · 场地机制：${hazard.name}`:'')}`,16,'#b3c8bf').setLineSpacing(7));
   if(r.phase==='boon'){
    this.draw(text(this,62,316,'选择一项本次挑战限定强化：',18,'#e5d6ad'));
    boonChoices(r).forEach((id,i)=>{const b=BOONS.find(b=>b.id===id)!;
     this.draw(button(this,242+i*398,390,362,`${i+1}  ${b.name} · ${b.description}`,()=>this.choose(i)));
    });
   }else if(r.phase==='ready'){
    const data=loadGameData(),wave=towerEnemies(r,data.enemies);
    this.draw(text(this,62,319,'本层敌人：'+wave.map(e=>e.name).join(' / '),18,'#c7d0c0'));
    this.draw(button(this,270,390,340,'E  挑战下一层',()=>this.fight()));
   }
   const counts=BOONS.map(b=>`${b.name} ×${r.boons.filter(id=>id===b.id).length}`).join(' · ');
   this.draw(text(this,62,463,counts,16,'#b3c8bf'));
   this.draw(button(this,280,552,410,canCashOut(r)?'L  撤离结算（结束本次挑战）':'L  暂离地表（保留试炼进度）',()=>this.leave()));
   if(!canCashOut(r))this.draw(button(this,710,552,340,this.abandonArmed?'X  再次确认放弃全部暂存奖励':'X  放弃本次挑战',()=>this.abandon()));
  }
  this.draw(button(this,250,502,350,`H  治疗药剂 ×${this.session.world.getItemCount('health_potion')}`,()=>this.useSupply(0)));
  this.draw(button(this,670,502,350,`M  魔力药剂 ×${this.session.world.getItemCount('mana_potion')}`,()=>this.useSupply(1)));
  this.draw(button(this,1050,552,260,'K  保存 / 重试',()=>this.saveCheckpoint()));
  if(!r)this.draw(button(this,690,542,340,'L  返回地表',()=>this.leave()));
 }
 private useSupply(index:number):void{
  if(this.busy||audio.panelOpen)return;
  const result=useTowerSupply(this.session,index?'mana_potion':'health_potion');
  if(result.ok){this.abandonArmed=false;audio.play('pickup');const saved=this.saveCheckpoint();this.render();this.message.setText(result.message+(saved?' · 已保存':' · 保存失败，请勿刷新，按 K 重试'));}
  else this.message.setText(result.message);
 }
 private choose(index:number):void{
  if(this.busy||audio.panelOpen)return;const r=this.session.tower!.run;if(!r||r.phase!=='boon')return;
  const id=boonChoices(r)[index];if(!id||!chooseBoon(r,id))return;
  this.abandonArmed=false;this.saveCheckpoint();this.render();
 }
 private fight():void{
  if(this.busy||audio.panelOpen)return;const p=this.session.tower!;
  if(!p.run&&!startTower(p))return;
  const r=p.run!;if(r.phase!=='ready'){this.message.setText('请先选择强化，或在登顶后撤离。');return;}
  if(!this.saveCheckpoint()){this.render();return;}
  const data=loadGameData(),wave=towerEnemies(r,data.enemies);
  this.busy=true;this.scene.start('TestRoomScene',{encounter:{spawnKey:`tower:${r.id}:${r.cleared+1}`,enemyIds:wave.map(e=>e.id),tower:{id:r.id,floor:r.cleared+1}}});
 }
 private leave():void{
  if(this.busy||audio.panelOpen)return;
  const r=this.session.tower!.run;
  if(r&&canCashOut(r))cashOutTower(this.session);
  this.clampVitals();
  if(!this.saveCheckpoint()){this.render();return;}
  this.busy=true;this.scene.start('OverworldScene',{retreated:false});
 }
 private abandon():void{
  if(this.busy||audio.panelOpen||!this.session.tower!.run)return;
  if(canCashOut(this.session.tower!.run!)){this.message.setText('当前是结算节点，请按 L 撤离领取奖励。');return;}
  if(!this.abandonArmed){this.abandonArmed=true;this.render();this.message.setText('再次按 X 确认放弃；选择强化或离开可取消。');return;}
  this.session.tower!.run=null;this.clampVitals();this.saveCheckpoint();this.abandonArmed=false;this.render();
 }
 private clampVitals():void{
  const d=loadGameData(),p=combatProfile(this.session.player.equipment,d.items,d.affixes,d.itemSets,this.session.player.crafting);
  this.session.player.hp=Math.min(this.session.player.hp,p.maxHp);
  if(this.session.player.mana!==undefined)this.session.player.mana=Math.min(this.session.player.mana,p.maxMana);
 }
}
