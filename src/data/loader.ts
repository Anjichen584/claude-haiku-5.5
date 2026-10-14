import itemsJson from '../../data/items.json';
import skillsJson from '../../data/skills.json';
import enemiesJson from '../../data/enemies.json';
import questsJson from '../../data/quests.json';
import dialoguesJson from '../../data/dialogues.json';
import biomesJson from '../../data/biomes.json';
import endingsJson from '../../data/endings.json';
import factionsJson from '../../data/factions.json';
import affixesJson from '../../data/affixes.json';
import dungeonJson from '../../data/dungeon.json';
import itemSetsJson from '../../data/item-sets.json';
import combosJson from '../../data/combos.json';
import type { ItemSetDef } from '../items/sets';
import type { ComboDef } from '../skills/skillTree';
import type { DungeonFloorFile } from '../dungeon/floors';
import type {
  AffixDataFile,
  BiomeDataFile,
  DialogueDataFile,
  EndingDataFile,
  EnemyDataFile,
  FactionDataFile,
  ItemDataFile,
  QuestDataFile,
  SkillDataFile,
} from './schema';

/**
 * 内容数据的统一入口。
 * 所有数据在启动时一次性加载并冻结，运行时只读。
 */
export interface GameData {
  items: ItemDataFile['items'];
  skills: SkillDataFile['skills'];
  enemies: EnemyDataFile['enemies'];
  quests: QuestDataFile['quests'];
  dialogues: DialogueDataFile['dialogues'];
  biomes: BiomeDataFile['biomes'];
  endings: EndingDataFile['endings'];
  factions: FactionDataFile['factions'];
  affixes: AffixDataFile['affixes'];
  dungeon: DungeonFloorFile;
  itemSets: ItemSetDef[];
  combos: ComboDef[];
}

let cached: Readonly<GameData> | null = null;

export function loadGameData(): Readonly<GameData> {
  if (cached) return cached;
  cached = Object.freeze({
    items: (itemsJson as ItemDataFile).items,
    skills: (skillsJson as SkillDataFile).skills,
    enemies: (enemiesJson as EnemyDataFile).enemies,
    quests: (questsJson as QuestDataFile).quests,
    dialogues: (dialoguesJson as DialogueDataFile).dialogues,
    biomes: (biomesJson as BiomeDataFile).biomes,
    endings: (endingsJson as EndingDataFile).endings,
    factions: (factionsJson as FactionDataFile).factions,
    affixes: (affixesJson as AffixDataFile).affixes,
    dungeon: dungeonJson as DungeonFloorFile,
    itemSets: (itemSetsJson as { sets: ItemSetDef[] }).sets,
    combos: (combosJson as { combos: ComboDef[] }).combos,
  });
  return cached;
}

/** 按 id 建立索引，便于 O(1) 查找。 */
export function indexById<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of list) map.set(item.id, item);
  return map;
}
