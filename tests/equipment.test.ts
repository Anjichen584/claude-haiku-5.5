import { describe, expect, it } from 'vitest';
import itemsJson from '../data/items.json';
import type { ItemDef } from '../src/data/schema';
import { BASE_STATS, combatStats, cycleSlot, equipmentDetailLines, equippableFor } from '../src/state/equipment';
import type { AffixDef } from '../src/data/schema';
import type { ItemSetDef } from '../src/items/sets';
import { newSession } from '../src/state/session';
import questsJson from '../data/quests.json';
import type { QuestDef } from '../src/data/schema';

const items = (itemsJson as unknown as { items: ItemDef[] }).items;
const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;

describe('槽位候选', () => {
  it('只列出对应槽位的武器或护甲', () => {
    expect(equippableFor('main_hand', items).map((i) => i.id)).toEqual(['iron_sword', 'rift_blade']);
    expect(equippableFor('head', items).map((i) => i.id)).toEqual(['ash_helm']);
  });
});

describe('切换装备', () => {
  it('从背包装备一件，背包减少一件', () => {
    const s = newSession(quests);
    s.world.addItem('iron_sword', 1);
    expect(cycleSlot(s, 'main_hand', items)).toBe('iron_sword');
    expect(s.player.equipment.main_hand).toBe('iron_sword');
    expect(s.world.getItemCount('iron_sword')).toBe(0);
  });

  it('在多件候选之间循环，最后一步为卸下并放回背包', () => {
    const s = newSession(quests);
    s.world.addItem('iron_sword', 1);
    s.world.addItem('rift_blade', 1);
    expect(cycleSlot(s, 'main_hand', items)).toBe('iron_sword');
    expect(cycleSlot(s, 'main_hand', items)).toBe('rift_blade');
    expect(s.world.getItemCount('iron_sword')).toBe(1);
    expect(s.world.getItemCount('rift_blade')).toBe(0);
    expect(cycleSlot(s, 'main_hand', items)).toBeUndefined();
    expect(s.player.equipment.main_hand).toBeUndefined();
    expect(s.world.getItemCount('rift_blade')).toBe(1);
  });

  it('没有候选时直接卸下', () => {
    const s = newSession(quests);
    s.world.addItem('ash_helm', 1);
    cycleSlot(s, 'head', items);
    expect(cycleSlot(s, 'head', items)).toBeUndefined();
    expect(s.world.getItemCount('ash_helm')).toBe(1);
  });

  it('背包里没有的物品不会被装备', () => {
    const s = newSession(quests);
    expect(cycleSlot(s, 'main_hand', items)).toBeUndefined();
    expect(s.player.equipment.main_hand).toBeUndefined();
  });
});

describe('战斗属性', () => {
  it('没有装备时是基础属性', () => {
    expect(combatStats({}, items)).toEqual({ attack: BASE_STATS.attack, defense: BASE_STATS.defense, maxHp: BASE_STATS.maxHp });
  });

  it('武器加攻击，护甲加防御', () => {
    const stats = combatStats({ main_hand: 'rift_blade', head: 'ash_helm', chest: 'ash_plate' }, items);
    expect(stats.attack).toBe(BASE_STATS.attack + 26);
    expect(stats.defense).toBe(BASE_STATS.defense + 3 + 6);
  });
});

