import type Phaser from 'phaser';
import {loadGameData} from '../data/loader';
import {getSession,persistSession} from '../state/sessionStore';
import {ownedGear,craftRecord,canUseWorkshop,refineCost,reforgeCost,salvageYield,refineGear,reforgeGear,salvageGear,workshopEquip,compareEquipment} from '../state/crafting';
import {itemAffixes} from '../state/equipment';
import {MAX_REFINEMENT,MAX_REFORGES,refinementBonuses} from '../items/gearCraft';
import {isSupportedModifier} from '../combat/profile';
import {audio} from '../audio/AudioDirector';

type Action='refine'|'reforge'|'salvage'|'equip';
export function mountForgeTools(root:HTMLElement,game:Phaser.Game):{open:()=>void;cancel:()=>void}{
 root.innerHTML=`<h2>营地装备工坊</h2><p>在起始营地行旅商人附近（坐标 4,4，五格内）使用。交战、对话或交易时不可操作；远处可查看对比。</p>
 <small>本版为同款装备共享图谱，不是独立装备实例。精炼和重铸影响所有同款副本，出售/分解后图谱仍保留，但不会提高出售价格。裂隙碎片也可能是任务材料。</small>
 <p id="forge-location"></p><p id="forge-balance"></p>
 <label class="rift-file-label">选择拥有的装备<select id="forge-item" aria-label="工坊装备"></select></label>
 <pre id="forge-details"></pre><pre id="forge-compare"></pre>
 <button id="forge-equip">装备所选</button><button id="forge-refine">精炼</button>
 <label class="rift-file-label">选择要重铸的词条<select id="forge-affix" aria-label="重铸词条"></select></label>
 <button id="forge-reforge">重铸所选词条</button><button id="forge-salvage">分解背包副本 ×1</button>
 <section id="forge-confirmation" hidden><h3>确认工坊操作</h3><p id="forge-preview"></p><button id="forge-confirm">确认执行</button><button id="forge-cancel">取消操作</button></section>
 <p id="forge-status" role="status" aria-live="polite"></p>`;
 const $=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
 const itemSelect=$<HTMLSelectElement>('forge-item'),affixSelect=$<HTMLSelectElement>('forge-affix'),status=$('forge-status'),confirmation=$('forge-confirmation');
 let pending:{action:Action;id:string;index:number;fingerprint:string}|null=null;
 const cancel=()=>{pending=null;confirmation.hidden=true;};
 const usable=()=>{
  const s=getSession();if(!s||!game.scene.isActive('OverworldScene')||!canUseWorkshop(s))return false;
  const scene=game.scene.getScene('OverworldScene') as Phaser.Scene&{surface?:{engaged:boolean};talk?:unknown;pendingChoice?:unknown;shop?:{visible:boolean}};
  return !scene.surface?.engaged&&!scene.talk&&!scene.pendingChoice&&!scene.shop?.visible;
 };
 const fingerprint=(id:string)=>{const s=getSession();return s?JSON.stringify([s.player.gold,s.world.getItemCount('rift_shard'),s.world.getItemCount(id),s.player.equipment,s.player.crafting?.[id]]):'';};
 const render=()=>{
  const s=getSession(),data=loadGameData(),selected=itemSelect.value;itemSelect.replaceChildren();affixSelect.replaceChildren();
  $('forge-location').textContent=usable()?'工坊可用 · 所有消耗性操作均需确认':'当前仅可查看：请在地表脱战后靠近营地行旅商人';
  $('forge-balance').textContent=s?`金币 ${s.player.gold} · 裂隙碎片 ${s.world.getItemCount('rift_shard')}`:'请先开始或继续游戏';
  const list=s?ownedGear(s,data.items):[];
  for(const item of list){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.name} +${craftRecord(s!,item.id).rank}${Object.values(s!.player.equipment).includes(item.id)?' · 已穿戴':''} · 背包 ${s!.world.getItemCount(item.id)}`;itemSelect.append(option);}
  if(list.some(i=>i.id===selected))itemSelect.value=selected;
  const item=list.find(i=>i.id===itemSelect.value);
  for(const id of ['forge-equip','forge-refine','forge-reforge','forge-salvage'])$<HTMLButtonElement>(id).disabled=!s||!item||!usable();
  if(!s||!item){$('forge-details').textContent='尚无可处理的装备。可通过商店、掉落或讨伐获得。';$('forge-compare').textContent='';return;}
  const record=craftRecord(s,item.id),affixes=itemAffixes(item,data.affixes,s.player.crafting),bonus=refinementBonuses(item,s.player.crafting);
  $('forge-details').textContent=[`${item.name} · 图谱 +${record.rank}/${MAX_REFINEMENT} · 重铸 ${record.reforges.length}/${MAX_REFORGES} 次`,`基础攻击 ${item.baseDamage??0} · 基础防御 ${item.defense??0}`,`精炼增益：${Object.entries(bonus).map(([k,v])=>`${({attack:'攻击',defense:'防御',maxHp:'生命上限',maxMana:'魔力上限'} as Record<string,string>)[k]} +${v}`).join(' / ')||'无'}`,...affixes.map((a,i)=>`${i+1}. ${a.name} +${a.value}${a.hidden?' [隐藏，不可重铸]':''}${isSupportedModifier(a.stat)?'':' [预留效果，尚未接入]'}`)].join('\n');
  const {before,after}=compareEquipment(s,item,data);
  const stats=[['attack','攻击',1],['defense','防御',1],['maxHp','生命上限',1],['maxMana','魔力上限',1],['critChance','暴击率 %',100],['speedMultiplier','移动倍率 %',100],['lifeSteal','吸血 %',100]] as const;
  $('forge-compare').textContent='换装预览（含词条、精炼和套装，不会自动换装）\n'+stats.map(([key,label,scale])=>{const a=Math.round(before[key]*scale*100)/100,b=Math.round(after[key]*scale*100)/100,d=Math.round((b-a)*100)/100;return `${label}：${a} → ${b}（${d>0?'+':''}${d}）`;}).join('\n');
  affixes.forEach((a,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${i+1}. ${a.name} +${a.value}${a.hidden?'（隐藏）':''}`;o.disabled=a.hidden;affixSelect.append(o);});
  const cost=refineCost(record.rank);$('forge-refine').textContent=record.rank>=MAX_REFINEMENT?'已精炼至 +5':`精炼 +${record.rank+1}：${cost.gold} 金 / ${cost.shards} 碎片`;
  const rc=reforgeCost(record.reforges.length);$('forge-reforge').textContent=`重铸：${rc.gold} 金 / ${rc.shards} 碎片`;
  $<HTMLButtonElement>('forge-refine').disabled=!usable()||record.rank>=MAX_REFINEMENT;
  $<HTMLButtonElement>('forge-reforge').disabled=!usable()||!affixes.some(a=>!a.hidden)||record.reforges.length>=MAX_REFORGES;
  $<HTMLButtonElement>('forge-salvage').disabled=!usable()||s.world.getItemCount(item.id)<1;
  $<HTMLButtonElement>('forge-equip').disabled=!usable()||s.world.getItemCount(item.id)<1||Object.values(s.player.equipment).includes(item.id);
 };
 const request=(action:Action)=>{
  cancel();const s=getSession(),data=loadGameData(),item=data.items.find(i=>i.id===itemSelect.value);if(!s||!item||!usable()){status.textContent='请先在地表脱战后靠近营地行旅商人。';return;}
  const r=craftRecord(s,item.id),index=Number(affixSelect.value),cost=action==='refine'?refineCost(r.rank):reforgeCost(r.reforges.length);
  const text=action==='equip'?`装备 ${item.name}，原装备放回背包。`:action==='salvage'?`不可撤销：分解背包中的 ${item.name} ×1，获得 ${salvageYield(item)} 裂隙碎片。已穿戴装备不受影响。`:`${item.name}：消耗 ${cost.gold} 金币与 ${cost.shards} 裂隙碎片。${action==='refine'?`图谱精炼至 +${r.rank+1}。`:'重铸所选词条，结果可能更低或相同；隐藏词条不变。'}同款装备共享结果。`;
  pending={action,id:item.id,index,fingerprint:fingerprint(item.id)};$('forge-preview').textContent=text;confirmation.hidden=false;$('forge-confirm').focus();
 };
 for(const action of ['refine','reforge','salvage','equip'] as const)$('forge-'+action).onclick=()=>request(action);
 itemSelect.onchange=()=>{cancel();status.textContent='';render();};affixSelect.onchange=cancel;
 $('forge-cancel').onclick=()=>{cancel();status.textContent='已取消，物品和材料未改变。';};
 $('forge-confirm').onclick=()=>{
  if(!pending)return;const plan=pending;cancel();const s=getSession();if(!s||!usable()||plan.fingerprint!==fingerprint(plan.id)){status.textContent='条件或资源已变化，请重新确认。';render();return;}
  try{
   const data=loadGameData(),result=plan.action==='refine'?refineGear(s,plan.id,data):plan.action==='reforge'?reforgeGear(s,plan.id,plan.index,data):plan.action==='salvage'?salvageGear(s,plan.id,data):workshopEquip(s,plan.id,data);
   if(result.ok){game.scene.getScene('OverworldScene').events.emit('craft-updated');const saved=persistSession(s);status.textContent=result.message+(saved?' · 已保存':' · 保存失败：进度仅在当前页面，请勿刷新，返回游戏按 K 重试');audio.play('pickup');}
   else status.textContent=result.message;
  }catch(e){status.textContent=e instanceof Error?e.message:'工坊操作失败';}
  render();
 };
 return {open:()=>{cancel();status.textContent='';render();},cancel};
}
