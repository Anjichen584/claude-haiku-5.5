import {describe,it,expect} from 'vitest';
import {SurfaceCombat,surfaceMemberKey} from '../src/combat/SurfaceCombat';
import {combatProfile} from '../src/combat/profile';
import {settleSurfaceKill} from '../src/state/surfaceRewards';
import {newSession,parseSave,serializeSave,toSaveFile,fromSaveFile} from '../src/state/session';
import {loadGameData} from '../src/data/loader';
import type {SurfaceSpawn} from '../src/world/encounters';
import {Actor} from '../src/combat/Actor';
const data=loadGameData();
const pack:SurfaceSpawn={key:'test-pack',tileX:20,tileY:0,enemyIds:['ash_wolf','ash_wolf']};
function setup(){const profile=combatProfile({},data.items,data.affixes,data.itemSets);const combat=new SurfaceCombat(profile,data.skills,['fireball'],data.combos,100,80);combat.addPack(pack,data.enemies,new Set());return combat;}

describe('seamless world combat',()=>{
 it('does not duplicate packs and respects whole-pack and per-member save records',()=>{
  const c=setup();c.addPack(pack,data.enemies,new Set());expect(c.targets()).toHaveLength(2);
  c.removePack(pack.key);c.addPack(pack,data.enemies,new Set([surfaceMemberKey(pack.key,0)]));expect(c.targets()).toHaveLength(1);
  c.removePack(pack.key);c.addPack(pack,data.enemies,new Set([pack.key]));expect(c.targets()).toHaveLength(0);
 });
 it('aggros near the player without a scene transition and telegraphs before damage',()=>{
  const c=setup(),enemy=c.targets()[0];c.removePack(pack.key);c.addPack({...pack,enemyIds:['ash_wolf']},data.enemies,new Set());
  const e=c.targets()[0],input={x:e.x+20,y:e.y,safe:false,protected:false};
  for(let i=0;i<7;i++)c.tick(100,input);
  expect(e.engaged).toBe(true);expect(e.windup).toBeGreaterThan(0);expect(c.runtime.actor.hp).toBe(100);
  for(let i=0;i<10;i++)c.tick(100,input);
  expect(c.runtime.actor.hp).toBeLessThan(100);expect(enemy.def.id).toBe('ash_wolf');
 });
 it('locked attack telegraphs can be avoided by moving away',()=>{
  const c=setup(),e=c.targets()[0];e.engaged=true;e.cooldown=0;
  c.tick(16,{x:e.x+10,y:e.y,safe:false,protected:false});expect(e.windup).toBeGreaterThan(0);
  const hp=c.runtime.actor.hp;for(let i=0;i<6;i++)c.tick(100,{x:e.x+130,y:e.y+100,safe:false,protected:false});
  expect(c.runtime.actor.hp).toBe(hp);
 });
 it.each(['safe','protected'] as const)('%s player cancels windups and enemies return home',flag=>{
  const c=setup(),e=c.targets()[0];e.x+=90;e.engaged=true;e.windup=200;e.aimX=e.x;e.aimY=e.y;
  c.tick(100,{x:e.x,y:e.y,safe:false,protected:false,[flag]:true});
  expect(e.windup).toBe(0);expect(e.engaged).toBe(false);expect(e.x).toBeLessThan(e.homeX+90);expect(c.runtime.actor.hp).toBe(100);
 });
 it('leashes based on home position instead of chasing indefinitely',()=>{
  const c=setup(),e=c.targets()[0];e.x=e.homeX+380;e.engaged=true;
  c.tick(100,{x:e.x+20,y:e.y,safe:false,protected:false});expect(e.engaged).toBe(false);
 });
 it('same melee swing can damage several nearby enemies',()=>{
  const c=setup();const hits=c.runtime.basicAttack({x:pack.tileX*16-30,y:0},{x:1,y:0},c.targets());
  expect(hits).toHaveLength(2);expect(c.targets().every(e=>e.actor.hp<e.actor.maxHp)).toBe(true);
 });
 it('supports skill damage, mana and cooldowns on the map',()=>{
  const c=setup(),mana=c.runtime.mana;expect(c.runtime.cast('fireball',{x:280,y:0},{x:1,y:0},c.targets()).ok).toBe(true);
  expect(c.runtime.mana).toBeLessThan(mana);expect(c.runtime.cooldowns.get('fireball')).toBeGreaterThan(0);
 });
 it('changing gear/learning skills never resets cooldowns or grants a heal',()=>{
  const c=setup();c.runtime.actor.hp=33;c.runtime.basicCooldownMs=320;c.runtime.cooldowns.set('fireball',2000);
  c.syncProfile({...c.runtime.profile,maxHp:140},['fireball','slash'],33,21);
  expect(c.runtime.actor.maxHp).toBe(140);expect(c.runtime.actor.hp).toBe(33);expect(c.runtime.mana).toBe(21);
  expect(c.runtime.cooldowns.get('fireball')).toBe(2000);expect(c.runtime.basicCooldownMs).toBe(320);expect(c.runtime.learned.has('slash')).toBe(true);
 });
 it('unloading a pack removes its combat effects',()=>{
  const c=setup();c.runtime.cast('fireball',{x:280,y:0},{x:1,y:0},c.targets());c.removePack(pack.key);expect(c.enemies.size).toBe(0);expect(c.runtime.debuffs.size).toBe(0);
 });
 it('dead enemies cannot attack or issue repeated kill callbacks',()=>{
  const c=setup(),e=c.targets()[0];let kills=0;c.onKill=()=>kills++;
  c.runtime.onDamage(e,999);c.runtime.onDamage(e,999);expect(kills).toBe(1);
 });
 it('Actor resizing clamps HP without accepting invalid capacities',()=>{
  const a=new Actor({maxHp:100});a.setMaxHp(80);expect(a.hp).toBe(80);a.setMaxHp(NaN);a.setMaxHp(-1);expect(a.maxHp).toBe(80);
 });
});

describe('surface reward transactions',()=>{
 it('survives a mid-pack save/reload without respawning or rewarding the killed member',()=>{
  const session=newSession(data.quests),c=setup(),first=c.targets()[0];first.actor.hp=0;
  expect(settleSurfaceKill(session,first,{},id=>id).length).toBeGreaterThan(0);
  const gold=session.player.gold,exp=session.player.exp;
  expect(settleSurfaceKill(session,first,{},id=>id)).toEqual([]);expect(session.player.gold).toBe(gold);
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(session))),data.quests);
  const next=setup();next.removePack(pack.key);next.addPack(pack,data.enemies,restored.defeated);
  expect(next.targets()).toHaveLength(1);expect(next.targets()[0].slot).toBe(1);
  expect(restored.player.gold).toBe(gold);expect(restored.player.exp).toBe(exp);
  const last=next.targets()[0];last.actor.hp=0;settleSurfaceKill(restored,last,{},id=>id);
  expect(restored.defeated.has(pack.key)).toBe(true);expect(restored.defeated.has(surfaceMemberKey(pack.key,0))).toBe(false);
  expect(settleSurfaceKill(restored,first,{},id=>id)).toEqual([]);
  expect(restored.world.getQuest('main_01_first_rift')?.progress[0]).toBe(2);
 });
 it('never grants rewards for a living target',()=>{const s=newSession([]),e=setup().targets()[0];expect(settleSurfaceKill(s,e,{},id=>id)).toEqual([]);expect(s.player.gold).toBe(0);expect(s.defeated.size).toBe(0);});
});
