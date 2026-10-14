/**
 * 游戏会话：一局游戏中所有需要跨场景保留的数据。
 *
 * - 世界状态（标记、声望、任务记录、背包、稳定度）；
 * - 玩家位置、生命、游戏内时间；
 * - 已访问的地点与已击败的地表敌人（击败后本局不再刷新）。
 *
 * 本文件不依赖 Phaser，便于单元测试。存档的读写见 save.ts。
 */
import type { QuestDef } from '../data/schema';
import { DAY_LENGTH_MS } from '../world/time';
import { QuestManager } from '../narrative/QuestManager';
import { WorldState, type WorldSnapshot } from './WorldState';

export const PLAYER_MAX_HP = 100;

export interface PlayerState {
  tileX: number;
  tileY: number;
  hp: number;
}

export interface GameSession {
  world: WorldState;
  quests: QuestManager;
  player: PlayerState;
  elapsedMs: number;
  visited: Set<string>;
  /** 已击败的地表敌人，键为 `区块cx,cy,序号` */
  defeated: Set<string>;
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
}

export class SaveError extends Error {}

/** 新开一局：默认出生在原点，满血，世界状态来自任务定义的初始值。 */
export function newSession(quests: readonly QuestDef[]): GameSession {
  const world = new WorldState();
  const manager = new QuestManager(quests, world);
  manager.acceptAvailable();
  return {
    world,
    quests: manager,
    player: { tileX: 0, tileY: 0, hp: PLAYER_MAX_HP },
    // 从黎明前开始（与地表场景的初始时间一致）
    elapsedMs: DAY_LENGTH_MS * 0.3,
    visited: new Set(),
    defeated: new Set(),
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
  if (!isFiniteNumber(data.elapsedMs) || data.elapsedMs < 0) throw new SaveError('时间数据错误');
  if (!isStringArray(data.visited) || !isStringArray(data.defeated)) throw new SaveError('地点或敌人记录错误');
  if (!isRecord(data.world)) throw new SaveError('世界状态缺失');

  const world = data.world;
  if (!Array.isArray(world.flags) || !isStringArray(world.flags)) throw new SaveError('标记数据错误');
  if (!isRecord(world.reputation) || !isRecord(world.quests) || !isRecord(world.inventory)) {
    throw new SaveError('世界状态结构错误');
  }

  return {
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    world: world as unknown as WorldSnapshot,
    player: { tileX: player.tileX, tileY: player.tileY, hp: player.hp },
    elapsedMs: data.elapsedMs,
    visited: data.visited,
    defeated: data.defeated,
  };
}

/** 从存档恢复会话。任务定义变化时，缺失的任务会按 locked 补入。 */
export function fromSaveFile(file: SaveFile, quests: readonly QuestDef[]): GameSession {
  const world = WorldState.restore(file.world);
  return {
    world,
    quests: new QuestManager(quests, world),
    player: { ...file.player },
    elapsedMs: file.elapsedMs,
    visited: new Set(file.visited),
    defeated: new Set(file.defeated),
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
