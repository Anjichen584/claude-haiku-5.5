/**
 * 结局判定（阶段 6）。纯逻辑。
 * 满足条件的结局中，priority 数值最小者胜出；都不满足时返回 null。
 */
import type { EndingDef } from '../data/schema';
import { evaluateCondition, type Condition } from '../narrative/conditions';
import type { WorldState } from '../state/WorldState';

export interface ResolvedEnding {
  id: string;
  name: string;
  text: string;
}

export function resolveEnding(endings: readonly EndingDef[], world: WorldState): ResolvedEnding | null {
  const candidates = endings
    .filter((e) => evaluateCondition(e.conditions as Condition, world))
    .sort((a, b) => a.priority - b.priority);
  const winner = candidates[0];
  return winner ? { id: winner.id, name: winner.name, text: winner.text } : null;
}
