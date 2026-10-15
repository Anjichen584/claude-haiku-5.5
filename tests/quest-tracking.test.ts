import {describe,expect,it} from 'vitest';
import {questPage,trackedObjective,trackedQuest,trackableQuests} from '../src/narrative/questTracking';
import {newSession,parseSave,serializeSave,toSaveFile,fromSaveFile} from '../src/state/session';
import type {QuestDef} from '../src/data/schema';

const main:QuestDef={id:'main',title:'main',type:'main',chapter:1,requires:[],objectives:[{type:'kill',target:'wolf',text:'kill',count:2}]};
const side:QuestDef={id:'side',title:'side',type:'side',requires:[],objectives:[{type:'talk',target:'npc',text:'deliver'},{type:'kill',target:'wolf',text:'kill',count:2}]};
const defs=[side,main];
const setup=()=>{const s=newSession(defs);s.quests.accept(side.id);return s;};

describe('quest tracking',()=>{
  it('defaults to main but allows explicit side tracking',()=>{
    const s=setup();expect(trackedQuest(defs,s.world)?.id).toBe('main');
    expect(trackedQuest(defs,s.world,'side')?.id).toBe('side');
    expect(trackableQuests(defs,s.world).map(q=>q.id)).toEqual(['main','side']);
  });
  it('falls back when the preferred quest completes, fails or disappears',()=>{
    const s=setup();s.world.setQuest('side',{status:'completed',progress:[1,2]});
    expect(trackedQuest(defs,s.world,'side')?.id).toBe('main');
    expect(trackedQuest(defs,s.world,'missing')?.id).toBe('main');
    s.world.setQuest('main',{status:'failed',progress:[0]});
    expect(trackedQuest(defs,s.world,'main')).toBeUndefined();
  });
  it('guides non-talk objectives before delivery even when talk appears first',()=>{
    const s=setup();expect(trackedObjective(side,s.world)).toBe(1);
    s.quests.report({type:'kill',target:'wolf',amount:2});
    expect(trackedObjective(side,s.world)).toBe(0);
  });
  it('paginates all active tasks and wraps in both directions',()=>{
    const s=setup();expect(questPage(defs,s.world,1,1).items[0].id).toBe('side');
    expect(questPage(defs,s.world,-1,1).page).toBe(1);
    expect(questPage(defs,s.world,2,1).page).toBe(0);
    expect(questPage([],s.world,0)).toEqual({items:[],page:0,pages:1});
  });
  it('persists side tracking without changing save version or player structure',()=>{
    const s=setup();s.trackedQuestId='side';const before=JSON.stringify(s.player);
    const file=parseSave(serializeSave(toSaveFile(s))),restored=fromSaveFile(file,defs);
    expect(file.version).toBe(1);expect(restored.trackedQuestId).toBe('side');expect(JSON.stringify(restored.player)).toBe(before);
  });
  it('accepts old saves without tracking and rejects malformed tracking values',()=>{
    const raw=JSON.parse(serializeSave(toSaveFile(setup())));
    expect(parseSave(JSON.stringify(raw)).trackedQuestId).toBeUndefined();
    for(const id of [42,null,{},'', 'x'.repeat(201)])expect(()=>parseSave(JSON.stringify({...raw,trackedQuestId:id}))).toThrow(/追踪/);
  });
});
