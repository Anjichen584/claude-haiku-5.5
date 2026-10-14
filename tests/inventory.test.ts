import { describe, expect, it } from 'vitest';
import { WorldState } from '../src/state/WorldState';
import { formatInventory, inventoryLines } from '../src/state/inventory';

const items = [
  { id: 'rift_shard', name: '裂隙碎片' },
  { id: 'iron_sword', name: '铁剑' },
];

describe('背包视图', () => {
  it('空背包显示提示', () => {
    const w = new WorldState();
    expect(inventoryLines(w, items)).toEqual([]);
    expect(formatInventory([])).toBe('背包是空的');
  });

  it('只列出有数量的物品，数量多的在前', () => {
    const w = new WorldState();
    w.addItem('iron_sword', 1);
    w.addItem('rift_shard', 3);
    w.addItem('gone', 0);
    const lines = inventoryLines(w, items);
    expect(lines.map((l) => l.id)).toEqual(['rift_shard', 'iron_sword']);
    expect(lines[0]).toEqual({ id: 'rift_shard', name: '裂隙碎片', count: 3 });
    expect(formatInventory(lines)).toContain('裂隙碎片 × 3');
  });

  it('未知物品显示 id', () => {
    const w = new WorldState();
    w.addItem('mystery', 2);
    expect(inventoryLines(w, items)[0].name).toBe('mystery');
  });
});
