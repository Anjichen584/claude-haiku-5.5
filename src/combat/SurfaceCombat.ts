import {Actor} from './Actor';
import {CombatRuntime, type CombatTarget} from './CombatRuntime';
import type {CombatProfile} from './profile';
import {enemyTactics} from './enemyTactics';
import type {Element} from './damage';
import type {EnemyDef, SkillDef} from '../data/schema';
import type {ComboDef} from '../skills/skillTree';
import type {SurfaceSpawn} from '../world/encounters';

export interface SurfaceEnemy extends CombatTarget {
  def: EnemyDef; spawn: SurfaceSpawn; slot: number; homeX: number; homeY: number;
  cooldown: number; windup: number; aimX: number; aimY: number; engaged: boolean;
}
export const surfaceMemberKey=(spawn:string,slot:number)=>`surface-member:${spawn}:${slot}`;
export interface SurfaceInput {x:number;y:number;safe:boolean;protected:boolean}
/** World coordinates are pixels. One runtime owns all nearby packs, not one battle per pack. */
export class SurfaceCombat {
  readonly enemies=new Map<string,SurfaceEnemy>();
  readonly runtime:CombatRuntime;
  onHit:(enemy:SurfaceEnemy,damage:number)=>void=()=>{};
  onKill:(enemy:SurfaceEnemy)=>void=()=>{};
  onHurt:(damage:number)=>void=()=>{};
  constructor(profile:CombatProfile,skills:readonly SkillDef[],learned:readonly string[],combos:readonly ComboDef[],hp:number,mana:number){
    const actor=new Actor({maxHp:profile.maxHp,staggerMs:100});actor.hp=Math.max(1,Math.min(hp,profile.maxHp));
    this.runtime=new CombatRuntime(actor,profile,skills,learned,combos,20261015);
    this.runtime.mana=Math.min(mana,profile.maxMana);
    this.runtime.onDamage=(target,amount)=>{
      const enemy=this.enemies.get(target.id);if(!enemy)return 0;
      const applied=enemy.actor.receiveDamage(amount);
      if(applied>0){enemy.engaged=true;if(enemy.actor.isStaggered)enemy.windup=0;this.onHit(enemy,applied);if(enemy.actor.isDead)this.onKill(enemy);}
      return applied;
    };
  }
  syncProfile(profile:CombatProfile,learned:readonly string[],hp:number,mana:number):void{
    Object.assign(this.runtime.profile,profile);
    this.runtime.actor.setMaxHp(profile.maxHp);
    this.runtime.actor.hp=Math.max(0,Math.min(hp,profile.maxHp));
    this.runtime.mana=Math.max(0,Math.min(mana,profile.maxMana));
    this.runtime.learned.clear();for(const id of learned)this.runtime.learned.add(id);
  }
  addPack(spawn:SurfaceSpawn,defs:readonly EnemyDef[],defeated:ReadonlySet<string>):void{
    if(defeated.has(spawn.key))return;
    spawn.enemyIds.forEach((id,slot)=>{
      const key=surfaceMemberKey(spawn.key,slot),def=defs.find(e=>e.id===id);
      if(!def||defeated.has(key)||this.enemies.has(key))return;
      const x=spawn.tileX*16+slot*26,y=spawn.tileY*16;
      this.enemies.set(key,{id:key,spawn,slot,def,x,y,homeX:x,homeY:y,actor:new Actor({maxHp:def.hp,staggerMs:def.boss||def.elite||def.staggerImmune?0:200}),defense:def.defense,element:(def.element??'none') as Element,boss:def.boss,elite:def.elite,controlImmune:def.staggerImmune,cooldown:600+slot*250,windup:0,aimX:x,aimY:y,engaged:false});
    });
  }
  removePack(key:string):void{for(const [id,e]of this.enemies)if(e.spawn.key===key){this.enemies.delete(id);this.runtime.debuffs.delete(id);}}
  targets():SurfaceEnemy[]{return [...this.enemies.values()].filter(e=>!e.actor.isDead);}
  nearest(x:number,y:number,range=220):SurfaceEnemy|undefined{return this.targets().filter(e=>Math.hypot(e.x-x,e.y-y)<=range).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];}
  get engaged():boolean{return this.targets().some(e=>e.engaged);}
  tick(deltaMs:number,input:SurfaceInput,isSafe:(x:number,y:number)=>boolean=()=>false):void{
    const dt=Math.max(0,Math.min(100,Number.isFinite(deltaMs)?deltaMs:0));
    const targets=this.targets();this.runtime.tick(dt,targets);
    for(const e of targets){
      if(e.actor.isDead)continue;e.actor.tick(dt);e.cooldown=Math.max(0,e.cooldown-dt);
      const dist=Math.hypot(e.x-input.x,e.y-input.y),homeDist=Math.hypot(input.x-e.homeX,input.y-e.homeY);
      const tactics=enemyTactics(e.def),speed=Math.min(115,e.def.speed*.7)*this.runtime.getSpeedMultiplier(e);
      const disengage=input.safe||input.protected||this.runtime.actor.isDead||homeDist>360;
      if(disengage){e.engaged=false;e.windup=0;}
      else if(dist<150)e.engaged=true;
      if(!e.engaged){
        const home=Math.hypot(e.homeX-e.x,e.homeY-e.y);
        if(home>1){const step=Math.min(home,130*dt/1000);e.x+=(e.homeX-e.x)/home*step;e.y+=(e.homeY-e.y)/home*step;}
        else {e.actor.heal(e.actor.maxHp*dt/1000);this.runtime.debuffs.delete(e.id);}
        continue;
      }
      if(this.runtime.isStunned(e)||e.actor.isStaggered){e.windup=0;continue;}
      if(e.windup>0){
        e.windup-=dt;
        if(e.windup<=0&&Math.hypot(input.x-e.aimX,input.y-e.aimY)<=tactics.hitRadius*.65){
          const damage=this.runtime.receiveAttack(e.def.attack,(e.def.element??'none') as Element,e);
          if(damage>0){this.runtime.actor.grantInvulnerability(450);this.onHurt(damage);}
        }
        continue;
      }
      const range=tactics.kind==='ranged'?140:38;
      if(dist<=range&&e.cooldown===0){e.windup=tactics.windupMs;e.aimX=input.x;e.aimY=input.y;e.cooldown=tactics.ai.attackCooldownMs+300;}
      else if(dist>range&&dist>0){
        const step=Math.min(dist-range,speed*dt/1000),x=e.x+(input.x-e.x)/dist*step,y=e.y+(input.y-e.y)/dist*step;
        if(!isSafe(x,y)){e.x=x;e.y=y;}
      }
    }
    // Bounded local separation prevents packs collapsing onto a single pixel.
    for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
      const a=targets[i],b=targets[j];if(a.actor.isDead||b.actor.isDead)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d<22){const push=Math.min(2,(22-d)/2),nx=d?dx/d:1,ny=d?dy/d:0;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
    }
  }
}
