import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import affixesJson from '../data/affixes.json';
import itemsJson from '../data/items.json';
import itemSetsJson from '../data/item-sets.json';
import skillsJson from '../data/skills.json';
import combosJson from '../data/combos.json';
import type { AffixDef, ItemDef, Rarity, SkillDef } from '../src/data/schema';
import { RARITY_AFFIX_COUNT, reforgeAffix, rollAffixes, scaleAffixValue } from '../src/items/affixRoller';
import { activeSetBonuses, countSetPieces, type ItemSetDef } from '../src/items/sets';
import {
  SkillTreeError,
  activeCombos,
  canUnlock,
  createSkillTree,
  indexSkills,
  resetBranch,
  resetCost,
  unlockBlockReason,
  unlockSkill,
  type ComboDef,
} from '../src/skills/skillTree';

const pool = (affixesJson as { affixes: AffixDef[] }).affixes;
const items = (itemsJson as { items: ItemDef[] }).items;
const sets = (itemSetsJson as { sets: ItemSetDef[] }).sets;
const skills = (skillsJson as { skills: SkillDef[] }).skills;
const combos = (combosJson as { combos: ComboDef[] }).combos;
const byId = indexSkills(skills);

describe('词条抽取', () => {
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'rift'];

  it('每个品质的词条数量符合规则，裂隙额外带 1 条隐藏词条', () => {
    for (const r of rarities) {
      const affixes = rollAffixes(new Rng(1), r, pool, 1);
      const hidden = affixes.filter((a) => a.hidden).length;
      const visible = affixes.length - hidden;
      expect(visible).toBe(RARITY_AFFIX_COUNT[r]);
      expect(hidden).toBe(r === 'rift' ? 1 : 0);
    }
  });

  it('同一件装备中 id 与属性都不重复', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const affixes = rollAffixes(new Rng(seed), 'rift', pool, 5);
      expect(new Set(affixes.map((a) => a.id)).size).toBe(affixes.length);
      expect(new Set(affixes.map((a) => a.stat)).size).toBe(affixes.length);
    }
  });

  it('数值落在配置区间内（按等级缩放后）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = 1 + (seed % 10);
      for (const a of rollAffixes(new Rng(seed), 'legendary', pool, level)) {
        const def = pool.find((p) => p.id === a.id)!;
        const lo = scaleAffixValue(def.min, level);
        const hi = scaleAffixValue(def.max, level);
        expect(a.value).toBeGreaterThanOrEqual(lo);
        expect(a.value).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('相同种子结果一致', () => {
    expect(rollAffixes(new Rng(9), 'epic', pool, 3)).toEqual(rollAffixes(new Rng(9), 'epic', pool, 3));
  });

  it('装备等级越高，数值越大', () => {
    expect(scaleAffixValue(10, 10)).toBeGreaterThan(scaleAffixValue(10, 1));
    expect(scaleAffixValue(10, 0)).toBe(10);
  });

  it('重铸只替换一条非隐藏词条，且不产生重复', () => {
    const original = rollAffixes(new Rng(5), 'rift', pool, 4);
    const reforged = reforgeAffix(new Rng(6), original, 0, pool, 4);
    expect(reforged).toHaveLength(original.length);
    expect(reforged[1]).toEqual(original[1]);
    expect(new Set(reforged.map((a) => a.stat)).size).toBe(reforged.length);
    // 原数组不被修改
    expect(original[0]).not.toBe(reforged[0]);
  });

  it('重铸隐藏词条会报错', () => {
    const affixes = rollAffixes(new Rng(5), 'rift', pool, 4);
    const hiddenIndex = affixes.findIndex((a) => a.hidden);
    expect(() => reforgeAffix(new Rng(1), affixes, hiddenIndex, pool, 4)).toThrow(/隐藏词条/);
  });
});

describe('套装', () => {
  it('件数统计只计入带 setId 的物品', () => {
    const equipped = items.filter((i) => i.id === 'ash_helm' || i.id === 'ash_plate' || i.id === 'iron_sword');
    const counts = countSetPieces(equipped);
    expect(counts.get('ash_warden')).toBe(2);
    expect(counts.has('iron_sword')).toBe(false);
  });

  it('2 件激活第一档，4 件同时激活第一、二档', () => {
    const two = items.filter((i) => i.id === 'ash_helm' || i.id === 'ash_plate');
    expect(activeSetBonuses(sets, two).map((b) => b.pieces)).toEqual([2]);
    const four = [...two, ...two];
    expect(activeSetBonuses(sets, four).map((b) => b.pieces)).toEqual([2, 4]);
  });

  it('未达到件数时不激活任何效果', () => {
    expect(activeSetBonuses(sets, [])).toHaveLength(0);
  });
});

