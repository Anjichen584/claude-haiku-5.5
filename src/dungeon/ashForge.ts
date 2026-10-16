import {Rng,hashSeed} from '../core/Rng';
import type {EnemyDef} from '../data/schema';
import type {GameSession} from '../state/session';
import {applyGains,type Gains} from '../state/rewards';

export const FORGE_ROOMS=['entry','hall','valves','cache','boss','exit'] as const;
export type ForgeRoom=typeof FORGE_ROOMS[number];
export const FORGE_NAMES:Record<ForgeRoom,string>={entry:'熔炉入口',hall:'熔渣长廊',valves:'冷却阀室',cache:'军械支库',boss:'泰坦炉心',exit:'结算宝匣'};
export const FORGE_EDGES:readonly [ForgeRoom,ForgeRoom][]=[['entry','hall'],['hall','valves'],['valves','cache'],['valves','boss'],['cache','boss'],['boss','exit']];
export const FORGE_GEAR=['ash_sword','ash_helm','ash_plate','ash_boots','ash_gloves','ash_amulet'] as const;
export const EMBER_PRICE=3;
export type ForgeDifficulty='normal'|'challenge';
export const forgeDifficulty=(r:ForgeRun):ForgeDifficulty=>r.difficulty??'normal';
export interface ForgeRun {difficulty?:'challenge';id:number;current:ForgeRoom;cleared:ForgeRoom[];valveStep:number;pressure:number}
export interface ForgeProgress {version:1;attempts:number;clears:number;challengeClears?:number;embers:number;run:ForgeRun|null}
export const newForge=():ForgeProgress=>({version:1,attempts:0,clears:0,challengeClears:0,embers:0,run:null});
export function forgeUnlocked(s:GameSession):boolean{return s.world.questStatus('main_02_ash_road')==='completed';}
export function canStartForge(s:GameSession):boolean{
 return forgeUnlocked(s)&&!s.tower?.run&&s.dungeon?.activeFloor==null&&Number.isFinite(s.player.tileX)&&Number.isFinite(s.player.tileY)&&Math.hypot(s.player.tileX-4,s.player.tileY-4)<=10;
}
export function startForge(s:GameSession,difficulty:ForgeDifficulty='normal'):boolean{
 if(!canStartForge(s))return false;const p=s.forge??=newForge();if(p.run||p.attempts>=1000000||!['normal','challenge'].includes(difficulty)||(difficulty==='challenge'&&p.clears<1))return false;
 p.run={...(difficulty==='challenge'?{difficulty:'challenge' as const}:{}),id:++p.attempts,current:'entry',cleared:[],valveStep:0,pressure:0};return true;
}
export function forgeNeighbors(room:ForgeRoom):ForgeRoom[]{return FORGE_EDGES.flatMap(([a,b])=>a===room?[b]:b===room?[a]:[]);}
export function isForgeCombat(room:ForgeRoom):boolean{return ['hall','cache','boss'].includes(room);}
export function canMoveForge(r:ForgeRun,to:ForgeRoom):boolean{
 if(!forgeNeighbors(r.current).includes(to))return false;
 if(isForgeCombat(r.current)&&!r.cleared.includes(r.current))return false;
 if(r.current==='valves'&&!r.cleared.includes('valves')&&to!=='hall')return false;
 if(['cache','boss','exit'].includes(to)&&!r.cleared.includes('valves'))return false;
 if(to==='exit'&&!r.cleared.includes('boss'))return false;
 // The optional preparation route must happen before the boss has fallen.
 if(to==='cache'&&r.cleared.includes('boss')&&!r.cleared.includes('cache'))return false;
 return true;
}
export function moveForge(r:ForgeRun,to:ForgeRoom):boolean{if(!canMoveForge(r,to))return false;r.current=to;return true;}
export function valveOrder(r:ForgeRun):number[]{
 const ids=[1,2,3],rng=new Rng(hashSeed('ash-forge-valves',r.id));
 for(let i=2;i>0;i--){const j=rng.int(0,i);[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;
}
export function operateValve(r:ForgeRun,index:number):'blocked'|'wrong'|'progress'|'complete'{
 if(r.current!=='valves'||!r.cleared.includes('hall')||r.cleared.includes('valves')||!Number.isInteger(index)||index<1||index>3)return 'blocked';
 if(index!==valveOrder(r)[r.valveStep]){r.valveStep=0;r.pressure=Math.min(3,r.pressure+1);return 'wrong';}
 r.valveStep++;if(r.valveStep===3){r.cleared.push('valves');return 'complete';}return 'progress';
}
export function forgeEnemies(r:ForgeRun,enemies:readonly EnemyDef[]):EnemyDef[]{
 const hard=forgeDifficulty(r)==='challenge';
 const ids=r.current==='hall'?['ember_hound','ash_crow','ember_lizard',...(hard?['cinder_golem']:[])]:r.current==='cache'?['elite_magma_crab','ember_hound',...(hard?['ember_lizard']:[])]:r.current==='boss'?['boss_ember_titan',...(hard?['ash_crow']:[])]:[];
 return ids.map(id=>{
  const e=enemies.find(x=>x.id===id);if(!e)throw new Error(`熔炉敌人缺失：${id}`);
  return {...e,hp:Math.round(e.hp*(hard?1.3:1)*(e.boss&&r.cleared.includes('cache')?.8:1)),attack:Math.round(e.attack*(hard?1.15:1))+(e.boss?r.pressure*3:0),defense:e.defense+(hard?2:0),drops:[]};
 });
}
export function finishForgeCombat(p:ForgeProgress,id:number,room:ForgeRoom,won:boolean):boolean{
 const r=p.run;if(!r||r.id!==id||r.current!==room||!isForgeCombat(room)||r.cleared.includes(room))return false;
 if(room!=='hall'&&!r.cleared.includes('valves'))return false;
 if(!won){p.run=null;return true;}r.cleared.push(room);return true;
}
export function forgeReward(r:ForgeRun):{gains:Gains;embers:number}{
 const extra=r.cleared.includes('cache'),hard=forgeDifficulty(r)==='challenge';return {gains:{exp:hard?(extra?800:600):(extra?360:240),gold:hard?(extra?420:300):(extra?180:120),items:[]},embers:hard?(extra?8:6):(extra?5:3)};
}
export function claimForge(s:GameSession):boolean{
 const p=s.forge,r=p?.run;if(!p||!r||r.current!=='exit'||!r.cleared.includes('boss'))return false;
 const reward=forgeReward(r);p.run=null;p.clears++;if(forgeDifficulty(r)==='challenge')p.challengeClears=(p.challengeClears??0)+1;p.embers+=reward.embers;applyGains(s,reward.gains);return true;
}
export function exchangeForgeGear(s:GameSession,id:string):boolean{
 const p=s.forge;if(!p||p.run||!canStartForge(s)||p.embers<EMBER_PRICE||!FORGE_GEAR.some(x=>x===id))return false;
 p.embers-=EMBER_PRICE;s.world.addItem(id,1);return true;
}
/** Optional v1 save extension. Validate chronology as well as field types. */
export function parseForge(raw:unknown):ForgeProgress{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const int=(v:unknown,a:number,b:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=a&&v<=b;
 const bad=():never=>{throw new Error('灰烬熔炉存档错误');};
 if(!obj(raw)||raw.version!==1||!int(raw.attempts,0,1000000)||!int(raw.clears,0,raw.attempts)||!int(raw.embers,0,raw.clears*8))return bad();
 const challengeClears=raw.challengeClears===undefined?0:raw.challengeClears;
 if(!int(challengeClears,0,Math.max(0,raw.clears-1))||raw.embers>raw.clears*5+challengeClears*3)return bad();
 let run:ForgeRun|null=null;
 if(raw.run!==null){
  const r=raw.run;
  if(!obj(r)||!int(r.id,1,raw.attempts)||r.id!==raw.attempts||raw.clears>=raw.attempts||!FORGE_ROOMS.includes(r.current as ForgeRoom)||!Array.isArray(r.cleared)||r.cleared.length>4||!r.cleared.every(x=>['hall','valves','cache','boss'].includes(String(x)))||new Set(r.cleared).size!==r.cleared.length||!int(r.valveStep,0,3)||!int(r.pressure,0,3))return bad();
  if(r.difficulty!==undefined&&r.difficulty!=='challenge')return bad();
  if(r.difficulty==='challenge'&&raw.clears<1)return bad();
  const cleared=r.cleared as ForgeRoom[],current=r.current as ForgeRoom;
  if(cleared.includes('valves')!==(r.valveStep===3)||(!cleared.includes('hall')&&(cleared.length>0||!['entry','hall'].includes(current)))||((cleared.includes('cache')||cleared.includes('boss')||['cache','boss','exit'].includes(current))&&!cleared.includes('valves'))||(current==='exit'&&!cleared.includes('boss')))return bad();
  if(current==='cache'&&cleared.includes('boss')&&!cleared.includes('cache'))return bad();
  const expected=['hall','valves',...(cleared.includes('cache')?['cache']:[]),...(cleared.includes('boss')?['boss']:[])];
  if((r.valveStep>0||r.pressure>0)&&!cleared.includes('hall'))return bad();
  if(cleared.some((room,i)=>room!==expected[i])||(current==='entry'&&r.valveStep>0&&!cleared.includes('hall')))return bad();
  run={...(r.difficulty==='challenge'?{difficulty:'challenge' as const}:{}),id:r.id,current,cleared:[...cleared],valveStep:r.valveStep,pressure:r.pressure};
 }
 return {version:1,attempts:raw.attempts,clears:raw.clears,challengeClears,embers:raw.embers,run};
}
