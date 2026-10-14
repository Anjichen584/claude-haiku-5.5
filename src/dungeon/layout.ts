/**
 * 地牢房间图生成（阶段 2）。纯逻辑，不依赖 Phaser。
 *
 * 流程：
 *   1. 在网格上从入口开始随机扩展，生成树形骨架；
 *   2. 按 loopChance 补充相邻房间之间的环路；
 *   3. 以入口为起点做 BFS，最远的房间设为 Boss 房；
 *   4. 其余房间按权重分配为战斗、宝箱、事件、商店、休息点；
 *   5. 连通性检测失败则换一个派生种子重试，最多 maxAttempts 次。
 *
 * 所有随机数都来自种子，同一 (seed, floor) 的结果在任何平台上完全一致。
 */
import { Rng, hashSeed } from '../core/Rng';

export type RoomKind = 'entrance' | 'combat' | 'chest' | 'event' | 'shop' | 'rest' | 'boss';

export interface Room {
  id: number;
  kind: RoomKind;
  /** 网格坐标，入口为 (0, 0) */
  x: number;
  y: number;
}

export interface Layout {
  floor: number;
  seed: number;
  rooms: Room[];
  /** 无向边，a < b，保证唯一 */
  edges: Array<[number, number]>;
  bossId: number;
  attempt: number;
}

export interface FloorParams {
  floor: number;
  roomMin: number;
  roomMax: number;
  loopChance: number;
  enemyTier: number;
  bossId: string | null;
}

/** 非 Boss、非入口房间的类型权重 */
export const ROOM_WEIGHTS: ReadonlyArray<{ value: RoomKind; weight: number }> = [
  { value: 'combat', weight: 50 },
  { value: 'chest', weight: 15 },
  { value: 'event', weight: 15 },
  { value: 'shop', weight: 8 },
  { value: 'rest', weight: 12 },
];

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const cellKey = (x: number, y: number): string => `${x},${y}`;
const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** 生成一次尝试的结果（不做连通性之外的检查） */
function buildOnce(rng: Rng, params: FloorParams): Omit<Layout, 'seed' | 'attempt'> {
  const target = rng.int(params.roomMin, params.roomMax);

  const rooms: Room[] = [{ id: 0, kind: 'entrance', x: 0, y: 0 }];
  const occupied = new Map<string, number>([[cellKey(0, 0), 0]]);
  const edges = new Set<string>();
  const edgeList: Array<[number, number]> = [];

  const addEdge = (a: number, b: number) => {
    const key = edgeKey(a, b);
    if (edges.has(key)) return;
    edges.add(key);
    edgeList.push(a < b ? [a, b] : [b, a]);
  };

  // 1. 树形骨架：从已有房间中随机选一个，向随机方向扩展
  let guard = 0;
  while (rooms.length < target && guard < 10000) {
    guard++;
    const parent = rooms[rng.int(0, rooms.length - 1)];
    const [dx, dy] = rng.pick(DIRS);
    const nx = parent.x + dx;
    const ny = parent.y + dy;
    if (occupied.has(cellKey(nx, ny))) continue;
    const id = rooms.length;
    rooms.push({ id, kind: 'combat', x: nx, y: ny });
    occupied.set(cellKey(nx, ny), id);
    addEdge(parent.id, id);
  }

  // 2. 环路：相邻但未连接的房间，按概率连接
  for (const room of rooms) {
    for (const [dx, dy] of DIRS) {
      const otherId = occupied.get(cellKey(room.x + dx, room.y + dy));
      if (otherId === undefined || otherId <= room.id) continue;
      if (rng.next() < params.loopChance) addEdge(room.id, otherId);
    }
  }

  // 3. BFS 求距离，最远房间作为 Boss
  const adj = buildAdjacency(rooms.length, edgeList);
  const dist = bfs(adj, 0);
  let bossId = 0;
  for (const room of rooms) {
    if (dist[room.id] > dist[bossId]) bossId = room.id;
  }
  rooms[bossId].kind = 'boss';

  // 4. 其余房间按权重分配类型
  for (const room of rooms) {
    if (room.kind !== 'combat') continue;
    room.kind = rng.weighted(ROOM_WEIGHTS);
  }

  return { floor: params.floor, rooms, edges: edgeList, bossId };
}

function buildAdjacency(count: number, edges: ReadonlyArray<[number, number]>): number[][] {
  const adj: number[][] = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

/** 返回从 start 到各节点的步数，不可达为 -1 */
function bfs(adj: number[][], start: number): number[] {
  const dist = new Array<number>(adj.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const next of adj[cur]) {
      if (dist[next] === -1) {
        dist[next] = dist[cur] + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}

/** 检查所有房间是否连通，且 Boss 可达 */
export function isConnected(layout: Pick<Layout, 'rooms' | 'edges' | 'bossId'>): boolean {
  const adj = buildAdjacency(layout.rooms.length, layout.edges);
  const dist = bfs(adj, 0);
  return dist.every((d) => d >= 0) && dist[layout.bossId] >= 0;
}

export class LayoutGenerationError extends Error {
  constructor(floor: number, seed: number, attempts: number) {
    super(`地牢生成失败：floor=${floor} seed=${seed} 已尝试 ${attempts} 次`);
    this.name = 'LayoutGenerationError';
  }
}

/**
 * 生成指定楼层的房间图。
 * 连通性检测失败时，使用派生种子重试，最多 maxAttempts 次。
 */
export function generateLayout(
  seed: number,
  params: FloorParams,
  maxAttempts = 5,
): Layout {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = new Rng(hashSeed('dungeon', seed, params.floor, attempt));
    const built = buildOnce(rng, params);
    if (isConnected(built)) {
      return { ...built, seed, attempt };
    }
  }
  throw new LayoutGenerationError(params.floor, seed, maxAttempts);
}
