/** 套装效果计算（阶段 4）。 */
import type { ItemDef } from '../data/schema';

export interface SetBonus {
  pieces: number;
  stat: string;
  value: number;
  text: string;
}

export interface ItemSetDef {
  id: string;
  name: string;
  bonuses: SetBonus[];
}

/** 统计已装备物品中，每套装备的件数 */
export function countSetPieces(equipped: ReadonlyArray<Pick<ItemDef, 'setId'>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of equipped) {
    if (!item.setId) continue;
    counts.set(item.setId, (counts.get(item.setId) ?? 0) + 1);
  }
  return counts;
}

/**
 * 返回当前已激活的套装效果。
 * 例如穿 4 件灰烬守望者，会同时激活 2 件与 4 件的效果，不包括 6 件。
 */
export function activeSetBonuses(
  sets: readonly ItemSetDef[],
  equipped: ReadonlyArray<Pick<ItemDef, 'setId'>>,
): Array<SetBonus & { setId: string; setName: string }> {
  const counts = countSetPieces(equipped);
  const active: Array<SetBonus & { setId: string; setName: string }> = [];
  for (const set of sets) {
    const count = counts.get(set.id) ?? 0;
    for (const bonus of set.bonuses) {
      if (count >= bonus.pieces) {
        active.push({ ...bonus, setId: set.id, setName: set.name });
      }
    }
  }
  return active;
}
