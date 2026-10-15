import {describe,expect,it} from 'vitest';
import {snowGatePatrols,spawnAvailable,SNOW_PATROL_PREFIX} from '../src/world/storyPatrols';
import {placeLocations} from '../src/world/placement';
import {placeNpcs,inSettlement} from '../src/world/npcPlacement';
import {newSession,toSaveFile,fromSaveFile,parseSave,serializeSave} from '../src/state/session';
import locations from '../data/locations.json';
import npcs from '../data/npcs.json';
import quests from '../data/quests.json';
import type {QuestDef} from '../src/data/schema';
const places=placeLocations(locations.locations,20261014),positions=placeNpcs(npcs.npcs,places);
const patrols=snowGatePatrols(places,positions),defs=quests.quests as QuestDef[];

describe('snow gate story patrols',()=>{
  it('provides six real wolves to match chapter three without relying on random biome spawns',()=>{
    expect(patrols).toHaveLength(3);
    expect(patrols.flatMap(s=>s.enemyIds)).toEqual(Array(6).fill('frost_wolf'));
    expect(defs.find(q=>q.id==='main_03')?.objectives[0].count).toBe(6);
    expect(new Set(patrols.map(s=>s.key)).size).toBe(3);
    expect(patrols.every(s=>s.key.startsWith(SNOW_PATROL_PREFIX))).toBe(true);
  });
  it('is stable across data order and outside NPC and settlement interaction courts',()=>{
    expect(snowGatePatrols([...places].reverse(),new Map([...positions].reverse()))).toEqual(patrols);
    for(const p of patrols){
      expect(inSettlement({x:p.tileX,y:p.tileY},places,positions)).toBe(false);
      for(const other of patrols)if(p!==other)expect(Math.hypot(p.tileX-other.tileX,p.tileY-other.tileY)).toBeGreaterThanOrEqual(12);
    }
  });
  it('is inactive before chapter three and after completed or failed states; ordinary spawns unaffected',()=>{
    const s=newSession(defs);
    for(const status of ['locked','available','completed','failed'] as const){
      s.world.setQuest('main_03',{status,progress:[0,0]});expect(spawnAvailable(patrols[0],s.world)).toBe(false);
    }
    s.world.setQuest('main_03',{status:'active',progress:[0,0]});expect(spawnAvailable(patrols[0],s.world)).toBe(true);
    expect(spawnAvailable({key:'0,0,1',tileX:0,tileY:0,enemyIds:['ash_wolf']},s.world)).toBe(true);
  });
  it('keeps old v1 active saves compatible and defeated keys stable across reloads',()=>{
    const s=newSession(defs);s.world.setQuest('main_03',{status:'active',progress:[2,0]});s.defeated.add(patrols[0].key);
    const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),defs);
    const available=snowGatePatrols(places,positions).filter(p=>spawnAvailable(p,restored.world)&&!restored.defeated.has(p.key));
    expect(available).toHaveLength(2);expect(available.flatMap(p=>p.enemyIds)).toHaveLength(4);
  });
  it('does not mutate placement data or require a save migration',()=>{
    const before=JSON.stringify(places);snowGatePatrols(places,positions);expect(JSON.stringify(places)).toBe(before);
    expect(snowGatePatrols([],new Map())).toEqual([]);
  });
});
