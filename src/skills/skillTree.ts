/**
 * 技能树规则（阶段 4）。纯逻辑，不依赖 Phaser。
 *
 * - 解锁需要：满足前置技能、技能点足够；
 * - 每个技能的 cost.skillPoints 等于其层级；
 * - 重置某分支会返还点数，但需要支付金币，费用随角色等级提高；
 * - 组合技：两个指定技能同时解锁时触发。
 */
import type { SkillDef } from '../data/schema';

export type Branch = SkillDef['branch'];

export interface SkillTreeState {
  unlocked: Set<string>;
  points: number;
}

export interface ComboDef {
  id: string;
  name: string;
  /** 必须恰好两个不同的技能，由数据校验保证 */
  skills: string[];
  effect: Partial<Record<string, number>>;
}

export class SkillTreeError extends Error {}

export function createSkillTree(points = 0): SkillTreeState {
  return { unlocked: new Set(), points };
}

export function indexSkills(skills: readonly SkillDef[]): Map<string, SkillDef> {
  return new Map(skills.map((s) => [s.id, s]));
}

export type UnlockBlock = 'unknown' | 'already' | 'missing-prereq' | 'no-points';

/** 返回无法解锁的原因；可以解锁时返回 null。 */
export function unlockBlockReason(
  state: SkillTreeState,
  skill: SkillDef | undefined,
): UnlockBlock | null {
  if (!skill) return 'unknown';
  if (state.unlocked.has(skill.id)) return 'already';
  if (!skill.requires.every((r) => state.unlocked.has(r))) return 'missing-prereq';
  if (state.points < skill.cost.skillPoints) return 'no-points';
  return null;
}

export function canUnlock(state: SkillTreeState, skill: SkillDef | undefined): boolean {
  return unlockBlockReason(state, skill) === null;
}

/** 解锁技能，直接修改状态。失败时抛出 SkillTreeError。 */
export function unlockSkill(state: SkillTreeState, skill: SkillDef | undefined): void {
  const reason = unlockBlockReason(state, skill);
  if (reason !== null) throw new SkillTreeError(`无法解锁 ${skill?.id ?? '未知技能'}：${reason}`);
  state.unlocked.add(skill!.id);
  state.points -= skill!.cost.skillPoints;
}

/** 重置某分支：收回该分支已解锁的技能，并返还点数。被其他分支依赖的技能会一并收回。 */
export function resetBranch(
  state: SkillTreeState,
  branch: Branch,
  skillsById: ReadonlyMap<string, SkillDef>,
): number {
  let refunded = 0;
  const toRemove = new Set<string>();
  // 分支内所有已解锁技能
  for (const id of state.unlocked) {
    if (skillsById.get(id)?.branch === branch) toRemove.add(id);
  }
  // 其他分支中依赖这些技能的，也需要收回（递归直到稳定）
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of state.unlocked) {
      if (toRemove.has(id)) continue;
      const skill = skillsById.get(id);
      if (skill && skill.requires.some((r) => toRemove.has(r))) {
        toRemove.add(id);
        changed = true;
      }
    }
  }
  for (const id of toRemove) {
    const skill = skillsById.get(id);
    if (skill) refunded += skill.cost.skillPoints;
    state.unlocked.delete(id);
  }
  state.points += refunded;
  return refunded;
}

/** 重置费用：基础 50 金，每级增加 25 金。 */
export function resetCost(playerLevel: number): number {
  return 50 + Math.max(1, playerLevel) * 25;
}

/** 返回当前已解锁的组合技（两个技能都已解锁）。 */
export function activeCombos(state: SkillTreeState, combos: readonly ComboDef[]): ComboDef[] {
  return combos.filter((c) => c.skills.length === 2 && c.skills.every((id) => state.unlocked.has(id)));
}
