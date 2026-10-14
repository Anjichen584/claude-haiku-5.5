/**
 * 装备：四个槽位（主手、头部、胸甲、脚部）。
 *
 * - 装备会从背包扣除一件，卸下后放回背包；
 * - 战斗属性 = 基础属性 + 武器伤害 + 护甲防御 + 词条（攻击/防御/生命）+ 套装加成；
 * - 词条目前按物品 id 固定抽取（同一种装备数值一致），待接入物品实例后改为每件独立。
 *   这样不需要改存档结构，也不会出现“反复卸下重抽”的漏洞。
 */
import type { AffixDef, ItemDef, Rarity } from '../data/schema';
import { Rng } from '../core/Rng';
import { rollAffixes, type RolledAffix } from '../items/affixRoller';
import { activeSetBonuses, type ItemSetDef } from '../items/sets';
import type { GameSession } from './session';
import { PLAYER_MAX_HP, PLAYER_MAX_MANA } from './constants';

export const EQUIP_SLOTS = ['main_hand', 'head', 'chest', 'feet'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const SLOT_LABEL: Record<EquipSlot, string> = {
  main_hand: '主手', head: '头部', chest: '胸甲', feet: '脚部',
};

/** 玩家的基础战斗属性（不含装备） */
export const BASE_STATS = { attack: 12, defense: 2, maxHp: PLAYER_MAX_HP };

export interface CombatStats {
  attack: number;
  defense: number;
  maxHp: number;
}

export function isEquipSlot(value: string): value is EquipSlot {
  return (EQUIP_SLOTS as readonly string[]).includes(value);
}

/** 某个槽位可以装备的物品（武器或护甲，且槽位匹配）。 */
export function equippableFor(slot: EquipSlot, items: readonly ItemDef[]): ItemDef[] {
  return items.filter((i) => (i.type === 'weapon' || i.type === 'armor') && i.slot === slot);
}

/**
 * 循环切换某个槽位：当前装备 → 背包里的下一件同槽位装备 → …… → 卸下 → 当前装备。
 * 返回切换后该槽位的物品 id（卸下时为 undefined）。
 */
export function cycleSlot(session: GameSession, slot: EquipSlot, items: readonly ItemDef[], affixes: readonly AffixDef[] = [], sets: readonly ItemSetDef[] = []): string | undefined {
  const equipment = session.player.equipment;
  const current = equipment[slot];
  // 固定顺序：所有拥有的同槽位装备（含当前装备），最后是“卸下”（undefined）
  const owned = equippableFor(slot, items)
    .map((i) => i.id)
    .filter((id) => id === current || session.world.getItemCount(id) > 0);
  const options: Array<string | undefined> = [...owned, undefined];
  const idx = options.indexOf(current);
  const next = options[(idx + 1) % options.length];

  if (current !== undefined && current !== next) session.world.addItem(current, 1);
  if (next !== undefined && next !== current) session.world.addItem(next, -1);
  if (next === undefined) delete equipment[slot];
  else equipment[slot] = next;
  session.player.hp = Math.min(session.player.hp, combatStats(equipment, items, affixes, sets).maxHp);
  if(session.player.mana!==undefined)session.player.mana=Math.min(session.player.mana,Math.max(1,PLAYER_MAX_MANA+(equipmentBonuses(equipment,items,affixes,sets).maxMana??0)));
  return next;
}

/** 字符串哈希（FNV-1a），用于把物品 id 转成稳定的随机种子。 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 物品的固定词条（按物品 id 抽取，结果稳定）。无品质、无等级或未提供词条池时没有词条。 */
export function itemAffixes(item: ItemDef, pool: readonly AffixDef[]): RolledAffix[] {
  if (!item.rarity || !item.itemLevel || pool.length === 0) return [];
  return rollAffixes(new Rng(hashId(item.id)), item.rarity as Rarity, pool, item.itemLevel);
}

/** Sum all modifiers from valid equipped slots, shared by the combat profile and resource clamping. */
export function equipmentBonuses(equipment:Partial<Record<string,string>>,items:readonly ItemDef[],affixes:readonly AffixDef[]=[],sets:readonly ItemSetDef[]=[]):Record<string,number>{
  const worn=EQUIP_SLOTS.map(slot=>items.find(i=>i.id===equipment[slot]&&i.slot===slot)).filter((i):i is ItemDef=>!!i);
  const result:Record<string,number>={};
  for(const item of worn)for(const a of itemAffixes(item,affixes))result[a.stat]=(result[a.stat]??0)+a.value;
  for(const b of activeSetBonuses(sets,worn))result[b.stat]=(result[b.stat]??0)+b.value;
  return result;
}

/** 参与战斗计算的属性名 */
const COMBAT_STATS = ['attack', 'defense', 'maxHp'] as const;
type CombatStatName = (typeof COMBAT_STATS)[number];

/**
 * 按当前装备计算战斗属性。
 * - affixes / sets 可省略（省略时只计算基础装备数值）。
 * - 词条和套装中，只有 attack、defense、maxHp 会计入战斗；其他词条暂不生效。
 */
export function combatStats(
  equipment: Partial<Record<string, string>>,
  items: readonly ItemDef[],
  affixes: readonly AffixDef[] = [],
  sets: readonly ItemSetDef[] = [],
): CombatStats {
  const byId = new Map(items.map((i) => [i.id, i]));
  const worn: ItemDef[] = [];
  for (const slot of EQUIP_SLOTS) {
    const id=equipment[slot];
    if (id === undefined) continue;
    const item = byId.get(id);
    if (item && item.slot === slot) worn.push(item);
  }

  const totals: Record<CombatStatName, number> = {
    attack: BASE_STATS.attack,
    defense: BASE_STATS.defense,
    maxHp: BASE_STATS.maxHp,
  };
  for (const item of worn) {
    totals.attack += item.baseDamage ?? 0;
    totals.defense += item.defense ?? 0;
    for (const a of itemAffixes(item, affixes)) addIfCombat(totals, a.stat, a.value);
  }
  for (const bonus of activeSetBonuses(sets, worn)) addIfCombat(totals, bonus.stat, bonus.value);

  return { attack: totals.attack, defense: totals.defense, maxHp: totals.maxHp };
}

function addIfCombat(totals: Record<CombatStatName, number>, stat: string, value: number): void {
  if ((COMBAT_STATS as readonly string[]).includes(stat)) totals[stat as CombatStatName] += value;
}

/**
 * 装备明细文本（给装备面板用）：每件已装备物品的词条，以及已激活的套装效果。
 * 没有词条或套装时返回空数组。
 */
export function equipmentDetailLines(
  equipment: Partial<Record<string, string>>,
  items: readonly ItemDef[],
  affixes: readonly AffixDef[],
  sets: readonly ItemSetDef[],
): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const worn: ItemDef[] = [];
  const lines: string[] = [];
  for (const slot of EQUIP_SLOTS) {
    const id = equipment[slot];
    const item = id ? byId.get(id) : undefined;
    if (!item) continue;
    worn.push(item);
    for (const a of itemAffixes(item, affixes)) {
      lines.push(`  · ${item.name}：${a.name} +${a.value}（${a.stat}）${a.hidden ? ' [隐藏]' : ''}`);
    }
  }
  const bonuses = activeSetBonuses(sets, worn);
  const bySet = new Map<string, { name: string; pieces: number; texts: string[] }>();
  for (const b of bonuses) {
    const entry = bySet.get(b.setId) ?? { name: b.setName, pieces: b.pieces, texts: [] };
    entry.pieces = Math.max(entry.pieces, b.pieces);
    entry.texts.push(b.text);
    bySet.set(b.setId, entry);
  }
  for (const entry of bySet.values()) {
    lines.push(`  ◆ ${entry.name}（${entry.pieces} 件）：${entry.texts.join('；')}`);
  }
  return lines;
}
