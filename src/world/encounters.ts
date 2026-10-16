/**
 * 地表遭遇：按区块确定性地生成游荡敌人的刷新点。
 *
 * - 敌人来自所在群系的 enemyTable，排除精英与 Boss（它们只在地牢和剧情中出现）；
 * - 同一种子、同一区块永远生成相同的刷新点；
 * - 河流上不刷怪；击败记录由会话保存，`key` 用于跨存档识别同一个刷新点。
 */
import { Rng } from '../core/Rng';
import type { BiomeDef, EnemyDef } from '../data/schema';
import { CHUNK_SIZE, FLAG_RIVER, type Chunk } from './chunk';
import { hashString } from './placement';

export interface SurfaceSpawn {
  /** Story encounters are available only while this quest is active. Not serialized. */
  requiredQuest?: string;
  /** Optional event prerequisites: quest completed AND explicitly accepted. */
  unlockQuest?: string;
  requiredFlag?: string;
  hunt?: import('./hunts').HuntInfo;
  /** 形如 `cx,cy,序号`，在会话的 defeated 集合中使用 */
  key: string;
  /** 世界瓦片坐标 */
  tileX: number;
  tileY: number;
  /** 本组敌人（1–MAX_GROUP 只），按 enemies.json 中的 id */
  enemyIds: string[];
}

/** 每个区块尝试刷新的次数 */
export const SPAWN_CANDIDATES = 3;
/** 每次尝试真正刷出敌人的概率 */
export const SPAWN_CHANCE = 0.5;
/** 一组最多几只 */
export const MAX_GROUP = 2;

export function surfaceSpawnsForChunk(
  worldSeed: number,
  chunk: Chunk,
  biomes: readonly BiomeDef[],
  enemies: readonly EnemyDef[],
): SurfaceSpawn[] {
  const { cx, cy } = chunk;
  const byId = new Map(enemies.map((e) => [e.id, e]));
  const rng = new Rng((worldSeed ^ hashString(`spawn:${cx},${cy}`)) >>> 0);
  const spawns: SurfaceSpawn[] = [];

  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    // 每次尝试固定消耗同样数量的随机数，保证结果稳定
    const roll = rng.next();
    const lx = rng.int(0, CHUNK_SIZE - 1);
    const ly = rng.int(0, CHUNK_SIZE - 1);
    const groupRoll = rng.next();
    const groupSize = rng.int(1, MAX_GROUP);
    const pickRolls = Array.from({ length: MAX_GROUP }, () => rng.next());

    if (roll >= SPAWN_CHANCE) continue;
    const idx = ly * CHUNK_SIZE + lx;
    if (chunk.flags[idx] & FLAG_RIVER) continue;

    const biome = biomes[chunk.biome[idx]];
    const pool = (biome?.enemyTable ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is EnemyDef => !!e && !e.boss && !e.elite)
      .map((e) => e.id);
    if (pool.length === 0) continue;

    const size = groupRoll < 0.5 ? 1 : groupSize;
    const enemyIds = Array.from({ length: size }, (_, k) => pool[Math.floor(pickRolls[k] * pool.length)]);
    spawns.push({
      key: `${cx},${cy},${i}`,
      tileX: cx * CHUNK_SIZE + lx,
      tileY: cy * CHUNK_SIZE + ly,
      enemyIds,
    });
  }
  return spawns;
}

/** 从地表进入战斗场景时传递的参数 */
export interface EncounterRequest {
  tower?:{id:number;floor:number};
  forge?:{id:number;room:import('../dungeon/ashForge').ForgeRoom};
  enemyIds: string[];
  /** 对应 SurfaceSpawn.key；胜利后写入会话的 defeated 集合（地牢战斗不写入） */
  spawnKey: string;
  /** 地牢房间战斗时提供；胜负结果会回写到当前地牢探索 */
  dungeon?: { roomId: number; boss: boolean };
}
