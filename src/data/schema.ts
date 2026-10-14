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
  rarity?: Rarity;
  stackable?: boolean;
  maxStack?: number;
  price: number;
}

export interface SkillDef {
  id: string;
  name: string;
  branch: 'martial' | 'arcane' | 'survival';
  tier: number;
  requires: string[];
  element?: string;
  manaCost?: number;
  cooldown?: number;
  multiplier?: number;
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
}

export interface QuestDef {
  id: string;
  type: 'main' | 'side' | 'hidden';
  chapter?: number;
  title: string;
  requires: string[];
  objectives: Array<{ type: string; target: string; count?: number; text: string }>;
  rewards?: { exp?: number; gold?: number; items?: string[] };
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
  priority: number;
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
