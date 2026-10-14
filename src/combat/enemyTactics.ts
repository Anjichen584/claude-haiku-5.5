import type { EnemyDef } from '../data/schema';
import type { EnemyAiConfig } from './enemyAi';
export interface EnemyTactics { kind:'melee'|'ranged'|'brute'; ai:EnemyAiConfig; windupMs:number; hitRadius:number; retreatRange:number }
/** Telegraphs are locked at attack start; moving out is a valid counterplay. */
export function enemyTactics(def:Pick<EnemyDef,'id'|'boss'>):EnemyTactics{
  if(/crow|owl|moth|sprite|wraith|witch|shaman|queen|herald/.test(def.id))return{
    kind:'ranged',ai:{aggroRange:560,leashRange:850,attackRange:285,attackCooldownMs:2000},windupMs:850,hitRadius:62,retreatRange:115,
  };
  if(def.boss||/golem|titan|colossus|treant|warden/.test(def.id))return{
    kind:'brute',ai:{aggroRange:600,leashRange:850,attackRange:100,attackCooldownMs:1900},windupMs:900,hitRadius:125,retreatRange:0,
  };
  return{kind:'melee',ai:{aggroRange:330,leashRange:560,attackRange:45,attackCooldownMs:1200},windupMs:450,hitRadius:65,retreatRange:0};
}
