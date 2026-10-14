import Phaser from 'phaser';
import { UI } from './theme';
import type { SkillDef } from '../data/schema';
import type { CombatRuntime } from '../combat/CombatRuntime';
/** The same slots are driven by clicks and number keys. */
export class BattleHotbar {
 private slots:{bg:Phaser.GameObjects.Rectangle;status:Phaser.GameObjects.Text}[]=[];
 private effects:Phaser.GameObjects.Text;
 private resources:Phaser.GameObjects.Text;
 constructor(scene:Phaser.Scene,private skills:readonly SkillDef[],private runtime:CombatRuntime,cast:(i:number)=>void){
  this.effects=scene.add.text(762,98,'',{fontFamily:UI.font,fontSize:11,color:'#d9c48d'}).setDepth(210);
  this.resources=scene.add.text(762,78,'',{fontFamily:UI.font,fontSize:13,color:'#b4cdb5'}).setDepth(210);
  skills.forEach((skill,i)=>{
   const x=354+i*152,y=552;
   const bg=scene.add.rectangle(x,y,142,48,0x142d32,.96).setStrokeStyle(1,0x9eaa7e).setDepth(210).setInteractive({useHandCursor:true});
   scene.add.text(x-61,y-17,`${i+1}  ${skill.name}`,{fontFamily:UI.font,fontSize:14,color:'#e2d6b3'}).setDepth(211);
   const status=scene.add.text(x-61,y+4,'',{fontFamily:UI.font,fontSize:11,color:'#93b7a3'}).setDepth(211);
   bg.on('pointerdown',()=>cast(i));this.slots.push({bg,status});
  });
  if(!skills.length)scene.add.text(640,548,'尚未装配技能 · 返回地表按 G 学习与装配',{fontFamily:UI.font,fontSize:14,color:'#c1c9aa',backgroundColor:'#122e30',padding:{x:14,y:9}}).setOrigin(.5).setDepth(210);
 }
 update():void{
  const r=this.runtime;this.effects.setText([r.profile.bonuses.fireReflect?`套装火焰反伤 ${r.profile.bonuses.fireReflect}%`:'',r.nextBasicCritical?'下次普攻必暴':'',r.dashAttackLeftMs>0?`冲刺增伤 ${(r.dashAttackLeftMs/1000).toFixed(1)}s`:''].filter(Boolean).join(' · '));this.resources.setText(`魔力 ${Math.floor(r.mana)}/${r.profile.maxMana}    耐力 ${Math.floor(r.stamina)}/${r.profile.maxStamina}${r.shield>0?`    护盾 ${Math.ceil(r.shield)}`:''}`);
  this.slots.forEach((slot,i)=>{
   const s=this.skills[i],cd=r.cooldowns.get(s.id)??0,reason=r.canCast(s.id);
   slot.status.setText(cd>0?`冷却 ${(cd/1000).toFixed(1)}s`:`${s.manaCost??0} 魔力 · ${Math.max(0,s.combat?.staminaCost??0)} 耐力`);
   slot.bg.setFillStyle(reason?0x172d30:0x2d4a40).setStrokeStyle(1,reason?0x49635e:0xd3c18c);
  });
 }
}
