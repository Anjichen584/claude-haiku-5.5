/**
 * 装备词条抽取（阶段 4）。纯逻辑，不依赖 Phaser。
 *
 * 规则（见 README「装备词条」）：
 *   - 词条数量由品质决定，裂隙品质额外带 1 条隐藏词条；
 *   - 同一件装备中，同一 id 与同一属性都不会重复出现；
 *   - 数值在 [min, max] 之间随机，并按装备等级缩放。
 */
import type { Rng } from '../core/Rng';
import type { AffixDef, Rarity } from '../data/schema';

export const RARITY_AFFIX_COUNT: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  rift: 4,
};

/** 裂隙品质的隐藏词条数量 */
export const HIDDEN_AFFIX_COUNT = 1;

/** 装备等级每提高 1 级，词条数值增加的比例 */
export const ILVL_SCALE_PER_LEVEL = 0.05;

export interface RolledAffix {
  id: string;
  name: string;
  stat: string;
  value: number;
  hidden: boolean;
}

/** 数值缩放：按装备等级放大，结果取整 */
export function scaleAffixValue(base: number, itemLevel: number): number {
  const level = Math.max(1, itemLevel);
  return Math.round(base * (1 + ILVL_SCALE_PER_LEVEL * (level - 1)));
}

/** 按权重无放回地抽取一条词条，跳过已经使用的 id 与属性 */
function pickAffix(rng: Rng, pool: readonly AffixDef[], used: Set<string>, usedStats: Set<string>): AffixDef {
  const candidates = pool
    .filter((a) => !used.has(a.id) && !usedStats.has(a.stat))
    .map((a) => ({ value: a, weight: a.weight }));
  if (candidates.length === 0) {
    throw new RangeError('词条池不足：无法为该装备抽取足够的不重复词条');
  }
  return rng.weighted(candidates);
}

export function rollAffixes(
  rng: Rng,
  rarity: Rarity,
  pool: readonly AffixDef[],
  itemLevel: number,
): RolledAffix[] {
  const count = RARITY_AFFIX_COUNT[rarity];
  const hiddenCount = rarity === 'rift' ? HIDDEN_AFFIX_COUNT : 0;
  const used = new Set<string>();
  const usedStats = new Set<string>();
  const result: RolledAffix[] = [];

  for (let i = 0; i < count + hiddenCount; i++) {
    const def = pickAffix(rng, pool, used, usedStats);
    used.add(def.id);
    usedStats.add(def.stat);
    const raw = def.min + (def.max - def.min) * rng.next();
    result.push({
      id: def.id,
      name: def.name,
      stat: def.stat,
      value: scaleAffixValue(Math.round(raw), itemLevel),
      hidden: i >= count,
    });
  }
  return result;
}

/**
 * 重铸：替换一条非隐藏词条，新词条不得与其他词条重复。
 * 返回新数组，不修改原数组。
 */
export function reforgeAffix(
  rng: Rng,
  affixes: readonly RolledAffix[],
  index: number,
  pool: readonly AffixDef[],
  itemLevel: number,
): RolledAffix[] {
  const target = affixes[index];
  if (!target) throw new RangeError(`重铸索引越界：${index}`);
  if (target.hidden) throw new Error('隐藏词条不能重铸');

  const others = affixes.filter((_, i) => i !== index);
  const used = new Set(others.map((a) => a.id));
  const usedStats = new Set(others.map((a) => a.stat));
  const def = pickAffix(rng, pool, used, usedStats);
  const raw = def.min + (def.max - def.min) * rng.next();

  const next = affixes.slice();
  next[index] = {
    id: def.id,
    name: def.name,
    stat: def.stat,
    value: scaleAffixValue(Math.round(raw), itemLevel),
    hidden: false,
  };
  return next;
}
