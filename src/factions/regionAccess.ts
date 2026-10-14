/**
 * 区域门槛（阶段 6）。纯逻辑，不依赖 Phaser。
 *
 * 某些区域要求玩家对某阵营达到一定声望档位才能进入。
 * “进入”指抵达该区域内的地点（地点任务与探索奖励）。
 */
import type { FactionDef } from '../data/schema';
import type { WorldState } from '../state/WorldState';
import { canEnter, TIER_LABEL, type ReputationTier } from './reputation';

export interface RegionGate {
  region: string;
  faction: string;
  minTier: ReputationTier;
}

/** 区域被锁时的提示文字；区域可进入时返回 null。 */
export function blockReason(
  world: WorldState,
  region: string,
  gates: readonly RegionGate[],
  factions: readonly FactionDef[],
): string | null {
  const gate = gates.find((g) => g.region === region);
  if (!gate) return null;
  if (canEnter(world, { faction: gate.faction, minTier: gate.minTier })) return null;
  const name = factions.find((f) => f.id === gate.faction)?.name ?? gate.faction;
  return `需要与「${name}」的声望达到「${TIER_LABEL[gate.minTier]}」才能进入${region}`;
}
