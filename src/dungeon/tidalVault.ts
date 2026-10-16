import type {GameSession} from '../state/session';
import type {EnemyDef} from '../data/schema';
import {applyGains,type Gains} from '../state/rewards';
import {TowerHazards} from '../tower/hazards';

export const VAULT_WINGS=['stacks','cistern'] as const;
export type VaultWing=typeof VAULT_WINGS[number];
export type VaultRoom='hub'|VaultWing|'boss'|'exit';
export type VaultChoice='seal'|'loot';
export interface VaultRun {id:number;room:VaultRoom;cleared:VaultWing[];decisions:{wing:VaultWing;choice:VaultChoice}[]}
export interface VaultProgress {version:1;attempts:number;clears:number;retreats:number;pages:number;run:VaultRun|null}
export const VAULT_NAMES:Record<VaultRoom,string>={hub:'中央回廊',stacks:'沉没书库',cistern:'寒潮水闸',boss:'封冻中枢',exit:'档案终匣'};
export const VAULT_GEAR=['scholar_staff','scholar_hood','scholar_robe','scholar_boots','scholar_gloves','scholar_amulet'] as const;
export const VAULT_PRICE=3;
export const newVault=():VaultProgress=>({version:1,attempts:0,clears:0,retreats:0,pages:0,run:null});
export const vaultUnlocked=(s:GameSession):boolean=>s.world.questStatus('main_03')==='completed';
export function canStartVault(s:GameSession):boolean{return vaultUnlocked(s)&&!s.forge?.run&&!s.tower?.run&&s.dungeon?.activeFloor==null&&Number.isFinite(s.player.tileX)&&Number.isFinite(s.player.tileY)&&Math.hypot(s.player.tileX-4,s.player.tileY-4)<=10;}
export function startVault(s:GameSession):boolean{
 if(!canStartVault(s))return false;const p=s.vault??=newVault();if(p.run||p.attempts>=1000000)return false;
 p.run={id:++p.attempts,room:'hub',cleared:[],decisions:[]};return true;
}
export const vaultLoot=(r:VaultRun):number=>r.decisions.filter(d=>d.choice==='loot').length;
/** A cleared wing raises the tide; sealing it cancels that rise, looting doubles it. */
export const vaultTide=(r:VaultRun):number=>r.cleared.length+r.decisions.reduce((n,d)=>n+(d.choice==='loot'?1:-1),0);
export function enterVaultRoom(r:VaultRun,room:VaultWing|'boss'):boolean{
 if(r.room!=='hub'||r.decisions.length!==r.cleared.length)return false;
 if(room==='boss'?r.decisions.length!==2:!VAULT_WINGS.includes(room)||r.cleared.includes(room))return false;
 r.room=room;return true;
}
export function finishVaultCombat(p:VaultProgress,id:number,room:VaultRoom,won:boolean):boolean{
 const r=p.run;if(!r||r.id!==id||r.room!==room||!['stacks','cistern','boss'].includes(room)||r.cleared.includes(room as VaultWing))return false;
 if(!won){p.run=null;return true;}
 if(room==='boss'){if(r.decisions.length!==2)return false;r.room='exit';}
 else r.cleared.push(room as VaultWing);
 return true;
}
export function chooseVault(r:VaultRun,choice:VaultChoice):boolean{
 if(!['seal','loot'].includes(choice)||!VAULT_WINGS.includes(r.room as VaultWing)||r.cleared.at(-1)!==r.room||r.decisions.length!==r.cleared.length-1)return false;
 r.decisions.push({wing:r.room as VaultWing,choice});r.room='hub';return true;
}
export function vaultEnemies(r:VaultRun,enemies:readonly EnemyDef[]):EnemyDef[]{
 const tide=vaultTide(r),ids=r.room==='stacks'?['frost_wolf','icicle_slime',...(tide>=2?['frost_rat']:[])]:r.room==='cistern'?['elite_ice_warden','frost_rat',...(tide>=2?['icicle_slime']:[])]:r.room==='boss'?['boss_glacier_queen',...(tide>=2?['icicle_slime']:[]),...(tide>=4?['frost_wolf']:[])]:[];
 return ids.map(id=>{const e=enemies.find(e=>e.id===id);if(!e)throw new Error(`档案馆敌人缺失：${id}`);return {...e,attack:e.attack+(e.boss?tide*2:0),drops:[]};});
}
export function vaultBossHazards(r:VaultRun):TowerHazards{
 const tide=vaultTide(r);return new TowerHazards(20,{name:'霜潮封线',hint:'离开纵向冰潮；搜掠会加快冰潮并召来增援',element:'ice',attack:24+tide*2,windupMs:1700,intervalMs:8000-tide*750});
}
export function vaultReward(r:VaultRun):{gains:Gains;pages:number}{const loot=vaultLoot(r);return {gains:{exp:360+loot*80,gold:200+loot*80,items:[]},pages:2+loot};}
export function claimVault(s:GameSession):boolean{
 const p=s.vault,r=p?.run;if(!p||!r||r.room!=='exit')return false;const reward=vaultReward(r);p.run=null;p.clears++;p.pages+=reward.pages;applyGains(s,reward.gains);return true;
}
export function retreatVault(s:GameSession):boolean{
 const p=s.vault,r=p?.run;if(!p||!r||r.room!=='hub'||!r.decisions.length||r.decisions.length!==r.cleared.length)return false;
 const n=r.decisions.length;p.run=null;p.retreats++;applyGains(s,{exp:35*n,gold:25*n,items:[]});return true;
}
export function exchangeVault(s:GameSession,id:string):boolean{
 const p=s.vault;if(!p||p.run||!canStartVault(s)||p.pages<VAULT_PRICE||!VAULT_GEAR.some(x=>x===id))return false;
 p.pages-=VAULT_PRICE;s.world.addItem(id,1);return true;
}
/** Optional v1 extension. Only states reachable through the room/decision machine are accepted. */
export function parseVault(raw:unknown):VaultProgress{
 const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const int=(v:unknown,a:number,b:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=a&&v<=b;
 const bad=():never=>{throw new Error('霜潮档案馆存档错误');};
 if(!obj(raw)||raw.version!==1||!int(raw.attempts,0,1000000)||!int(raw.clears,0,raw.attempts)||!int(raw.retreats,0,raw.attempts-raw.clears)||!int(raw.pages,0,raw.clears*4))return bad();
 let run:VaultRun|null=null;
 if(raw.run!==null){
  const r=raw.run;if(!obj(r)||r.id!==raw.attempts||raw.attempts<=raw.clears+raw.retreats||!int(r.id,1,1000000)||!['hub',...VAULT_WINGS,'boss','exit'].includes(String(r.room))||!Array.isArray(r.cleared)||r.cleared.length>2||!r.cleared.every(w=>VAULT_WINGS.includes(w as VaultWing))||new Set(r.cleared).size!==r.cleared.length||!Array.isArray(r.decisions)||r.decisions.length>r.cleared.length)return bad();
  const decisions:{wing:VaultWing;choice:VaultChoice}[]=[];
  for(let i=0;i<r.decisions.length;i++){const d=r.decisions[i];if(!obj(d)||d.wing!==r.cleared[i]||!['seal','loot'].includes(String(d.choice)))return bad();decisions.push({wing:d.wing as VaultWing,choice:d.choice as VaultChoice});}
  const room=r.room as VaultRoom,cleared=[...r.cleared] as VaultWing[],pending=cleared.length-decisions.length;
  if(pending>1||((room==='hub'||room==='boss'||room==='exit')&&pending!==0)||((room==='boss'||room==='exit')&&decisions.length!==2))return bad();
  if(VAULT_WINGS.includes(room as VaultWing)&&(pending===1?cleared.at(-1)!==room:cleared.includes(room as VaultWing)))return bad();
  run={id:r.id,room,cleared,decisions};
 }
 return {version:1,attempts:raw.attempts,clears:raw.clears,retreats:raw.retreats,pages:raw.pages,run};
}
