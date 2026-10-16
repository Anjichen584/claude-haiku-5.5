import type {Element} from '../combat/damage';
import {ARENA_BOUNDS} from '../combat/crowd';

export interface HazardPoint {x:number;y:number}
export type HazardZone={kind:'circle';x:number;y:number;radius:number}|{kind:'lane';x:number;left:number;right:number;top:number;bottom:number};
export interface HazardRule {name:string;hint:string;element:Element;attack:number;windupMs:number;intervalMs:number}
export interface HazardWarning {zones:HazardZone[];remainingMs:number;durationMs:number}
export interface HazardStrike {zones:HazardZone[];attack:number;element:Element}

export function towerHazardRule(floor:number):HazardRule|null{
 if(floor===10)return {name:'余烬落火',hint:'落点锁定后离开火圈；闪避可规避命中',element:'fire',attack:26,windupMs:1400,intervalMs:6500};
 if(floor===20)return {name:'冰霜封线',hint:'离开蓝色纵向封锁带，或在爆发时闪避',element:'ice',attack:32,windupMs:1600,intervalMs:7500};
 if(floor===30)return {name:'双重裂隙',hint:'两处裂隙同时爆发；避开双圈或闪避',element:'dark',attack:38,windupMs:1400,intervalMs:6500};
 return null;
}
export function hazardContains(zone:HazardZone,point:HazardPoint):boolean{
 return zone.kind==='circle'?Math.hypot(point.x-zone.x,point.y-zone.y)<=zone.radius:
 point.x>=zone.left&&point.x<=zone.right&&point.y>=zone.top&&point.y<=zone.bottom;
}
/** Combat-time only. No real-time clock, timers or save mutations; paused frames never advance. */
export class TowerHazards {
 readonly rule:HazardRule|null;
 warning:HazardWarning|null=null;
 elapsedMs=0;
 strikes=0;
 private nextWarningMs=2200;
 constructor(readonly floor:number){this.rule=towerHazardRule(floor);}
 tick(deltaMs:number,position:HazardPoint):HazardStrike|null{
  if(!this.rule||!Number.isFinite(deltaMs)||deltaMs<=0||!Number.isFinite(position.x)||!Number.isFinite(position.y))return null;
  // Bound a resumed/background frame: it must never skip the full telegraph.
  const dt=Math.min(deltaMs,100);this.elapsedMs+=dt;
  if(this.warning){
   this.warning.remainingMs=Math.max(0,this.warning.remainingMs-dt);
   if(this.warning.remainingMs>0)return null;
   const zones=this.warning.zones;this.warning=null;this.strikes++;
   this.nextWarningMs=this.elapsedMs+this.rule.intervalMs;
   return {zones,attack:this.rule.attack,element:this.rule.element};
  }
  if(this.elapsedMs<this.nextWarningMs)return null;
  const x=Math.max(ARENA_BOUNDS.left,Math.min(ARENA_BOUNDS.right,position.x));
  const y=Math.max(ARENA_BOUNDS.top,Math.min(ARENA_BOUNDS.bottom,position.y));
  const zones:HazardZone[]=this.floor===20?
   [{kind:'lane',x,left:Math.max(ARENA_BOUNDS.left,x-75),right:Math.min(ARENA_BOUNDS.right,x+75),top:ARENA_BOUNDS.top,bottom:ARENA_BOUNDS.bottom}]:
   [{kind:'circle',x,y,radius:90}];
  if(this.floor===30)zones.push({kind:'circle',x:ARENA_BOUNDS.left+ARENA_BOUNDS.right-x,y:ARENA_BOUNDS.top+ARENA_BOUNDS.bottom-y,radius:90});
  this.warning={zones,remainingMs:this.rule.windupMs,durationMs:this.rule.windupMs};return null;
 }
}
