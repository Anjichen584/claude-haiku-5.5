/**
 * 地牢一次探索（run）的纯逻辑：房间移动、房间内容、奖励与通关判定。
 * 不依赖 Phaser。场景负责展示与战斗切换；奖励由调用方通过 applyGains 发放。
 *
 * 房间内容（按 kind）：
 * - combat：按楼层难度抽取敌人，战斗胜利后清理；
 * - boss：离入口最远的房间，击败后通关本层；
 * - chest：获得金币与一件材料；
 * - event：获得经验（残影事件，本阶段只有数值奖励）；
 * - rest：恢复最大生命的 30%；
 * - shop：分页买卖；
 * - entrance：入口，无内容。
 *
 * 同一 (种子, 楼层, 房间) 的内容永远相同。
 */
import { Rng, hashSeed } from '../core/Rng';
import type { EnemyDef } from '../data/schema';
import type { Gains } from '../state/rewards';
import { getFloorParams, type DungeonFloorFile } from './floors';
import { generateLayout, type Layout, type Room } from './layout';

export interface DungeonRun {
  floor: number;
  seed: number;
  layout: Layout;
  /** 玩家当前所在房间 id */
  current: number;
  /** 已清理（战斗胜利、宝箱已开、事件已完成、已休息）的房间 */
  cleared: Set<number>;
  /** 是否已击败本层 Boss */
  finished: boolean;
}

export const REST_HEAL_FRACTION = 0.3;
/** 宝箱可能出现的材料（需在 items.json 中存在） */
export const CHEST_ITEMS: readonly string[] = ['rift_shard'];

export type RoomOutcome =
  | { type: 'combat'; enemyIds: string[]; boss: boolean }
  | { type: 'chest'; gains: Gains }
  | { type: 'event'; gains: Gains }
  | { type: 'rest'; healFraction: number }
  | { type: 'shop' }
  | { type: 'entrance' };

export function startRun(seed: number, floor: number, file: DungeonFloorFile): DungeonRun {
  const params = getFloorParams(file, floor);
  const layout = generateLayout(seed, params, file.maxAttempts);
  const entrance = layout.rooms.find((r) => r.kind === 'entrance') ?? layout.rooms[0];
  return { floor, seed, layout, current: entrance.id, cleared: new Set(), finished: false };
}

export function roomById(run: DungeonRun, id: number): Room {
  const room = run.layout.rooms.find((r) => r.id === id);
  if (!room) throw new RangeError(`房间 ${id} 不存在`);
  return room;
}

/** 与指定房间直接相连的房间（可以一步到达）。 */
export function neighbors(run: DungeonRun, id: number): Room[] {
  const ids = new Set<number>();
  for (const [a, b] of run.layout.edges) {
    if (a === id) ids.add(b);
    if (b === id) ids.add(a);
  }
  return [...ids].sort((x, y) => x - y).map((n) => roomById(run, n));
}

export function canMoveTo(run: DungeonRun, id: number): boolean {
  return id !== run.current && neighbors(run, run.current).some((r) => r.id === id);
}

/** 移动到相邻房间；不相邻时抛错，避免场景里的状态错乱。 */
export function moveTo(run: DungeonRun, id: number): void {
  if (!canMoveTo(run, id)) throw new RangeError(`房间 ${id} 不与当前房间相邻`);
  run.current = id;
}

/** 房间内容：只由 (种子, 楼层, 房间) 决定。 */
export function roomOutcome(run: DungeonRun, roomId: number, enemies: readonly EnemyDef[]): RoomOutcome {
  const room = roomById(run, roomId);
  const rng = new Rng(hashSeed('dungeon-room', run.seed, run.floor, roomId));
  const tier = getTier(run);
  switch (room.kind) {
    case 'combat':
      return { type: 'combat', enemyIds: pickEnemies(rng, enemies, tier), boss: false };
    case 'boss':
      return { type: 'combat', enemyIds: [pickBoss(run.floor, enemies)], boss: true };
    case 'chest':
      return { type: 'chest', gains: { exp: 0, gold: 15 * run.floor, items: [CHEST_ITEMS[rng.int(0, CHEST_ITEMS.length - 1)]] } };
    case 'event':
      return { type: 'event', gains: { exp: 20 * run.floor, gold: 0, items: [] } };
    case 'rest':
      return { type: 'rest', healFraction: REST_HEAL_FRACTION };
    case 'shop':
      return { type: 'shop' };
    case 'entrance':
      return { type: 'entrance' };
  }
}

/** 奖励：战斗按楼层给经验与金币，Boss 更多。 */
export function combatGains(run: DungeonRun, boss: boolean): Gains {
  return boss
    ? { exp: 60 * run.floor, gold: 50 * run.floor, items: [] }
    : { exp: 10 * run.floor, gold: 5 * run.floor, items: [] };
}

/** 标记房间已清理；击败 Boss 时设置通关。 */
export function markCleared(run: DungeonRun, roomId: number): boolean {
  const room=roomById(run,roomId);
  if(run.cleared.has(roomId)||room.kind==='entrance'||room.kind==='shop')return false;
  run.cleared.add(roomId);
  if(room.kind==='boss')run.finished=true;
  return true;
}

function getTier(run: DungeonRun): number {
  // 楼层号即难度：1–12 层，与 dungeon.json 中的 enemyTier 同步增长
  return Math.min(6, Math.ceil(run.floor / 2));
}

/** 普通敌人：等级落在层数难度附近；难度 4 以上有概率出现精英。 */
function pickEnemies(rng: Rng, enemies: readonly EnemyDef[], tier: number): string[] {
  const normal = enemies.filter((e) => !e.boss && !e.elite);
  const near = normal.filter((e) => {
    const lv = e.level ?? 2;
    return lv >= Math.max(1, tier - 2) && lv <= tier + 1;
  });
  const pool = near.length > 0 ? near : normal;
  const count = rng.int(1, 3);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(pool[rng.int(0, pool.length - 1)].id);
  }
  if (tier >= 4 && rng.next() < 0.25) {
    const elites = enemies.filter((e) => e.elite && (e.level ?? 5) <= tier + 1);
    const fallback = enemies.filter((e) => e.elite);
    const elitePool = elites.length > 0 ? elites : fallback;
    if (elitePool.length > 0) ids[ids.length - 1] = elitePool[rng.int(0, elitePool.length - 1)].id;
  }
  return ids;
}

/** Boss 按层数在已有的 Boss 列表中依次取用（等级从低到高）。 */
function pickBoss(floor: number, enemies: readonly EnemyDef[]): string {
  const bosses = enemies.filter((e) => e.boss).sort((a, b) => (a.level ?? 10) - (b.level ?? 10));
  if (bosses.length === 0) throw new RangeError('enemies.json 中没有 Boss');
  const index = Math.min(bosses.length - 1, Math.floor(((floor - 1) * bosses.length) / 12));
  return bosses[index].id;
}
