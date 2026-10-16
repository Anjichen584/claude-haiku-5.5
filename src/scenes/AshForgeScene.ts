import {expeditionPreparation} from '../dungeon/preparation';
import Phaser from 'phaser';
import {audio} from '../audio/AudioDirector';
import {panel,text,button} from '../ui/theme';
import {bufferSceneKeys,pressed} from '../input/bufferedKeys';
import {loadGameData} from '../data/loader';
import {combatProfile} from '../combat/profile';
import {getSession,persistSession} from '../state/sessionStore';
import {useConsumable} from '../state/consumables';
import type {GameSession} from '../state/session';
import {forgeDifficulty,newForge,startForge,moveForge,canMoveForge,forgeNeighbors,forgeUnlocked,forgeEnemies,isForgeCombat,operateValve,valveOrder,claimForge,exchangeForgeGear,forgeReward,FORGE_GEAR,FORGE_NAMES,FORGE_ROOMS,FORGE_EDGES,EMBER_PRICE,type ForgeRoom} from '../dungeon/ashForge';
const POS:Record<ForgeRoom,[number,number]>={entry:[125,245],hall:[340,245],valves:[555,245],cache:[770,160],boss:[985,245],exit:[1160,245]};
const VALVES=['赤铜','鎏金','青钢'];

