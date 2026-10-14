/**
 * 条件判断（对话选项、任务前置、结局）。纯函数，只读取 WorldState。
 *
 * 条件结构示例：
 *   {
 *     "flags": ["met_captain"],          // 必须同时拥有
 *     "notFlags": ["betrayed"],          // 必须都没有
 *     "reputation": { "ashguard": { "gte": 20 } },
 *     "quests": { "main_01": "completed" },
 *     "items": { "rift_shard": { "gte": 3 } }
 *   }
 * 所有字段都是可选的；缺省视为通过。
 */
import type { WorldState, QuestStatus } from '../state/WorldState';

export interface RangeCheck {
  gte?: number;
  lte?: number;
}

export interface Condition {
  flags?: string[];
  notFlags?: string[];
  reputation?: Record<string, RangeCheck>;
  quests?: Record<string, QuestStatus>;
  items?: Record<string, RangeCheck>;
}

function inRange(value: number, check: RangeCheck): boolean {
  if (check.gte !== undefined && value < check.gte) return false;
  if (check.lte !== undefined && value > check.lte) return false;
  return true;
}

export function evaluateCondition(condition: Condition | undefined, world: WorldState): boolean {
  if (!condition) return true;

  if (condition.flags?.some((f) => !world.hasFlag(f))) return false;
  if (condition.notFlags?.some((f) => world.hasFlag(f))) return false;

  for (const [faction, check] of Object.entries(condition.reputation ?? {})) {
    if (!inRange(world.getReputation(faction), check)) return false;
  }
  for (const [questId, status] of Object.entries(condition.quests ?? {})) {
    if (world.questStatus(questId) !== status) return false;
  }
  for (const [itemId, check] of Object.entries(condition.items ?? {})) {
    if (!inRange(world.getItemCount(itemId), check)) return false;
  }
  return true;
}
