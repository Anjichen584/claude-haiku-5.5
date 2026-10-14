/**
 * 区块生成（阶段 3）。每个区块 64×64 瓦片，完全由 世界种子 + 区块坐标 + 全局噪声决定。
 *
 * 河流与道路使用“脊线噪声”：噪声值接近 0.5 的细带即为河流或道路。
 * 因为噪声是全局连续的，相邻区块的河流与道路天然对齐，不会出现接缝。
 */
import type { BiomeDef } from '../data/schema';
import { fbm } from './noise';

export const CHUNK_SIZE = 64;

export const FLAG_RIVER = 1;
export const FLAG_ROAD = 2;

/** 噪声尺度：数值越大，地貌特征越大 */
const SCALE = {
  temperature: 220,
  humidity: 180,
  relief: 120,
  river: 110,
  road: 170,
} as const;

/** 脊线宽度：|noise − 0.5| 小于该值视为河流或道路 */
const RIVER_HALF_WIDTH = 0.012;
const ROAD_HALF_WIDTH = 0.007;

/** 世界的噪声通道使用不同的派生种子，互不干扰 */
const CHANNEL = { temperature: 11, humidity: 23, relief: 37, river: 53, road: 71 } as const;

export interface Chunk {
  cx: number;
  cy: number;
  /** 每个瓦片所属群系在 biomes 数组中的下标 */
  biome: Uint8Array;
  /** 每个瓦片的标志位（FLAG_RIVER | FLAG_ROAD） */
  flags: Uint8Array;
  /** 高度 0–255，用于阴影与渲染明暗 */
  height: Uint8Array;
}

/**
 * 在温度、湿度组合中找到第一个包含该点的群系；
 * 若都不包含（数据未覆盖），返回距离最近的群系。
 */
export function pickBiomeIndex(biomes: readonly BiomeDef[], temperature: number, humidity: number): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < biomes.length; i++) {
    const b = biomes[i];
    const inT = temperature >= b.temperature[0] && temperature <= b.temperature[1];
    const inH = humidity >= b.humidity[0] && humidity <= b.humidity[1];
    if (inT && inH) return i;
    const dt = inT ? 0 : Math.min(Math.abs(temperature - b.temperature[0]), Math.abs(temperature - b.temperature[1]));
    const dh = inH ? 0 : Math.min(Math.abs(humidity - b.humidity[0]), Math.abs(humidity - b.humidity[1]));
    const dist = Math.hypot(dt, dh);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function generateChunk(
  worldSeed: number,
  cx: number,
  cy: number,
  biomes: readonly BiomeDef[],
): Chunk {
  if (biomes.length === 0) throw new Error('generateChunk: 至少需要一个群系');
  const size = CHUNK_SIZE * CHUNK_SIZE;
  const chunk: Chunk = {
    cx,
    cy,
    biome: new Uint8Array(size),
    flags: new Uint8Array(size),
    height: new Uint8Array(size),
  };

  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wy = cy * CHUNK_SIZE + ly;
      const i = ly * CHUNK_SIZE + lx;

      const t = fbm(worldSeed ^ CHANNEL.temperature, wx / SCALE.temperature, wy / SCALE.temperature, 3);
      const h = fbm(worldSeed ^ CHANNEL.humidity, wx / SCALE.humidity, wy / SCALE.humidity, 3);
      const relief = fbm(worldSeed ^ CHANNEL.relief, wx / SCALE.relief, wy / SCALE.relief, 4);
      const river = fbm(worldSeed ^ CHANNEL.river, wx / SCALE.river, wy / SCALE.river, 2);
      const road = fbm(worldSeed ^ CHANNEL.road, wx / SCALE.road, wy / SCALE.road, 2);

      chunk.biome[i] = pickBiomeIndex(biomes, t, h);
      chunk.height[i] = Math.round(relief * 255);

      let flags = 0;
      if (Math.abs(river - 0.5) < RIVER_HALF_WIDTH) flags |= FLAG_RIVER;
      if (Math.abs(road - 0.5) < ROAD_HALF_WIDTH) flags |= FLAG_ROAD;
      chunk.flags[i] = flags;
    }
  }
  return chunk;
}

/** 世界坐标（瓦片）→ 区块坐标 */
export function chunkOf(tileX: number, tileY: number): { cx: number; cy: number } {
  return { cx: Math.floor(tileX / CHUNK_SIZE), cy: Math.floor(tileY / CHUNK_SIZE) };
}

/** 世界坐标 → 区块内的线性下标（用于读取 Chunk 的数组） */
export function tileIndexInChunk(tileX: number, tileY: number): number {
  const lx = ((tileX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((tileY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return ly * CHUNK_SIZE + lx;
}
