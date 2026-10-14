import {describe,it,expect} from 'vitest';
import itemsFile from '../data/items.json';
import setsFile from '../data/item-sets.json';
import enemiesFile from '../data/enemies.json';
import skillsFile from '../data/skills.json';
import type {ItemDef,SkillDef} from '../src/data/schema';
import {newSession,toSaveFile,serializeSave,parseSave,fromSaveFile} from '../src/state/session';
import {EQUIP_SLOTS,cycleSlot,equipItem,combatStats} from '../src/state/equipment';
import {combatProfile} from '../src/combat/profile';
import {activeSetBonuses,type ItemSetDef} from '../src/items/sets';
import {validateItemContent} from '../src/items/validate';
import {sellItem,sellStock,sellPrice,buyItem,buyPrice} from '../src/state/shop';
import {useConsumable} from '../src/state/consumables';
import {killGains,rollDrops} from '../src/state/killRewards';
import {bindSkill} from '../src/combat/loadout';
import {Actor} from '../src/combat/Actor';
import {CombatRuntime,type CombatTarget} from '../src/combat/CombatRuntime';
const items=itemsFile.items as ItemDef[],sets=setsFile.sets as ItemSetDef[],skills=skillsFile.skills as SkillDef[];
const potion=(id='health_potion')=>items.find(i=>i.id===id)!;
const p=()=>combatProfile({},items);
const setup=()=>{const s=newSession([]);s.world.addItem('health_potion',3);s.world.addItem('mana_potion',3);return s;};
const victim=():CombatTarget=>({id:'target',x:50,y:0,actor:new Actor({maxHp:10000,staggerMs:0}),defense:0});
const origin={x:0,y:0},dir={x:1,y:0};
const runtime=(bonuses:Record<string,number>={})=>new CombatRuntime(new Actor({maxHp:100,staggerMs:0}),{...p(),bonuses,critChance:0},skills,['fireball'],[],1);
const advance=(r:CombatRuntime,ms:number)=>{for(let n=0;n<ms;n+=100)r.tick(Math.min(100,ms-n),[]);};
describe('reachable six-piece progression',()=>{
 it('production content is valid and every slot has a real item',()=>{expect(items).toHaveLength(25);expect(validateItemContent(items,sets)).toEqual([]);for(const slot of EQUIP_SLOTS)expect(items.some(i=>i.slot===slot)).toBe(true);});
 it.each(sets.map(s=>[s.id,s]as const))('%s can reach all thresholds using real inventory',(_id,set)=>{
  const s=newSession([]),gear=items.filter(i=>i.setId===set.id);expect(gear).toHaveLength(6);
  for(const item of gear){s.world.addItem(item.id,1);expect(equipItem(s,item.id,items,[],sets)).toBe(true);}
  expect(Object.keys(s.player.equipment)).toHaveLength(6);
  expect(activeSetBonuses(sets,gear).filter(b=>b.setId===set.id).map(b=>b.pieces)).toEqual([2,4,6,6]);
  for(const item of gear)expect(s.world.getItemCount(item.id)).toBe(0);
  const loaded=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),[]);expect(loaded.player.equipment).toEqual(s.player.equipment);
  for(const slot of EQUIP_SLOTS)cycleSlot(s,slot,items,[],sets);
  expect(s.player.equipment).toEqual({});for(const item of gear)expect(s.world.getItemCount(item.id)).toBe(1);
 });
 it('neck accessories really contribute to defense and sets',()=>{expect(combatStats({neck:'ash_amulet'},items).defense).toBe(3);});
 it('equipping the selected item replaces exactly that slot and conserves inventory',()=>{const s=newSession([]);s.world.addItem('ash_gloves',1);s.world.addItem('wild_gloves',1);expect(equipItem(s,'wild_gloves',items)).toBe(true);expect(equipItem(s,'ash_gloves',items)).toBe(true);expect(s.player.equipment.hands).toBe('ash_gloves');expect(s.world.getItemCount('wild_gloves')).toBe(1);});
 it('cannot equip missing gear, material or potion',()=>{const s=newSession([]);s.world.addItem('rift_shard',1);for(const id of ['rift_blade','rift_shard','health_potion','unknown'])expect(equipItem(s,id,items)).toBe(false);});
 it('every gear piece and potion has a configured enemy drop source',()=>{for(const item of items.filter(i=>i.slot||i.consumable))expect(enemiesFile.enemies.some(e=>e.drops.some(d=>d.item===item.id)),item.id).toBe(true);});
 it('configured drops remain deterministic after content expansion',()=>{for(const enemy of enemiesFile.enemies)expect(rollDrops(enemy,'test')).toEqual(rollDrops(enemy,'test'));});
 it('validation rejects unreachable set tiers',()=>{expect(validateItemContent(items.filter(i=>i.slot!=='neck'),sets).some(e=>e.includes('无法'))).toBe(true);});
 it.each([{...potion(),consumable:undefined},{...potion(),consumable:{resource:'hp',amount:-1,cooldownMs:0}},{...items[0],slot:'cape'},{...items[0],price:Infinity}]as ItemDef[])('validation rejects malformed content $id',(item)=>{expect(validateItemContent([item],[]).length).toBeGreaterThan(0);});
});
describe('six-piece special effects',()=>{
 it('fire reflection uses real received damage, and not non-fire attacks',()=>{const r=runtime({fireReflect:10}),t=victim();const applied=r.receiveAttack(40,'fire',t);expect(10000-t.actor.hp).toBe(Math.round(applied*.1));t.actor.hp=10000;r.receiveAttack(10,'ice',t);expect(t.actor.hp).toBe(10000);});
 it('a spell primes the next whole basic attack, not only its first target',()=>{const r=runtime({spellNextCrit:1}),a=victim(),b={...victim(),id:'b'};r.cast('fireball',origin,dir,[a]);expect(r.nextBasicCritical).toBe(true);advance(r,400);a.actor.hp=10000;r.basicAttack(origin,dir,[a,b]);expect(10000-a.actor.hp).toBe(18);expect(a.actor.hp).toBe(b.actor.hp);expect(r.nextBasicCritical).toBe(false);advance(r,400);a.actor.hp=10000;r.basicAttack(origin,dir,[a]);expect(10000-a.actor.hp).toBe(12);});
 it('failed/no-target spell cannot prime guaranteed crit',()=>{const r=runtime({spellNextCrit:1});r.cast('fireball',origin,dir,[]);expect(r.nextBasicCritical).toBe(false);});
 it('missing basic does not consume primed critical',()=>{const r=runtime({spellNextCrit:1});r.nextBasicCritical=true;r.basicAttack(origin,dir,[]);expect(r.nextBasicCritical).toBe(true);});
 it('dash attack bonus expires after two seconds',()=>{const r=runtime({dashAttackBonus:50}),t=victim();r.tryDash();r.basicAttack(origin,dir,[t]);expect(10000-t.actor.hp).toBe(18);advance(r,2100);t.actor.hp=10000;r.basicAttack(origin,dir,[t]);expect(10000-t.actor.hp).toBe(12);});
 it('failed dash never activates the bonus',()=>{const r=runtime({dashAttackBonus:15});r.stamina=0;expect(r.tryDash()).toBe(false);expect(r.dashAttackLeftMs).toBe(0);});
});
describe('potions and durable shared cooldown',()=>{
 it('new characters start with limited supplies',()=>{const s=newSession([]);expect(s.world.getItemCount('health_potion')).toBe(2);expect(s.world.getItemCount('mana_potion')).toBe(1);});
 it('heals and consumes exactly one potion',()=>{const s=setup(),before=s.world.getItemCount('health_potion'),r=useConsumable(s,potion(),p(),{hp:10,mana:0},1000);expect(r.hp).toBe(60);expect(s.world.getItemCount('health_potion')).toBe(before-1);expect(s.player.consumableReadyAt).toBe(9000);});
 it('mana potion restores MP without changing HP',()=>{const r=useConsumable(setup(),potion('mana_potion'),p(),{hp:30,mana:10},1000);expect(r).toMatchObject({ok:true,hp:30,mana:50});});
 it('potion efficiency has a real capped effect',()=>{expect(useConsumable(setup(),potion(),{...p(),bonuses:{potionEfficiency:50}},{hp:10,mana:0},0).hp).toBe(85);});
 it('never overheals or overfills mana',()=>{expect(useConsumable(setup(),potion(),p(),{hp:95,mana:0},0).hp).toBe(100);expect(useConsumable(setup(),potion('mana_potion'),p(),{hp:30,mana:75},0).mana).toBe(80);});
 it('full resources do not consume items or start cooldown',()=>{const s=setup(),before=s.world.getItemCount('health_potion');expect(useConsumable(s,potion(),p(),{hp:100,mana:0},0).ok).toBe(false);expect(s.world.getItemCount('health_potion')).toBe(before);expect(s.player.consumableReadyAt).toBeUndefined();});
 it('health and mana share cooldown, which expires exactly at the boundary',()=>{const s=setup();useConsumable(s,potion(),p(),{hp:1,mana:0},1000);expect(useConsumable(s,potion('mana_potion'),p(),{hp:50,mana:0},8999).ok).toBe(false);expect(useConsumable(s,potion('mana_potion'),p(),{hp:50,mana:0},9000).ok).toBe(true);});
 it('save/reload does not reset cooldown or duplicate supplies',()=>{const s=setup();useConsumable(s,potion(),p(),{hp:1,mana:0},1000);const loaded=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),[]);expect(loaded.player.consumableReadyAt).toBe(9000);expect(useConsumable(loaded,potion('mana_potion'),p(),{hp:50,mana:0},2000).ok).toBe(false);expect(loaded.world.getItemCount('health_potion')).toBe(s.world.getItemCount('health_potion'));});
 it('old version-1 saves without potion cooldown remain valid',()=>{const file=toSaveFile(newSession([]));delete file.player.consumableReadyAt;expect(parseSave(serializeSave(file)).player.consumableReadyAt).toBeUndefined();});
 it.each([-1,Infinity,'tomorrow'])('invalid saved cooldown %s is rejected',(value)=>{const file=toSaveFile(newSession([]));(file.player as unknown as Record<string,unknown>).consumableReadyAt=value;expect(()=>parseSave(serializeSave(file))).toThrow();});
 it('dead characters cannot revive using potions',()=>{expect(useConsumable(setup(),potion(),p(),{hp:0,mana:0},0).ok).toBe(false);});
 it('empty inventory cannot be consumed',()=>{const s=setup();s.world.addItem('health_potion',-s.world.getItemCount('health_potion'));expect(useConsumable(s,potion(),p(),{hp:1,mana:0},0).ok).toBe(false);});
 it('invalid effects are rejected atomically',()=>{const s=setup(),before=s.world.getItemCount('health_potion');expect(useConsumable(s,{...potion(),consumable:{resource:'hp',amount:NaN,cooldownMs:1}},p(),{hp:1,mana:0},0).ok).toBe(false);expect(s.world.getItemCount('health_potion')).toBe(before);});
});
describe('merchant resale and reward modifiers',()=>{
 it('sells only inventory spares, credits 35 percent of price',()=>{const s=newSession([]),sword=items[0];s.world.addItem(sword.id,1);expect(sellItem(s,sword).ok).toBe(true);expect(s.player.gold).toBe(14);expect(s.world.getItemCount(sword.id)).toBe(0);});
 it('equipped items cannot be sold or duplicated',()=>{const s=newSession([]);s.world.addItem('iron_sword',1);equipItem(s,'iron_sword',items);expect(sellItem(s,items[0]).ok).toBe(false);expect(s.player.equipment.main_hand).toBe('iron_sword');});
 it('materials are not offered for sale and cannot be sold through the API',()=>{const s=newSession([]),shard=items.find(i=>i.id==='rift_shard')!;s.world.addItem(shard.id,10);expect(sellStock(s,items)).not.toContain(shard);expect(sellItem(s,shard).ok).toBe(false);});
 it('buy-resell is not profitable at any supported reputation discount',()=>{for(const item of items.filter(i=>i.type!=='material'))expect(sellPrice(item)).toBeLessThan(buyPrice(item,.7));});
 it.each([NaN,Infinity,-1,0])('invalid buy multiplier %s never creates currency or items',(m)=>{const s=newSession([]);s.player.gold=100;expect(buyItem(s,items[0],m).ok).toBe(false);expect(s.player.gold).toBe(100);expect(s.world.getItemCount('iron_sword')).toBe(0);});
 it('gold and experience affixes scale kill gains once',()=>{expect(killGains({level:5},{goldFind:50,expGain:20})).toEqual({exp:36,gold:18,items:[]});});
 it('negative reward affixes do not destroy payouts and large bonuses are capped',()=>{expect(killGains({level:1},{goldFind:-100})).toEqual(killGains({level:1}));expect(killGains({level:1},{expGain:10000}).exp).toBe(40);});
});

