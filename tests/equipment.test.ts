import { describe, expect, it } from 'vitest';
import itemsJson from '../data/items.json';
import type { ItemDef } from '../src/data/schema';
import { BASE_STATS, combatStats, cycleSlot, equippableFor } from '../src/state/equipment';
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
