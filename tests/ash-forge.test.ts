import {describe,it,expect} from 'vitest';
import {newForge,startForge,forgeUnlocked,moveForge,canMoveForge,valveOrder,operateValve,forgeEnemies,finishForgeCombat,claimForge,exchangeForgeGear,parseForge,FORGE_GEAR,type ForgeRun} from '../src/dungeon/ashForge';
import {newSession,toSaveFile,serializeSave,parseSave,fromSaveFile} from '../src/state/session';
import {newTower,startTower} from '../src/tower/run';
import {loadGameData} from '../src/data/loader';
const d=loadGameData();
function make(){const s=newSession(d.quests);s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});s.forge=newForge();return s;}
function begin(){const s=make();expect(startForge(s)).toBe(true);return s;}
function hall(s:ReturnType<typeof begin>){const r=s.forge!.run!;expect(moveForge(r,'hall')).toBe(true);expect(finishForgeCombat(s.forge!,r.id,'hall',true)).toBe(true);expect(moveForge(r,'valves')).toBe(true);return r;}
function valves(r:ForgeRun){for(const index of valveOrder(r))operateValve(r,index);}
function win(s:ReturnType<typeof begin>,extra=false){const r=hall(s);valves(r);if(extra){expect(moveForge(r,'cache')).toBe(true);expect(finishForgeCombat(s.forge!,r.id,'cache',true)).toBe(true);}expect(moveForge(r,'boss')).toBe(true);expect(finishForgeCombat(s.forge!,r.id,'boss',true)).toBe(true);expect(moveForge(r,'exit')).toBe(true);return r;}
const snapshot=(s:ReturnType<typeof begin>)=>serializeSave(toSaveFile(s,new Date(0)));

