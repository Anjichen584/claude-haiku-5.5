/**
 * 游戏会话：一局游戏中所有需要跨场景保留的数据。
 *
 * - 世界状态（标记、声望、任务记录、背包、稳定度）；
 * - 玩家位置、生命、经验、金币；
 * - 游戏内时间、已访问地点、已击败的地表敌人、地牢层数。
 *
 * 本文件不依赖 Phaser，便于单元测试。存档的读写见 sessionStore.ts。
 */
import type { QuestDef } from '../data/schema';
import { QuestManager } from '../narrative/QuestManager';
import { DAY_LENGTH_MS } from '../world/time';
import { WorldState, type WorldSnapshot } from './WorldState';

export const PLAYER_MAX_HP = 100;
/** 地牢最深层数（dungeon.json 共 12 层） */
export const MAX_DUNGEON_FLOOR = 12;

export interface PlayerState {
  tileX: number;
  tileY: number;
  hp: number;
  /** 累计经验，等级由它推导（见 rewards.ts） */
  exp: number;
  gold: number;
  /** 已装备的物品，键为槽位（main_hand / head / chest / feet） */
  equipment: Partial<Record<string, string>>;
}

export interface GameSession {
  world: WorldState;
  quests: QuestManager;
  player: PlayerState;
  elapsedMs: number;
  visited: Set<string>;
  /** 已击败的地表敌人，键为 `区块cx,cy,序号` */
  defeated: Set<string>;
  /** 下一次可以进入的地牢层数，通关 Boss 后递增 */
  dungeonFloor: number;
}

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: string;
  world: WorldSnapshot;
  player: PlayerState;
  elapsedMs: number;
  visited: string[];
  defeated: string[];
  dungeonFloor: number;
}

export class SaveError extends Error {}

/** 新开一局：默认出生在原点，满血，可接取的主线任务自动接取。 */
export function newSession(quests: readonly QuestDef[]): GameSession {
  const world = new WorldState();
  const manager = new QuestManager(quests, world);
  // 支线任务由 NPC 发布，这里只接取非支线任务
  manager.acceptAvailable((d) => d.type !== 'side');
  return {
    world,
    quests: manager,
    player: { tileX: 0, tileY: 0, hp: PLAYER_MAX_HP, exp: 0, gold: 0, equipment: {} },
    // 从黎明前开始（与地表场景的初始时间一致）
    elapsedMs: DAY_LENGTH_MS * 0.3,
    visited: new Set(),
    defeated: new Set(),
    dungeonFloor: 1,
  };
}

export function toSaveFile(session: GameSession, savedAt: Date = new Date()): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: savedAt.toISOString(),
    world: session.world.snapshot(),
    player: { ...session.player },
    elapsedMs: session.elapsedMs,
    visited: [...session.visited].sort(),
    defeated: [...session.defeated].sort(),
    dungeonFloor: session.dungeonFloor,
  };
}

export function serializeSave(file: SaveFile): string {
  return JSON.stringify(file);
}

/** 解析并校验存档。任何结构错误都抛出 SaveError，调用方应当提示玩家而不是崩溃。 */
export function parseSave(raw: string): SaveFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SaveError('存档不是合法的 JSON');
  }
  if (!isRecord(data)) throw new SaveError('存档结构错误');
  if (data.version !== SAVE_VERSION) throw new SaveError(`不支持的存档版本：${String(data.version)}`);

  const player = data.player;
  if (!isRecord(player) || !isFiniteNumber(player.tileX) || !isFiniteNumber(player.tileY) || !isFiniteNumber(player.hp)) {
    throw new SaveError('玩家数据缺失');
  }
  if (player.hp < 0 || player.hp > PLAYER_MAX_HP) throw new SaveError('玩家生命值越界');
  // 旧存档没有经验、金币与地牢层数，缺省为初始值
  const exp: unknown = player.exp === undefined ? 0 : player.exp;
  const gold: unknown = player.gold === undefined ? 0 : player.gold;
  if (!isFiniteNumber(exp) || exp < 0 || !isFiniteNumber(gold) || gold < 0) {
    throw new SaveError('经验或金币数据错误');
  }
  // 旧存档没有装备，缺省为空
  const equipment: Partial<Record<string, string>> = {};
  const equipmentRaw: unknown = player.equipment === undefined ? {} : player.equipment;
  if (!isRecord(equipmentRaw)) throw new SaveError('装备数据错误');
  for (const [slot, id] of Object.entries(equipmentRaw)) {
    if (typeof id !== 'string') throw new SaveError('装备数据错误');
    equipment[slot] = id;
  }
  const rawFloor: unknown = data.dungeonFloor === undefined ? 1 : data.dungeonFloor;
  if (typeof rawFloor !== 'number' || !Number.isInteger(rawFloor) || rawFloor < 1 || rawFloor > MAX_DUNGEON_FLOOR) {
    throw new SaveError('地牢层数越界');
  }
  const dungeonFloor: number = rawFloor;
  if (!isFiniteNumber(data.elapsedMs) || data.elapsedMs < 0) throw new SaveError('时间数据错误');
  if (!isStringArray(data.visited) || !isStringArray(data.defeated)) throw new SaveError('地点或敌人记录错误');
  if (!isRecord(data.world)) throw new SaveError('世界状态缺失');

  const world = data.world;
  if (!isStringArray(world.flags)) throw new SaveError('标记数据错误');
  if (!isRecord(world.reputation) || !isRecord(world.quests) || !isRecord(world.inventory)) {
    throw new SaveError('世界状态结构错误');
  }

  return {
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    world: world as unknown as WorldSnapshot,
    player: { tileX: player.tileX, tileY: player.tileY, hp: player.hp, exp, gold, equipment },
    elapsedMs: data.elapsedMs,
    visited: data.visited,
    defeated: data.defeated,
    dungeonFloor,
  };
}

/** 从存档恢复会话。任务定义变化时，缺失的任务会按 locked 补入。 */
export function fromSaveFile(file: SaveFile, quests: readonly QuestDef[]): GameSession {
  const world = WorldState.restore(file.world);
  return {
    world,
    quests: new QuestManager(quests, world),
    player: { ...file.player, equipment: { ...file.player.equipment } },
    elapsedMs: file.elapsedMs,
    visited: new Set(file.visited),
    defeated: new Set(file.defeated),
    dungeonFloor: file.dungeonFloor,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
