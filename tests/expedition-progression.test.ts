import {describe,it,expect} from 'vitest';
import {loadGameData} from '../src/data/loader';
import {newSession} from '../src/state/session';
import {settleQuestRewards,levelForExp} from '../src/state/rewards';
import {buyItem} from '../src/state/shop';
import {equipItem} from '../src/state/equipment';
import {createSkillTree,unlockSkill} from '../src/skills/skillTree';
import {forgeUnlocked} from '../src/dungeon/ashForge';
import {vaultUnlocked} from '../src/dungeon/tidalVault';
import {expeditionPreparation} from '../src/dungeon/preparation';
const d=loadGameData();
const main=d.quests.filter(q=>['main_01_first_rift','main_02_ash_road','main_03'].includes(q.id));
describe('chapter reward budget and expedition preparation',()=>{
 it('naturally advances chapter events/rewards and gates the two themed expeditions',()=>{
  const s=newSession(main);
  const settle=(events:Parameters<typeof settleQuestRewards>[1]=[])=>settleQuestRewards(s,events,id=>id,id=>id);
  expect(forgeUnlocked(s)).toBe(false);expect(vaultUnlocked(s)).toBe(false);
  settle(s.quests.report({type:'kill',target:'ash_wolf',amount:5}));
  expect(s.player.exp).toBe(300);expect(s.player.gold).toBe(120);expect(s.player.skills.points).toBe(2);
  // Guaranteed camp supplies; excludes kill XP/gold and side rewards on purpose.
  s.world.addItem('rift_shard',2);s.visited.add('ash_road_camp');settle();
  expect(s.player.exp).toBe(800);expect(s.player.gold).toBe(320);expect(levelForExp(s.player.exp)).toBe(4);expect(s.player.skills.points).toBe(3);
  expect(forgeUnlocked(s)).toBe(true);expect(vaultUnlocked(s)).toBe(false);
  for(const id of ['iron_sword','leather_cap','leather_vest']){expect(buyItem(s,d.items.find(i=>i.id===id)!,1).ok).toBe(true);expect(equipItem(s,id,d.items,d.affixes,d.itemSets)).toBe(true);}
  expect(s.player.gold).toBe(220);
  const tree=createSkillTree(s.player.skills.points);unlockSkill(tree,d.skills.find(x=>x.id==='fireball'));expect(tree.points).toBe(2);
  expect(()=>unlockSkill(tree,d.skills.find(x=>x.id==='mana_shield'))).toThrow();
  expect(()=>unlockSkill(tree,d.skills.find(x=>x.id==='trap_set'))).toThrow();
  s.player.skills={unlocked:[...tree.unlocked],equipped:['fireball'],points:tree.points};
  expect(expeditionPreparation(s)).toContain('勿硬扛');
  settle(s.quests.report({type:'kill',target:'frost_wolf',amount:6}));s.visited.add('snow_gate');settle();
  expect(s.world.questStatus('main_03')).toBe('completed');expect(vaultUnlocked(s)).toBe(true);
  const before=[s.player.gold,s.player.exp];settle();expect([s.player.gold,s.player.exp]).toEqual(before);
 });
 it('does not misrepresent the full ash set as affordable from the two main quest rewards',()=>{
  const total=d.items.filter(i=>['ash_sword','ash_helm','ash_plate','ash_boots','ash_gloves','ash_amulet'].includes(i.id)).reduce((n,i)=>n+i.price,0);
  expect(total).toBe(1330);expect(total).toBeGreaterThan(320);
 });
 it('gives read-only preparation advice, including empty equipped slots and scarce supplies',()=>{
  const s=newSession(main);s.player.skills.unlocked=['fireball'];s.player.skills.equipped=[];s.world.addItem('health_potion',-2);
  const before=JSON.stringify(s.player),bag=JSON.stringify(s.world.snapshot());const advice=expeditionPreparation(s);
  expect(advice).toContain('武器');expect(advice).toContain('G 学习');expect(advice).toContain('治疗');expect(JSON.stringify(s.player)).toBe(before);expect(JSON.stringify(s.world.snapshot())).toBe(bag);
 });
});
