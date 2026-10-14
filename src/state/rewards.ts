/**
 * 奖励发放：经验、金币、物品。
 * 只修改会话数据，不依赖 Phaser，便于测试。文字描述由调用方提供物品名称。
 */
import type { QuestCompletion } from '../narrative/QuestManager';
import type { GameSession } from './session';

export interface Gains {
  exp: number;
  gold: number;
  items: string[];
}

export const NO_GAINS: Gains = { exp: 0, gold: 0, items: [] };

/** 等级由累计经验决定：升到 L 级需要累计 50·L·(L−1) 点经验（1 级起步）。 */
export function levelForExp(exp: number): number {
  return Math.floor((50 + Math.sqrt(2500 + 200 * Math.max(0, exp))) / 100);
}

/** 发放奖励，返回升级提示（没有升级则为空数组）。 */
export function applyGains(session: GameSession, gains: Gains): string[] {
  const before = levelForExp(session.player.exp);
  session.player.exp += gains.exp;
  session.player.gold += gains.gold;
  for (const id of gains.items) session.world.addItem(id, 1);
  const after = levelForExp(session.player.exp);
  // 每升一级获得 1 点技能点
  if (after > before) session.player.skills.points += after - before;
  return after > before ? [`升级！当前等级 ${after}（+${after - before} 技能点）`] : [];
}

/** 把一组奖励写成一行文字，例如 “+300 经验、+120 金币、裂隙碎片”。 */
export function describeGains(gains: Gains, itemName: (id: string) => string): string {
  const parts: string[] = [];
  if (gains.exp > 0) parts.push(`+${gains.exp} 经验`);
  if (gains.gold > 0) parts.push(`+${gains.gold} 金币`);
  for (const id of gains.items) parts.push(itemName(id));
  return parts.join('、');
}

/** 发放任务完成的奖励，并返回用于提示的文本行。 */
export function grantQuestRewards(
  session: GameSession,
  completions: readonly QuestCompletion[],
  titleOf: (questId: string) => string,
  itemName: (id: string) => string,
): string[] {
  const lines: string[] = [];
  for (const c of completions) {
    const gains: Gains = {
      exp: c.rewards.exp ?? 0,
      gold: c.rewards.gold ?? 0,
      items: c.rewards.items ?? [],
    };
    const text = describeGains(gains, itemName);
    lines.push(text ? `任务完成：${titleOf(c.questId)}（${text}）` : `任务完成：${titleOf(c.questId)}`);
    lines.push(...applyGains(session, gains));
    for (const [faction, delta] of Object.entries(c.rewards.reputation ?? {})) {
      const after = session.world.addReputation(faction, delta);
      lines.push(`声望变化：${faction} ${delta > 0 ? '+' : ''}${delta}（现为 ${after}）`);
    }
  }
  return lines;
}
