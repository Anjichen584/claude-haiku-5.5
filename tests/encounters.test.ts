import { describe, expect, it } from 'vitest';
import biomesJson from '../data/biomes.json';
import enemiesJson from '../data/enemies.json';
import type { BiomeDef, EnemyDef } from '../src/data/schema';
import { CHUNK_SIZE, FLAG_RIVER, generateChunk } from '../src/world/chunk';
import { MAX_GROUP, surfaceSpawnsForChunk } from '../src/world/encounters';

const biomes = (biomesJson as unknown as { biomes: BiomeDef[] }).biomes;
const enemies = (enemiesJson as unknown as { enemies: EnemyDef[] }).enemies;
const SEED = 20261014;

function allSpawns(cxRange = 12) {
  const out = [];
  for (let cx = -cxRange; cx < cxRange; cx++) {
    for (let cy = -cxRange; cy < cxRange; cy++) {
      const chunk = generateChunk(SEED, cx, cy, biomes);
      out.push({ chunk, spawns: surfaceSpawnsForChunk(SEED, chunk, biomes, enemies) });
    }
  }
  return out;
}

describe('地表遭遇', () => {
  it('同一种子、同一区块的刷新结果完全一致', () => {
    const chunk = generateChunk(SEED, 3, -2, biomes);
    const a = surfaceSpawnsForChunk(SEED, chunk, biomes, enemies);
    const b = surfaceSpawnsForChunk(SEED, chunk, biomes, enemies);
    expect(a).toEqual(b);
  });

  it('大范围内确实会刷出敌人', () => {
    const total = allSpawns().reduce((n, x) => n + x.spawns.length, 0);
    expect(total).toBeGreaterThan(50);
  });

  it('只刷出所在群系敌人表中的普通敌人（不含精英与 Boss）', () => {
    const byId = new Map(enemies.map((e) => [e.id, e]));
    for (const { chunk, spawns } of allSpawns(6)) {
      for (const s of spawns) {
        const idx = (s.tileY - chunk.cy * CHUNK_SIZE) * CHUNK_SIZE + (s.tileX - chunk.cx * CHUNK_SIZE);
        const biome = biomes[chunk.biome[idx]];
        for (const id of s.enemyIds) {
          const def = byId.get(id);
          expect(def, id).toBeDefined();
          expect(def!.elite ?? false, id).toBe(false);
          expect(def!.boss ?? false, id).toBe(false);
          expect(biome.enemyTable, id).toContain(id);
        }
      }
    }
  });

  it('河流上不刷怪，组的大小在 1 到 MAX_GROUP 之间', () => {
    for (const { chunk, spawns } of allSpawns(6)) {
      for (const s of spawns) {
        const idx = (s.tileY - chunk.cy * CHUNK_SIZE) * CHUNK_SIZE + (s.tileX - chunk.cx * CHUNK_SIZE);
        expect(chunk.flags[idx] & FLAG_RIVER).toBe(0);
        expect(s.enemyIds.length).toBeGreaterThanOrEqual(1);
        expect(s.enemyIds.length).toBeLessThanOrEqual(MAX_GROUP);
      }
    }
  });

  it('刷新点位于所在区块内，键在区块内唯一', () => {
    for (const { chunk, spawns } of allSpawns(6)) {
      const keys = new Set(spawns.map((s) => s.key));
      expect(keys.size).toBe(spawns.length);
      for (const s of spawns) {
        expect(s.tileX).toBeGreaterThanOrEqual(chunk.cx * CHUNK_SIZE);
        expect(s.tileX).toBeLessThan((chunk.cx + 1) * CHUNK_SIZE);
        expect(s.tileY).toBeGreaterThanOrEqual(chunk.cy * CHUNK_SIZE);
        expect(s.tileY).toBeLessThan((chunk.cy + 1) * CHUNK_SIZE);
      }
    }
  });
});