describe('loadout rebinding regression',()=>{
 it('rebinding the same skill to its slot does not delete the neighboring slot',()=>{const state={unlocked:['fireball','first_aid','guard_stance','armor_break'],equipped:['fireball','first_aid','guard_stance','armor_break']};bindSkill(state,skills,'guard_stance',2);expect(state.equipped).toEqual(state.unlocked);});
 it('moving an equipped skill swaps slots instead of silently deleting two bindings',()=>{const state={unlocked:['fireball','first_aid','guard_stance','armor_break'],equipped:['fireball','first_aid','guard_stance','armor_break']};bindSkill(state,skills,'guard_stance',0);expect(state.equipped).toEqual(['guard_stance','first_aid','fireball','armor_break']);});
 it('binding to an empty position still compacts without duplicates',()=>{const state={unlocked:['fireball','first_aid'],equipped:['fireball','first_aid']};bindSkill(state,skills,'fireball',3);expect(state.equipped).toEqual(['first_aid','fireball']);});
 it('ranged damage actually strengthens arcane bolts as well as spell damage',()=>{const a=runtime(),b=runtime({rangedDamage:50}),ta=victim(),tb=victim();a.cast('fireball',origin,dir,[ta]);b.cast('fireball',origin,dir,[tb]);expect(tb.actor.hp).toBeLessThan(ta.actor.hp);});
});
