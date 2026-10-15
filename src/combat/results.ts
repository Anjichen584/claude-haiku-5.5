import type {GameSession} from '../state/session';
import {levelForExp} from '../state/rewards';

export interface BattleSnapshot {
  exp:number;gold:number;skillPoints:number;inventory:Record<string,number>;
  reputation:Record<string,number>;stability:number;
}
export interface BattleSummary {
  exp:number;gold:number;levelBefore:number;levelAfter:number;skillPoints:number;
  items:{id:string;delta:number}[];reputation:{id:string;delta:number}[];stability:number;
}
export function battleSnapshot(session:GameSession):BattleSnapshot {
  const world=session.world.snapshot();
  return {exp:session.player.exp,gold:session.player.gold,skillPoints:session.player.skills.points,
    inventory:{...world.inventory},reputation:{...world.reputation},stability:world.stability??50};
}
/** Read actual state differences after all settlements. Never grants rewards or parses display logs. */
export function battleSummary(before:BattleSnapshot,after:BattleSnapshot):BattleSummary {
  const changes=(a:Record<string,number>,b:Record<string,number>)=>[...new Set([...Object.keys(a),...Object.keys(b)])].sort()
    .map(id=>({id,delta:(b[id]??0)-(a[id]??0)})).filter(x=>x.delta!==0);
  return {exp:after.exp-before.exp,gold:after.gold-before.gold,levelBefore:levelForExp(before.exp),levelAfter:levelForExp(after.exp),
    skillPoints:after.skillPoints-before.skillPoints,items:changes(before.inventory,after.inventory),
    reputation:changes(before.reputation,after.reputation),stability:after.stability-before.stability};
}
export function resultPages(lines:readonly string[],size=6):string[][] {
  if(!Number.isInteger(size)||size<1)throw new RangeError('Invalid result page size');
  const pages:string[][]=[];
  for(let i=0;i<lines.length;i+=size)pages.push(lines.slice(i,i+size));
  return pages.length?pages:[['本场没有物品或任务状态变化。']];
}
/** A held dodge or buffered Space must not dismiss a newly-created result. */
export class ResultInputGate {
  private armed=false;
  constructor(private shownAt:number,private delayMs=450){}
  update(now:number,held:boolean,tapped:boolean):boolean {
    if(!this.armed){
      if(now-this.shownAt>=this.delayMs && !held)this.armed=true;
      return false;
    }
    return tapped;
  }
  get ready():boolean{return this.armed;}
}
