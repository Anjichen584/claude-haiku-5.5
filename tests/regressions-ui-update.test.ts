import { describe, expect, it, vi, afterEach } from 'vitest';
import { newSession, parseSave, serializeSave, toSaveFile } from '../src/state/session';
import { cycleSlot, combatStats } from '../src/state/equipment';
import { settleQuestRewards } from '../src/state/rewards';
import { writeSaveRaw } from '../src/state/sessionStore';
import questsData from '../data/quests.json';
import itemsData from '../data/items.json';
import affixesData from '../data/affixes.json';
import setsData from '../data/item-sets.json';
import type { QuestDef, ItemDef, AffixDef } from '../src/data/schema';
import type { ItemSetDef } from '../src/items/sets';
const quests=questsData.quests as QuestDef[],items=itemsData.items as ItemDef[],affixes=affixesData.affixes as AffixDef[],sets=setsData.sets as ItemSetDef[];
const settle=(s:ReturnType<typeof newSession>,c:Parameters<typeof settleQuestRewards>[1]=[])=>settleQuestRewards(s,c,id=>id,id=>id);

describe('integration regressions: discoveries, equipment and storage',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it('previsited main quest destination counts when its chapter unlocks, with no duplicate rewards',()=>{
  const s=newSession(quests);s.visited.add('ash_road_camp');s.quests.report({type:'reach',target:'ash_road_camp'});
  s.world.addItem('rift_shard',3);
  const done=s.quests.report({type:'kill',target:'ash_wolf',amount:5});
  const result=settle(s,done);
  expect(s.world.questStatus('main_02_ash_road')).toBe('completed');
  expect(result.completed.map(c=>c.questId)).toContain('main_02_ash_road');
  const gold=s.player.gold;expect(settle(s).completed).toEqual([]);expect(s.player.gold).toBe(gold);
 });
 it('a previsited reach objective is reconciled for a newly accepted side quest',()=>{
  const s=newSession(quests);s.visited.add('ash_road_camp');
  const mock:QuestDef={id:'side_visit',title:'visit',type:'side',requires:[],objectives:[{type:'reach',target:'ash_road_camp',text:'visit'}],rewards:{gold:10}};
  const session=newSession([mock]);session.visited.add('ash_road_camp');session.quests.accept('side_visit');
  expect(settle(session).completed.map(c=>c.questId)).toEqual(['side_visit']);expect(session.player.gold).toBe(10);
 });
 it.each(['ash_helm','rift_blade'])('equipment-derived hp above 100 round-trips: %s',id=>{
  const s=newSession(quests),item=items.find(i=>i.id===id)!;
  s.player.equipment={[item.slot!]:id};s.player.hp=combatStats(s.player.equipment,items,affixes,sets).maxHp;
  expect(s.player.hp).toBeGreaterThan(100);
  expect(parseSave(serializeSave(toSaveFile(s))).player.hp).toBe(s.player.hp);
 });
 it('rejects hp above the equipped maximum',()=>{
  const s=newSession(quests);s.player.equipment={head:'ash_helm'};s.player.hp=136;
  expect(()=>parseSave(serializeSave(toSaveFile(s)))).toThrow(/生命值/);
 });
 it('unequipping clamps hp to the new maximum and returns the item',()=>{
  const s=newSession(quests);s.player.equipment={head:'ash_helm'};s.player.hp=135;
  cycleSlot(s,'head',items,affixes,sets);
  expect(s.player.hp).toBe(100);expect(s.world.getItemCount('ash_helm')).toBe(1);
 });
 it('equipment switching preserves hp when the new equipment still supports it',()=>{
  const s=newSession(quests);s.player.equipment={head:'ash_helm'};s.player.hp=120;s.world.addItem('iron_sword',1);
  cycleSlot(s,'main_hand',items,affixes,sets);expect(s.player.hp).toBe(120);
 });
 it('does not claim a successful save when storage is unavailable',()=>{
  vi.stubGlobal('localStorage',undefined);expect(writeSaveRaw('{}')).toBe(false);
 });
 it('reports storage failure without throwing',()=>{
  vi.stubGlobal('localStorage',{setItem:()=>{throw new Error('quota');}});expect(writeSaveRaw('{}')).toBe(false);
 });
});
