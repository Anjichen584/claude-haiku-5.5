import {loadGameData} from '../data/loader';
import {combatProfile} from '../combat/profile';
import {towerProfile} from './run';
import type {GameSession} from '../state/session';
import {useConsumable,type UseResult} from '../state/consumables';

/** Lobby and tower battles share the same backpack and epoch-based potion cooldown. */
export function towerLobbyProfile(session:GameSession){
 const d=loadGameData(),base=combatProfile(session.player.equipment,d.items,d.affixes,d.itemSets,session.player.crafting);
 return session.tower?.run?towerProfile(base,session.tower.run):base;
}
export function useTowerSupply(session:GameSession,id:'health_potion'|'mana_potion',now=Date.now()):UseResult{
 const p=towerLobbyProfile(session),item=loadGameData().items.find(i=>i.id===id)!;
 const result=useConsumable(session,item,p,{hp:session.player.hp,mana:session.player.mana??p.maxMana},now);
 if(result.ok){session.player.hp=result.hp;session.player.mana=result.mana;}
 return result;
}
export function nextTowerCheckpoint(cleared:number):number{
 return Math.min(30,(Math.floor(cleared/5)+1)*5);
}
