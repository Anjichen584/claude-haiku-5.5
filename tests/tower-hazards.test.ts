import {describe,it,expect} from 'vitest';
import {TowerHazards,towerHazardRule,hazardContains,type HazardStrike} from '../src/tower/hazards';
import {Actor} from '../src/combat/Actor';
import {CombatRuntime} from '../src/combat/CombatRuntime';
import {combatProfile} from '../src/combat/profile';
import {loadGameData} from '../src/data/loader';
const point={x:640,y:360};
function advance(h:TowerHazards,ms:number,position=point){const strikes:HazardStrike[]=[];for(let t=0;t<ms;t+=100){const hit=h.tick(Math.min(100,ms-t),position);if(hit)strikes.push(hit);}return strikes;}

describe('telegraphed tower boss hazards',()=>{
 it.each([1,5,9,11,19,21,29])('does not introduce hazards on floor %i',floor=>{const h=new TowerHazards(floor);expect(towerHazardRule(floor)).toBeNull();expect(advance(h,20000)).toEqual([]);expect(h.warning).toBeNull();});
 it.each([10,20,30])('warns before damage, locks aim, and resolves a pulse once on floor %i',floor=>{
  const h=new TowerHazards(floor),rule=h.rule!;expect(advance(h,2100)).toEqual([]);expect(h.warning).toBeNull();
  expect(advance(h,100)).toEqual([]);expect(h.warning!.remainingMs).toBe(rule.windupMs);
  const zones=JSON.stringify(h.warning!.zones);
  expect(advance(h,rule.windupMs-100,{x:110,y:500})).toEqual([]);expect(JSON.stringify(h.warning!.zones)).toBe(zones);
  const hit=advance(h,100,{x:110,y:500});expect(hit).toHaveLength(1);expect(h.strikes).toBe(1);expect(h.warning).toBeNull();
  expect(hit[0].zones.some(z=>hazardContains(z,point))).toBe(true);expect(hit[0].zones.some(z=>hazardContains(z,{x:110,y:500}))).toBe(false);
  expect(advance(h,rule.intervalMs-100)).toEqual([]);expect(h.warning).toBeNull();
  advance(h,100);expect(h.warning).not.toBeNull();expect(h.strikes).toBe(1);
 });
 it('uses two mirrored final-floor circles, with valid room geometry',()=>{
  const h=new TowerHazards(30);advance(h,2200,{x:250,y:250});
  expect(h.warning!.zones).toEqual([{kind:'circle',x:250,y:250,radius:90},{kind:'circle',x:1030,y:460,radius:90}]);
  expect(h.warning!.zones.some(z=>hazardContains(z,{x:640,y:360}))).toBe(false);
 });
 it('uses a bounded vertical strip rather than a circle on floor 20',()=>{
  const h=new TowerHazards(20);advance(h,2200,{x:110,y:210});const z=h.warning!.zones[0];
  expect(z.kind).toBe('lane');expect(hazardContains(z,{x:110,y:500})).toBe(true);
  expect(hazardContains(z,{x:186,y:500})).toBe(false);expect(hazardContains(z,{x:110,y:501})).toBe(false);
 });
 it('ignores invalid input, uses no wall clock and bounds long resumed frames',()=>{
  const h=new TowerHazards(10);for(const dt of [NaN,Infinity,-1,0])expect(h.tick(dt,point)).toBeNull();
  expect(h.tick(50,{x:NaN,y:0})).toBeNull();expect(h.elapsedMs).toBe(0);
  h.tick(10000000,point);expect(h.elapsedMs).toBe(100);expect(h.warning).toBeNull();
  advance(h,2100);const before=JSON.stringify(h.warning);expect(JSON.stringify(h.warning)).toBe(before);
  const restarted=new TowerHazards(10);expect(restarted.elapsedMs).toBe(0);expect(restarted.warning).toBeNull();
 });
 it('hazard damage uses normal defense and respects dodge invulnerability',()=>{
  const d=loadGameData(),profile=combatProfile({},d.items,d.affixes,d.itemSets),actor=new Actor({maxHp:profile.maxHp});
  const runtime=new CombatRuntime(actor,{...profile,dodgeChance:0,blockChance:0},[],[],[],1);
  const h=new TowerHazards(10),strike=advance(h,3600)[0];
  expect(runtime.receiveAttack(strike.attack,strike.element)).toBeGreaterThan(0);
  const hp=actor.hp;actor.grantInvulnerability(300);
  expect(runtime.receiveAttack(strike.attack,strike.element)).toBe(0);expect(actor.hp).toBe(hp);
 });
 it('lets an actual learned mana shield absorb the environmental pulse',()=>{
  const d=loadGameData(),profile=combatProfile({},d.items,d.affixes,d.itemSets),actor=new Actor({maxHp:profile.maxHp});
  const runtime=new CombatRuntime(actor,{...profile,dodgeChance:0,blockChance:0},d.skills,['mana_shield'],d.combos,1);
  expect(runtime.cast('mana_shield',point,{x:1,y:0},[]).ok).toBe(true);
  const before=runtime.shield,strike=advance(new TowerHazards(10),3600)[0];
  expect(runtime.receiveAttack(strike.attack,strike.element)).toBe(0);
  expect(actor.hp).toBe(profile.maxHp);expect(runtime.shield).toBeLessThan(before);
 });
 it('resolves overlapping final circles as one pulse, not two attacks',()=>{
  const h=new TowerHazards(30),hit=advance(h,3600)[0];
  expect(hit.zones.filter(z=>hazardContains(z,point))).toHaveLength(2);
  expect(h.strikes).toBe(1);expect(h.tick(50,point)).toBeNull();
 });
});