describe('ash forge repeatable theme dungeon',()=>{
 it('requires chapter unlock, camp location and no active tower/dungeon',()=>{
  const s=newSession(d.quests);expect(forgeUnlocked(s)).toBe(false);expect(startForge(s)).toBe(false);
  s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});s.player.tileX=100;expect(startForge(s)).toBe(false);
  s.player.tileX=0;s.tower=newTower();startTower(s.tower);expect(startForge(s)).toBe(false);
  s.tower.run=null;s.dungeon={activeFloor:1,runs:[]};expect(startForge(s)).toBe(false);
  s.dungeon.activeFloor=null;expect(startForge(s)).toBe(true);expect(startForge(s)).toBe(false);
 });
 it('does not allow teleporting, skipping the hall, unsolved valves or boss',()=>{
  const s=begin(),r=s.forge!.run!;
  expect(moveForge(r,'boss')).toBe(false);expect(moveForge(r,'exit')).toBe(false);
  expect(moveForge(r,'hall')).toBe(true);expect(moveForge(r,'valves')).toBe(false);
  finishForgeCombat(s.forge!,r.id,'hall',true);moveForge(r,'valves');
  expect(moveForge(r,'cache')).toBe(false);expect(moveForge(r,'boss')).toBe(false);expect(claimForge(s)).toBe(false);
  valves(r);expect(moveForge(r,'boss')).toBe(true);expect(moveForge(r,'exit')).toBe(false);
 });
 it('locks the deterministic valve order and caps wrong-input pressure',()=>{
  const s=begin(),r=hall(s),order=valveOrder(r);expect(new Set(order).size).toBe(3);expect(valveOrder(r)).toEqual(order);
  expect(operateValve(r,order[0])).toBe('progress');expect(operateValve(r,order[0])).toBe('wrong');expect(r.valveStep).toBe(0);
  const wrong=order.find(i=>i!==order[0])!;for(let i=0;i<8;i++)operateValve(r,wrong);expect(r.pressure).toBe(3);
  for(const i of order)operateValve(r,i);expect(r.cleared).toEqual(['hall','valves']);expect(operateValve(r,order[0])).toBe('blocked');
  expect(operateValve(r,NaN)).toBe('blocked');
 });
 it.each([false,true])('settles route extra=%s once only, and allows another distinct run',extra=>{
  const s=begin();win(s,extra);expect(s.player.gold).toBe(0);expect(s.player.exp).toBe(0);expect(s.forge!.embers).toBe(0);
  expect(claimForge(s)).toBe(true);expect(s.player.gold).toBe(extra?180:120);expect(s.player.exp).toBe(extra?360:240);expect(s.forge!.embers).toBe(extra?5:3);
  expect(s.forge!.clears).toBe(1);expect(s.forge!.run).toBeNull();const done=snapshot(s);expect(claimForge(s)).toBe(false);expect(snapshot(s)).toBe(done);
  expect(startForge(s)).toBe(true);expect(s.forge!.run!.id).toBe(2);
 });
 it('rejects duplicate/stale combat settlements and loses only unclaimed progress on defeat',()=>{
  const s=begin(),r=hall(s);expect(finishForgeCombat(s.forge!,r.id,'hall',true)).toBe(false);
  expect(finishForgeCombat(s.forge!,r.id+1,'valves',true)).toBe(false);valves(r);moveForge(r,'cache');
  expect(finishForgeCombat(s.forge!,r.id,'boss',true)).toBe(false);expect(finishForgeCombat(s.forge!,r.id,'cache',false)).toBe(true);
  expect(s.forge!.run).toBeNull();expect(s.forge!.clears).toBe(0);expect(s.forge!.embers).toBe(0);expect(s.player.gold).toBe(0);
 });
 it('keeps already banked embers after a later defeat',()=>{const s=begin();win(s);claimForge(s);startForge(s);moveForge(s.forge!.run!,'hall');finishForgeCombat(s.forge!,2,'hall',false);expect(s.forge!.embers).toBe(3);expect(s.forge!.clears).toBe(1);});
 it('preparation route weakens boss HP, pressure strengthens attack, without mutating enemy data',()=>{
  const s=begin(),r=hall(s),original=JSON.stringify(d.enemies);valves(r);moveForge(r,'boss');
  const normal=forgeEnemies(r,d.enemies)[0];r.cleared.splice(2,0,'cache');r.pressure=3;
  const changed=forgeEnemies(r,d.enemies)[0];expect(changed.hp).toBe(Math.round(normal.hp*.8));expect(changed.attack).toBe(normal.attack+9);expect(changed.drops).toEqual([]);expect(JSON.stringify(d.enemies)).toBe(original);
 });
 it('does not let players add the optional reward after the boss is dead',()=>{const s=begin();win(s);moveForge(s.forge!.run!,'boss');expect(canMoveForge(s.forge!.run!,'cache')).toBe(false);});
 it('roundtrips partial valve progress, pressure and claimed rewards',()=>{
  const s=begin(),r=hall(s);operateValve(r,valveOrder(r)[1]);operateValve(r,valveOrder(r)[0]);
  const restored=fromSaveFile(parseSave(snapshot(s)),d.quests);expect(restored.forge).toEqual(s.forge);expect(valveOrder(restored.forge!.run!)).toEqual(valveOrder(r));
  restored.forge!.run!.cleared.push('cache');expect(restored.forge).not.toEqual(s.forge);
 });
 it('roundtrips every reachable room and clear checkpoint',()=>{
  for(const extra of [false,true]){const s=begin(),r=s.forge!.run!;const valid=()=>expect(parseSave(snapshot(s)).forge).toEqual(s.forge);
   valid();moveForge(r,'hall');valid();finishForgeCombat(s.forge!,r.id,'hall',true);valid();moveForge(r,'valves');valid();valves(r);valid();
   if(extra){moveForge(r,'cache');valid();finishForgeCombat(s.forge!,r.id,'cache',true);valid();}
   moveForge(r,'boss');valid();finishForgeCombat(s.forge!,r.id,'boss',true);valid();moveForge(r,'exit');valid();claimForge(s);valid();
  }
 });
 it.each(FORGE_GEAR)('exchanges banked currency for exactly one %s',id=>{
  const s=begin();win(s);claimForge(s);const count=s.world.getItemCount(id);expect(exchangeForgeGear(s,id)).toBe(true);expect(s.forge!.embers).toBe(0);expect(s.world.getItemCount(id)).toBe(count+1);
  expect(exchangeForgeGear(s,id)).toBe(false);expect(s.world.getItemCount(id)).toBe(count+1);expect(parseSave(snapshot(s)).forge?.embers).toBe(0);
 });
 it('does not exchange arbitrary IDs, during a run, away from camp or before unlock',()=>{
  const s=begin();win(s,true);claimForge(s);expect(exchangeForgeGear(s,'rift_blade')).toBe(false);
  s.player.tileX=200;expect(exchangeForgeGear(s,'ash_sword')).toBe(false);s.player.tileX=0;
  startForge(s);expect(exchangeForgeGear(s,'ash_sword')).toBe(false);s.forge!.run=null;s.world.setQuest('main_02_ash_road',{status:'active',progress:[]});expect(exchangeForgeGear(s,'ash_sword')).toBe(false);
 });
 it('preserves old v1 saves and rejects simultaneous active special runs',()=>{
  const old=newSession(d.quests);expect(parseSave(snapshot(old)).forge).toBeUndefined();const s=begin();s.tower=newTower();startTower(s.tower);expect(()=>parseSave(snapshot(s))).toThrow('同时');
 });
 it.each([
  {},{version:1,attempts:0,clears:1,embers:3,run:null},{version:1,attempts:1,clears:0,embers:1,run:null},
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'exit',cleared:[],valveStep:0,pressure:0}},
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'hall',cleared:[],valveStep:2,pressure:0}},
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'boss',cleared:['hall','valves'],valveStep:0,pressure:0}},
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'valves',cleared:['hall','hall'],valveStep:0,pressure:0}},
 ])('rejects invalid save structure %#',raw=>{expect(()=>parseForge(raw)).toThrow();});
});
