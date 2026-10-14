/**
 * 种子随机数生成器（Mulberry32）。
 *
 * 所有世界与地牢的随机逻辑都必须通过本类完成，禁止直接使用 Math.random()，
 * 以保证同一种子在任何平台上生成结果一致。
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 返回 [0, 1) 之间的浮点数 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [min, max] 之间的整数（含两端） */
  int(min: number, max: number): number {
    if (max < min) {
      throw new RangeError(`Rng.int: max (${max}) must be >= min (${min})`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 按权重随机选择一项。权重必须为非负数且总和大于 0。 */
  weighted<T>(entries: ReadonlyArray<{ value: T; weight: number }>): T {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) {
      throw new RangeError('Rng.weighted: total weight must be > 0');
    }
    let roll = this.next() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll < 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }

  /** 从数组中随机选择一项 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('Rng.pick: array is empty');
    }
    return items[Math.floor(this.next() * items.length)];
  }
}

/** 由字符串生成稳定的 32 位种子（FNV-1a），用于区块坐标等场景。 */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7c;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
