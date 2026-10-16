import {parseTower,towerProfile,type TowerProgress} from '../tower/run';
import {parseCrafting,cloneCrafting,type GearCrafting} from '../items/gearCraft';
import { parseDungeon, snapshotDungeon, restoreDungeon, type DungeonProgress, type DungeonSnapshot } from '../dungeon/checkpoint';
/**
 * 游戏会话：一局游戏中所有需要跨场景保留的数据。
 *
 * - 世界状态（标记、声望、任务记录、背包、稳定度）；
 * - 玩家位置、生命、经验、金币；
 * - 游戏内时间、已访问地点、已击败的地表敌人、地牢层数。
 *
 * 本文件不依赖 Phaser，便于单元测试。存档的读写见 sessionStore.ts。
 */
import type { QuestDef, ItemDef, AffixDef } from '../data/schema';
import { isEquipSlot } from './equipment';
import { combatProfile } from '../combat/profile';
import itemsData from '../../data/items.json';
import affixesData from '../../data/affixes.json';
import setsData from '../../data/item-sets.json';
import type { ItemSetDef } from '../items/sets';
import { PLAYER_MAX_HP, MAX_DUNGEON_FLOOR } from './constants';
export { PLAYER_MAX_HP, MAX_DUNGEON_FLOOR } from './constants';
import { QuestManager } from '../narrative/QuestManager';
import { DAY_LENGTH_MS } from '../world/time';
import { WorldState, type WorldSnapshot } from './WorldState';


/** 地牢最深层数（dungeon.json 共 12 层） */


export interface PlayerState {
  /** Optional item-type blueprint progression; old saves omit it. */
  crafting?: GearCrafting;
  tileX: number;
  tileY: number;
  hp: number;
  /** 累计经验，等级由它推导（见 rewards.ts） */
  exp: number;
  gold: number;
  /** 已装备的物品，键为槽位（main_hand / head / chest / feet / hands / neck） */
  equipment: Partial<Record<string, string>>;
  /** 技能：已解锁的技能 id 与尚未使用的技能点（技能点由升级获得） */
  skills: { unlocked: string[]; points: number; equipped?: string[] };
  /** Optional for backwards-compatible version-1 saves. */
  mana?: number;
  /** Shared potion cooldown, epoch milliseconds; survives scene changes and saves. */
  consumableReadyAt?: number;
}

export interface GameSession {
  tower?:TowerProgress;
  trackedQuestId?: string;
  dungeon?: DungeonProgress;
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
  tower?:TowerProgress;
  trackedQuestId?: string;
  dungeon?: DungeonSnapshot;
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
  world.addItem('health_potion',2);world.addItem('mana_potion',1);
  const manager = new QuestManager(quests, world);
  // 支线任务由 NPC 发布，这里只接取非支线任务
  manager.acceptAvailable((d) => d.type !== 'side');
  return {
    world,
    quests: manager,
    player: { tileX: 0, tileY: 0, hp: PLAYER_MAX_HP, exp: 0, gold: 0, equipment: {}, skills: { unlocked: [], points: 0 } },
    // 从黎明前开始（与地表场景的初始时间一致）
    elapsedMs: DAY_LENGTH_MS * 0.3,
    visited: new Set(),
    defeated: new Set(),
    dungeonFloor: 1,
  };
}

