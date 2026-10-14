/**
 * 内容统计：npm run content:stats
 * 对比 docs/design-targets.md 中的内容目标，显示完成度。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name: string): any => JSON.parse(readFileSync(resolve(root, 'data', name), 'utf8'));

const quests: any[] = load('quests.json').quests;
const dialogues: any[] = load('dialogues.json').dialogues;
const enemies: any[] = load('enemies.json').enemies;
const items: any[] = load('items.json').items;
const biomes: any[] = load('biomes.json').biomes;

const dialogueNodes = dialogues.reduce((n, d) => n + Object.keys(d.nodes).length, 0);
const count = (list: any[], pred: (x: any) => boolean) => list.filter(pred).length;

const rows: Array<[string, number, number]> = [
  ['主线章节（任务）', count(quests, (q) => q.type === 'main'), 24],
  ['支线任务', count(quests, (q) => q.type === 'side'), 120],
  ['隐藏任务', count(quests, (q) => q.type === 'hidden'), 20],
  ['敌人种类', enemies.length, 45],
  ['精英敌人', count(enemies, (e) => e.elite === true), 12],
  ['Boss', count(enemies, (e) => e.boss === true), 8],
  ['对话节点', dialogueNodes, 2000],
  ['物品', items.length, 0],
  ['群系', biomes.length, 5],
];

console.log('内容完成度（对照设计目标）\n');
for (const [label, have, want] of rows) {
  const pct = want > 0 ? Math.min(100, Math.round((have / want) * 100)) : 100;
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '·');
  const target = want > 0 ? `${have}/${want}` : `${have}`;
  console.log(`${label.padEnd(12, '　')} ${bar} ${String(pct).padStart(3)}%  ${target}`);
}
