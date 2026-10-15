import type {ItemDef,Rarity} from '../data/schema';
import {RARITY_AFFIX_COUNT} from './affixRoller';
export const MAX_REFINEMENT=5;
export const MAX_REFORGES=200;
/** A learned blueprint belongs to an item TYPE, not an individual inventory copy. */
export interface GearCraftRecord {readonly rank:number;readonly reforges:readonly number[]}
export type GearCrafting=Record<string,GearCraftRecord>;
export const isGear=(item:ItemDef):boolean=>['weapon','armor','accessory'].includes(item.type)&&!!item.slot;
export function refinementBonuses(item:ItemDef,craft:GearCrafting={}):Record<string,number>{
 const rank=craft[item.id]?.rank??0;
 if(item.type==='weapon')return {attack:rank*2};
 if(item.type==='armor')return {defense:rank};
 if(item.type==='accessory')return {maxHp:rank*4,maxMana:rank*3};
 return {};
}
export function cloneCrafting(craft:GearCrafting):GearCrafting{return Object.fromEntries(Object.entries(craft).map(([id,r])=>[id,{rank:r.rank,reforges:[...r.reforges]}]));}
export function parseCrafting(value:unknown,items:readonly ItemDef[]):GearCrafting|undefined{
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('装备工坊记录错误');
 const entries=Object.entries(value);if(entries.length>items.length)throw new Error('装备工坊记录过多');
 const result:GearCrafting={};
 for(const [id,raw]of entries){
  const item=items.find(i=>i.id===id);if(!item||!isGear(item)||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('装备工坊物品错误');
  const r=raw as Record<string,unknown>,count=RARITY_AFFIX_COUNT[(item.rarity??'common') as Rarity];
  if(typeof r.rank!=='number'||!Number.isInteger(r.rank)||r.rank<0||r.rank>MAX_REFINEMENT||!Array.isArray(r.reforges)||r.reforges.length>MAX_REFORGES||r.reforges.some(i=>!Number.isInteger(i)||i<0||i>=count))throw new Error('装备精炼或重铸记录越界');
  result[id]={rank:r.rank,reforges:[...r.reforges] as number[]};
 }
 return result;
}
