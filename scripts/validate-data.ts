/**
 * 数据校验脚本：npm run validate:data
 *
 * 检查项：
 * 1. 每个文件的顶层结构是否正确；
 * 2. 所有 id 是否唯一；
 * 3. 所有跨文件引用（物品、敌人、任务、群系、阵营、对话节点）是否存在；
 * 4. 数值范围是否合理。
 *
 * 任一错误都会以非零退出码结束，便于 CI 使用。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name: string): any => JSON.parse(readFileSync(resolve(root, 'data', name), 'utf8'));

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

function checkUniqueIds(label: string, list: Array<{ id?: unknown }>): Set<string> {
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      fail(`${label}: 存在缺少 id 的条目`);
      continue;
    }
    if (seen.has(entry.id)) fail(`${label}: id 重复 "${entry.id}"`);
    seen.add(entry.id);
  }
  return seen;
}

function expectArray(label: string, value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    fail(`${label}: 顶层应为数组`);
    return false;
  }
  return true;
}

// ---------- 读取文件 ----------
const itemsFile = load('items.json');
const skillsFile = load('skills.json');
const enemiesFile = load('enemies.json');
const questsFile = load('quests.json');
const dialoguesFile = load('dialogues.json');
const biomesFile = load('biomes.json');
const endingsFile = load('endings.json');
const factionsFile = load('factions.json');
const affixesFile = load('affixes.json');
const dungeonFile = load('dungeon.json');
const roomTemplatesFile = load('room-templates.json');
const itemSetsFile = load('item-sets.json');
const combosFile = load('combos.json');
const keyChoicesFile = load('key-choices.json');

if (!expectArray('items', itemsFile.items)) process.exit(1);

const items = itemsFile.items;
const skills = skillsFile.skills;
const enemies = enemiesFile.enemies;
const quests = questsFile.quests;
const dialogues = dialoguesFile.dialogues;
const biomes = biomesFile.biomes;
const endings = endingsFile.endings;
const factions = factionsFile.factions;
const affixes = affixesFile.affixes;


// ---------- id 集合 ----------
const itemIds = checkUniqueIds('items', items);
const skillIds = checkUniqueIds('skills', skills);
const enemyIds = checkUniqueIds('enemies', enemies);
const questIds = checkUniqueIds('quests', quests);
checkUniqueIds('dialogues', dialogues);
const biomeIds = checkUniqueIds('biomes', biomes);
checkUniqueIds('endings', endings);
const factionIds = checkUniqueIds('factions', factions);
checkUniqueIds('affixes', affixes);
if (affixes.length < 60) fail(`affixes: 词条至少需要 60 种，目前 ${affixes.length} 种`);

// ---------- 物品 ----------
for (const item of items) {
  if (typeof item.price !== 'number' || item.price < 0) fail(`items.${item.id}: price 必须为非负数`);
  if (item.stackable && (!item.maxStack || item.maxStack < 1)) {
    fail(`items.${item.id}: 可堆叠物品必须设置 maxStack >= 1`);
  }
}

// ---------- 技能 ----------
const skillById = new Map<string, any>(skills.map((s: any) => [s.id, s]));
const branchCounts: Record<string, number> = {};
for (const skill of skills) {
  branchCounts[skill.branch] = (branchCounts[skill.branch] ?? 0) + 1;
  if (!['martial', 'arcane', 'survival'].includes(skill.branch)) fail(`skills.${skill.id}: 未知分支 "${skill.branch}"`);
  if (skill.multiplier !== undefined && skill.multiplier < 0) fail(`skills.${skill.id}: multiplier 不能为负`);
  if (!skill.cost || skill.cost.skillPoints !== skill.tier) {
    fail(`skills.${skill.id}: cost.skillPoints 必须等于 tier`);
  }
  for (const req of skill.requires ?? []) {
    const parent = skillById.get(req);
    if (!parent) {
      fail(`skills.${skill.id}: 前置技能 "${req}" 不存在`);
      continue;
    }
    if (parent.branch !== skill.branch) fail(`skills.${skill.id}: 前置技能 "${req}" 不在同一分支`);
    if (parent.tier >= skill.tier) fail(`skills.${skill.id}: 前置技能 "${req}" 的层级必须更低`);
  }
}
for (const branch of ['martial', 'arcane', 'survival']) {
  if ((branchCounts[branch] ?? 0) < 15) fail(`skills: 分支 "${branch}" 至少需要 15 个技能`);
}

// ---------- 组合技 ----------
for (const combo of combosFile.combos) {
  if (!Array.isArray(combo.skills) || combo.skills.length !== 2 || combo.skills[0] === combo.skills[1]) {
    fail(`combos.${combo.id}: 必须由两个不同的技能组成`);
    continue;
  }
  for (const s of combo.skills) {
    if (!skillIds.has(s)) fail(`combos.${combo.id}: 技能 "${s}" 不存在`);
  }
}

// ---------- 套装 ----------
const setIds = checkUniqueIds('item-sets', itemSetsFile.sets);
for (const set of itemSetsFile.sets) {
  for (const b of set.bonuses) {
    if (![2, 4, 6].includes(b.pieces)) fail(`item-sets.${set.id}: 套装件数必须为 2、4 或 6`);
  }
}
for (const item of items) {
  if (item.setId && !setIds.has(item.setId)) fail(`items.${item.id}: 套装 "${item.setId}" 不存在`);
}

// ---------- 敌人 ----------
for (const enemy of enemies) {
  if (enemy.hp <= 0) fail(`enemies.${enemy.id}: hp 必须大于 0`);
  for (const b of enemy.biomes ?? []) {
    if (!biomeIds.has(b)) fail(`enemies.${enemy.id}: 群系 "${b}" 不存在`);
  }
  for (const drop of enemy.drops ?? []) {
    if (!itemIds.has(drop.item)) fail(`enemies.${enemy.id}: 掉落物品 "${drop.item}" 不存在`);
    if (drop.chance < 0 || drop.chance > 1) fail(`enemies.${enemy.id}: 掉落概率必须在 0–1 之间`);
  }
}

const WEATHER_KEYS = ['clear', 'rain', 'fog', 'snowstorm', 'sandstorm', 'thunder'];

// ---------- 群系 ----------
for (const biome of biomes) {
  for (const e of biome.enemyTable ?? []) {
    if (!enemyIds.has(e)) fail(`biomes.${biome.id}: 敌人 "${e}" 不存在`);
  }
  const [tMin, tMax] = biome.temperature;
  const [hMin, hMax] = biome.humidity;
  if (tMin > tMax || hMin > hMax) fail(`biomes.${biome.id}: 温度或湿度区间顺序错误`);
  if (!/^#[0-9a-fA-F]{6}$/.test(biome.color ?? '')) fail(`biomes.${biome.id}: color 必须为 #RRGGBB`);
  for (const w of Object.keys(biome.weatherWeights ?? {})) {
    if (!WEATHER_KEYS.includes(w)) fail(`biomes.${biome.id}: 未知天气 "${w}"`);
  }
}

// 群系覆盖检查：温度–湿度平面网格采样，每个点都应被某个群系包含
for (let ti = 0; ti <= 20; ti++) {
  for (let hi = 0; hi <= 20; hi++) {
    const t = ti / 20; // 整数步进，避免浮点累加误差
    const h = hi / 20;
    const covered = biomes.some(
      (b: any) => t >= b.temperature[0] && t <= b.temperature[1] && h >= b.humidity[0] && h <= b.humidity[1],
    );
    if (!covered) {
      fail(`biomes: 温度 ${t.toFixed(2)} / 湿度 ${h.toFixed(2)} 没有群系覆盖`);
    }
  }
}

// ---------- 任务 ----------
for (const quest of quests) {
  for (const req of quest.requires ?? []) {
    if (!questIds.has(req)) fail(`quests.${quest.id}: 前置任务 "${req}" 不存在`);
  }
  for (const obj of quest.objectives ?? []) {
    if (obj.type === 'kill' && !enemyIds.has(obj.target)) {
      fail(`quests.${quest.id}: 击杀目标敌人 "${obj.target}" 不存在`);
    }
    if (obj.type === 'kill' && (obj.count ?? 0) < 1) {
      fail(`quests.${quest.id}: 击杀数量必须 >= 1`);
    }
  }
  for (const item of quest.rewards?.items ?? []) {
    if (!itemIds.has(item)) fail(`quests.${quest.id}: 奖励物品 "${item}" 不存在`);
  }
}

// ---------- 任务依赖（无环）与对话条件 / 效果 ----------
{
  const reqOf = new Map<string, string[]>(quests.map((q: any) => [q.id, q.requires ?? []]));
  const state = new Map<string, number>(); // 0 未访问，1 访问中，2 完成
  const visit = (id: string): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      fail(`quests.${id}: 任务依赖存在环`);
      return;
    }
    state.set(id, 1);
    for (const r of reqOf.get(id) ?? []) visit(r);
    state.set(id, 2);
  };
  for (const q of quests) visit(q.id);

  for (const q of quests) {
    if (!['main', 'side', 'hidden'].includes(q.type)) fail(`quests.${q.id}: 未知任务类型 "${q.type}"`);
    for (const obj of q.objectives ?? []) {
      if (obj.type === 'collect' && !itemIds.has(obj.target)) {
        fail(`quests.${q.id}: 收集目标物品 "${obj.target}" 不存在`);
      }
    }
  }
}

const STATUSES = ['locked', 'available', 'active', 'completed', 'failed'];
function checkCondition(label: string, cond: any): void {
  if (!cond) return;
  for (const f of cond.reputation ? Object.keys(cond.reputation) : []) {
    if (!factionIds.has(f)) fail(`${label}: 声望阵营 "${f}" 不存在`);
  }
  for (const [qid, status] of Object.entries<any>(cond.quests ?? {})) {
    if (!questIds.has(qid)) fail(`${label}: 任务 "${qid}" 不存在`);
    if (!STATUSES.includes(status)) fail(`${label}: 任务状态 "${status}" 不合法`);
  }
  for (const iid of Object.keys(cond.items ?? {})) {
    if (!itemIds.has(iid)) fail(`${label}: 物品 "${iid}" 不存在`);
  }
}
function checkEffects(label: string, eff: any): void {
  if (!eff) return;
  for (const f of Object.keys(eff.reputation ?? {})) {
    if (!factionIds.has(f)) fail(`${label}: 声望阵营 "${f}" 不存在`);
  }
  for (const iid of Object.keys(eff.items ?? {})) {
    if (!itemIds.has(iid)) fail(`${label}: 物品 "${iid}" 不存在`);
  }
  for (const qid of eff.startQuest ?? []) {
    if (!questIds.has(qid)) fail(`${label}: 启动任务 "${qid}" 不存在`);
  }
}

// ---------- 对话 ----------
for (const dlg of dialogues) {
  const nodeIds = new Set(Object.keys(dlg.nodes ?? {}));
  if (!nodeIds.has(dlg.start)) fail(`dialogues.${dlg.id}: 起始节点 "${dlg.start}" 不存在`);
  for (const [nodeId, node] of Object.entries<any>(dlg.nodes ?? {})) {
    if (node.next && !nodeIds.has(node.next)) {
      fail(`dialogues.${dlg.id}.${nodeId}: next "${node.next}" 不存在`);
    }
    checkEffects(`dialogues.${dlg.id}.${nodeId}`, node.effects);
    for (const choice of node.choices ?? []) {
      if (choice.next && !nodeIds.has(choice.next)) {
        fail(`dialogues.${dlg.id}.${nodeId}: 选项 next "${choice.next}" 不存在`);
      }
      checkCondition(`dialogues.${dlg.id}.${nodeId}`, choice.condition);
      checkEffects(`dialogues.${dlg.id}.${nodeId}`, choice.effects);
    }
  }
}

// ---------- 阵营 ----------
for (const f of factions) {
  for (const r of f.rivals ?? []) {
    if (!factionIds.has(r)) fail(`factions.${f.id}: 敌对阵营 "${r}" 不存在`);
  }
}

// ---------- 阵营（敌对关系对称） ----------
const factionDefs = new Map<string, any>(factions.map((f: any) => [f.id, f]));
for (const f of factions) {
  for (const r of f.rivals ?? []) {
    const other = factionDefs.get(r);
    if (other && !(other.rivals ?? []).includes(f.id)) {
      fail(`factions.${f.id}: 敌对关系必须对称，"${r}" 没有反向记录`);
    }
  }
}

// ---------- 结局 ----------
for (const e of endings) {
  checkCondition(`endings.${e.id}`, e.conditions);
  if (!e.conditions || typeof e.conditions !== 'object') fail(`endings.${e.id}: conditions 必须为对象`);
}
if (!endings.some((e: any) => e.id === 'ending_default')) fail('endings: 必须包含兜底结局 ending_default');

// ---------- 关键抉择 ----------
const keyChapters = keyChoicesFile.keyChoices.map((k: any) => k.chapter).sort((a: number, b: number) => a - b);
if (JSON.stringify(keyChapters) !== JSON.stringify([4, 10, 16, 22])) {
  fail(`key-choices: 关键抉择必须分布在第 4、10、16、22 章，当前为 ${JSON.stringify(keyChapters)}`);
}
checkUniqueIds('key-choices', keyChoicesFile.keyChoices);
for (const k of keyChoicesFile.keyChoices) {
  if (k.options.length < 2) fail(`key-choices.${k.id}: 至少需要两个选项`);
}

// ---------- 结局（优先级） ----------
const priorities = endings.map((e: { priority: number }) => e.priority);
if (new Set(priorities).size !== priorities.length) fail('endings: priority 必须唯一');

// ---------- 地牢楼层 ----------
if (!Array.isArray(dungeonFile.floors) || dungeonFile.floors.length !== 12) {
  fail('dungeon: floors 必须包含 12 层');
} else {
  const enemyIdSet = enemyIds;
  dungeonFile.floors.forEach((f: any, idx: number) => {
    if (f.floor !== idx + 1) fail(`dungeon: 第 ${idx + 1} 项的 floor 应为 ${idx + 1}`);
    if (f.roomMin > f.roomMax) fail(`dungeon.floor${f.floor}: roomMin 不能大于 roomMax`);
    if (f.roomMin < 2) fail(`dungeon.floor${f.floor}: roomMin 至少为 2（入口与 Boss）`);
    if (f.loopChance < 0 || f.loopChance > 1) fail(`dungeon.floor${f.floor}: loopChance 必须在 0–1 之间`);
    if (f.bossId !== null && !enemyIdSet.has(f.bossId)) {
      fail(`dungeon.floor${f.floor}: bossId "${f.bossId}" 不存在`);
    }
  });
}

// ---------- 房间模板 ----------
const roomKinds = ['entrance', 'combat', 'chest', 'event', 'shop', 'rest', 'boss'];
checkUniqueIds('room-templates', roomTemplatesFile.templates);
for (const kind of roomKinds) {
  if (!roomTemplatesFile.templates.some((t: any) => t.kind === kind)) {
    fail(`room-templates: 缺少类型 "${kind}" 的模板`);
  }
}
for (const t of roomTemplatesFile.templates) {
  if (!roomKinds.includes(t.kind)) fail(`room-templates.${t.id}: 未知房间类型 "${t.kind}"`);
  if (t.weight <= 0) fail(`room-templates.${t.id}: weight 必须大于 0`);
}

// ---------- 输出 ----------
if (errors.length > 0) {
  console.error(`✖ 数据校验失败，共 ${errors.length} 个问题：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✔ 数据校验通过：物品 ${items.length}，技能 ${skills.length}，敌人 ${enemies.length}，` +
    `任务 ${quests.length}，对话 ${dialogues.length}，群系 ${biomes.length}，` +
    `结局 ${endings.length}，阵营 ${factions.length}，词条 ${affixes.length}`,
);
