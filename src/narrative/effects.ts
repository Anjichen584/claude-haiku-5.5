/**
 * 效果执行（对话与任务奖励）。只修改 WorldState，不直接操作 UI。
 */
import type { WorldState } from '../state/WorldState';

export interface Effects {
  setFlags?: string[];
  clearFlags?: string[];
  reputation?: Record<string, number>;
  items?: Record<string, number>;
  startQuest?: string[];
}

/**
 * 执行效果。返回需要由外部处理的事件（例如开始任务），
 * 因为任务的启动需要 QuestManager 参与。
 */
export function applyEffects(effects: Effects | undefined, world: WorldState): { startQuests: string[] } {
  if (!effects) return { startQuests: [] };
  effects.setFlags?.forEach((f) => world.setFlag(f));
  effects.clearFlags?.forEach((f) => world.clearFlag(f));
  for (const [faction, delta] of Object.entries(effects.reputation ?? {})) {
    world.addReputation(faction, delta);
  }
  for (const [itemId, count] of Object.entries(effects.items ?? {})) {
    world.addItem(itemId, count);
  }
  return { startQuests: [...(effects.startQuest ?? [])] };
}
