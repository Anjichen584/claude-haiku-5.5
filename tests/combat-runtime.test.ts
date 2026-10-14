import { describe,expect,it } from 'vitest';
import skillsData from '../data/skills.json';
import combosData from '../data/combos.json';
import type { SkillDef,ItemDef,AffixDef } from '../src/data/schema';
import type { ComboDef } from '../src/skills/skillTree';
import { Actor } from '../src/combat/Actor';
import { CombatRuntime,type CombatTarget } from '../src/combat/CombatRuntime';
import { combatProfile,type CombatProfile } from '../src/combat/profile';
import { skillLoadout,bindSkill } from '../src/combat/loadout';
import { enemyTactics } from '../src/combat/enemyTactics';
const skills=skillsData.skills as SkillDef[],combos=combosData.combos as ComboDef[];
const profile=():CombatProfile=>({...combatProfile({},[]),attack:30,maxMana:1000,maxStamina:1000,manaRegen:0,staminaRegen:0,critChance:0,dodgeChance:0,blockChance:0});
const target=(id='target',x=50,y=0):CombatTarget=>({id,x,y,actor:new Actor({maxHp:10000,staggerMs:0}),defense:12});
const origin={x:0,y:0},dir={x:1,y:0};
const setup=(learned=skills.map(s=>s.id),p=profile())=>new CombatRuntime(new Actor({maxHp:100,staggerMs:0}),p,skills,learned,combos,25);
const advance=(r:CombatRuntime,ms:number,targets:CombatTarget[]=[])=>{for(let n=0;n<ms;n+=100)r.tick(Math.min(100,ms-n),targets);};

