/**
 * 装备：四个槽位（主手、头部、胸甲、脚部）。
 *
 * - 装备会从背包扣除一件，卸下后放回背包；
 * - 战斗属性 = 基础属性 + 武器伤害 + 护甲防御；
 * - 本阶段装备没有词条与套装加成（词条数据已有，待接入物品实例后再启用）。
 */
import type { ItemDef } from '../data/schema';
import { PLAYER_MAX_HP, type GameSession } from './session';

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
export function cycleSlot(session: GameSession, slot: EquipSlot, items: readonly ItemDef[]): string | undefined {
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
  return next;
}

/** 按当前装备计算战斗属性。 */
export function combatStats(equipment: Partial<Record<string, string>>, items: readonly ItemDef[]): CombatStats {
  const byId = new Map(items.map((i) => [i.id, i]));
  let attack = BASE_STATS.attack;
  let defense = BASE_STATS.defense;
  for (const id of Object.values(equipment)) {
    if (id === undefined) continue;
    const item = byId.get(id);
    if (!item) continue;
    attack += item.baseDamage ?? 0;
    defense += item.defense ?? 0;
  }
  return { attack, defense, maxHp: BASE_STATS.maxHp };
}