export class AshForgeScene extends Phaser.Scene {
 private session!:GameSession;
 private objects:Phaser.GameObjects.GameObject[]=[];
 private message!:Phaser.GameObjects.Text;
 private keys!:Phaser.Input.Keyboard.Key[];
 private busy=false;
 private abandonArmed=false;
 private pendingGear:string|null=null;
 constructor(){super('AshForgeScene');}
 create():void{
  const s=getSession();if(!s){this.scene.start('TitleScene');return;}this.session=s;s.forge??=newForge();
  this.objects=[];this.busy=false;this.abandonArmed=false;this.pendingGear=null;
  this.cameras.main.setBackgroundColor('#201b20');
  const g=this.add.graphics();g.fillGradientStyle(0x30202a,0x30202a,0x57372a,0x57372a,1).fillRect(0,0,1280,720);
  for(let i=0;i<16;i++){g.lineStyle(1,0xeab26a,.08);g.lineBetween(i*100,0,i*100-300,720);}
  text(this,42,24,'灰烬熔炉 / 主题副本',30,'#f2ce92');
  this.message=text(this,42,642,'',14,'#f4c58e').setWordWrapWidth(1190);
  const kb=this.input.keyboard!;this.keys=['E','L','K','X','H','M',1,2,3,4,5,6,'C'].map(k=>kb.addKey(typeof k==='number'?48+k:k));bufferSceneKeys(this);this.render();
 }
 update():void{
  if(audio.panelOpen||this.busy)return;
  if(pressed(this.keys[0]))this.interact();
  if(pressed(this.keys[1]))this.leave();
  if(pressed(this.keys[2]))this.saveCheckpoint();
  if(pressed(this.keys[3]))this.abandon();
  if(pressed(this.keys[4]))this.supply('health_potion');
  if(pressed(this.keys[12]))this.startChallenge();
  if(pressed(this.keys[5]))this.supply('mana_potion');
  for(let i=0;i<6;i++)if(pressed(this.keys[6+i]))this.digit(i);
 }
 saveCheckpoint():boolean{const ok=persistSession(this.session);this.message.setText(ok?'副本检查点已保存':'保存失败，请勿刷新，按 K 重试');return ok;}
 private draw(o:Phaser.GameObjects.GameObject){this.objects.push(o);}
 private profile(){const d=loadGameData();return combatProfile(this.session.player.equipment,d.items,d.affixes,d.itemSets,this.session.player.crafting);}
 private render():void{
  this.objects.forEach(o=>o.destroy());this.objects=[];
  const p=this.session.forge!,r=p.run,profile=this.profile(),data=loadGameData();
  this.draw(text(this,44,73,`已通关 ${p.clears} 次（挑战 ${p.challengeClears??0}）· 副本余烬 ${p.embers} · 生命 ${Math.ceil(this.session.player.hp)}/${profile.maxHp} · 魔力 ${Math.floor(this.session.player.mana??profile.maxMana)}/${profile.maxMana}`,16,'#c9bba9'));
  if(!r){
   this.draw(panel(this,28,112,1224,510,0));
   this.draw(text(this,52,139,'路线、机关、精英与定向刷装',25,'#edc38d'));
   this.draw(text(this,52,192,forgeUnlocked(this.session)?'已解锁 · '+expeditionPreparation(this.session):'尚未解锁：完成第二章「灰烬之路」',17,'#cfbba0'));
   this.draw(text(this,52,228,'熔渣长廊 → 冷却阀室 → 炉心 Boss → 宝匣结算。\n阀门按提示顺序操作；误操作提高炉压，强化 Boss 攻击（最多 +9）。\n普通：直接路线 3 余烬 / 支库路线 5 余烬；清理支库使 Boss 生命降低 20%。\n挑战：普通宝匣结算后解锁，双火圈与增援；直接 6 / 支库 8 余烬，建议强化装备。\n只有打开最终宝匣才结算；战败或放弃失去本轮收益，已持有余烬保留。',16,'#bdaea3').setLineSpacing(6));
   this.draw(text(this,52,378,`房间补给：H 治疗 ×${this.session.world.getItemCount('health_potion')} / M 回魔 ×${this.session.world.getItemCount('mana_potion')} · 共享 8 秒药剂冷却，正常消耗背包`,15,'#c9bba9'));
   FORGE_GEAR.forEach((id,i)=>{
    const name=data.items.find(item=>item.id===id)!.name;
    this.draw(button(this,235+(i%3)*400,430+Math.floor(i/3)*55,355,`${i+1} ${this.pendingGear===id?'确认兑换：':''}${name} · ${EMBER_PRICE} 余烬`,()=>this.digit(i)));
   });
   this.draw(button(this,245,568,340,'E  开始普通远征',()=>this.interact()));
   this.draw(button(this,665,568,340,p.clears>0?'C  挑战模式 / 双焰与增援':'C  挑战模式（先通关普通）',()=>this.startChallenge()));
   this.draw(button(this,650,683,350,'L  返回地表',()=>this.leave()));
   this.draw(button(this,1090,568,260,'K  保存 / 重试',()=>this.saveCheckpoint()));
  }else{
   this.draw(panel(this,28,112,1224,235,0));this.draw(panel(this,28,365,1224,260,0));
   const lines=this.add.graphics().setDepth(20);this.draw(lines);
   for(const [a,b] of FORGE_EDGES){lines.lineStyle(3,0xb47952,.65);lines.lineBetween(...POS[a],...POS[b]);}
   for(const room of FORGE_ROOMS){const [x,y]=POS[room],selected=room===r.current,done=r.cleared.includes(room),can=canMoveForge(r,room);
    this.draw(this.add.circle(x,y,selected?24:20,selected?0xffca7b:done?0x788a65:can?0xa75d42:0x3a3335).setStrokeStyle(2,selected?0xffe4b8:0x9d7661).setDepth(30).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.move(room)));
    this.draw(text(this,x,y+32,FORGE_NAMES[room]+(done?' ✓':''),14,selected?'#ffe4b8':'#c7b3a1').setOrigin(.5,0));
   }
   const reward=forgeReward(r);
   this.draw(text(this,52,384,`${FORGE_NAMES[r.current]} · ${forgeDifficulty(r)==='challenge'?'挑战':'普通'} · 炉压 ${r.pressure}/3 · 完成后 ${reward.embers} 余烬`,23,'#edc38d'));
   let detail='点击下方相邻房间继续。';
   if(r.current==='entry')detail='从熔渣长廊开始。原地退出可保留本轮进度；药剂按 H/M 使用，正常消耗。';
   if(isForgeCombat(r.current)&&!r.cleared.includes(r.current))detail='本室敌人：'+forgeEnemies(r,data.enemies).map(e=>e.name).join(' / ')+(r.current==='boss'?(forgeDifficulty(r)==='challenge'?'\n挑战双焰：避开玩家与镜像双圈，并处理增援。':'\n炉心持续出现落火预警：离开火圈或闪避。')+(r.cleared.includes('cache')?'支库供给已破坏，Boss 生命降低 20%。':'未破坏支库供给，Boss 保持完整生命。'):'');
   if(r.current==='valves')detail=r.cleared.includes('valves')?'冷却阀已接通。可直达 Boss，或挑战军械支库换取额外收益并削弱 Boss。':`检修铭文：${valveOrder(r).map(i=>VALVES[i-1]).join(' → ')}\n已正确操作 ${r.valveStep}/3；错误会清空本次顺序并增加炉压。`;
   if(r.current==='exit')detail=`宝匣待领取：${reward.gains.exp} 经验、${reward.gains.gold} 金币、${reward.embers} 副本余烬。按 E 结算，结束本次远征。`;
   this.draw(text(this,52,431,detail,16,'#cbb8a6').setLineSpacing(8).setWordWrapWidth(1170));
   if(r.current==='valves'&&!r.cleared.includes('valves'))VALVES.forEach((name,i)=>this.draw(button(this,235+i*400,520,355,`${i+1}  操作${name}阀门`,()=>this.digit(i))));
   else this.draw(button(this,260,520,400,r.current==='exit'?'E  打开宝匣并结算':isForgeCombat(r.current)&&!r.cleared.includes(r.current)?'E  开始本室战斗':r.current==='entry'?'E  前往熔渣长廊':'E  当前房间已处理，选择路线',()=>this.interact()));
   forgeNeighbors(r.current).forEach((room,i)=>this.draw(button(this,235+i*400,587,355,`${canMoveForge(r,room)?'→':'锁定'} ${FORGE_NAMES[room]}`,()=>this.move(room))));
   this.draw(button(this,280,683,310,this.abandonArmed?'X  再次确认放弃未结算收益':'X  放弃本轮（需确认）',()=>this.abandon()));
   this.draw(button(this,650,683,350,'L  暂离地表，保留进度',()=>this.leave()));
   this.draw(button(this,1040,683,240,'K  保存 / 重试',()=>this.saveCheckpoint()));
  }
 }
 private move(room:ForgeRoom):void{
  if(this.busy||audio.panelOpen)return;const r=this.session.forge!.run;
  if(!r||!moveForge(r,room)){this.message.setText('路线尚未开放：先清理当前战斗、接通阀门，或击败 Boss。');return;}
  this.abandonArmed=false;this.saveCheckpoint();this.render();
 }
 private digit(index:number):void{
  if(this.busy||audio.panelOpen)return;const p=this.session.forge!,r=p.run;
  if(r){
   if(r.current!=='valves'||index>2)return;const outcome=operateValve(r,index+1);
   if(outcome==='blocked')return;this.abandonArmed=false;const saved=this.saveCheckpoint();this.render();
   this.message.setText((outcome==='wrong'?'误操作！顺序重置，炉压上升。':outcome==='complete'?'冷却阀接通，炉心路线已开放。':'阀门操作正确。')+(saved?' · 已保存':' · 保存失败，按 K 重试'));return;
  }
  const id=FORGE_GEAR[index];if(!id)return;
  if(this.pendingGear!==id){this.pendingGear=id;this.render();this.message.setText('再按相同数字键或同一按钮确认兑换；开始远征或离开会取消。');return;}
  this.pendingGear=null;
  if(!exchangeForgeGear(this.session,id)){this.render();this.message.setText('兑换失败：需在已解锁的营地、副本未开始，且至少持有 3 余烬。');return;}
  const saved=this.saveCheckpoint();this.render();this.message.setText(saved?'兑换成功，装备已进入背包并保存':'装备已兑换，但保存失败；请勿刷新，按 K 重试');
 }
 private startChallenge():void{
  if(this.busy||audio.panelOpen)return;
  this.pendingGear=null;
  if(!startForge(this.session,'challenge')){this.render();this.message.setText('挑战需先完成一次普通熔炉，且没有活动远征或试炼塔挑战。');return;}
  this.abandonArmed=false;this.saveCheckpoint();this.render();
 }
 private interact():void{
  if(this.busy||audio.panelOpen)return;this.pendingGear=null;const p=this.session.forge!;
  if(!p.run){if(!startForge(this.session)){this.render();this.message.setText('需完成第二章、结束试炼塔挑战，并位于营地商人十格内。');return;}this.saveCheckpoint();this.render();return;}
  const r=p.run;
  if(r.current==='entry'){this.move('hall');return;}
  if(r.current==='exit'){
   if(claimForge(this.session)){const saved=this.saveCheckpoint();this.render();this.message.setText(saved?'熔炉通关，奖励与余烬已结算保存':'奖励已结算，但保存失败；请勿刷新，按 K 重试');}return;
  }
  if(!isForgeCombat(r.current)||r.cleared.includes(r.current)){this.message.setText('选择相邻房间；阀门使用 1–3 操作。');return;}
  if(!this.saveCheckpoint())return;const enemies=forgeEnemies(r,loadGameData().enemies);
  this.busy=true;this.scene.start('TestRoomScene',{encounter:{spawnKey:`forge:${r.id}:${r.current}`,enemyIds:enemies.map(e=>e.id),forge:{id:r.id,room:r.current}}});
 }
 private supply(id:'health_potion'|'mana_potion'):void{
  if(this.busy||audio.panelOpen)return;const d=loadGameData(),p=this.profile(),result=useConsumable(this.session,d.items.find(i=>i.id===id)!,p,{hp:this.session.player.hp,mana:this.session.player.mana??p.maxMana});
  if(!result.ok){this.message.setText(result.message);return;}
  this.session.player.hp=result.hp;this.session.player.mana=result.mana;this.abandonArmed=false;const saved=this.saveCheckpoint();this.render();this.message.setText(result.message+(saved?' · 已保存':' · 保存失败，按 K 重试'));
 }
 private leave():void{if(this.busy||audio.panelOpen)return;this.pendingGear=null;this.abandonArmed=false;if(!this.saveCheckpoint()){this.render();return;}this.busy=true;this.scene.start('OverworldScene');}
 private abandon():void{
  if(this.busy||audio.panelOpen||!this.session.forge!.run)return;
  if(!this.abandonArmed){this.abandonArmed=true;this.render();this.message.setText('再次按 X 确认：丢失本轮未结算收益，原有余烬不受影响。');return;}
  this.session.forge!.run=null;this.abandonArmed=false;this.saveCheckpoint();this.render();
 }
}