describe('all real skill definitions are runnable',()=>{
 it.each(skills.map(s=>[s.id,s] as const))('%s has a meaningful configured effect',(id,skill)=>{
  const r=setup(),t=target();expect(skill.combat?.description.length).toBeGreaterThan(5);
  const cast=r.cast(id,origin,dir,[t]);
  if(skill.combat?.kind==='passive'){expect(cast.reason).toBe('passive');return;}
  expect(cast.ok).toBe(true);expect(r.cooldowns.get(id)).toBeGreaterThan(0);
  if(['strike','bolt','blast','nova'].includes(skill.combat!.kind))expect(t.actor.hp).toBeLessThan(10000);
 });
});
describe('casting, resources and targeting',()=>{
 it('rejects locked skills without consuming resources',()=>{const r=setup([]);expect(r.cast('fireball',origin,dir,[target()]).reason).toBe('locked');expect(r.mana).toBe(1000);});
 it('rejects insufficient mana atomically',()=>{const r=setup();r.mana=1;expect(r.cast('fireball',origin,dir,[target()]).reason).toBe('mana');expect(r.mana).toBe(1);expect(r.cooldowns.size).toBe(0);});
 it('does not spend mana when a directional attack has no target',()=>{const r=setup();expect(r.cast('fireball',origin,dir,[target('behind',-50)]).reason).toBe('no-target');expect(r.mana).toBe(1000);});
 it('applies cooldown and shared cast interval',()=>{const r=setup(),t=target();r.cast('fireball',origin,dir,[t]);expect(r.cast('fireball',origin,dir,[t]).reason).toBe('cooldown');expect(r.cast('frost_bolt',origin,dir,[t]).reason).toBe('busy');advance(r,350);expect(r.cast('frost_bolt',origin,dir,[t]).ok).toBe(true);});
 it('never lets an unlearned or unknown skill cast',()=>{expect(setup().cast('not_a_skill',origin,dir,[]).reason).toBe('unknown');});
 it('requires stamina for martial skills',()=>{const r=setup();r.stamina=0;expect(r.cast('slash',origin,dir,[target()]).reason).toBe('stamina');});
 it('an attack misses targets outside its configured range',()=>{const r=setup();expect(r.cast('lunge',origin,dir,[target('far',200)]).reason).toBe('no-target');});
 it('nova hits enemies behind the player but not outside the radius',()=>{const r=setup(),a=target('a',-50),b=target('b',300);r.cast('whirlwind',origin,dir,[a,b]);expect(a.actor.hp).toBeLessThan(10000);expect(b.actor.hp).toBe(10000);});
 it('chain strikes neighboring enemies, capped at three',()=>{const r=setup(),ts=[target('a',60),target('b',100,40),target('c',180),target('d',150,70)];const result=r.cast('arc_chain',origin,dir,ts);expect(result.targets).toHaveLength(3);expect(ts.filter(t=>t.actor.hp<10000)).toHaveLength(3);});
 it('basic attack cannot bypass skill global cooldown',()=>{const r=setup(),t=target();r.cast('fireball',origin,dir,[t]);const hp=t.actor.hp;expect(r.basicAttack(origin,dir,[t])).toEqual([]);expect(t.actor.hp).toBe(hp);});
 it('holding dodge cannot grant permanent invulnerability',()=>{const r=setup();expect(r.tryDodge()).toBe(true);expect(r.tryDodge()).toBe(false);advance(r,400);expect(r.actor.isInvulnerable).toBe(false);expect(r.tryDodge()).toBe(false);advance(r,300);expect(r.tryDodge()).toBe(true);});
 it('dodge and dash consume finite stamina',()=>{const r=setup();r.stamina=23;expect(r.tryDodge()).toBe(false);expect(r.tryDash()).toBe(true);expect(r.stamina).toBe(8);});
 it('resource regeneration caps at maxima',()=>{const p={...profile(),manaRegen:20,staminaRegen:20},r=setup([],p);r.mana=999;r.stamina=999;advance(r,500);expect(r.mana).toBe(1000);expect(r.stamina).toBe(1000);});
 it('dead players cannot cast, heal themselves, dash or dodge',()=>{const r=setup();r.actor.hp=0;expect(r.cast('first_aid',origin,dir,[]).reason).toBe('dead');expect(r.tryDash()).toBe(false);expect(r.tryDodge()).toBe(false);advance(r,1000);expect(r.actor.hp).toBe(0);});
 it('seeded criticals reproduce exactly',()=>{const a=setup([], {...profile(),critChance:.5}),b=setup([],{...profile(),critChance:.5}),ta=target(),tb=target();for(let i=0;i<10;i++){a.basicAttack(origin,dir,[ta]);b.basicAttack(origin,dir,[tb]);advance(a,500);advance(b,500);}expect(ta.actor.hp).toBe(tb.actor.hp);});
});
describe('statuses and defensive skills',()=>{
 it('first aid heals and caps at maximum hp',()=>{const r=setup();r.actor.hp=90;r.cast('first_aid',origin,dir,[]);expect(r.actor.hp).toBe(100);});
 it('regen ends after its configured duration',()=>{const r=setup();r.actor.hp=10;r.cast('regen_aura',origin,dir,[]);advance(r,6000);expect(r.actor.hp).toBeCloseTo(34);advance(r,2000);expect(r.actor.hp).toBeCloseTo(34);});
 it('armor break and burn persist then expire',()=>{const r=setup(),t=target();r.cast('ignite',origin,dir,[t]);const hp=t.actor.hp;advance(r,4000,[t]);expect(t.actor.hp).toBeLessThan(hp);expect(r.status(t).burnMs).toBe(0);});
 it('slows affect movement and expire',()=>{const r=setup(),t=target();r.cast('frost_bolt',origin,dir,[t]);expect(r.getSpeedMultiplier(t)).toBe(.65);advance(r,3100,[t]);expect(r.getSpeedMultiplier(t)).toBe(1);});
 it('bosses resist hard control but still take damage and slow',()=>{const r=setup(),t={...target(),boss:true};r.cast('chill',origin,dir,[t]);expect(r.isStunned(t)).toBe(false);expect(r.getSpeedMultiplier(t)).toBe(.5);expect(t.actor.hp).toBeLessThan(10000);});
 it('normal targets are stunned',()=>{const r=setup(),t=target();r.cast('bash',origin,dir,[t]);expect(r.isStunned(t)).toBe(true);advance(r,1000,[t]);expect(r.isStunned(t)).toBe(false);});
 it('shields absorb damage without spending hp',()=>{const r=setup([]);r.learned.add('mana_shield');r.cast('mana_shield',origin,dir,[]);expect(r.shield).toBe(35);r.receiveAttack(10,'none');expect(r.actor.hp).toBe(100);expect(r.shield).toBeLessThan(35);});
 it('guard damage reduction is not cosmetic',()=>{const a=setup([]),b=setup(['guard_stance']);b.cast('guard_stance',origin,dir,[]);expect(b.receiveAttack(30,'none')).toBeLessThan(a.receiveAttack(30,'none'));});
 it('immortal will prevents only one lethal hit',()=>{const r=setup(['immortal_will']);r.cast('immortal_will',origin,dir,[]);r.receiveAttack(1000,'none');expect(r.actor.hp).toBe(1);r.receiveAttack(1000,'none');expect(r.actor.hp).toBe(0);});
 it('counter stance retaliates once, not every tick',()=>{const r=setup(['counter_stance']),t=target();r.cast('counter_stance',origin,dir,[]);r.receiveAttack(10,'none',t);const hp=t.actor.hp;expect(hp).toBeLessThan(10000);r.receiveAttack(10,'none',t);expect(t.actor.hp).toBe(hp);});
 it('trap fires once on actual proximity',()=>{const r=setup(),t=target('t',300);r.cast('trap_set',origin,dir,[t]);r.tick(100,[t]);expect(t.actor.hp).toBe(10000);t.x=70;r.tick(100,[t]);const hp=t.actor.hp;expect(hp).toBeLessThan(10000);expect(r.traps).toHaveLength(0);r.tick(100,[t]);expect(t.actor.hp).toBe(hp);});
 it('life steal is based on actual damage, not overkill',()=>{const r=setup(['leech_touch']),t=target();t.actor.hp=2;r.actor.hp=50;r.cast('leech_touch',origin,dir,[t]);expect(r.actor.hp).toBe(51);});
});
describe('eight sequenced combos',()=>{
 it.each(combos.map(c=>[c.name,c] as const))('%s requires both learned casts and triggers within 4 seconds',(_name,c)=>{
  const r=setup(),t=target();r.cast(c.skills[0],origin,dir,[t]);advance(r,400,[t]);const result=r.cast(c.skills[1],origin,dir,[t]);expect(result.ok).toBe(true);expect(result.combo?.id).toBe(c.id);
 });
 it('learning both skills alone never gives a combo',()=>{const r=setup(),t=target();expect(r.cast('fireball',origin,dir,[t]).combo).toBeUndefined();});
 it('combo window expires',()=>{const r=setup(),t=target();r.cast('fireball',origin,dir,[t]);advance(r,4100);expect(r.cast('armor_break',origin,dir,[t]).combo).toBeUndefined();});
 it('molten really removes ten defense',()=>{const r=setup(),t=target();r.cast('fireball',origin,dir,[t]);advance(r,400);r.cast('armor_break',origin,dir,[t]);expect(r.status(t).shred).toBe(10);});
 it('life drain also works when regen aura is the second cast',()=>{const r=setup(),t=target();r.actor.hp=10;r.cast('leech_touch',origin,dir,[t]);advance(r,400);r.cast('regen_aura',origin,dir,[t]);advance(r,400);const hp=r.actor.hp;r.basicAttack(origin,dir,[t]);expect(r.actor.hp).toBeGreaterThanOrEqual(hp+3);});
 it('fortress flame reflects fire but not ice',()=>{const r=setup(),t=target();r.cast('fortify',origin,dir,[t]);advance(r,400);r.cast('meteor',origin,dir,[t]);r.receiveAttack(100,'ice',t);const hp=t.actor.hp;r.receiveAttack(30,'fire',t);expect(t.actor.hp).toBeLessThan(hp);});
});
describe('loadout and equipment modifiers',()=>{
 it('legacy saves auto-fill four learned active skills, never passives',()=>{expect(skillLoadout({unlocked:['scout','fireball','frost_bolt','first_aid','slash','lunge']},skills)).toEqual(['fireball','frost_bolt','first_aid','slash']);});
 it('explicit empty loadout stays empty',()=>{expect(skillLoadout({unlocked:['fireball'],equipped:[]},skills)).toEqual([]);});
 it('filters duplicate, reset and unknown skills',()=>{expect(skillLoadout({unlocked:['fireball'],equipped:['fireball','fireball','missing','slash']},skills)).toEqual(['fireball']);});
 it('can bind a learned skill, not a passive or unknown',()=>{const s={unlocked:['fireball','scout'],equipped:[] as string[]};expect(bindSkill(s,skills,'scout',0)).toBe(false);expect(bindSkill(s,skills,'fireball',0)).toBe(true);expect(s.equipped).toEqual(['fireball']);expect(bindSkill(s,skills,'slash',1)).toBe(false);});
 it('refuses fractional and out of range slot indices',()=>{const s={unlocked:['fireball']};expect(bindSkill(s,skills,'fireball',4)).toBe(false);expect(bindSkill(s,skills,'fireball',.5)).toBe(false);});
 it('speed, mana and cooldown affixes change derived combat values',()=>{
  const item:ItemDef={id:'test',name:'test',type:'armor',slot:'head',rarity:'epic',itemLevel:1,price:1};
  const affixes:AffixDef[]=[{id:'s',name:'s',stat:'speed',min:20,max:20,weight:1},{id:'m',name:'m',stat:'maxMana',min:30,max:30,weight:1},{id:'c',name:'c',stat:'cooldownReduction',min:15,max:15,weight:1}];
  const p=combatProfile({head:'test'},[item],affixes);expect(p.speedMultiplier).toBe(1.2);expect(p.maxMana).toBe(110);expect(p.cooldownMultiplier).toBe(.85);
 });
 it('does not count an item in the wrong slot or duplicated unknown slots',()=>{const item:ItemDef={id:'sword',name:'sword',type:'weapon',slot:'main_hand',baseDamage:20,price:1};expect(combatProfile({head:'sword',fake:'sword'},[item]).attack).toBe(12);});
 it('enemy roles have different attacks and response windows',()=>{expect(enemyTactics({id:'ash_crow'}).kind).toBe('ranged');expect(enemyTactics({id:'moss_golem'}).hitRadius).toBeGreaterThan(enemyTactics({id:'ash_wolf'}).hitRadius);expect(enemyTactics({id:'boss_dune_regent',boss:true}).kind).toBe('brute');});
});
