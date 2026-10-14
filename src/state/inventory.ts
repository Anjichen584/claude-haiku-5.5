/**
 * 背包视图：把世界状态中的物品数量转换为可显示的列表。只读。
 */
import type { WorldState } from './WorldState';

export interface InventoryLine {
  id: string;
  name: string;
  count: number;
}

/** 列出数量大于 0 的物品，数量多的在前，同数量按名称排序。 */
export function inventoryLines(world: WorldState, items: readonly { id: string; name: string }[]): InventoryLine[] {
  const names = new Map(items.map((i) => [i.id, i.name]));
  return Object.entries(world.snapshot().inventory)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, name: names.get(id) ?? id, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
}

export function formatInventory(lines: readonly InventoryLine[]): string {
  if (lines.length === 0) return '背包是空的';
  return ['背包（I 关闭）', ...lines.map((l) => `${l.name} × ${l.count}`)].join('\n');
}
