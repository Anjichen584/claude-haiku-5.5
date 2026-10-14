import { describe, expect, it } from 'vitest';
import enemiesJson from '../data/enemies.json';
import type { EnemyDef } from '../src/data/schema';
import { killGains, rollDrops } from '../src/state/killRewards';

const enemies = (enemiesJson as unknown as { enemies: EnemyDef[] }).enemies;

describe('击杀奖励', () => {
  it('等级越高经验与金币越多，没有等级时按 2 级计算', () => {
    expect(killGains({ level: 1 })).toEqual({ exp: 10, gold: 4, items: [] });
    expect(killGains({ level: 5 })).toEqual({ exp: 30, gold: 12, items: [] });
    expect(killGains({})).toEqual(killGains({ level: 2 }));
  });
});

describe('掉落', () => {
  it('同一个 key 的结果稳定', () => {
    const def = enemies.find((e) => e.id === 'ash_wolf')!;
    expect(rollDrops(def, 'k-1')).toEqual(rollDrops(def, 'k-1'));
  });

  it('概率为 1 的掉落必然出现，概率为 0 的永不出现', () => {
    expect(rollDrops({ id: 'x', drops: [{ item: 'a', chance: 1 }] }, 'k')).toEqual(['a']);
    expect(rollDrops({ id: 'x', drops: [{ item: 'a', chance: 0 }] }, 'k')).toEqual([]);
  });

  it('大量击杀的掉落率接近配置的概率', () => {
    const def = { id: 'x', drops: [{ item: 'a', chance: 0.3 }] };
    let hits = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) hits += rollDrops(def, `k-${i}`).length;
    expect(hits / n).toBeGreaterThan(0.25);
    expect(hits / n).toBeLessThan(0.35);
  });
});
