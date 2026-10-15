import {describe,expect,it} from 'vitest';
import questsJson from '../data/quests.json';
import enemiesJson from '../data/enemies.json';
import type {QuestDef,EnemyDef} from '../src/data/schema';
import {newSession,toSaveFile,serializeSave,parseSave,fromSaveFile} from '../src/state/session';
import {settleQuestRewards} from '../src/state/rewards';
import {claimCampSupplies,CAMP_SUPPLIES_FLAG,CAMP_SUPPLIES_TARGET} from '../src/state/campSupplies';
import {rollDrops} from '../src/state/killRewards';
const quests=questsJson.quests as QuestDef[];
const camp={x:95,y:-3};
function chapterTwo(){
  const s=newSession(quests);
  const completed=s.quests.report({type:'kill',target:'ash_wolf',amount:5});
  settleQuestRewards(s,completed,id=>id,id=>id);
  s.visited.add('ash_road_camp');s.quests.report({type:'reach',target:'ash_road_camp'});
  return s;
}

describe('early camp progression safety net',()=>{
  it('documents the fixed starter packs dropping no shards and the chapter requirement',()=>{
    const wolf=enemiesJson.enemies.find(e=>e.id==='ash_wolf') as EnemyDef;
    const drops=[];
    for(let pack=0;pack<3;pack++)for(let slot=0;slot<(pack===2?1:2);slot++)drops.push(...rollDrops(wolf,`camp-wolves-${pack}:${slot}`));
    expect(drops.filter(id=>id==='rift_shard')).toEqual([]);
    expect(quests.find(q=>q.id==='main_02_ash_road')?.objectives.find(o=>o.type==='collect')?.count).toBe(CAMP_SUPPLIES_TARGET);
  });
  it('tops up the missing materials so the ordinary route completes chapter two',()=>{
    const s=chapterTwo();expect(s.world.getItemCount('rift_shard')).toBe(1);
    expect(claimCampSupplies(s,camp,camp)).toEqual({claimed:true,shards:2,potions:1});
    expect(s.world.getItemCount('rift_shard')).toBe(3);
    const result=settleQuestRewards(s,[],id=>id,id=>id);
    expect(result.completed.map(c=>c.questId)).toContain('main_02_ash_road');
    expect(s.world.questStatus('main_03')).toBe('active');
  });
  it('cannot be claimed remotely, before discovery, in chapter one or after completion',()=>{
    const s=chapterTwo();
    expect(claimCampSupplies(s,camp,{x:0,y:0}).claimed).toBe(false);
    s.visited.clear();expect(claimCampSupplies(s,camp,camp).claimed).toBe(false);
    expect(claimCampSupplies(newSession(quests),camp,camp).claimed).toBe(false);
    s.visited.add('ash_road_camp');s.world.setQuest('main_02_ash_road',{status:'completed',progress:[1,3]});
    expect(claimCampSupplies(s,camp,camp).claimed).toBe(false);
  });
  it('supports old discovered-but-incomplete saves and persists an idempotent claim',()=>{
    let s=fromSaveFile(parseSave(serializeSave(toSaveFile(chapterTwo()))),quests);
    expect(claimCampSupplies(s,camp,camp).claimed).toBe(true);
    const gold=s.player.gold,potions=s.world.getItemCount('health_potion');
    s=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),quests);
    expect(s.world.hasFlag(CAMP_SUPPLIES_FLAG)).toBe(true);
    expect(claimCampSupplies(s,camp,camp).claimed).toBe(false);
    expect(s.world.getItemCount('health_potion')).toBe(potions);expect(s.player.gold).toBe(gold);
  });
  it('does not add excess shards or accept nonfinite positions',()=>{
    const s=chapterTwo();s.world.addItem('rift_shard',5);
    expect(claimCampSupplies(s,camp,{x:NaN,y:0}).claimed).toBe(false);
    expect(claimCampSupplies(s,camp,camp).shards).toBe(0);expect(s.world.getItemCount('rift_shard')).toBe(6);
  });
});
