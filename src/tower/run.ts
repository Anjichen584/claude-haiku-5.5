import {Rng,hashSeed} from '../core/Rng';
import type {CombatProfile} from '../combat/profile';
import type {EnemyDef} from '../data/schema';
import type {GameSession} from '../state/session';
import {applyGains,type Gains} from '../state/rewards';

export const TOWER_FLOORS=30;
export const BOONS=[
 {id:'might',name:'破阵',description:'攻击 +4'},
 {id:'vitality',name:'坚韧',description:'生命上限 +18（不直接治疗）'},
 {id:'armor',name:'磐石',description:'防御 +2'},
 {id:'spring',name:'灵泉',description:'魔力上限 +12，魔力回复 +1'},
 {id:'haste',name:'迅咒',description:'技能冷却倍率 ×0.94（最低 0.35）'},
 {id:'leech',name:'汲取',description:'吸血 +2%（最高 30%）'},
] as const;
export type BoonId=typeof BOONS[number]['id'];
export interface TowerRun {id:number;cleared:number;phase:'ready'|'boon'|'complete';boons:BoonId[]}
export interface TowerProgress {version:1;attempts:number;best:number;run:TowerRun|null}
export const newTower=():TowerProgress=>({version:1,attempts:0,best:0,run:null});
export function startTower(p:TowerProgress):boolean{
 if(p.run||p.attempts>=1000000)return false;
 p.run={id:++p.attempts,cleared:0,phase:'ready',boons:[]};return true;
}
export function boonChoices(run:TowerRun):BoonId[]{
 const pool=BOONS.map(b=>b.id),rng=new Rng(hashSeed('tower-boon',run.id,run.cleared));
 for(let i=pool.length-1;i>0;i--){const j=rng.int(0,i);[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,3);
}
export function chooseBoon(run:TowerRun,id:BoonId):boolean{
 if(run.phase!=='boon'||!boonChoices(run).includes(id))return false;
 run.boons.push(id);run.phase='ready';return true;
}
/** Settlement requires the exact attempt/floor, so stale callbacks cannot advance twice. */
export function finishTowerFloor(p:TowerProgress,id:number,floor:number,won:boolean):boolean{
 const r=p.run;if(!r||r.id!==id||r.phase!=='ready'||floor!==r.cleared+1)return false;
 if(!won){p.run=null;return true;}
 r.cleared=floor;p.best=Math.max(p.best,floor);r.phase=floor===TOWER_FLOORS?'complete':'boon';return true;
}
export function towerReward(cleared:number):Gains{
 return {exp:15*cleared*(cleared+1),gold:8*cleared*(cleared+1),items:Array.from({length:Math.floor(cleared/5)*2},()=> 'rift_shard')};
}
export function canCashOut(run:TowerRun):boolean{return run.cleared>0&&run.cleared%5===0;}
/** Clear the claim before issuing rewards. A second click or re-entry cannot claim again. */
export function cashOutTower(session:GameSession):boolean{
 const p=session.tower,r=p?.run;if(!p||!r||!canCashOut(r))return false;
 const reward=towerReward(r.cleared);p.run=null;applyGains(session,reward);return true;
}
export function towerProfile(base:CombatProfile,run:TowerRun):CombatProfile{
 const p={...base};for(const id of run.boons){
  if(id==='might')p.attack+=4;
  if(id==='vitality')p.maxHp+=18;
  if(id==='armor')p.defense+=2;
  if(id==='spring'){p.maxMana+=12;p.manaRegen+=1;}
  if(id==='haste')p.cooldownMultiplier=Math.max(.35,p.cooldownMultiplier*.94);
  if(id==='leech')p.lifeSteal=Math.max(base.lifeSteal,Math.min(.3,p.lifeSteal+.02));
 }return p;
}
const WAVES=[['ash_wolf','ember_hound','moss_boar'],['frost_wolf','icicle_slime','bark_stag'],['sand_scorpion','plains_raider','swamp_wraith']];
export function towerEnemies(run:TowerRun,enemies:readonly EnemyDef[]):EnemyDef[]{
 const floor=run.cleared+1,rng=new Rng(hashSeed('tower-wave',run.id,floor));
 const pool=WAVES[Math.min(2,Math.floor((floor-1)/10))];
 const ids=floor%10===0?[[ 'boss_glacier_queen','boss_ember_titan','boss_ancient_treant'][Math.floor(floor/10)-1]]:
  floor%5===0?[['elite_ash_drake','elite_frost_alpha','elite_grove_witch','elite_ice_warden','elite_mire_shaman','elite_rot_colossus'][Math.floor(floor/5)-1],rng.pick(pool)]:Array.from({length:2+Math.floor((floor-1)/10)},()=>rng.pick(pool));
 return ids.map(id=>{
  const def=enemies.find(e=>e.id===id);if(!def)throw new Error(`缺少试炼敌人：${id}`);
  const scale=1+(floor-1)*.045;
  // Wind-floors change movement pressure; armored floors change damage mitigation.
  return {...def,hp:Math.round(def.hp*scale),attack:Math.round(def.attack*(1+(floor-1)*.025)),defense:def.defense+(floor%3===0?2:0),speed:def.speed*(floor%3===1?1.15:1),drops:[]};
 });
}
export function towerRule(floor:number):string{return floor%3===0?'坚甲：敌人防御 +2':floor%3===1?'疾风：敌人移动速度 +15%':'常规：无额外环境词缀';}
/** Strict bounded v1 extension. No save migration needed for characters without a tower. */
export function parseTower(raw:unknown):TowerProgress{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const int=(v:unknown,a:number,b:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=a&&v<=b;
 if(!obj(raw)||raw.version!==1||!int(raw.attempts,0,1000000)||!int(raw.best,0,TOWER_FLOORS)||(raw.attempts===0&&raw.best!==0))throw new Error('试炼记录错误');
 let run:TowerRun|null=null;
 if(raw.run!==null){
  const r=raw.run;
  if(!obj(r)||!int(r.id,1,raw.attempts)||r.id!==raw.attempts||!int(r.cleared,0,TOWER_FLOORS)||r.cleared>raw.best||!Array.isArray(r.boons)||r.boons.length>29||!r.boons.every(id=>BOONS.some(b=>b.id===id)))throw new Error('试炼进度错误');
  const phase=r.phase;
  if(!['ready','boon','complete'].includes(String(phase))||
   (phase==='complete'?(r.cleared!==30||r.boons.length!==29):phase==='boon'?(r.cleared<1||r.cleared>=30||r.boons.length!==r.cleared-1):(r.cleared>=30||r.boons.length!==r.cleared)))throw new Error('试炼阶段错误');
  run={id:r.id,cleared:r.cleared,phase:phase as TowerRun['phase'],boons:[...r.boons] as BoonId[]};
  // Validate historical choices, not just known IDs.
  for(let i=0;i<run.boons.length;i++)if(!boonChoices({...run,cleared:i+1}).includes(run.boons[i]))throw new Error('试炼强化记录错误');
 }
 return {version:1,attempts:raw.attempts,best:raw.best,run};
}
