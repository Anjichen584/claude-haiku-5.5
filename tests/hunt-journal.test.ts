import {describe,it,expect} from 'vitest';
import {buildHuntJournal} from '../src/world/huntJournal';
import {placeHunts,startHunt} from '../src/world/hunts';
import {placeLocations} from '../src/world/placement';
import {placeNpcs} from '../src/world/npcPlacement';
import {loadGameData} from '../src/data/loader';
import {newSession,toSaveFile,serializeSave,fromSaveFile,parseSave} from '../src/state/session';
import {surfaceMemberKey,SurfaceCombat} from '../src/combat/SurfaceCombat';
import {combatProfile} from '../src/combat/profile';
import {settleSurfaceKill} from '../src/state/surfaceRewards';
const data=loadGameData(),seed=20261014,places=placeLocations(data.locations,seed);
const hunts=placeHunts(places,placeNpcs(data.npcs,places),data.biomes,seed);
const names=new Map(data.items.map(i=>[i.id,i.name]));
const snapshot=(s:ReturnType<typeof newSession>)=>serializeSave(toSaveFile(s,new Date(0)));

describe('hunt journal and expanded challenges',()=>{
 it('shows every prerequisite and all fixed rewards without mutating the session',()=>{
  const s=newSession(data.quests),before=snapshot(s),entries=buildHuntJournal(s,hunts,data.quests,names);
  expect(entries).toHaveLength(6);expect(new Set(entries.map(e=>e.key)).size).toBe(6);
  for(const [i,e] of entries.entries()){
   expect(e.state).toBe('locked');expect(e.progress).toBe(0);expect(e.total).toBe(3);
   expect(e.prerequisite).toBe(data.quests.find(q=>q.id===hunts[i].unlockQuest)?.title);
   expect(e.reward.items).toEqual(hunts[i].hunt.reward.items.map(id=>names.get(id)));
   expect(e.distance).toBe(Math.round(Math.hypot(e.position.x,e.position.y)));
  }
  entries[0].reward.items.push('untrusted');entries[0].position.x=0;
  expect(hunts[0].hunt.reward.items).not.toContain('untrusted');
  expect(snapshot(s)).toBe(before);
 });
 it('projects ready, accepted, partial, completed and reloaded states faithfully',()=>{
  const s=newSession(data.quests),h=hunts[3];
  const entry=()=>buildHuntJournal(s,hunts,data.quests,names)[3];
  s.world.setQuest(h.unlockQuest,{status:'completed',progress:[]});expect(entry().state).toBe('ready');
  expect(startHunt(s,h,{x:h.tileX,y:h.tileY})).toBe(true);expect(entry().state).toBe('active');
  s.defeated.add(surfaceMemberKey(h.key,1));expect(entry().progress).toBe(1);
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),data.quests);
  expect(buildHuntJournal(restored,hunts,data.quests,names)[3]).toEqual(entry());
  s.defeated.add(h.key);expect(entry().state).toBe('completed');expect(entry().progress).toBe(3);
 });
 it.each(hunts.slice(3))('settles $key only after every member and never twice',h=>{
  const s=newSession(data.quests);s.world.setQuest(h.unlockQuest,{status:'completed',progress:[]});
  startHunt(s,h,{x:h.tileX,y:h.tileY});
  const combat=new SurfaceCombat(combatProfile({},data.items,data.affixes,data.itemSets),data.skills,[],data.combos,100,80);
  combat.addPack(h,data.enemies,s.defeated);const targets=combat.targets();
  for(const enemy of targets.slice(0,2)){
   enemy.actor.hp=0;expect(settleSurfaceKill(s,enemy,{},id=>id).some(l=>l.includes('讨伐完成'))).toBe(false);
  }
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),data.quests),last=targets[2];last.actor.hp=0;
  const gold=restored.player.gold,exp=restored.player.exp;
  const lines=settleSurfaceKill(restored,last,{},id=>id);
  expect(lines[0]).toContain('讨伐完成');expect(restored.player.gold).toBeGreaterThanOrEqual(gold+h.hunt.reward.gold);
  expect(restored.player.exp).toBeGreaterThanOrEqual(exp+h.hunt.reward.exp);
  for(const id of h.hunt.reward.items)expect(restored.world.getItemCount(id)).toBeGreaterThanOrEqual(1);
  const done=snapshot(restored);for(const enemy of targets)expect(settleSurfaceKill(restored,enemy,{},id=>id)).toEqual([]);
  expect(snapshot(restored)).toBe(done);
 });
});
