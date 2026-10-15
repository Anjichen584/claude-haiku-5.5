import type {SurfaceSpawn} from './encounters';
import {inSettlement,type PlacedNpc} from './npcPlacement';
import type {PlacedLocation} from './placement';
import type {WorldState} from '../state/WorldState';

export const SNOW_PATROL_PREFIX='snow-gate-patrol-';
/** Three deterministic two-wolf patrols, outside all interaction courts. No existing coordinates move. */
export function snowGatePatrols(places:readonly PlacedLocation[],npcs:ReadonlyMap<string,PlacedNpc>):SurfaceSpawn[]{
  const gate=places.find(p=>p.id==='snow_gate');
  if(!gate)return [];
  const result:SurfaceSpawn[]=[];
  for(let i=0;i<3;i++){
    // Approach from the camp side; search a bounded stable lattice when a court occupies an offset.
    let found=false;
    for(let ring=0;ring<16&&!found;ring++)for(let y=-ring;y<=ring&&!found;y++)for(let x=-ring;x<=ring&&!found;x++){
      if(Math.max(Math.abs(x),Math.abs(y))!==ring)continue;
      const point={x:gate.x+18+i*22+x*6,y:gate.y+12+i*16+y*6};
      if(inSettlement(point,places,npcs)||result.some(p=>Math.hypot(p.tileX-point.x,p.tileY-point.y)<12))continue;
      result.push({key:`${SNOW_PATROL_PREFIX}${i}`,tileX:point.x,tileY:point.y,enemyIds:['frost_wolf','frost_wolf'],requiredQuest:'main_03'});
      found=true;
    }
    if(!found)throw new Error('Cannot place snow gate patrol outside settlement courts');
  }
  return result;
}
/** Keep pre-quest and completed saves safe; markers, collision and tracking share this predicate. */
export function spawnAvailable(spawn:SurfaceSpawn,world:WorldState):boolean {
  return (!spawn.requiredQuest || world.questStatus(spawn.requiredQuest)==='active')
    && (!spawn.unlockQuest || world.questStatus(spawn.unlockQuest)==='completed')
    && (!spawn.requiredFlag || world.hasFlag(spawn.requiredFlag));
}