describe('词条与套装加成', () => {
  const pool: AffixDef[] = [
    { id: 'sharp', name: '锋利', stat: 'attack', min: 1, max: 5, weight: 10 },
    { id: 'tough', name: '坚韧', stat: 'defense', min: 1, max: 5, weight: 10 },
    { id: 'vital', name: '活力', stat: 'maxHp', min: 10, max: 20, weight: 10 },
  ];
  const speedOnly: AffixDef[] = [
    { id: 'swift', name: '迅捷', stat: 'speed', min: 1, max: 5, weight: 10 },
    { id: 'keen', name: '精准', stat: 'critRate', min: 1, max: 5, weight: 10 },
    { id: 'nimble', name: '灵巧', stat: 'dodgeChance', min: 1, max: 5, weight: 10 },
  ];
  const gear: ItemDef[] = [
    { id: 'ash_helm', name: '灰烬头盔', type: 'armor', slot: 'head', baseDamage: 0, rarity: 'epic', price: 1, setId: 'ash', itemLevel: 1, defense: 3 },
    { id: 'ash_plate', name: '灰烬胸甲', type: 'armor', slot: 'chest', baseDamage: 0, rarity: 'epic', price: 1, setId: 'ash', itemLevel: 1, defense: 6 },
  ];
  const sets: ItemSetDef[] = [
    { id: 'ash', name: '灰烬', bonuses: [{ pieces: 2, stat: 'defense', value: 5, text: '防御 +5' }] },
  ];

  it('词条按物品固定抽取：同一件装备多次计算结果一致', () => {
    expect(combatStats({ head: 'ash_helm' }, gear, pool)).toEqual(combatStats({ head: 'ash_helm' }, gear, pool));
  });

  it('非战斗词条（如速度）不改变战斗属性', () => {
    expect(combatStats({ head: 'ash_helm' }, gear, speedOnly)).toEqual(combatStats({ head: 'ash_helm' }, gear));
  });

  it('攻击、防御、生命类词条会计入战斗属性', () => {
    const withAffix = combatStats({ head: 'ash_helm' }, gear, pool);
    const noAffix = combatStats({ head: 'ash_helm' }, gear);
    expect(withAffix.attack + withAffix.defense + withAffix.maxHp).toBeGreaterThan(
      noAffix.attack + noAffix.defense + noAffix.maxHp,
    );
  });

  it('两件同套装激活 2 件套效果（防御 +5）', () => {
    const one = combatStats({ head: 'ash_helm' }, gear, [], sets);
    const two = combatStats({ head: 'ash_helm', chest: 'ash_plate' }, gear, [], sets);
    expect(one.defense).toBe(BASE_STATS.defense + 3);
    expect(two.defense).toBe(BASE_STATS.defense + 3 + 6 + 5);
  });

  it('未提供词条池时不抽取词条，不报错', () => {
    expect(() => combatStats({ head: 'ash_helm' }, gear)).not.toThrow();
  });
});

describe('装备明细', () => {
  it('列出词条，并显示已激活的套装效果', () => {
    const gear: ItemDef[] = [
      { id: 'ash_helm', name: '灰烬头盔', type: 'armor', slot: 'head', baseDamage: 0, rarity: 'epic', price: 1, setId: 'ash', itemLevel: 1, defense: 3 },
      { id: 'ash_plate', name: '灰烬胸甲', type: 'armor', slot: 'chest', baseDamage: 0, rarity: 'epic', price: 1, setId: 'ash', itemLevel: 1, defense: 6 },
    ];
    const pool: AffixDef[] = [
      { id: 'tough', name: '坚韧', stat: 'defense', min: 1, max: 5, weight: 10 },
      { id: 'vital', name: '活力', stat: 'maxHp', min: 10, max: 20, weight: 10 },
      { id: 'sharp', name: '锋利', stat: 'attack', min: 1, max: 5, weight: 10 },
    ];
    const sets: ItemSetDef[] = [{ id: 'ash', name: '灰烬', bonuses: [{ pieces: 2, stat: 'defense', value: 5, text: '防御 +5' }] }];
    const lines = equipmentDetailLines({ head: 'ash_helm', chest: 'ash_plate' }, gear, pool, sets);
    expect(lines.filter((l) => l.includes('·')).length).toBe(3 * 2);
    expect(lines.some((l) => l.includes('◆ 灰烬（2 件）') && l.includes('防御 +5'))).toBe(true);
    expect(equipmentDetailLines({}, gear, pool, sets)).toEqual([]);
  });
});
