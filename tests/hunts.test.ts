import {describe,it,expect} from 'vitest';
import {placeHunts,huntState,huntProgress,startHunt} from '../src/world/hunts';
import {placeLocations} from '../src/world/placement';
import {placeNpcs} from '../src/world/npcPlacement';
import {spawnAvailable} from '../src/world/storyPatrols';
import {loadGameData} from '../src/data/loader';
import {newSession,fromSaveFile,toSaveFile,parseSave,serializeSave} from '../src/state/session';
import {SurfaceCombat} from '../src/combat/SurfaceCombat';
import {combatProfile} from '../src/combat/profile';
import {settleSurfaceKill} from '../src/state/surfaceRewards';
import {generateChunk,chunkOf,FLAG_RIVER} from '../src/world/chunk';
const data=loadGameData(),seed=20261014,places=placeLocations(data.locations,seed),npcs=placeNpcs(data.npcs,places);
const hunts=placeHunts(places,npcs,data.biomes,seed);
const create=()=>newSession(data.quests);
function unlock(s:ReturnType<typeof create>,q:string){s.world.setQuest(q,{status:'completed',progress:[]});}
function battle(){return new SurfaceCombat(combatProfile({},data.items,data.affixes,data.itemSets),data.skills,[],data.combos,100,80);}

describe('optional elite hunts',()=>{
 it('places three deterministic independent events outside settlements and water',()=>{
  expect(hunts).toHaveLength(3);expect(placeHunts([...places].reverse(),npcs,data.biomes,seed)).toEqual(hunts);
  for(const h of hunts){
   expect(h.key.startsWith('hunt:')).toBe(true);expect(h.enemyIds).toHaveLength(3);
   expect(h.enemyIds.some(id=>data.enemies.find(e=>e.id===id)?.elite)).toBe(true);
   expect(h.enemyIds.every(id=>data.enemies.some(e=>e.id===id))).toBe(true);
   expect(h.hunt.reward.items.every(id=>data.items.some(i=>i.id===id))).toBe(true);
   expect(data.quests.some(q=>q.id===h.unlockQuest)).toBe(true);
   for(const p of [...places,...npcs.values()])expect(Math.hypot(p.x-h.tileX,p.y-h.tileY)).toBeGreaterThanOrEqual(15);
   const {cx,cy}=chunkOf(h.tileX,h.tileY),c=generateChunk(seed,cx,cy,data.biomes);expect(c.flags[(h.tileY-cy*64)*64+h.tileX-cx*64]&FLAG_RIVER).toBe(0);
  }
 });
 it('never auto-starts on unlocking or proximity; requires explicit acceptance',()=>{
  const s=create(),h=hunts[0],p={x:h.tileX,y:h.tileY};
  expect(huntState(s,h)).toBe('locked');expect(startHunt(s,h,p)).toBe(false);expect(spawnAvailable(h,s.world)).toBe(false);
  unlock(s,h.unlockQuest);expect(huntState(s,h)).toBe('ready');expect(spawnAvailable(h,s.world)).toBe(false);
  expect(startHunt(s,h,{x:h.tileX+6,y:h.tileY})).toBe(false);expect(startHunt(s,h,{x:NaN,y:h.tileY})).toBe(false);
  expect(startHunt(s,h,p)).toBe(true);expect(huntState(s,h)).toBe('active');expect(spawnAvailable(h,s.world)).toBe(true);expect(startHunt(s,h,p)).toBe(false);
 });
 it('persists acceptance/partial kills and grants the extra completion reward only once',()=>{
  const s=create(),h=hunts[0];unlock(s,h.unlockQuest);startHunt(s,h,{x:h.tileX,y:h.tileY});
  const c=battle();c.addPack(h,data.enemies,s.defeated);const first=c.targets()[0];first.actor.hp=0;
  settleSurfaceKill(s,first,{},id=>id);expect(huntProgress(s,h)).toBe(1);expect(s.world.getItemCount('ash_gloves')).toBeLessThan(2);
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),data.quests);
  expect(huntState(restored,h)).toBe('active');expect(huntProgress(restored,h)).toBe(1);
  const next=battle();next.addPack(h,data.enemies,restored.defeated);expect(next.targets()).toHaveLength(2);
  const gold=restored.player.gold;let lines:string[]=[];
  for(const e of next.targets()){e.actor.hp=0;lines=settleSurfaceKill(restored,e,{},id=>id);}
  expect(lines[0]).toContain('讨伐完成');expect(huntState(restored,h)).toBe('completed');expect(huntProgress(restored,h)).toBe(3);
  expect(restored.player.gold).toBeGreaterThanOrEqual(gold+h.hunt.reward.gold);expect(restored.world.getItemCount('ash_gloves')).toBeGreaterThanOrEqual(1);
  const snapshot=serializeSave(toSaveFile(restored,new Date(0)));
  expect(settleSurfaceKill(restored,first,{},id=>id)).toEqual([]);expect(startHunt(restored,h,{x:h.tileX,y:h.tileY})).toBe(false);
  expect(serializeSave(toSaveFile(restored,new Date(0)))).toBe(snapshot);
 });
 it('an acceptance flag cannot bypass its prerequisite',()=>{const s=create(),h=hunts[0];s.world.setFlag(h.requiredFlag);expect(spawnAvailable(h,s.world)).toBe(false);expect(huntState(s,h)).toBe('locked');});
});
