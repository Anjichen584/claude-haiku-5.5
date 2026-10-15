import type {BiomeDef} from '../data/schema';
import {generateChunk,chunkOf,FLAG_RIVER} from './chunk';
import type {SurfaceSpawn} from './encounters';
import type {PlacedLocation} from './placement';
import type {PlacedNpc} from './npcPlacement';
import type {GameSession} from '../state/session';
import {surfaceMemberKey} from '../combat/SurfaceCombat';

export interface HuntReward {exp:number;gold:number;items:string[]}
export interface HuntInfo {title:string;level:number;reward:HuntReward}
export interface HuntSpawn extends SurfaceSpawn {hunt:HuntInfo;unlockQuest:string;requiredFlag:string}
const DEFINITIONS=[
 {id:'ash-drake',place:'ash_road_camp',quest:'main_02_ash_road',title:'灰烬幼龙讨伐',level:5,enemyIds:['elite_ash_drake','ember_hound','ember_hound'],reward:{exp:160,gold:90,items:['ash_gloves','health_potion']}},
 {id:'frost-alpha',place:'snow_gate',quest:'main_03',title:'霜狼首领讨伐',level:5,enemyIds:['elite_frost_alpha','frost_wolf','frost_wolf'],reward:{exp:200,gold:110,items:['wild_amulet','health_potion']}},
 {id:'dust-titan',place:'dune_outpost',quest:'main_03',title:'尘暴巨人讨伐',level:6,enemyIds:['elite_dust_titan','sand_scorpion','dust_hyena'],reward:{exp:260,gold:150,items:['scholar_amulet','mana_potion']}},
] as const;
/** Opt-in challenges have independent keys and never replace quest patrols or normal spawns. */
export function placeHunts(places:readonly PlacedLocation[],npcs:ReadonlyMap<string,PlacedNpc>,biomes:readonly BiomeDef[],seed:number):HuntSpawn[]{
 return DEFINITIONS.map(def=>{
  const anchor=places.find(p=>p.id===def.place);if(!anchor)throw new Error(`Missing hunt anchor: ${def.place}`);
  for(let ring=0;ring<20;ring++)for(let y=-ring;y<=ring;y++)for(let x=-ring;x<=ring;x++){
   if(Math.max(Math.abs(x),Math.abs(y))!==ring)continue;
   const tx=anchor.x+30+x*6,ty=anchor.y-26+y*6;
   if(Math.hypot(tx,ty)<45||places.some(p=>Math.hypot(tx-p.x,ty-p.y)<15)||[...npcs.values()].some(p=>Math.hypot(tx-p.x,ty-p.y)<15))continue;
   const {cx,cy}=chunkOf(tx,ty),chunk=generateChunk(seed,cx,cy,biomes),index=(ty-cy*64)*64+tx-cx*64;
   if(chunk.flags[index]&FLAG_RIVER)continue;
   const key=`hunt:${def.id}`;
   return {key,tileX:tx,tileY:ty,enemyIds:[...def.enemyIds],unlockQuest:def.quest,requiredFlag:`hunt-active:${def.id}`,hunt:{title:def.title,level:def.level,reward:{...def.reward,items:[...def.reward.items]}}};
  }
  throw new Error(`No safe hunt location for ${def.id}`);
 });
}
export function huntProgress(session:GameSession,hunt:HuntSpawn):number{
 return session.defeated.has(hunt.key)?hunt.enemyIds.length:hunt.enemyIds.filter((_,i)=>session.defeated.has(surfaceMemberKey(hunt.key,i))).length;
}
export function huntState(session:GameSession,hunt:HuntSpawn):'locked'|'ready'|'active'|'completed'{
 if(session.defeated.has(hunt.key))return 'completed';
 if(session.world.questStatus(hunt.unlockQuest)!=='completed')return 'locked';
 return session.world.hasFlag(hunt.requiredFlag)?'active':'ready';
}
/** Validate acceptance at the model boundary, not just in the UI. */
export function startHunt(session:GameSession,hunt:HuntSpawn,position:{x:number;y:number}):boolean{
 if(huntState(session,hunt)!=='ready'||!Number.isFinite(position.x)||!Number.isFinite(position.y)||Math.hypot(position.x-hunt.tileX,position.y-hunt.tileY)>5)return false;
 session.world.setFlag(hunt.requiredFlag);return true;
}
