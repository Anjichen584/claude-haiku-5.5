import {describe,expect,it} from 'vitest';
import {npcQuestState,questGuidance,directionHint} from '../src/narrative/questGuidance';
import {newSession} from '../src/state/session';
import type {QuestDef,EnemyDef} from '../src/data/schema';

const quest:QuestDef={id:'side',title:'test',type:'side',requires:[],objectives:[{type:'kill',target:'wolf',text:'kill',count:2},{type:'talk',target:'npc',text:'deliver'}]};
const place={id:'camp',name:'Camp',region:'r',x:100,y:100};
const npc={id:'npc',name:'Guide',location:'camp',dialogueId:'dialogue'};
const position={id:'npc',location:'camp',x:106,y:106};
const positions=new Map([['npc',position]]);
const wolf:EnemyDef={id:'wolf',name:'Wolf',hp:20,attack:2,defense:0,speed:70,biomes:[],drops:[{item:'shard',chance:.2}]};
const spawns=[{key:'far',tileX:300,tileY:300,enemyIds:['wolf']},{key:'near',tileX:20,tileY:20,enemyIds:['wolf']}];

describe('NPC quest state',()=>{
  it('distinguishes available, active and ready without granting or completing tasks',()=>{
    const s=newSession([quest]);
    expect(npcQuestState('npc',[quest],s.world)).toMatchObject({kind:'available',available:1,ready:0});
    s.quests.accept('side');expect(npcQuestState('npc',[quest],s.world).kind).toBe('active');
    s.quests.report({type:'kill',target:'wolf',amount:2});expect(npcQuestState('npc',[quest],s.world).kind).toBe('ready');
    expect(s.world.questStatus('side')).toBe('active');
    s.quests.report({type:'talk',target:'npc'});expect(npcQuestState('npc',[quest],s.world).kind).toBe('none');
  });
  it('gives ready delivery priority over new offers',()=>{
    const another={...quest,id:'another'};const s=newSession([quest,another]);s.quests.accept('side');
    s.quests.report({type:'kill',target:'wolf',amount:2});
    expect(npcQuestState('npc',[quest,another],s.world)).toMatchObject({kind:'ready',ready:1,available:1});
  });
});

describe('quest destination guidance',()=>{
  const guide=(q:QuestDef,s:ReturnType<typeof newSession>)=>questGuidance(q,s.world,{x:0,y:0},[place],[npc],positions,spawns,[wolf]);
  it('uses nearest loaded living spawn then the actual NPC layout position for delivery',()=>{
    const s=newSession([quest]);s.quests.accept('side');
    expect(guide(quest,s).point).toEqual({x:20,y:20});
    s.quests.report({type:'kill',target:'wolf',amount:2});
    expect(guide(quest,s)).toMatchObject({point:position,label:'Guide',location:'camp'});
  });
  it('uses the real location center for reach objectives',()=>{
    const q={...quest,objectives:[{type:'reach',target:'camp',text:'reach'}]};const s=newSession([q]);s.quests.accept(q.id);
    expect(guide(q,s).point).toEqual(place);
  });
  it('suggests a possible drop source, not a guaranteed item coordinate',()=>{
    const q={...quest,objectives:[{type:'collect',target:'shard',text:'collect'}]};const s=newSession([q]);s.quests.accept(q.id);
    expect(guide(q,s)).toMatchObject({point:{x:20,y:20},hint:'可能掉落所需物品，并非必掉'});
    expect(questGuidance(q,s.world,{x:0,y:0},[place],[npc],positions,[],[wolf]).point).toBeUndefined();
  });
  it('does not fabricate coordinates when a destination is unknown',()=>{
    const q={...quest,objectives:[{type:'talk',target:'missing',text:'find'}]};const s=newSession([q]);s.quests.accept(q.id);
    expect(guide(q,s).point).toBeUndefined();
  });
  it('describes cardinal and diagonal directions without a fake second axis',()=>{
    expect(directionHint({x:0,y:0},{x:20,y:0})).toBe('20 格 · 向东');
    expect(directionHint({x:0,y:0},{x:0,y:-20})).toBe('20 格 · 向北');
    expect(directionHint({x:0,y:0},{x:-20,y:20})).toContain('西南');
    expect(directionHint({x:0,y:0},{x:1,y:1})).toBe('已到目标附近');
  });
});
