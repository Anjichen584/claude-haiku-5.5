export interface CombatPoint {x:number;y:number}
export interface EngagementTarget extends CombatPoint {id:string;dead?:boolean}
export const ENCOUNTER_OPENING_MS = 650;
export const BATTLE_PLAYER_START: CombatPoint = {x:420,y:380};

/** Encounter formations start inside the arena, close enough to read without spawning in melee. */
export function encounterFormation(ids: readonly string[]): {id:string;x:number;y:number}[] {
  return ids.map((id,i) => ({id,x:680+Math.floor(i/4)*100,y:380+(i%4===0?0:i%4===1?-90:i%4===2?90:-160)}));
}

/** Movement assist only; damage and cooldowns still belong to CombatRuntime. */
export function attackIntent(origin:CombatPoint,targets:readonly EngagementTarget[],range:number):
  {targetId:string;direction:CombatPoint;distance:number;approach:number}|null {
  const target=targets.filter(t=>!t.dead).map(t=>({...t,distance:Math.hypot(t.x-origin.x,t.y-origin.y)}))
    .sort((a,b)=>a.distance-b.distance || (a.id<b.id?-1:a.id>b.id?1:0))[0];
  if(!target)return null;
  const distance=target.distance;
  return {targetId:target.id,direction:distance>0?{x:(target.x-origin.x)/distance,y:(target.y-origin.y)/distance}:{x:1,y:0},
    distance,approach:Math.max(0,distance-Math.max(12,range-8))};
}
