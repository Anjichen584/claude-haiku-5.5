import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/core/Rng';

describe('Rng', () => {
  it('同一种子生成的序列完全一致', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('next() 始终落在 [0, 1) 区间内', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() 结果包含两端且不越界', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('int() 在 max < min 时抛出错误', () => {
    expect(() => new Rng(1).int(5, 2)).toThrow(RangeError);
  });

  it('weighted() 不会选中权重为 0 的项', () => {
    const rng = new Rng(99);
    const entries = [
      { value: 'a', weight: 0 },
      { value: 'b', weight: 1 },
    ];
    for (let i = 0; i < 1000; i++) {
      expect(rng.weighted(entries)).toBe('b');
    }
  });

  it('weighted() 总权重为 0 时抛出错误', () => {
    expect(() => new Rng(1).weighted([{ value: 'x', weight: 0 }])).toThrow(RangeError);
  });
});

describe('hashSeed', () => {
  it('相同输入得到相同种子，不同输入得到不同种子', () => {
    expect(hashSeed('world', 3, -2)).toBe(hashSeed('world', 3, -2));
    expect(hashSeed('world', 3, -2)).not.toBe(hashSeed('world', -2, 3));
  });
});
