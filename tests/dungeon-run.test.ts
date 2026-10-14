import { describe, expect, it } from 'vitest';
import dungeonJson from '../data/dungeon.json';
import enemiesJson from '../data/enemies.json';
import type { EnemyDef } from '../src/data/schema';
import type { DungeonFloorFile } from '../src/dungeon/floors';
import {
  CHEST_ITEMS,
  canMoveTo,
  markCleared,
  moveTo,
  neighbors,
  roomById,
  roomOutcome,
  startRun,
} from '../src/dungeon/run';

const dungeon = dungeonJson as unknown as DungeonFloorFile;
const enemies = (enemiesJson as unknown as { enemies: EnemyDef[] }).enemies;
const SEED = 20261014;

describe('地牢房间图', () => {
  it('12 层都能生成，每层有且只有一个入口与一个 Boss 房', () => {
    for (let floor = 1; floor <= 12; floor++) {
      const run = startRun(SEED, floor, dungeon);
      const kinds = run.layout.rooms.map((r) => r.kind);
      expect(kinds.filter((k) => k === 'entrance')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'boss')).toHaveLength(1);
      expect(roomById(run, run.layout.bossId).kind).toBe('boss');
      expect(roomById(run, run.current).kind).toBe('entrance');
    }
  });

  it('只能移动到相邻房间', () => {
    const run = startRun(SEED, 1, dungeon);
    const next = neighbors(run, run.current);
    expect(next.length).toBeGreaterThan(0);
    const far = run.layout.rooms.find((r) => r.id !== run.current && !next.some((n) => n.id === r.id))!;
    expect(canMoveTo(run, far.id)).toBe(false);
    expect(() => moveTo(run, far.id)).toThrow(RangeError);
    moveTo(run, next[0].id);
    expect(run.current).toBe(next[0].id);
  });
});

describe('房间内容', () => {
  it('同一房间的内容稳定', () => {
    const run = startRun(SEED, 3, dungeon);
    for (const room of run.layout.rooms) {
      expect(roomOutcome(run, room.id, enemies)).toEqual(roomOutcome(run, room.id, enemies));
    }
  });

  it('战斗房的敌人都存在，且不是 Boss', () => {
    const byId = new Map(enemies.map((e) => [e.id, e]));
    for (let floor = 1; floor <= 12; floor++) {
      const run = startRun(SEED, floor, dungeon);
      for (const room of run.layout.rooms.filter((r) => r.kind === 'combat')) {
        const out = roomOutcome(run, room.id, enemies);
        if (out.type !== 'combat') throw new Error('expected combat');
        expect(out.boss).toBe(false);
        expect(out.enemyIds.length).toBeGreaterThanOrEqual(1);
        for (const id of out.enemyIds) expect(byId.get(id)?.boss ?? false).toBe(false);
      }
    }
  });

  it('Boss 房的敌人是 Boss，击败后通关', () => {
    const run = startRun(SEED, 5, dungeon);
    const out = roomOutcome(run, run.layout.bossId, enemies);
    if (out.type !== 'combat') throw new Error('expected combat');
    expect(out.boss).toBe(true);
    expect(enemies.find((e) => e.id === out.enemyIds[0])?.boss).toBe(true);
    expect(run.finished).toBe(false);
    markCleared(run, run.layout.bossId);
    expect(run.finished).toBe(true);
  });

  it('宝箱给金币和材料，休息点恢复 30%', () => {
    const run = startRun(SEED, 2, dungeon);
    const chest = run.layout.rooms.find((r) => r.kind === 'chest');
    const rest = run.layout.rooms.find((r) => r.kind === 'rest');
    if (chest) {
      const out = roomOutcome(run, chest.id, enemies);
      if (out.type !== 'chest') throw new Error('expected chest');
      expect(out.gains.gold).toBeGreaterThan(0);
      expect(CHEST_ITEMS).toContain(out.gains.items[0]);
    }
    if (rest) {
      expect(roomOutcome(run, rest.id, enemies)).toEqual({ type: 'rest', healFraction: 0.3 });
    }
  });

  it('清理房间会记录到 cleared 集合', () => {
    const run = startRun(SEED, 1, dungeon);
    const combat = run.layout.rooms.find((r) => r.kind === 'combat')!;
    markCleared(run, combat.id);
    expect(run.cleared.has(combat.id)).toBe(true);
    expect(run.finished).toBe(false);
  });
});
