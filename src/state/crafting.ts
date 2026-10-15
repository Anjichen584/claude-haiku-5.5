import type {GameSession} from './session';
import type {ItemDef,AffixDef} from '../data/schema';
import type {ItemSetDef} from '../items/sets';
import {MAX_REFINEMENT,MAX_REFORGES,isGear,type GearCraftRecord} from '../items/gearCraft';
import {combatProfile} from '../combat/profile';
import {equipItem,itemAffixes} from './equipment';
export interface CraftData {items:readonly ItemDef[];affixes:readonly AffixDef[];itemSets:readonly ItemSetDef[]}
export interface CraftCost {gold:number;shards:number}
export interface CraftResult {ok:boolean;message:string}
export const craftRecord=(s:GameSession,id:string):GearCraftRecord=>s.player.crafting?.[id]??{rank:0,reforges:[]};
export const ownedGear=(s:GameSession,items:readonly ItemDef[])=>items.filter(i=>isGear(i)&&(s.world.getItemCount(i.id)>0||Object.values(s.player.equipment).includes(i.id)));
export function canUseWorkshop(s:GameSession):boolean{return s.dungeon?.activeFloor==null&&Math.hypot(s.player.tileX-4,s.player.tileY-4)<=5;}
export function refineCost(rank:number):CraftCost{return {gold:80*(rank+1),shards:rank+2};}
export function reforgeCost(turns:number):CraftCost{return {gold:60+20*turns,shards:2+Math.floor(turns/5)};}
export function salvageYield(item:ItemDef):number{return ({common:1,uncommon:2,rare:3,epic:4,legendary:5,rift:6} as Record<string,number>)[item.rarity??'common']??1;}
const fail=(message:string):CraftResult=>({ok:false,message});
function eligible(s:GameSession,id:string,data:CraftData):ItemDef|undefined{return canUseWorkshop(s)?ownedGear(s,data.items).find(i=>i.id===id):undefined;}
function affordable(s:GameSession,cost:CraftCost):boolean{return Number.isFinite(s.player.gold)&&s.player.gold>=cost.gold&&s.world.getItemCount('rift_shard')>=cost.shards;}
function commit(s:GameSession,id:string,record:GearCraftRecord,cost:CraftCost,data:CraftData):void{
 const next={...s.player.crafting,[id]:record};
 // Compute before charging: invalid data cannot consume money/materials.
 const profile=combatProfile(s.player.equipment,data.items,data.affixes,data.itemSets,next);
 s.player.gold-=cost.gold;s.world.addItem('rift_shard',-cost.shards);s.player.crafting=next;
 s.player.hp=Math.min(s.player.hp,profile.maxHp);if(s.player.mana!==undefined)s.player.mana=Math.min(s.player.mana,profile.maxMana);
}
export function refineGear(s:GameSession,id:string,data:CraftData):CraftResult{
 const item=eligible(s,id,data);if(!item)return fail('需在营地行旅商人附近，并拥有这款装备');
 const r=craftRecord(s,id);if(r.rank>=MAX_REFINEMENT)return fail('精炼已达到 +5 上限');
 const cost=refineCost(r.rank);if(!affordable(s,cost))return fail(`材料不足：需要 ${cost.gold} 金币、${cost.shards} 裂隙碎片`);
 commit(s,id,{rank:r.rank+1,reforges:[...r.reforges]},cost,data);return {ok:true,message:`${item.name} 图谱精炼 +${r.rank+1}（同款共享）`};
}
export function reforgeGear(s:GameSession,id:string,index:number,data:CraftData):CraftResult{
 const item=eligible(s,id,data);if(!item)return fail('需在营地行旅商人附近，并拥有这款装备');
 const r=craftRecord(s,id),current=itemAffixes(item,data.affixes,s.player.crafting);
 if(!Number.isInteger(index)||!current[index]||current[index].hidden)return fail('只能重铸现有的非隐藏词条');
 if(r.reforges.length>=MAX_REFORGES)return fail('这款装备已达到本版 200 次重铸上限');
 const cost=reforgeCost(r.reforges.length);if(!affordable(s,cost))return fail(`材料不足：需要 ${cost.gold} 金币、${cost.shards} 裂隙碎片`);
 const record={rank:r.rank,reforges:[...r.reforges,index]};
 const next=itemAffixes(item,data.affixes,{...s.player.crafting,[id]:record});
 commit(s,id,record,cost,data);return {ok:true,message:`${item.name} 重铸：${next[index].name} +${next[index].value}（同款共享）`};
}
export function salvageGear(s:GameSession,id:string,data:CraftData):CraftResult{
 const item=eligible(s,id,data);if(!item)return fail('需在营地行旅商人附近，并拥有这款装备');
 if(s.world.getItemCount(id)<1)return fail('没有可分解的背包副本；已穿戴装备不会被分解');
 const amount=salvageYield(item);s.world.addItem(id,-1);s.world.addItem('rift_shard',amount);
 return {ok:true,message:`分解 ${item.name} ×1，获得裂隙碎片 ×${amount}；精炼图谱保留`};
}
export function workshopEquip(s:GameSession,id:string,data:CraftData):CraftResult{
 if(!eligible(s,id,data))return fail('请在营地工坊选择拥有的装备');
 return equipItem(s,id,data.items,data.affixes,data.itemSets)?{ok:true,message:'已装备所选物品'}:fail('该物品已穿戴，或背包中没有可装备副本');
}
export function compareEquipment(s:GameSession,item:ItemDef,data:CraftData){
 const before=combatProfile(s.player.equipment,data.items,data.affixes,data.itemSets,s.player.crafting);
 const next=isGear(item)&&item.slot?{...s.player.equipment,[item.slot]:item.id}:s.player.equipment;
 return {before,after:combatProfile(next,data.items,data.affixes,data.itemSets,s.player.crafting)};
}
