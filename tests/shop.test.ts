import { describe, expect, it } from 'vitest';
import { buyItem, buyPrice, currentPriceMultiplier, shopLines, shopStock } from '../src/state/shop';
import { newSession } from '../src/state/session';
import { WorldState } from '../src/state/WorldState';
import type { FactionDef, ItemDef } from '../src/data/schema';

const items = [
  { id: 'iron_sword', name: '铁剑', type: 'weapon', price: 40, rarity: 'common' },
  { id: 'rift_shard', name: '裂隙碎片', type: 'material', price: 15, rarity: 'uncommon' },
  { id: 'ash_helm', name: '灰烬头盔', type: 'armor', price: 220, rarity: 'epic' },
] as unknown as ItemDef[];

const factions: FactionDef[] = [
  { id: 'ashguard', name: '灰烬守望会', rivals: [] },
  { id: 'red_tide', name: '赤潮商盟', rivals: [] },
];

describe('地牢商店', () => {
  it('库存不包含材料', () => {
    expect(shopStock(items).map((i) => i.id)).toEqual(['iron_sword', 'ash_helm']);
  });

  it('没有声望时价格为基础价', () => {
    const w = new WorldState();
    expect(currentPriceMultiplier(w, factions)).toBe(1);
    expect(buyPrice(items[0], 1)).toBe(40);
  });

  it('声望最高的阵营决定价格倍率（信任档位更便宜）', () => {
    const w = new WorldState();
    w.addReputation('red_tide', 60);
    w.addReputation('ashguard', -60);
    expect(currentPriceMultiplier(w, factions)).toBeLessThan(1);
  });

  it('金币足够时购买成功，扣除金币并加入背包', () => {
    const s = newSession([]);
    s.player.gold = 100;
    const r = buyItem(s, items[0], 1);
    expect(r.ok).toBe(true);
    expect(s.player.gold).toBe(60);
    expect(s.world.getItemCount('iron_sword')).toBe(1);
  });

  it('金币不足时购买失败，金币和背包都不变', () => {
    const s = newSession([]);
    s.player.gold = 10;
    const r = buyItem(s, items[2], 1);
    expect(r.ok).toBe(false);
    expect(s.player.gold).toBe(10);
    expect(s.world.getItemCount('ash_helm')).toBe(0);
  });

  it('商店列表行首编号从 1 开始', () => {
    const lines = shopLines(shopStock(items), 1);
    expect(lines[0]).toBe('[1] 铁剑  40 金币');
    expect(lines[1]).toBe('[2] 灰烬头盔  220 金币');
  });
});
