import {describe,it,expect} from 'vitest';
import {newSession,toSaveFile,parseSave,serializeSave,fromSaveFile} from '../src/state/session';
import {validateSkillCombat} from '../src/skills/validateCombat';
import {resetBranch,treeOf,storeTree,indexSkills} from '../src/skills/skillTree';
import questsData from '../data/quests.json';import skillsData from '../data/skills.json';
import type {QuestDef,SkillDef,ItemDef,AffixDef} from '../src/data/schema';
import {cycleSlot} from '../src/state/equipment';
const quests=questsData.quests as QuestDef[],skills=skillsData.skills as SkillDef[];
const save=()=>toSaveFile(newSession(quests));
describe('combat loadout and save validation',()=>{
 it('persists mana and selected skills in version-1 saves',()=>{const s=newSession(quests);s.player.mana=42;s.player.skills={points:2,unlocked:['fireball','first_aid'],equipped:['first_aid','fireball']};const loaded=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),quests);expect(loaded.player).toEqual(s.player);});
 it('legacy saves still load without mana or equipped fields',()=>{const s=parseSave(serializeSave(save()));expect(s.player.mana).toBeUndefined();expect(s.player.skills.equipped).toBeUndefined();});
 it('a save snapshot does not alias mutable inventory, quests or equipment',()=>{const s=newSession(quests);s.player.skills.equipped=['slash'];s.player.skills.unlocked=['slash'];const snapshot=toSaveFile(s);s.player.skills.equipped.push('fireball');s.player.skills.unlocked.push('fireball');s.player.equipment.main_hand='iron_sword';s.world.getQuest('main_01_first_rift')!.progress[0]=5;expect(snapshot.player.skills.equipped).toEqual(['slash']);expect(snapshot.player.skills.unlocked).toEqual(['slash']);expect(snapshot.player.equipment).toEqual({});expect(snapshot.world.quests.main_01_first_rift.progress[0]).toBe(0);});
 it.each([-1,81,Infinity])('rejects impossible mana %s',mana=>{const s=save();s.player.mana=mana;expect(()=>parseSave(serializeSave(s))).toThrow(/魔力/);});
 it('reset removes skills from loadout and keeps unrelated skills',()=>{const p={skills:{points:0,unlocked:['slash','fireball'],equipped:['slash','fireball']}};const tree=treeOf(p);resetBranch(tree,'martial',indexSkills(skills));storeTree(p,tree);expect(p.skills.equipped).toEqual(['fireball']);});
 it('rejects duplicate and unlearned loadout entries',()=>{const s=save();s.player.skills={points:0,unlocked:['fireball'],equipped:['fireball','fireball']};expect(()=>parseSave(serializeSave(s))).toThrow(/技能栏/);s.player.skills.equipped=['slash'];expect(()=>parseSave(serializeSave(s))).toThrow(/技能栏/);});
 it('rejects unknown equipment slots and wrong-slot items',()=>{const s=save();s.player.equipment={fake:'iron_sword'};expect(()=>parseSave(serializeSave(s))).toThrow(/装备/);s.player.equipment={head:'iron_sword'};expect(()=>parseSave(serializeSave(s))).toThrow(/装备/);});
 it.each(['inventory','reputation','quests','stability'] as const)('rejects malformed nested world %s',field=>{const s=save();if(field==='inventory')s.world.inventory.x=-5;else if(field==='reputation')s.world.reputation.x=101;else if(field==='quests')s.world.quests.x={status:'active',progress:[-1]};else s.world.stability=-1;expect(()=>parseSave(serializeSave(s))).toThrow();});
 it('clamps mana after removing a mana item',()=>{const i:ItemDef={id:'hat',name:'hat',slot:'head',type:'armor',rarity:'uncommon',itemLevel:1,price:1};const a:AffixDef={id:'mana',name:'mana',stat:'maxMana',min:20,max:20,weight:1};const s=newSession(quests);s.player.equipment={head:'hat'};s.player.mana=100;cycleSlot(s,'head',[i],[a]);expect(s.player.mana).toBe(80);});
});
describe('skill behavior validation',()=>{
 it('accepts every production skill',()=>{expect(skills.flatMap(validateSkillCombat)).toEqual([]);});
 it.each([{kind:'nova',description:'bad',radius:-1},{kind:'buff',description:'bad',damageReduction:2},{kind:'unknown',description:''},{kind:'strike',description:'bad',range:0}])('rejects malformed behavior %s',bad=>{const s={...skills[0],combat:bad} as SkillDef;expect(validateSkillCombat(s).length).toBeGreaterThan(0);});
});