export function toSaveFile(session: GameSession, savedAt: Date = new Date()): SaveFile {
  return {
    ...(session.tower?{tower:parseTower(session.tower)}:{}),
    ...(session.dungeon?{dungeon:snapshotDungeon(session.dungeon)}:{}),
    ...(session.trackedQuestId ? {trackedQuestId:session.trackedQuestId} : {}),
    version: SAVE_VERSION,
    savedAt: savedAt.toISOString(),
    world: session.world.snapshot(),
    player: { ...session.player, ...(session.player.crafting?{crafting:cloneCrafting(session.player.crafting)}:{}), equipment:{...session.player.equipment}, skills:{...session.player.skills,unlocked:[...session.player.skills.unlocked],...(session.player.skills.equipped?{equipped:[...session.player.skills.equipped]}:{})} },
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

  if(data.trackedQuestId!==undefined && (typeof data.trackedQuestId!=='string' || !data.trackedQuestId.length || data.trackedQuestId.length>200))throw new SaveError('追踪任务数据错误');
  let tower:TowerProgress|undefined;
  if(data.tower!==undefined){try{tower=parseTower(data.tower);}catch(e){throw new SaveError(e instanceof Error?e.message:'试炼存档错误');}}
  const player = data.player;
  if (!isRecord(player) || !isFiniteNumber(player.tileX) || !isFiniteNumber(player.tileY) || !isFiniteNumber(player.hp)) {
    throw new SaveError('玩家数据缺失');
  }

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
    if (typeof id !== 'string' || !isEquipSlot(slot) || !itemsData.items.some(i=>i.id===id && 'slot' in i && i.slot===slot)) throw new SaveError('装备数据错误');
    equipment[slot] = id;
  }
  let crafting:GearCrafting|undefined;
  try{crafting=parseCrafting(player.crafting,itemsData.items as ItemDef[]);}catch(e){throw new SaveError(e instanceof Error?e.message:'装备工坊记录错误');}
  const baseProfile=combatProfile(equipment,itemsData.items as ItemDef[],affixesData.affixes as AffixDef[],setsData.sets as ItemSetDef[],crafting);
  const savedProfile=tower?.run?towerProfile(baseProfile,tower.run):baseProfile;
  const maxHp=savedProfile.maxHp;
  if (player.hp < 0 || player.hp > maxHp) throw new SaveError('玩家生命值越界');
  // 旧存档没有技能，缺省为未解锁、0 点
  const skillsRaw: unknown = player.skills === undefined ? { unlocked: [], points: 0 } : player.skills;
  if (!isRecord(skillsRaw) || !Array.isArray(skillsRaw.unlocked) || !skillsRaw.unlocked.every((x) => typeof x === 'string')) {
    throw new SaveError('技能数据错误');
  }
  const skillPoints: unknown = skillsRaw.points === undefined ? 0 : skillsRaw.points;
  if (!isFiniteNumber(skillPoints) || !Number.isInteger(skillPoints) || skillPoints < 0) throw new SaveError('技能点数据错误');
  const skills: PlayerState['skills'] = { unlocked: [...new Set(skillsRaw.unlocked as string[])], points: skillPoints };
  if(skillsRaw.equipped!==undefined){
    if(!isStringArray(skillsRaw.equipped) || skillsRaw.equipped.length>4 || new Set(skillsRaw.equipped).size!==skillsRaw.equipped.length || skillsRaw.equipped.some(id=>!skills.unlocked.includes(id)))throw new SaveError('技能栏数据错误');
    skills.equipped=[...skillsRaw.equipped];
  }
  const mana=player.mana;
  const maxMana=savedProfile.maxMana;
  if(mana!==undefined && (!isFiniteNumber(mana) || mana<0 || mana>maxMana))throw new SaveError('魔力数据错误');
  const consumableReadyAt=player.consumableReadyAt;
  if(consumableReadyAt!==undefined&&(!isFiniteNumber(consumableReadyAt)||consumableReadyAt<0))throw new SaveError('药剂冷却数据错误');
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

  for(const value of Object.values(world.reputation))if(!isFiniteNumber(value)||value < -100||value>100)throw new SaveError('声望数据错误');
  for(const value of Object.values(world.inventory))if(!isFiniteNumber(value)||!Number.isInteger(value)||value<0)throw new SaveError('背包数据错误');
  for(const value of Object.values(world.quests)){
    if(!isRecord(value)||!['locked','available','active','completed','failed'].includes(String(value.status))||!Array.isArray(value.progress)||value.progress.some(p=>!isFiniteNumber(p)||!Number.isInteger(p)||p<0))throw new SaveError('任务数据错误');
  }
  if(world.stability!==undefined&&(!isFiniteNumber(world.stability)||world.stability<0||world.stability>100))throw new SaveError('稳定度数据错误');

  let dungeon:DungeonSnapshot|undefined;
  if(data.dungeon!==undefined){try{dungeon=parseDungeon(data.dungeon,dungeonFloor);}catch(error){throw new SaveError(`地牢进度错误：${error instanceof Error?error.message:'结构错误'}`);}}
  return {
    ...(tower?{tower}:{}),
    ...(dungeon?{dungeon}:{}),
    version: SAVE_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : '',
    ...(typeof data.trackedQuestId==='string'?{trackedQuestId:data.trackedQuestId}:{}),
    world: world as unknown as WorldSnapshot,
    player: { ...(crafting?{crafting}:{}), tileX: player.tileX, tileY: player.tileY, hp: player.hp, exp, gold, equipment, skills, ...(mana===undefined?{}:{mana:mana as number}),...(consumableReadyAt===undefined?{}:{consumableReadyAt:consumableReadyAt as number}) },
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
    ...(file.tower?{tower:parseTower(file.tower)}:{}),
    ...(file.dungeon?{dungeon:restoreDungeon(file.dungeon)}:{}),
    world,
    ...(file.trackedQuestId ? {trackedQuestId:file.trackedQuestId} : {}),
    quests: new QuestManager(quests, world),
    player: { ...file.player, ...(file.player.crafting?{crafting:cloneCrafting(file.player.crafting)}:{}), equipment: { ...file.player.equipment }, skills: { ...file.player.skills, unlocked: [...file.player.skills.unlocked], ...(file.player.skills.equipped?{equipped:[...file.player.skills.equipped]}:{}) } },
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
