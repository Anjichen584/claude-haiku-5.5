/**
 * 击杀奖励：按敌人等级给经验与金币，并按掉落表随机掉落物品。
 * 掉落使用种子随机，同一场战斗（key 相同）的结果稳定。
 */
import { hashSeed, Rng } from '../core/Rng';
import type { EnemyDef } from '../data/schema';
import type { Gains } from './rewards';

export function killGains(def: Pick<EnemyDef, 'level'>): Gains {
  const lv = def.level ?? 2;
  return { exp: 5 + 5 * lv, gold: 2 + 2 * lv, items: [] };
}

/** 按掉落表判定掉落。key 应唯一标识这一次击杀（例如 战斗键 + 序号）。 */
export function rollDrops(def: Pick<EnemyDef, 'id' | 'drops'>, key: string): string[] {
  const rng = new Rng(hashSeed('drop', key, def.id));
  const items: string[] = [];
  for (const drop of def.drops) {
    if (rng.next() < drop.chance) items.push(drop.item);
  }
  return items;
}
