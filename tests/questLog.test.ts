import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import type { QuestDef } from '../src/data/schema';
import { activeQuestLog, formatQuestLog } from '../src/narrative/questLog';
import { newSession } from '../src/state/session';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;

describe('任务日志', () => {
  it('没有进行中的任务时显示提示', () => {
    const s = newSession(quests);
    expect(activeQuestLog(quests, s.world)).toEqual([]);
    expect(formatQuestLog([])).toBe('暂无进行中的任务');
  });

  it('只列出 active 任务，并显示计数进度', () => {
    const s = newSession(quests);
    s.quests.accept('main_01_first_rift');
    s.quests.report({ type: 'kill', target: 'ash_wolf', amount: 2 });

    const log = activeQuestLog(quests, s.world);
    expect(log.map((e) => e.id)).toEqual(['main_01_first_rift']);
    expect(log[0].objectives[0].progress).toBe('2/5');
    expect(log[0].objectives[0].done).toBe(false);
  });

  it('完成的任务不再出现在日志中', () => {
    const s = newSession(quests);
    s.quests.accept('main_01_first_rift');
    s.quests.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    expect(s.world.questStatus('main_01_first_rift')).toBe('completed');
    expect(activeQuestLog(quests, s.world)).toEqual([]);
  });

  it('主线排在支线之前', () => {
    const s = newSession(quests);
    const side = quests.find((q) => q.type === 'side' && q.objectives.some((o) => o.type === 'kill'))!;
    s.quests.accept('main_01_first_rift');
    s.quests.accept(side.id);
    const ids = activeQuestLog(quests, s.world).map((e) => e.type);
    expect(ids[0]).toBe('main');
  });

  it('文本渲染包含标题与目标', () => {
    const s = newSession(quests);
    s.quests.accept('main_01_first_rift');
    const text = formatQuestLog(activeQuestLog(quests, s.world));
    expect(text).toContain('第一道裂隙');
    expect(text).toContain('0/5');
  });
});
