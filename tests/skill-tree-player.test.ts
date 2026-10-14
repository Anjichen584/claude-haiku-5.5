import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  activeCombos, branchSkills, createSkillTree, indexSkills, resetBranch, resetCost, storeTree, treeOf,
  unlockSkill, type ComboDef, type SkillTreeState,
} from '../src/skills/skillTree';
import type { SkillDef } from '../src/data/schema';

const skills = (JSON.parse(readFileSync('data/skills.json', 'utf8')) as { skills: SkillDef[] }).skills;
const combos = (JSON.parse(readFileSync('data/combos.json', 'utf8')) as { combos?: ComboDef[] } & ComboDef[]);
const comboList: ComboDef[] = Array.isArray(combos) ? combos : (combos.combos ?? []);
const byId = indexSkills(skills);

/** 递归学习某个技能及其所有前置（测试用，保证路径合法） */
function learnWithPrereqs(state: SkillTreeState, id: string): void {
  const skill = byId.get(id)!;
  for (const r of skill.requires) if (!state.unlocked.has(r)) learnWithPrereqs(state, r);
  if (!state.unlocked.has(id)) unlockSkill(state, skill);
}

describe('技能树（玩家存档与界面逻辑）', () => {
  it('存档字段可以往返：读取后写回不变', () => {
    const player = { skills: { unlocked: ['slash'], points: 3 } };
    const state = treeOf(player);
    expect(state.unlocked.has('slash')).toBe(true);
    expect(state.points).toBe(3);
    unlockSkill(state, byId.get('guard_stance'));
    storeTree(player, state);
    expect(player.skills.unlocked.sort()).toEqual(['guard_stance', 'slash']);
    expect(player.skills.points).toBe(2);
  });

  it('每个分支 15 个技能，按层级排序', () => {
    for (const branch of ['martial', 'arcane', 'survival'] as const) {
      const list = branchSkills(skills, branch);
      expect(list.length).toBe(15);
      for (let i = 1; i < list.length; i++) expect(list[i].tier).toBeGreaterThanOrEqual(list[i - 1].tier);
    }
  });

  it('前置不足、点数不足时不能学习', () => {
    const state = createSkillTree(1);
    expect(() => unlockSkill(state, byId.get('cleave'))).toThrow(); // 需要斩击
    unlockSkill(state, byId.get('slash'));
    expect(state.points).toBe(0);
    expect(() => unlockSkill(state, byId.get('guard_stance'))).toThrow(); // 没有点数
  });

  it('组合技：两个技能都学会后才激活', () => {
    const combo = comboList.find((c) => c.skills.includes('slash') && c.skills.includes('dark_pulse'))!;
    expect(combo).toBeDefined();
    const state = createSkillTree(100);
    learnWithPrereqs(state, combo.skills[0]);
    expect(activeCombos(state, comboList).map((c) => c.id)).not.toContain(combo.id);
    learnWithPrereqs(state, combo.skills[1]);
    expect(activeCombos(state, comboList).map((c) => c.id)).toContain(combo.id);
  });

  it('重置分支：返还该分支技能点，依赖它的其他分支技能一并收回', () => {
    const state = createSkillTree(100);
    learnWithPrereqs(state, 'whirlwind'); // 武艺分支
    const before = state.points;
    const refunded = resetBranch(state, 'martial', byId);
    expect(refunded).toBeGreaterThan(0);
    expect(state.points).toBe(before + refunded);
    expect(state.unlocked.size).toBe(0);
  });

  it('重置费用随等级提高', () => {
    expect(resetCost(10)).toBeGreaterThan(resetCost(1));
  });
});
