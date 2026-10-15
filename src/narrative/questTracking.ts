import type {QuestDef} from '../data/schema';
import type {WorldState} from '../state/WorldState';

export function trackableQuests(quests:readonly QuestDef[],world:WorldState):QuestDef[] {
  const order={main:0,side:1,hidden:2};
  return quests.filter(q=>world.questStatus(q.id)==='active')
    .sort((a,b)=>order[a.type]-order[b.type] || (a.chapter??0)-(b.chapter??0) || (a.id<b.id?-1:a.id>b.id?1:0));
}
export function trackedQuest(quests:readonly QuestDef[],world:WorldState,preferred?:string):QuestDef|undefined {
  const active=trackableQuests(quests,world);
  return active.find(q=>q.id===preferred)??active[0];
}
/** Delivery dialogue waits for all other objectives, even if the data lists talk first. */
export function trackedObjective(quest:QuestDef,world:WorldState):number {
  const record=world.getQuest(quest.id);
  const unfinished=(index:number)=>(record?.progress[index]??0)<(quest.objectives[index].count??1);
  const action=quest.objectives.findIndex((o,i)=>o.type!=='talk'&&unfinished(i));
  return action>=0?action:quest.objectives.findIndex((_,i)=>unfinished(i));
}
export function questPage(quests:readonly QuestDef[],world:WorldState,page:number,size=3):{items:QuestDef[];page:number;pages:number} {
  if(!Number.isInteger(size)||size<1)throw new RangeError('Invalid quest page size');
  const active=trackableQuests(quests,world),pages=Math.max(1,Math.ceil(active.length/size));
  const normalized=((page%pages)+pages)%pages;
  return {items:active.slice(normalized*size,(normalized+1)*size),page:normalized,pages};
}
