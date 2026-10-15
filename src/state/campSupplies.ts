import type {GameSession} from './session';
import type {TilePoint} from '../world/npcPlacement';

export const CAMP_SUPPLIES_FLAG='ash-road-intro-supplies-claimed';
export const CAMP_SUPPLIES_TARGET=3;
export interface CampSupplies {claimed:boolean;shards:number;potions:number}
/** One-time chapter-two top-up. Existing explored-but-incomplete saves can claim at the camp too. */
export function claimCampSupplies(session:GameSession,camp:TilePoint|undefined,player:TilePoint):CampSupplies {
  const no:CampSupplies={claimed:false,shards:0,potions:0};
  if(!camp || !Number.isFinite(player.x) || !Number.isFinite(player.y)
    || Math.hypot(camp.x-player.x,camp.y-player.y)>1.5
    || !session.visited.has('ash_road_camp')
    || session.world.questStatus('main_01_first_rift')!=='completed'
    || session.world.questStatus('main_02_ash_road')!=='active'
    || session.world.hasFlag(CAMP_SUPPLIES_FLAG))return no;
  const shards=Math.max(0,CAMP_SUPPLIES_TARGET-session.world.getItemCount('rift_shard'));
  session.world.setFlag(CAMP_SUPPLIES_FLAG);
  if(shards)session.world.addItem('rift_shard',shards);
  session.world.addItem('health_potion',1);
  return {claimed:true,shards,potions:1};
}
