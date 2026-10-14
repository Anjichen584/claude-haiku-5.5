import type {ItemDef} from '../data/schema';
import type {GameSession} from './session';
import type {CombatProfile} from '../combat/profile';
export interface Resources {hp:number;mana:number}
export interface UseResult extends Resources {ok:boolean;message:string}
/** Commits inventory/cooldown only on success. Caller owns scene-local resource application. */
export function useConsumable(session:GameSession,item:ItemDef,profile:Pick<CombatProfile,'maxHp'|'maxMana'|'bonuses'>,resources:Resources,now=Date.now()):UseResult{
 const fail=(message:string):UseResult=>({...resources,ok:false,message});
 const effect=item.consumable;
 if(item.type!=='consumable'||!effect||!Number.isFinite(effect.amount)||effect.amount<=0||!Number.isFinite(effect.cooldownMs)||effect.cooldownMs<0||!['hp','mana'].includes(effect.resource))return fail('物品不能使用');
 if(!Number.isFinite(now)||!Number.isFinite(resources.hp)||!Number.isFinite(resources.mana)||resources.hp<=0)return fail('当前不能使用药剂');
 if(session.world.getItemCount(item.id)<1)return fail(`${item.name}不足`);
 const left=(session.player.consumableReadyAt??0)-now;
 if(left>0)return fail(`药剂共享冷却 ${Math.ceil(left/1000)} 秒`);
 const max=effect.resource==='hp'?profile.maxHp:profile.maxMana,current=resources[effect.resource];
 if(current>=max)return fail(effect.resource==='hp'?'生命已满，无需使用':'魔力已满，无需使用');
 const bonus=Math.max(0,Math.min(200,profile.bonuses.potionEfficiency??0));
 const restored=Math.min(max-current,effect.amount*(1+bonus/100));
 session.world.addItem(item.id,-1);session.player.consumableReadyAt=now+effect.cooldownMs;
 return {...resources,[effect.resource]:current+restored,ok:true,message:`使用 ${item.name}：恢复 ${Math.round(restored)} ${effect.resource==='hp'?'生命':'魔力'}`};
}
