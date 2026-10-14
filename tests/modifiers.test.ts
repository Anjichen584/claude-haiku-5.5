import { describe, expect, it } from 'vitest';
import { BASE_SIGHT_TILES, detectMultiplier, sightRadius } from '../src/world/modifiers';

describe('昼夜与天气的影响', () => {
  it('白天晴朗时视野为基础值', () => {
    expect(sightRadius('day', 'clear')).toBe(BASE_SIGHT_TILES);
  });
  it('夜晚比白天看得近，雾比晴天看得近', () => {
    expect(sightRadius('night', 'clear')).toBeLessThan(sightRadius('day', 'clear'));
    expect(sightRadius('day', 'fog')).toBeLessThan(sightRadius('day', 'clear'));
  });
  it('最坏情况（夜晚 + 雾）仍保留最小视野', () => {
    expect(sightRadius('night', 'fog')).toBeGreaterThanOrEqual(3);
  });
  it('只有夜晚提高侦测距离', () => {
    expect(detectMultiplier('night')).toBeGreaterThan(1);
    expect(detectMultiplier('day')).toBe(1);
    expect(detectMultiplier('dawn')).toBe(1);
  });
});
