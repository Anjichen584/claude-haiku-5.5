/**
 * 种子值噪声（value noise）与分形叠加（fBm）。纯函数，结果在 [0, 1] 之间。
 * 同一种子与坐标在任何平台上结果一致。
 */

function hash2(seed: number, ix: number, iy: number): number {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 单层值噪声，返回 [0, 1] */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** 分形噪声：多个倍频叠加，结果归一化到 [0, 1] */
export function fbm(seed: number, x: number, y: number, octaves = 4): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(seed + i * 1013, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
