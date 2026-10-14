/**
 * 地点放置：把 data/locations.json 中的地点确定性地分布到地表坐标上。
 *
 * - 每个区域有一个固定的锚点，同区域地点聚集在锚点附近；
 * - 位置由 (种子, 地点 id) 决定，与加载顺序无关，任何平台结果一致；
 * - 地点之间保持最小间距，避免标记重叠。
 */
import { Rng } from '../core/Rng';
import type { LocationDef } from '../data/schema';

export interface PlacedLocation {
  id: string;
  name: string;
  region: string;
  /** 地表瓦片坐标（整数） */
  x: number;
  y: number;
}

/** 区域锚点（瓦片坐标）。区域之间相距约 400 瓦片，避免互相挤压。 */
export const REGION_ANCHORS: Readonly<Record<string, { x: number; y: number }>> = {
  霜原: { x: -400, y: -400 },
  冰川: { x: 0, y: -400 },
  裂隙核心: { x: 400, y: -400 },
  草原: { x: -400, y: 0 },
  灰烬之路: { x: 0, y: 0 },
  裂隙: { x: 400, y: 0 },
  林地: { x: -400, y: 400 },
  泥沼: { x: 0, y: 400 },
  沙丘: { x: 400, y: 400 },
};

/** 区域内的散布半径（瓦片） */
export const SCATTER_RADIUS = 120;
/** 地点之间的最小间距（瓦片） */
export const MIN_SPACING = 8;

/** 把字符串哈希为 32 位整数（FNV-1a），用于派生每个地点的随机种子。 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function placeLocations(locations: readonly LocationDef[], seed: number): PlacedLocation[] {
  // 按 id 排序，保证放置顺序与数组顺序无关
  const sorted = [...locations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: PlacedLocation[] = [];

  for (const loc of sorted) {
    const anchor = REGION_ANCHORS[loc.region];
    if (!anchor) throw new RangeError(`地点 ${loc.id} 所在区域 "${loc.region}" 没有锚点`);

    const rng = new Rng((seed ^ hashString(loc.id)) >>> 0);
    let pos: { x: number; y: number } | undefined;
    // 拒绝采样：尝试 200 次找到不与已放置地点冲突的位置
    for (let attempt = 0; attempt < 200 && !pos; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const radius = Math.sqrt(rng.next()) * SCATTER_RADIUS;
      const x = Math.round(anchor.x + Math.cos(angle) * radius);
      const y = Math.round(anchor.y + Math.sin(angle) * radius);
      const clash = placed.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_SPACING);
      if (!clash) pos = { x, y };
    }
    if (!pos) throw new Error(`地点 ${loc.id} 无法在区域 ${loc.region} 中找到空位，请增大 SCATTER_RADIUS`);

    placed.push({ id: loc.id, name: loc.name, region: loc.region, x: pos.x, y: pos.y });
  }
  return placed;
}
