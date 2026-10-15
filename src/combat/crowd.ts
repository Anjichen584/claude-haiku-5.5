import type {CombatPoint} from './engagement';
export const ARENA_BOUNDS = {left:110,right:1170,top:210,bottom:500} as const;
export const ENEMY_SEPARATION = 72;
export interface CrowdUnit extends CombatPoint {id:string;anchored?:boolean}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

/** Position correction only. Anchored windups never move; no damage, aggro or reward changes. */
export function separateEnemies(units:readonly CrowdUnit[],spacing=ENEMY_SEPARATION):CrowdUnit[] {
  const sorted=units.map(u=>({...u})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(let pass=0;pass<8;pass++) {
    for(let i=0;i<sorted.length;i++) for(let j=i+1;j<sorted.length;j++) {
      const a=sorted[i],b=sorted[j];
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d>=spacing || (a.anchored && b.anchored))continue;
      const nx=d>0?dx/d:1,ny=d>0?dy/d:0;
      const push=spacing-d;
      const aShare=a.anchored?0:b.anchored?1:.5,bShare=1-aShare;
      if(!a.anchored){a.x=clamp(a.x-nx*push*aShare,ARENA_BOUNDS.left,ARENA_BOUNDS.right);a.y=clamp(a.y-ny*push*aShare,ARENA_BOUNDS.top,ARENA_BOUNDS.bottom);}
      if(!b.anchored){b.x=clamp(b.x+nx*push*bShare,ARENA_BOUNDS.left,ARENA_BOUNDS.right);b.y=clamp(b.y+ny*push*bShare,ARENA_BOUNDS.top,ARENA_BOUNDS.bottom);}
    }
  }
  const byId=new Map(sorted.map(u=>[u.id,u]));
  return units.map(u=>byId.get(u.id)!);
}
