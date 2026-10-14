import type {ItemDef} from '../data/schema';
import type {ItemSetDef} from './sets';
import {isEquipSlot} from '../state/equipment';
/** Content checks shared by validation command and regression tests. */
export function validateItemContent(items:readonly ItemDef[],sets:readonly ItemSetDef[]):string[]{
 const errors:string[]=[],bad=(item:ItemDef,text:string)=>errors.push(`items.${item.id}: ${text}`);
 for(const item of items){
  if(!['weapon','armor','accessory','material','consumable'].includes(item.type))bad(item,'未知物品类型');
  if(!Number.isFinite(item.price)||item.price<0)bad(item,'价格必须为非负有限数');
  if(['weapon','armor','accessory'].includes(item.type)&&(!item.slot||!isEquipSlot(item.slot)))bad(item,'装备槽位无效');
  if(item.type==='weapon'&&item.slot!=='main_hand')bad(item,'武器必须放在主手');
  if(item.type==='accessory'&&item.slot!=='neck')bad(item,'饰品必须放在项链槽位');
  if(['material','consumable'].includes(item.type)&&item.slot)bad(item,'非装备物品不能占用装备槽位');
  for(const n of [item.baseDamage,item.defense])if(n!==undefined&&(!Number.isFinite(n)||n<0))bad(item,'基础属性必须为非负有限数');
  if(item.type==='consumable'){
   const e=item.consumable;
   if(!e||!['hp','mana'].includes(e.resource)||!Number.isFinite(e.amount)||e.amount<=0||!Number.isFinite(e.cooldownMs)||e.cooldownMs<0)bad(item,'消耗品效果无效');
  }else if(item.consumable)bad(item,'非消耗品不能声明使用效果');
 }
 for(const set of sets){
  const slots=new Set(items.filter(i=>i.setId===set.id&&i.slot&&isEquipSlot(i.slot)).map(i=>i.slot));
  for(const bonus of set.bonuses){
   if(slots.size<bonus.pieces)errors.push(`item-sets.${set.id}: ${bonus.pieces} 件效果无法通过现有槽位/物品达成`);
   if(!Number.isFinite(bonus.value))errors.push(`item-sets.${set.id}: 套装数值无效`);
  }
 }
 return errors;
}
