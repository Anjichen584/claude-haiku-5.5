/**
 * 关键抉择（阶段 6）。纯逻辑，不依赖 Phaser。
 *
 * - 抉择在对应章节主线任务完成后出现；
 * - 是否待选由世界标记决定（任一选项的标记已存在即视为已选），因此存档后仍然有效；
 * - 选择后写入选项标记，不可撤销。
 */
import type { QuestDef } from '../data/schema';
import type { WorldState } from '../state/WorldState';

export interface KeyChoiceOption {
  id: string;
  text: string;
  flag: string;
  /** 选择后的数值效果：阵营声望变化、稳定度变化 */
  effects?: { reputation?: Record<string, number>; stability?: number };
}

export interface KeyChoiceDef {
  id: string;
  chapter: number;
  question: string;
  options: KeyChoiceOption[];
}

/** 找到该章节的主线任务 id */
function mainQuestOfChapter(chapter: number, quests: readonly QuestDef[]): string | undefined {
  return quests.find((q) => q.type === 'main' && q.chapter === chapter)?.id;
}

/** 某个抉择是否已经做过选择 */
export function isResolved(choice: KeyChoiceDef, world: WorldState): boolean {
  return choice.options.some((o) => world.hasFlag(o.flag));
}

/**
 * 返回当前待选的抉择（按章节顺序的第一个）；没有则返回 undefined。
 * 条件：对应章节主线任务已完成，且尚未选择。
 */
export function pendingKeyChoice(
  choices: readonly KeyChoiceDef[],
  quests: readonly QuestDef[],
  world: WorldState,
): KeyChoiceDef | undefined {
  const sorted = [...choices].sort((a, b) => a.chapter - b.chapter);
  for (const choice of sorted) {
    const questId = mainQuestOfChapter(choice.chapter, quests);
    if (!questId) continue;
    const done = world.getQuest(questId)?.status === 'completed';
    if (done && !isResolved(choice, world)) return choice;
  }
  return undefined;
}

/** 选择一个选项：写入标记。选项不存在时抛出错误。 */
export function resolveKeyChoice(choice: KeyChoiceDef, optionId: string, world: WorldState): KeyChoiceOption {
  const option = choice.options.find((o) => o.id === optionId);
  if (!option) throw new RangeError(`关键抉择 ${choice.id} 没有选项 ${optionId}`);
  if (isResolved(choice, world)) throw new Error(`关键抉择 ${choice.id} 已经选择过了`);
  world.setFlag(option.flag);
  for (const [faction, delta] of Object.entries(option.effects?.reputation ?? {})) {
    world.addReputation(faction, delta);
  }
  if (option.effects?.stability) world.addStability(option.effects.stability);
  return option;
}
