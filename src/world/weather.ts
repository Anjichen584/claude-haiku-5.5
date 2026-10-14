import { Rng, hashSeed } from '../core/Rng';

export type Weather = 'clear' | 'rain' | 'fog' | 'snowstorm' | 'sandstorm' | 'thunder';

export const WEATHER_TYPES: readonly Weather[] = [
  'clear', 'rain', 'fog', 'snowstorm', 'sandstorm', 'thunder',
];

/**
 * 按群系权重决定某区块在某一天的天气。
 * 同一 (世界种子, 区块, 日期) 的结果稳定，天气每个游戏日变化一次。
 */
export function rollWeather(
  worldSeed: number,
  chunkX: number,
  chunkY: number,
  day: number,
  weights: Readonly<Partial<Record<Weather, number>>>,
): Weather {
  const entries = WEATHER_TYPES
    .filter((w) => (weights[w] ?? 0) > 0)
    .map((w) => ({ value: w, weight: weights[w] as number }));
  if (entries.length === 0) return 'clear';
  const rng = new Rng(hashSeed('weather', worldSeed, chunkX, chunkY, day));
  return rng.weighted(entries);
}
