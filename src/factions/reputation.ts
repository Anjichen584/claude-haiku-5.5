/**
 * 阵营声望（阶段 6）。纯逻辑，不依赖 Phaser。
 *
 * - 声望范围 −100 到 +100，分为五个档位；
 * - 提升某阵营声望时，其敌对阵营按 RIVAL_RATIO 同比例下降；
 * - 档位决定商店价格与可进入的区域。
 */
import type { FactionDef } from '../data/schema';
import type { WorldState } from '../state/WorldState';

export type ReputationTier = 'hostile' | 'cold' | 'neutral' | 'friendly' | 'trusted';

/** 敌对阵营的声望变化比例（相对于正向变化） */
export const RIVAL_RATIO = 0.5;

export const TIER_RANGES: ReadonlyArray<{ tier: ReputationTier; min: number; max: number }> = [
  { tier: 'hostile', min: -100, max: -50 },
  { tier: 'cold', min: -49, max: -10 },
  { tier: 'neutral', min: -9, max: 9 },
  { tier: 'friendly', min: 10, max: 49 },
  { tier: 'trusted', min: 50, max: 100 },
];

export function tierOf(value: number): ReputationTier {
  for (const r of TIER_RANGES) {
    if (value >= r.min && value <= r.max) return r.tier;
  }
  return value < 0 ? 'hostile' : 'trusted';
}

/** 商店价格倍率 */
export const PRICE_MULTIPLIER: Record<ReputationTier, number> = {
  trusted: 0.9,
  friendly: 0.95,
  neutral: 1,
  cold: 1.1,
  hostile: 1.3,
};

export function priceMultiplier(world: WorldState, faction: string): number {
  return PRICE_MULTIPLIER[tierOf(world.getReputation(faction))];
}

export interface AreaRequirement {
  faction: string;
  minTier: ReputationTier;
}

const TIER_ORDER: ReputationTier[] = ['hostile', 'cold', 'neutral', 'friendly', 'trusted'];

/** 是否满足区域进入条件（声望档位不低于要求） */
export function canEnter(world: WorldState, req: AreaRequirement): boolean {
  const current = TIER_ORDER.indexOf(tierOf(world.getReputation(req.faction)));
  return current >= TIER_ORDER.indexOf(req.minTier);
}

export interface ReputationChange {
  faction: string;
  before: number;
  after: number;
}

/**
 * 变化某阵营声望，并同步影响其敌对阵营。
 * 只有正向变化才会影响敌对阵营（按 RIVAL_RATIO 反向变化，取整为 0 时不变）。
 */
export function changeReputation(
  world: WorldState,
  factions: readonly FactionDef[],
  faction: string,
  delta: number,
): ReputationChange[] {
  const def = factions.find((f) => f.id === faction);
  if (!def) throw new RangeError(`未知阵营 ${faction}`);

  const changes: ReputationChange[] = [];
  const before = world.getReputation(faction);
  const after = world.addReputation(faction, delta);
  changes.push({ faction, before, after });

  if (delta > 0) {
    const penalty = -Math.trunc(delta * RIVAL_RATIO);
    if (penalty !== 0) {
      for (const rival of def.rivals) {
        const rBefore = world.getReputation(rival);
        const rAfter = world.addReputation(rival, penalty);
        changes.push({ faction: rival, before: rBefore, after: rAfter });
      }
    }
  }
  return changes;
}

export const TIER_LABEL: Record<ReputationTier, string> = {
  hostile: '敌对', cold: '冷淡', neutral: '中立', friendly: '友好', trusted: '信任',
};

/** 声望面板文本：每个阵营一行，显示档位与数值。 */
export function reputationLines(world: WorldState, factions: readonly FactionDef[]): string[] {
  return factions.map((f) => {
    const value = world.getReputation(f.id);
    const sign = value > 0 ? '+' : '';
    return `${f.name}：${TIER_LABEL[tierOf(value)]}（${sign}${value}）`;
  });
}
