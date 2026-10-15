import { Actor } from './Actor';
import { calculateDamage, type Element } from './damage';
import type { SkillDef } from '../data/schema';
import type { SkillCombatDef } from '../skills/combatTypes';
import type { ComboDef } from '../skills/skillTree';
import type { CombatProfile } from './profile';
import { Rng } from '../core/Rng';

export interface CombatTarget {
  id: string; x: number; y: number; actor: Actor; defense: number; element?: Element;
  boss?: boolean; elite?: boolean; controlImmune?: boolean;
}
interface Debuff { burnMs:number; burnDps:number; burnClock:number; slowMs:number; slow:number; stunMs:number; shredMs:number; shred:number }
interface Buff { id:string; left:number; effect:SkillCombatDef; shield:number; retaliated:boolean; deathPrevented:boolean; healPerHit?:number; fireReflect?:number }
export interface CombatTrap { x:number;y:number;radius:number;left:number;skill:SkillDef }
export interface CastResult { ok:boolean; reason?:'unknown'|'locked'|'passive'|'cooldown'|'busy'|'mana'|'stamina'|'dead'|'no-target'; skill?:SkillDef; targets:CombatTarget[]; combo?:ComboDef; center?:{x:number;y:number} }
export type HitCallback=(target:CombatTarget,damage:number)=>number;
const blankDebuff=():Debuff=>({burnMs:0,burnDps:0,burnClock:0,slowMs:0,slow:0,stunMs:0,shredMs:0,shred:0});
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** Phaser-independent combat rules. All outgoing damage goes through one settlement callback. */
export class CombatRuntime {
  mana:number; stamina:number;
  readonly cooldowns=new Map<string,number>();
  readonly debuffs=new Map<string,Debuff>();
  readonly traps:CombatTrap[]=[];
  readonly buffs:Buff[]=[];
  globalCooldownMs=0;
  basicCooldownMs=0;
  elapsedMs=0;
  lastSkill:{id:string;at:number}|null=null;
  lastCombo:string|null=null;
  dodgeCooldownMs=0;
  dashCooldownMs=0;
  nextBasicCritical=false;
  dashAttackLeftMs=0;
  private rng:Rng;
  private skillById:Map<string,SkillDef>;
  readonly learned:Set<string>;
  onDamage:HitCallback;
  constructor(readonly actor:Actor,readonly profile:CombatProfile,skills:readonly SkillDef[],learned:readonly string[],readonly combos:readonly ComboDef[],seed=1){
    this.mana=profile.maxMana;this.stamina=profile.maxStamina;this.rng=new Rng(seed);this.learned=new Set(learned);this.skillById=new Map(skills.map(s=>[s.id,s]));
    this.onDamage=(t,n)=>t.actor.receiveDamage(n);
  }
  private n(key:string):number{return this.profile.bonuses[key]??0;}
  private passive(key:'staminaRegen'|'critChanceBonus'|'damageReduction'):number{return [...this.learned].reduce((sum,id)=>{const c=this.skillById.get(id)?.combat;return sum+(c?.kind==='passive'?(c[key]??0):0);},0);}
  private heal(amount:number):void{if(!this.actor.isDead)this.actor.heal(Math.max(0,amount)*(1+this.n('healingReceived')/100));}
  private buffMax(key:'damageReduction'|'speedBoost'|'attackBoost'|'dodgeBonus'):number{return Math.max(0,...this.buffs.filter(b=>b.left>0).map(b=>b.effect[key]??0));}
  get speedMultiplier():number{return this.profile.speedMultiplier*(1+this.buffMax('speedBoost'));}
  get shield():number{return this.buffs.filter(b=>b.left>0).reduce((sum,b)=>sum+b.shield,0);}
  status(target:CombatTarget):Readonly<Debuff>{return this.debuffs.get(target.id)??blankDebuff();}
  getSpeedMultiplier(target:CombatTarget):number{const d=this.status(target);return d.stunMs>0?0:1-(d.slowMs>0?d.slow:0);}
  isStunned(target:CombatTarget):boolean{return this.status(target).stunMs>0;}
  tick(deltaMs:number,targets:readonly CombatTarget[]):void{
    const dt=clamp(Number.isFinite(deltaMs)?deltaMs:0,0,250);
    this.elapsedMs+=dt;this.actor.tick(dt);this.dashAttackLeftMs=Math.max(0,this.dashAttackLeftMs-dt);
    this.globalCooldownMs=Math.max(0,this.globalCooldownMs-dt);this.basicCooldownMs=Math.max(0,this.basicCooldownMs-dt);
    this.dodgeCooldownMs=Math.max(0,this.dodgeCooldownMs-dt);this.dashCooldownMs=Math.max(0,this.dashCooldownMs-dt);
    for(const [id,cd]of this.cooldowns)this.cooldowns.set(id,Math.max(0,cd-dt));
    if(!this.actor.isDead){
      this.mana=Math.min(this.profile.maxMana,this.mana+this.profile.manaRegen*dt/1000);
      this.stamina=Math.min(this.profile.maxStamina,this.stamina+(this.profile.staminaRegen+this.passive('staminaRegen'))*dt/1000);
    }
    for(let i=this.buffs.length-1;i>=0;i--){const b=this.buffs[i];this.heal(this.actor.maxHp*(b.effect.regenFraction??0)*Math.min(dt,b.left)/1000);b.left-=dt;if(b.left<=0)this.buffs.splice(i,1);}
    for(const target of targets){
      const d=this.debuffs.get(target.id);if(!d)continue;
      const burning=Math.min(dt,d.burnMs);d.burnMs=Math.max(0,d.burnMs-dt);d.slowMs=Math.max(0,d.slowMs-dt);d.stunMs=Math.max(0,d.stunMs-dt);d.shredMs=Math.max(0,d.shredMs-dt);
      if(burning>0 && !target.actor.isDead){d.burnClock+=burning;while(d.burnClock>=500 && !target.actor.isDead){this.onDamage(target,Math.max(1,Math.round(d.burnDps*.5)));d.burnClock-=500;}}
      if(!d.burnMs && !d.slowMs && !d.stunMs && !d.shredMs)this.debuffs.delete(target.id);
    }
    for(let i=this.traps.length-1;i>=0;i--){const t=this.traps[i];t.left-=dt;
      const near=targets.filter(e=>!e.actor.isDead && Math.hypot(e.x-t.x,e.y-t.y)<=t.radius);
      if(t.left>0 && near.length){for(const e of near)this.hit(e,t.skill);this.traps.splice(i,1);}else if(t.left<=0)this.traps.splice(i,1);
    }
  }
  tryDodge():boolean{
    if(this.actor.isDead||this.dodgeCooldownMs>0||this.stamina<24)return false;
    this.stamina-=24;this.dodgeCooldownMs=700;
    this.actor.grantInvulnerability(300+clamp(this.n('invulnDuration'),0,250));return true;
  }
  tryDash():boolean{
    if(this.actor.isDead||this.actor.isStaggered||this.dashCooldownMs>0||this.stamina<15)return false;
    this.stamina-=15;this.dashCooldownMs=1000;if(this.n('dashAttackBonus')>0)this.dashAttackLeftMs=2000;return true;
  }
  canCast(id:string):CastResult['reason']|undefined{
    const skill=this.skillById.get(id);
    if(this.actor.isDead)return 'dead';if(!skill?.combat)return 'unknown';if(!this.learned.has(id))return 'locked';if(skill.combat.kind==='passive')return 'passive';
    if((this.cooldowns.get(id)??0)>0)return 'cooldown';if(this.globalCooldownMs>0||(this.actor.isStaggered&&id!=='purify'))return 'busy';
    if(this.mana<(skill.manaCost??0))return 'mana';if(this.stamina<Math.max(0,skill.combat.staminaCost??0))return 'stamina';
  }
  private select(effect:SkillCombatDef,origin:{x:number;y:number},direction:{x:number;y:number},targets:readonly CombatTarget[],preferredId?:string):{hits:CombatTarget[];center:{x:number;y:number}}{
    const living=targets.filter(e=>!e.actor.isDead);
    if(effect.kind==='nova')return{hits:living.filter(e=>Math.hypot(e.x-origin.x,e.y-origin.y)<=(effect.radius??120)),center:origin};
    if(effect.kind==='buff'||effect.kind==='heal'||effect.kind==='passive'||effect.kind==='trap')return{hits:[],center:origin};
    const norm=Math.hypot(direction.x,direction.y)||1;
    const front=living.filter(e=>{const dx=e.x-origin.x,dy=e.y-origin.y,dist=Math.hypot(dx,dy);return dist<=(effect.range??100)&&(dist<24||(dx*direction.x+dy*direction.y)/norm/dist>.4);}).sort((a,b)=>Number(b.id===preferredId)-Number(a.id===preferredId) || Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
    if(!front.length)return{hits:[],center:origin};
    if(effect.kind==='blast')return{hits:living.filter(e=>Math.hypot(e.x-front[0].x,e.y-front[0].y)<=(effect.radius??100)),center:front[0]};
    if(effect.kind==='bolt' && effect.radius){const first=front[0];const others=living.filter(e=>e!==first && Math.hypot(e.x-first.x,e.y-first.y)<=effect.radius!).sort((a,b)=>Math.hypot(a.x-first.x,a.y-first.y)-Math.hypot(b.x-first.x,b.y-first.y));return{hits:[first,...others].slice(0,effect.targets??1),center:first};}
    return{hits:front.slice(0,effect.targets??99),center:front[0]};
  }
  cast(id:string,origin:{x:number;y:number},direction:{x:number;y:number},targets:readonly CombatTarget[],preferredId?:string):CastResult{
    const reason=this.canCast(id);if(reason)return{ok:false,reason,targets:[]};
    const skill=this.skillById.get(id)!,effect=skill.combat!;
    const selection=this.select(effect,origin,direction,targets,preferredId);
    if(['strike','bolt','blast'].includes(effect.kind)&&!selection.hits.length)return{ok:false,reason:'no-target',skill,targets:[]};
    this.mana-=skill.manaCost??0;this.stamina=clamp(this.stamina-(effect.staminaCost??0),0,this.profile.maxStamina);
    this.cooldowns.set(id,Math.max(400,(skill.cooldown??0)*1000*this.profile.cooldownMultiplier));this.globalCooldownMs=350;
    const combo=this.lastSkill && this.elapsedMs-this.lastSkill.at<=4000?this.combos.find(c=>c.skills.includes(id)&&c.skills.includes(this.lastSkill!.id)&&this.lastSkill!.id!==id&&c.skills.every(s=>this.learned.has(s))):undefined;
    this.lastSkill={id,at:this.elapsedMs};this.lastCombo=combo?.name??null;
    if(effect.healFraction)this.heal(this.actor.maxHp*effect.healFraction);
    if(effect.invulnerabilityMs)this.actor.grantInvulnerability(effect.invulnerabilityMs);
    if(id==='purify')this.actor.staggerLeftMs=0;
    if(effect.kind==='buff'){
      const old=this.buffs.findIndex(b=>b.id===id);if(old>=0)this.buffs.splice(old,1);
      this.buffs.push({id,left:effect.durationMs??5000,effect,shield:this.actor.maxHp*(effect.shieldFraction??0),retaliated:false,deathPrevented:false});
    }
    if(combo && (combo.effect.reflectFire||combo.effect.healPerHit)){
      const id=`combo-${combo.id}`,old=this.buffs.findIndex(b=>b.id===id);if(old>=0)this.buffs.splice(old,1);
      this.buffs.push({id,left:6000,effect:{kind:'buff',description:combo.name},shield:0,retaliated:false,deathPrevented:false,healPerHit:combo.effect.healPerHit,fireReflect:combo.effect.reflectFire});
    }
    if(effect.kind==='trap'){
      const norm=Math.hypot(direction.x,direction.y)||1;
      this.traps.push({x:origin.x+direction.x/norm*(effect.range??60),y:origin.y+direction.y/norm*(effect.range??60),radius:effect.radius??90,left:effect.durationMs??8000,skill});
    }
    for(const target of selection.hits)this.hit(target,skill,combo);
    if(combo?.effect.aoeDamage){
      for(const target of targets.filter(e=>!e.actor.isDead&&Math.hypot(e.x-selection.center.x,e.y-selection.center.y)<=150))this.onDamage(target,combo.effect.aoeDamage);
    }
    if(skill.branch==='arcane'&&this.n('spellNextCrit')>0)this.nextBasicCritical=true;
    return{ok:true,skill,targets:selection.hits,combo,center:selection.center};
  }
  basicAttack(origin:{x:number;y:number},direction:{x:number;y:number},targets:readonly CombatTarget[]):CombatTarget[]{
    if(this.actor.isDead||this.actor.isStaggered||this.globalCooldownMs>0||this.basicCooldownMs>0)return[];
    this.basicCooldownMs=this.profile.attackIntervalMs;
    const {hits}=this.select({kind:'strike',description:'普攻',range:this.profile.weaponRange},origin,direction,targets);
    const forceCritical=this.nextBasicCritical;
    for(const target of hits)this.hit(target,{id:'basic',name:'普通攻击',branch:'martial',tier:1,requires:[],element:'none',manaCost:0,cooldown:0,multiplier:1,cost:{skillPoints:0},combat:{kind:'strike',description:'普攻'}},undefined,forceCritical);
    if(hits.length)this.nextBasicCritical=false;
    return hits;
  }
  private hit(target:CombatTarget,skill:SkillDef,combo?:ComboDef,forceCritical=false):void{
    if(target.actor.isDead)return;
    const effect=skill.combat!,d=this.debuffs.get(target.id)??blankDebuff();
    const shred=Math.max(effect.armorShred??0,combo?.effect.defenseShred??0);
    if(shred>0){d.shred=Math.max(d.shred,shred);d.shredMs=Math.max(d.shredMs,effect.durationMs??5000);}
    this.debuffs.set(target.id,d);
    const critical=forceCritical||this.rng.next()<clamp(this.profile.critChance+this.passive('critChanceBonus'),0,.85);
    const element=(skill.element??'none') as Element;
    let boost=1+this.buffMax('attackBoost')+(this.dashAttackLeftMs>0?this.n('dashAttackBonus')/100:0);
    boost*=1+(this.n(skill.branch==='arcane'?'spellDamage':'meleeDamage')+(effect.kind==='bolt'?this.n('rangedDamage'):0))/100;
    boost*=1+(this.n(`${element}Damage`)+this.n(`${element}SkillDamage`))/100;
    boost*=1+this.n(target.boss?'bossDamage':target.elite?'eliteDamage':'_')/100;
    const damage=calculateDamage({attack:this.profile.attack*boost,multiplier:(skill.multiplier??1)*(combo?.effect.bonusDamageMultiplier??1),element,critical,criticalMultiplier:this.profile.critMultiplier},{defense:Math.max(0,target.defense-(d.shredMs>0?d.shred:0)-this.n('armorShred')),element:target.element});
    const applied=this.onDamage(target,damage);
    if(applied<=0)return;
    this.heal(applied*(this.profile.lifeSteal+(effect.lifeSteal??0))+this.buffs.reduce((n,b)=>n+(b.healPerHit??0),0));
    if(effect.slow){d.slow=Math.max(d.slow,effect.slow);d.slowMs=Math.max(d.slowMs,effect.durationMs??3000);}
    const immune=target.boss||target.elite||target.controlImmune;
    if(!immune)d.stunMs=Math.max(d.stunMs,effect.stunMs??0,(combo?.effect.stunSeconds??0)*1000);
    if(effect.burnFraction){d.burnDps=Math.max(d.burnDps,this.profile.attack*effect.burnFraction);d.burnMs=Math.max(d.burnMs,effect.durationMs??4000);}
    if(this.rng.next()<this.n('burnChance')/100){d.burnDps=Math.max(d.burnDps,this.profile.attack*.2);d.burnMs=Math.max(d.burnMs,3000);}
    if(!immune && this.rng.next()<this.n('freezeChance')/100)d.stunMs=Math.max(d.stunMs,600);
    if(!immune && this.rng.next()<this.n('shockChance')/100)d.stunMs=Math.max(d.stunMs,350);
  }
  receiveAttack(attack:number,element:Element,source?:CombatTarget):number{
    if(this.actor.isDead||this.actor.isInvulnerable)return 0;
    const dodge=clamp(this.profile.dodgeChance+this.buffMax('dodgeBonus'),0,.8);
    if(this.rng.next()<dodge)return 0;
    const resistance=clamp(this.n(`${element}Resist`)/100,0,.8);
    let damage=calculateDamage({attack,multiplier:1,element,critical:false},{defense:this.profile.defense,resistances:{[element]:resistance}});
    const reduction=clamp(this.buffMax('damageReduction')+this.passive('damageReduction'),0,.85);
    damage=Math.max(1,Math.round(damage*(1-reduction)));
    if(this.rng.next()<this.profile.blockChance)damage=Math.max(1,Math.round(damage*.5));
    for(const b of this.buffs){const absorbed=Math.min(damage,b.shield);damage-=absorbed;b.shield-=absorbed;if(damage<=0)break;}
    if(damage>=this.actor.hp){const will=this.buffs.find(b=>b.effect.preventDeath&&!b.deathPrevented);if(will){will.deathPrevented=true;damage=Math.max(0,this.actor.hp-1);}}
    const applied=damage>0?this.actor.receiveDamage(damage):0;
    if(source && !source.actor.isDead && (applied>0||damage===0)){
      const counter=this.buffs.find(b=>b.effect.retaliate&&!b.retaliated);
      if(counter){counter.retaliated=true;this.onDamage(source,Math.max(1,Math.round(this.profile.attack*counter.effect.retaliate!)));}
      const reflect=element==='fire'?Math.max(this.n('fireReflect'),...this.buffs.map(b=>b.fireReflect??0)):0;
      const reflected=Math.round(applied*reflect/100)+this.n('thorns');
      if(reflected>0&&!source.actor.isDead)this.onDamage(source,reflected);
    }
    return applied;
  }
}
