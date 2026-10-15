import type {EnemyDef,QuestDef,NpcDef} from '../data/schema';
import type {WorldState} from '../state/WorldState';
import type {PlacedLocation} from '../world/placement';
import type {PlacedNpc,TilePoint} from '../world/npcPlacement';
import type {SurfaceSpawn} from '../world/encounters';
import {CAMP_SUPPLIES_FLAG} from '../state/campSupplies';
import {trackedObjective} from './questTracking';

export interface NpcQuestState {available:number;ready:number;active:number;kind:'ready'|'available'|'active'|'none'}
export function npcQuestState(id:string,quests:readonly QuestDef[],world:WorldState):NpcQuestState {
  let available=0,ready=0,active=0;
  for(const q of quests){
    const status=world.questStatus(q.id),record=world.getQuest(q.id);
    if(!q.objectives.some(o=>o.type==='talk'&&o.target===id))continue;
    if(status==='available')available++;
    if(status==='active'){
      active++;
      const deliver=q.objectives.some((o,i)=>o.type==='talk'&&o.target===id&&(record?.progress[i]??0)<(o.count??1));
      if(deliver&&q.objectives.every((o,i)=>o.type==='talk'||(record?.progress[i]??0)>=(o.count??1)))ready++;
    }
  }
  return {available,ready,active,kind:ready?'ready':available?'available':active?'active':'none'};
}
export interface QuestGuidance {point?:TilePoint;label:string;hint:string;location?:string}
export function questGuidance(quest:QuestDef,world:WorldState,player:TilePoint,places:readonly PlacedLocation[],npcs:readonly NpcDef[],
  positions:ReadonlyMap<string,PlacedNpc>,spawns:readonly SurfaceSpawn[],enemies:readonly EnemyDef[]):QuestGuidance {
  const index=trackedObjective(quest,world),objective=quest.objectives[index];
  if(!objective)return {label:'目标已达成',hint:'等待任务结算'};
  if(quest.id==='main_02_ash_road' && ((objective.type==='collect' && objective.target==='rift_shard') || (objective.type==='reach' && objective.target==='ash_road_camp'))
    && world.questStatus(quest.id)==='active' && world.questStatus('main_01_first_rift')==='completed' && !world.hasFlag(CAMP_SUPPLIES_FLAG)){
    const camp=places.find(p=>p.id==='ash_road_camp');
    if(camp)return {point:camp,label:'营地中心 · 首次补给',hint:'靠近营地中心自动领取首次补给',location:camp.id};
  }
  if(objective.type==='reach'){
    const place=places.find(p=>p.id===objective.target);
    return place?{point:place,label:place.name,hint:'走近地点中心',location:place.id}:{label:'探索目标',hint:'地点暂未标注'};
  }
  if(objective.type==='talk'){
    const npc=npcs.find(n=>n.id===objective.target),point=positions.get(objective.target);
    return {point,label:npc?.name??objective.target,hint:point?'靠近后按 E 对话，结束对话才算交付':'NPC 位置暂未标注',location:npc?.location};
  }
  if(objective.type==='kill'||objective.type==='collect'){
    const sources=objective.type==='kill'?enemies.filter(e=>e.id===objective.target):enemies.filter(e=>e.drops?.some(d=>d.item===objective.target));
    const ids=new Set(sources.map(e=>e.id));
    const near=spawns.filter(s=>s.enemyIds.some(id=>ids.has(id))).sort((a,b)=>Math.hypot(a.tileX-player.x,a.tileY-player.y)-Math.hypot(b.tileX-player.x,b.tileY-player.y) || (a.key<b.key?-1:1))[0];
    const names=sources.slice(0,2).map(e=>e.name).join('、');
    // A kill objective must not hide an independently reachable objective forever.
    // This is an exploration waypoint, not a claim that the enemy spawns there.
    if(!near && objective.type==='kill'){
      const record=world.getQuest(quest.id);
      for(const [i,o] of quest.objectives.entries()){
        if(o.type!=='reach' || (record?.progress[i]??0)>=(o.count??1))continue;
        const place=places.find(p=>p.id===o.target);
        if(place)return {point:place,label:`先探索：${place.name}`,hint:'先推进抵达目标；击杀目标仍需另寻',location:place.id};
      }
    }

    return {point:near?{x:near.tileX,y:near.tileY}:undefined,label:near?'附近目标':names||'探索与交易',
      hint:near?(objective.type==='collect'?'可能掉落所需物品，并非必掉':'前往遭遇目标'):
        sources.some(e=>e.boss||e.elite)?'目标可能出现在地牢或剧情遭遇':names?`附近未发现；寻找${names}`:'探索、交易或任务奖励获取'};
  }
  return {label:objective.text,hint:'按任务说明推进'};
}
export function directionHint(from:TilePoint,to:TilePoint):string {
  const distance=Math.hypot(to.x-from.x,to.y-from.y);
  if(distance<=2.5)return '已到目标附近';
  const angle=Math.atan2(to.y-from.y,to.x-from.x);
  const directions=['东','东南','南','西南','西','西北','北','东北'];
  const direction=directions[(Math.round(angle/(Math.PI/4))+8)%8];
  return `${Math.round(distance)} 格 · 向${direction}`;
}
