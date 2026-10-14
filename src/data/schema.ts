/**
 * 数据类型定义。与 data/*.json 一一对应。
 * 运行时只读；任何新增字段需同步更新 scripts/validate-data.ts。
 */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'rift';

export interface ItemDef {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory' | 'material' | 'consumable';
  slot?: string;
  baseDamage?: number;
  /** 护甲防御值（仅护甲使用） */
  defense?: number;
  rarity?: Rarity;
  stackable?: boolean;
  maxStack?: number;
  price: number;
  /** 所属套装 id（可选） */
  setId?: string;
  /** 装备等级（可选，用于词条缩放） */
  itemLevel?: number;
}

export interface SkillDef {
  combat?: import('../skills/combatTypes').SkillCombatDef;
  id: string;
  name: string;
  branch: 'martial' | 'arcane' | 'survival';
  tier: number;
  requires: string[];
  element?: string;
  manaCost?: number;
  cooldown?: number;
  multiplier?: number;
  cost: { skillPoints: number };
}

export interface EnemyDef {
  id: string;
  name: string;
  biomes: string[];
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  element?: string;
  drops: Array<{ item: string; chance: number }>;
  /** 怪物等级（1–12），用于地牢与数值缩放 */
  level?: number;
  /** 精英怪 */
  elite?: boolean;
  /** Boss */
  boss?: boolean;
  /** Boss 不受受击硬直影响 */
  staggerImmune?: boolean;
}

export interface QuestDef {
  id: string;
  type: 'main' | 'side' | 'hidden';
  chapter?: number;
  title: string;
  requires: string[];
  objectives: Array<{ type: string; target: string; count?: number; text: string }>;
  rewards?: { exp?: number; gold?: number; items?: string[]; reputation?: Record<string, number> };
}

export interface DialogueDef {
  id: string;
  start: string;
  nodes: Record<
    string,
    {
      speaker: string;
      text: string;
      next?: string | null;
      choices?: Array<{ text: string; next: string | null }>;
    }
  >;
}

export interface BiomeDef {
  id: string;
  name: string;
  /** 地图上显示的颜色（十六进制） */
  color: string;
  temperature: [number, number];
  humidity: [number, number];
  enemyTable: string[];
  weatherWeights: Partial<Record<'clear' | 'rain' | 'fog' | 'snowstorm' | 'sandstorm' | 'thunder', number>>;
  resources: string[];
}

export interface EndingDef {
  id: string;
  name: string;
  /** 数字越小优先级越高；多个结局同时满足时取优先级最高的 */
  priority: number;
  /** 判定条件，结构同 narrative/conditions.ts */
  conditions: Record<string, unknown>;
  text: string;
}

export interface FactionDef {
  id: string;
  name: string;
  rivals: string[];
}

export interface AffixDef {
  id: string;
  name: string;
  stat: string;
  min: number;
  max: number;
  weight: number;
}

export interface SkillDataFile { skills: SkillDef[] }
export interface ItemDataFile { items: ItemDef[] }
export interface EnemyDataFile { enemies: EnemyDef[] }
export interface QuestDataFile { quests: QuestDef[] }
export interface DialogueDataFile { dialogues: DialogueDef[] }
export interface BiomeDataFile { biomes: BiomeDef[] }
export interface EndingDataFile { endings: EndingDef[] }
export interface FactionDataFile { factions: FactionDef[] }
export interface AffixDataFile { affixes: AffixDef[] }

/** 地点（任务 reach 目标） */
export interface LocationDef { id: string; name: string; region: string }
/** 对话 NPC（任务 talk 目标） */
export interface NpcDef {
  id: string;
  name: string;
  /** 所在地点 id（必须在 locations.json 中） */
  location: string;
  /** 与该 NPC 对话时使用的对话 id（必须在 dialogues.json 中） */
  dialogueId: string;
}
export interface LocationDataFile { locations: LocationDef[] }
export interface NpcDataFile { npcs: NpcDef[] }
