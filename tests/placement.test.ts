import { describe, expect, it } from 'vitest';
import locationsJson from '../data/locations.json';
import type { LocationDef } from '../src/data/schema';
import {
  MIN_SPACING,
  REGION_ANCHORS,
  SCATTER_RADIUS,
  placeLocations,
} from '../src/world/placement';

const locations = (locationsJson as unknown as { locations: LocationDef[] }).locations;
const SEED = 20261014;

describe('地点放置', () => {
  it('同一种子结果完全一致', () => {
    const a = placeLocations(locations, SEED);
    const b = placeLocations(locations, SEED);
    expect(a).toEqual(b);
  });

  it('结果与输入顺序无关', () => {
    const a = placeLocations(locations, SEED);
    const b = placeLocations([...locations].reverse(), SEED);
    expect(b).toEqual(a);
  });

  it('所有地点都被放置，且 id 唯一', () => {
    const placed = placeLocations(locations, SEED);
    expect(placed).toHaveLength(locations.length);
    expect(new Set(placed.map((p) => p.id)).size).toBe(locations.length);
  });

  it('地点之间保持最小间距', () => {
    const placed = placeLocations(locations, SEED);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const d = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y);
        expect(d).toBeGreaterThanOrEqual(MIN_SPACING);
      }
    }
  });

  it('每个地点都在其区域锚点的散布半径内', () => {
    for (const p of placeLocations(locations, SEED)) {
      const a = REGION_ANCHORS[p.region];
      expect(Math.hypot(p.x - a.x, p.y - a.y)).toBeLessThanOrEqual(SCATTER_RADIUS + 1);
    }
  });

  it('不同种子得到不同布局', () => {
    const a = placeLocations(locations, SEED);
    const b = placeLocations(locations, SEED + 1);
    const same = a.filter((p, i) => p.x === b[i].x && p.y === b[i].y).length;
    expect(same).toBeLessThan(locations.length);
  });

  it('区域缺少锚点时报错', () => {
    expect(() =>
      placeLocations([{ id: 'x', name: 'X', region: '不存在的区域' }], SEED),
    ).toThrow(RangeError);
  });
});
