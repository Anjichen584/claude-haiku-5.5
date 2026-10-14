import { describe, expect, it } from 'vitest';
import biomesJson from '../data/biomes.json';
import type { BiomeDef } from '../src/data/schema';
import { fbm, valueNoise } from '../src/world/noise';
import {
  CHUNK_SIZE,
  FLAG_RIVER,
  FLAG_ROAD,
  chunkOf,
  generateChunk,
  pickBiomeIndex,
  tileIndexInChunk,
} from '../src/world/chunk';
import { DAY_LENGTH_MS, getDayState } from '../src/world/time';
import { rollWeather } from '../src/world/weather';

const biomes = (biomesJson as { biomes: BiomeDef[] }).biomes;

describe('噪声', () => {
  it('valueNoise 与 fbm 结果落在 [0, 1] 且确定', () => {
    for (let i = 0; i < 2000; i++) {
      const x = (i * 0.37) - 300;
      const y = (i * 0.91) - 150;
      const v = valueNoise(42, x, y);
      const f = fbm(42, x, y, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      expect(fbm(42, x, y, 4)).toBe(f);
    }
  });
});

describe('群系映射', () => {
  it('群系数据覆盖整个温度–湿度平面（网格采样）', () => {
    for (let ti = 0; ti <= 20; ti++) {
      for (let hi = 0; hi <= 20; hi++) {
        const t = ti / 20;
        const h = hi / 20;
        const idx = biomes.findIndex(
          (b) => t >= b.temperature[0] && t <= b.temperature[1] && h >= b.humidity[0] && h <= b.humidity[1],
        );
        expect(idx, `(${t.toFixed(2)}, ${h.toFixed(2)}) 没有群系覆盖`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('pickBiomeIndex 返回包含该点的群系', () => {
    const idx = pickBiomeIndex(biomes, 0.9, 0.1);
    expect(biomes[idx].id).toBe('ashland');
    expect(biomes[pickBiomeIndex(biomes, 0.1, 0.9)].id).toBe('snow');
  });
});

describe('区块生成', () => {
  it('同一 (种子, 区块) 结果完全一致', () => {
    const a = generateChunk(20261014, 3, -2, biomes);
    const b = generateChunk(20261014, 3, -2, biomes);
    expect(a.biome).toEqual(b.biome);
    expect(a.flags).toEqual(b.flags);
    expect(a.height).toEqual(b.height);
  });

  it('区块尺寸与群系下标合法', () => {
    const chunk = generateChunk(7, 0, 0, biomes);
    expect(chunk.biome.length).toBe(CHUNK_SIZE * CHUNK_SIZE);
    for (const idx of chunk.biome) {
      expect(idx).toBeLessThan(biomes.length);
    }
  });

  it('河流与道路占比适中（可见但不泛滥）', () => {
    let river = 0;
    let road = 0;
    let total = 0;
    for (let cx = 0; cx < 4; cx++) {
      for (let cy = 0; cy < 4; cy++) {
        const c = generateChunk(12345, cx, cy, biomes);
        for (const f of c.flags) {
          total++;
          if (f & FLAG_RIVER) river++;
          if (f & FLAG_ROAD) road++;
        }
      }
    }
    const riverRatio = river / total;
    const roadRatio = road / total;
    expect(riverRatio).toBeGreaterThan(0.005);
    expect(riverRatio).toBeLessThan(0.1);
    expect(roadRatio).toBeGreaterThan(0.002);
    expect(roadRatio).toBeLessThan(0.1);
  });

  it('世界坐标与区块坐标换算正确（含负数）', () => {
    expect(chunkOf(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOf(63, 64)).toEqual({ cx: 0, cy: 1 });
    expect(chunkOf(-1, -64)).toEqual({ cx: -1, cy: -1 });
    expect(tileIndexInChunk(-1, 0)).toBe(63);
  });
});

describe('昼夜', () => {
  it('第 1 天从夜晚开始，中午光照最强', () => {
    expect(getDayState(0).day).toBe(1);
    expect(getDayState(0).phase).toBe('night');
    const noon = getDayState(DAY_LENGTH_MS * 0.5);
    expect(noon.phase).toBe('day');
    expect(noon.light).toBeCloseTo(1, 5);
  });

  it('跨日后日期递增，光照始终在 [0.25, 1] 之间', () => {
    expect(getDayState(DAY_LENGTH_MS * 3 + 1).day).toBe(4);
    for (let ms = 0; ms < DAY_LENGTH_MS * 2; ms += 5000) {
      const s = getDayState(ms);
      expect(s.light).toBeGreaterThanOrEqual(0.25);
      expect(s.light).toBeLessThanOrEqual(1);
    }
  });
});

describe('天气', () => {
  it('同一输入结果稳定，且只返回权重大于 0 的天气', () => {
    const weights = { clear: 0, rain: 5 };
    for (let d = 1; d <= 20; d++) {
      expect(rollWeather(9, 1, 2, d, weights)).toBe('rain');
      expect(rollWeather(9, 1, 2, d, weights)).toBe(rollWeather(9, 1, 2, d, weights));
    }
  });

  it('没有任何权重时回落为晴天', () => {
    expect(rollWeather(1, 0, 0, 1, {})).toBe('clear');
  });
});
