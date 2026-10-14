/**
 * 任务日志：把任务定义与世界状态合并成界面可直接显示的条目。
 * 只读，不修改任何状态。
 */
import type { QuestDef } from '../data/schema';
import type { WorldState } from '../state/WorldState';

export interface QuestLogEntry {
  id: string;
  title: string;
  type: QuestDef['type'];
  /** 每个目标一行，例如 “清理周边灰烬狼 2/5” */
  objectives: { text: string; done: boolean; progress: string }[];
}

/** 列出所有进行中的任务，主线在前，其次按章节与 id 排序。 */
export function activeQuestLog(quests: readonly QuestDef[], world: WorldState): QuestLogEntry[] {
  const typeOrder: Record<QuestDef['type'], number> = { main: 0, side: 1, hidden: 2 };
  return quests
    .filter((q) => world.questStatus(q.id) === 'active')
    .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || a.id.localeCompare(b.id))
    .map((q) => {
      const record = world.getQuest(q.id);
      return {
        id: q.id,
        title: q.title,
        type: q.type,
        objectives: q.objectives.map((obj, i) => {
          const need = obj.count ?? 1;
          const have = Math.min(need, record?.progress[i] ?? 0);
          return {
            text: obj.text,
            done: have >= need,
            progress: need > 1 ? `${have}/${need}` : have >= need ? '完成' : '未完成',
          };
        }),
      };
    });
}

/** 把日志渲染为纯文本，供 Phaser 文本对象显示。 */
export function formatQuestLog(entries: readonly QuestLogEntry[], limit = 8): string {
  if (entries.length === 0) return '暂无进行中的任务';
  const lines: string[] = [];
  for (const e of entries.slice(0, limit)) {
    lines.push(`【${e.title}】`);
    for (const o of e.objectives) lines.push(`  ${o.done ? '✓' : '·'} ${o.text}  ${o.progress}`);
  }
  if (entries.length > limit) lines.push(`…还有 ${entries.length - limit} 项`);
  return lines.join('\n');
}
