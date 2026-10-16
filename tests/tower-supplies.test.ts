import {describe,it,expect} from 'vitest';
import {towerLobbyProfile,useTowerSupply,nextTowerCheckpoint} from '../src/tower/supplies';
import {newTower,startTower,finishTowerFloor,boonChoices,chooseBoon} from '../src/tower/run';
import {newSession,toSaveFile,parseSave,serializeSave,fromSaveFile} from '../src/state/session';
import {loadGameData} from '../src/data/loader';
const d=loadGameData();
function make(){const s=newSession(d.quests);s.tower=newTower();startTower(s.tower);for(let i=1;i<=9;i++){const r=s.tower.run!;finishTowerFloor(s.tower,r.id,i,true);const ids=boonChoices(r);chooseBoon(r,ids.includes('vitality')?'vitality':ids.includes('spring')?'spring':ids[0]);}return s;}
describe('between-floor supplies',()=>{
 it('restores against temporary capacity, charges inventory once, and shares potion cooldown',()=>{
  const s=make(),p=towerLobbyProfile(s);s.player.hp=p.maxHp-10;s.player.mana=1;
  const count=s.world.getItemCount('health_potion');expect(useTowerSupply(s,'health_potion',10000).ok).toBe(true);
  expect(s.player.hp).toBe(p.maxHp);expect(s.world.getItemCount('health_potion')).toBe(count-1);
  const mana=s.player.mana;expect(useTowerSupply(s,'mana_potion',10001).ok).toBe(false);expect(s.player.mana).toBe(mana);
  expect(useTowerSupply(s,'mana_potion',18000).ok).toBe(true);expect(s.player.mana).toBeGreaterThan(1);expect(s.player.mana).toBeLessThanOrEqual(p.maxMana);
 });
 it('persists boosted resources and cooldown without sharing the snapshot',()=>{
  const s=make(),p=towerLobbyProfile(s);s.player.hp=p.maxHp-1;useTowerSupply(s,'health_potion',10000);
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),d.quests);
  expect(restored.player.hp).toBe(s.player.hp);expect(restored.player.consumableReadyAt).toBe(18000);
  expect(useTowerSupply(restored,'mana_potion',15000).ok).toBe(false);
 });
 it('does not consume items at full resources, with an empty bag, or when dead',()=>{
  const s=newSession(d.quests),hp=s.world.getItemCount('health_potion');
  expect(useTowerSupply(s,'health_potion',10000).ok).toBe(false);expect(s.world.getItemCount('health_potion')).toBe(hp);
  s.player.hp=0;expect(useTowerSupply(s,'health_potion',10000).ok).toBe(false);
  s.player.hp=1;s.world.addItem('health_potion',-hp);expect(useTowerSupply(s,'health_potion',10000).ok).toBe(false);
 });
 it('does not grant tower capacity after the run ends',()=>{
  const s=make(),boost=towerLobbyProfile(s);expect(boost.maxHp).toBeGreaterThan(100);
  s.tower!.run=null;expect(towerLobbyProfile(s).maxHp).toBe(100);expect(towerLobbyProfile(s).maxMana).toBe(80);
 });
 it.each([[0,5],[4,5],[5,10],[9,10],[25,30],[29,30],[30,30]])('shows checkpoint after %i as %i',(cleared,next)=>{expect(nextTowerCheckpoint(cleared)).toBe(next);});
});