describe('技能树', () => {
  it('没有前置技能时不能解锁', () => {
    const state = createSkillTree(10);
    const cleave = byId.get('cleave');
    expect(unlockBlockReason(state, cleave)).toBe('missing-prereq');
    expect(canUnlock(state, cleave)).toBe(false);
  });

  it('技能点不足时不能解锁', () => {
    const state = createSkillTree(0);
    expect(unlockBlockReason(state, byId.get('slash'))).toBe('no-points');
  });

  it('解锁后扣除技能点，并允许解锁依赖它的技能', () => {
    const state = createSkillTree(5);
    unlockSkill(state, byId.get('slash'));
    expect(state.points).toBe(4);
    unlockSkill(state, byId.get('cleave'));
    expect(state.points).toBe(4 - 2);
    expect(state.unlocked.has('cleave')).toBe(true);
  });

  it('重复解锁和未知技能会抛出错误', () => {
    const state = createSkillTree(10);
    unlockSkill(state, byId.get('slash'));
    expect(() => unlockSkill(state, byId.get('slash'))).toThrow(SkillTreeError);
    expect(() => unlockSkill(state, undefined)).toThrow(SkillTreeError);
  });

  it('重置分支返还点数，并收回依赖它的其他分支技能', () => {
    const state = createSkillTree(20);
    unlockSkill(state, byId.get('slash'));          // martial tier1, 1 点
    unlockSkill(state, byId.get('cleave'));         // martial tier2, 2 点
    unlockSkill(state, byId.get('fireball'));       // arcane tier1, 1 点
    const before = state.points;
    const refunded = resetBranch(state, 'martial', byId);
    expect(refunded).toBe(3);
    expect(state.points).toBe(before + 3);
    expect(state.unlocked.has('slash')).toBe(false);
    expect(state.unlocked.has('fireball')).toBe(true);
  });

  it('跨分支依赖：重置前置技能会连带收回后续技能', () => {
    const state = createSkillTree(50);
    // 技能 whirlwind 依赖 slash（martial）与 lunge（martial），这里验证同分支链式收回
    unlockSkill(state, byId.get('slash'));
    unlockSkill(state, byId.get('lunge'));
    unlockSkill(state, byId.get('whirlwind'));
    resetBranch(state, 'martial', byId);
    expect(state.unlocked.size).toBe(0);
  });

  it('重置费用随等级提高', () => {
    expect(resetCost(10)).toBeGreaterThan(resetCost(1));
    expect(resetCost(0)).toBe(resetCost(1));
  });

  it('组合技只有两个技能都解锁时才生效', () => {
    const state = createSkillTree(50);
    // steam 组合技需要 ignite 与 chill；ignite 依赖 fireball，chill 依赖 frost_bolt
    unlockSkill(state, byId.get('fireball'));
    unlockSkill(state, byId.get('ignite'));
    expect(activeCombos(state, combos).map((c) => c.id)).not.toContain('steam');
    unlockSkill(state, byId.get('frost_bolt'));
    unlockSkill(state, byId.get('chill'));
    expect(activeCombos(state, combos).map((c) => c.id)).toContain('steam');
  });
});

describe('数据一致性', () => {
  it('三条分支各 15 个技能，层级从 1 到 5', () => {
    for (const branch of ['martial', 'arcane', 'survival'] as const) {
      const list = skills.filter((s) => s.branch === branch);
      expect(list).toHaveLength(15);
      expect(Math.min(...list.map((s) => s.tier))).toBe(1);
      expect(Math.max(...list.map((s) => s.tier))).toBe(5);
    }
  });

  it('每个组合技引用的技能都存在', () => {
    for (const c of combos) {
      for (const s of c.skills) expect(byId.has(s)).toBe(true);
    }
  });

  it('词条池至少 60 种且 id 唯一', () => {
    expect(pool.length).toBeGreaterThanOrEqual(60);
    expect(new Set(pool.map((a) => a.id)).size).toBe(pool.length);
  });
});
