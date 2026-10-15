import type {GameSession} from './session';
import type {SurfaceEnemy} from '../combat/SurfaceCombat';
import {surfaceMemberKey} from '../combat/SurfaceCombat';
import {killGains,rollDrops} from './killRewards';
import {applyGains,settleQuestRewards} from './rewards';
/** Mark a member BEFORE issuing rewards. Partial pack progress survives save/reload. */
export function settleSurfaceKill(session:GameSession,enemy:SurfaceEnemy,bonuses:Readonly<Record<string,number>>,itemName:(id:string)=>string):string[]{
  const {spawn,slot,def}=enemy,key=surfaceMemberKey(spawn.key,slot);
  if(!enemy.actor.isDead||session.defeated.has(spawn.key)||session.defeated.has(key))return [];
  session.defeated.add(key);
  if(spawn.enemyIds.every((_,i)=>session.defeated.has(surfaceMemberKey(spawn.key,i)))){
    session.defeated.add(spawn.key);
    spawn.enemyIds.forEach((_,i)=>session.defeated.delete(surfaceMemberKey(spawn.key,i)));
  }
  const gains=killGains(def,bonuses);gains.items=rollDrops(def,`${spawn.key}:${slot}`);
  const lines=[`击败 ${def.name} · +${gains.exp} 经验 · +${gains.gold} 金币`,...applyGains(session,gains)];
  for(const item of gains.items)lines.push(`拾取 ${itemName(item)}`);
  if(spawn.hunt&&session.defeated.has(spawn.key)){
    const reward=spawn.hunt.reward;
    const upgrades=applyGains(session,reward);
    lines.unshift(`讨伐完成：${spawn.hunt.title}`,`额外奖励：+${reward.exp} 经验 · +${reward.gold} 金币`,...reward.items.map(id=>`获得 ${itemName(id)}`));
    lines.push(...upgrades);
  }
  lines.push(...settleQuestRewards(session,session.quests.report({type:'kill',target:def.id}),id=>session.quests.def(id)?.title??id,itemName).lines);
  return lines;
}
