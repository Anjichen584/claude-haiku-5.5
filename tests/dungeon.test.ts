import { describe, expect, it } from 'vitest';
import { generateLayout, isConnected, LayoutGenerationError, type FloorParams, type Layout } from '../src/dungeon/layout';
import { getFloorParams, type DungeonFloorFile } from '../src/dungeon/floors';
import dungeonJson from '../data/dungeon.json';

const file = dungeonJson as DungeonFloorFile;

function checkInvariants(layout: Layout, params: FloorParams): void {
  const { rooms, edges, bossId } = layout;

  // 房间数量在楼层范围内
  expect(rooms.length).toBeGreaterThanOrEqual(params.roomMin);
  expect(rooms.length).toBeLessThanOrEqual(params.roomMax);

  // 唯一入口、唯一 Boss，Boss 不是入口
  expect(rooms.filter((r) => r.kind === 'entrance')).toHaveLength(1);
  expect(rooms[0].kind).toBe('entrance');
  expect(rooms.filter((r) => r.kind === 'boss')).toHaveLength(1);
  expect(rooms[bossId].kind).toBe('boss');
  expect(bossId).not.toBe(0);

  // 网格坐标不重叠
  const cells = new Set(rooms.map((r) => `${r.x},${r.y}`));
  expect(cells.size).toBe(rooms.length);

  // 边合法、无重复、无自环
  const edgeKeys = new Set<string>();
  for (const [a, b] of edges) {
    expect(a).toBeLessThan(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(rooms.length);
    const key = `${a}-${b}`;
    expect(edgeKeys.has(key)).toBe(false);
    edgeKeys.add(key);
    // 连接的房间必须是网格相邻
    const ra = rooms[a];
    const rb = rooms[b];
    expect(Math.abs(ra.x - rb.x) + Math.abs(ra.y - rb.y)).toBe(1);
  }

  // 连通
  expect(isConnected(layout)).toBe(true);
}

describe('generateLayout', () => {
  it('同一 (seed, floor) 生成结果完全一致', () => {
    const params = getFloorParams(file, 5);
    const a = generateLayout(20261014, params);
    const b = generateLayout(20261014, params);
    expect(a).toEqual(b);
  });

  it('不同种子生成结果不同', () => {
    const params = getFloorParams(file, 5);
    const a = generateLayout(1, params);
    const b = generateLayout(2, params);
    expect(a).not.toEqual(b);
  });

  it('1–12 层，每层 300 个种子都满足结构不变量', () => {
    for (const params of file.floors) {
      for (let seed = 1; seed <= 300; seed++) {
        const layout = generateLayout(seed * 7919, params, file.maxAttempts);
        checkInvariants(layout, params);
      }
    }
  });

  it('Boss 是离入口步数最远的房间', () => {
    const params = getFloorParams(file, 12);
    for (let seed = 1; seed <= 100; seed++) {
      const layout = generateLayout(seed, params);
      const adj = Array.from({ length: layout.rooms.length }, () => [] as number[]);
      for (const [a, b] of layout.edges) {
        adj[a].push(b);
        adj[b].push(a);
      }
      const dist = new Array<number>(layout.rooms.length).fill(-1);
      dist[0] = 0;
      const queue = [0];
      for (let i = 0; i < queue.length; i++) {
        for (const n of adj[queue[i]]) {
          if (dist[n] === -1) {
            dist[n] = dist[queue[i]] + 1;
            queue.push(n);
          }
        }
      }
      const maxDist = Math.max(...dist);
      expect(dist[layout.bossId]).toBe(maxDist);
    }
  });

  it('房间类型只使用合法的取值', () => {
    const allowed = new Set(['entrance', 'combat', 'chest', 'event', 'shop', 'rest', 'boss']);
    const layout = generateLayout(42, getFloorParams(file, 8));
    for (const room of layout.rooms) {
      expect(allowed.has(room.kind)).toBe(true);
    }
  });

  it('连通性检测在图不连通时返回 false', () => {
    const broken = {
      rooms: [
        { id: 0, kind: 'entrance' as const, x: 0, y: 0 },
        { id: 1, kind: 'boss' as const, x: 5, y: 5 },
      ],
      edges: [] as Array<[number, number]>,
      bossId: 1,
    };
    expect(isConnected(broken)).toBe(false);
  });

  it('尝试次数耗尽时抛出 LayoutGenerationError', () => {
    expect(() => generateLayout(1, getFloorParams(file, 1), 0)).toThrow(LayoutGenerationError);
  });
});

describe('getFloorParams', () => {
  it('楼层越界时抛出 RangeError', () => {
    expect(() => getFloorParams(file, 13)).toThrow(RangeError);
    expect(() => getFloorParams(file, 0)).toThrow(RangeError);
  });

  it('1–12 层全部存在', () => {
    for (let f = 1; f <= 12; f++) {
      expect(getFloorParams(file, f).floor).toBe(f);
    }
  });
});

import { assignTemplates, type RoomTemplateFile } from '../src/dungeon/templates';
import templatesJson from '../data/room-templates.json';

describe('assignTemplates', () => {
  const library = templatesJson as RoomTemplateFile;

  it('每个房间都分配到与其类型一致的模板', () => {
    const layout = generateLayout(777, getFloorParams(file, 6));
    const placed = assignTemplates(layout.rooms, library, 777, 6);
    expect(placed).toHaveLength(layout.rooms.length);
    for (const p of placed) {
      expect(p.template.kind).toBe(layout.rooms[p.roomId].kind);
    }
  });

  it('同一输入的模板分配完全一致', () => {
    const layout = generateLayout(777, getFloorParams(file, 6));
    expect(assignTemplates(layout.rooms, library, 777, 6)).toEqual(
      assignTemplates(layout.rooms, library, 777, 6),
    );
  });

  it('缺少某类型模板时抛出错误', () => {
    const empty: RoomTemplateFile = { templates: [] };
    expect(() => assignTemplates([{ id: 0, kind: 'entrance' }], empty, 1, 1)).toThrow(/缺少房间类型/);
  });
});
