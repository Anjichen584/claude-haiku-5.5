import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import type { QuestDef } from '../src/data/schema';
import { applyGains, describeGains, grantQuestRewards, levelForExp, NO_GAINS } from '../src/state/rewards';
import { newSession } from '../src/state/session';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;
const name = (id: string) => `物品:${id}`;

describe('等级计算', () => {
  it('按累计经验升级：0 级 1、100 级 2、300 级 3', () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(99)).toBe(1);
    expect(levelForExp(100)).toBe(2);
    expect(levelForExp(299)).toBe(2);
    expect(levelForExp(300)).toBe(3);
  });
});

describe('发放奖励', () => {
  it('经验、金币、物品写入会话', () => {
    const s = newSession(quests);
    applyGains(s, { exp: 40, gold: 25, items: ['rift_shard', 'rift_shard'] });
    expect(s.player.exp).toBe(40);
    expect(s.player.gold).toBe(25);
    expect(s.world.getItemCount('rift_shard')).toBe(2);
  });

  it('跨过等级门槛时返回升级提示', () => {
    const s = newSession(quests);
    expect(applyGains(s, { exp: 99, gold: 0, items: [] })).toEqual([]);
    expect(applyGains(s, { exp: 1, gold: 0, items: [] })).toEqual(['升级！当前等级 2']);
  });

  it('空奖励不改变任何数值', () => {
    const s = newSession(quests);
    applyGains(s, NO_GAINS);
    expect(s.player.exp).toBe(0);
    expect(s.player.gold).toBe(0);
  });

  it('描述文字包含各项奖励', () => {
    expect(describeGains({ exp: 300, gold: 120, items: ['rift_shard'] }, name)).toBe('+300 经验、+120 金币、物品:rift_shard');
    expect(describeGains(NO_GAINS, name)).toBe('');
  });
});

describe('任务奖励', () => {
  it('完成任务时发放该任务的奖励并给出提示', () => {
    const s = newSession(quests);
    const done = s.quests.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    expect(done.map((c) => c.questId)).toContain('main_01_first_rift');
    const lines = grantQuestRewards(s, done, (id) => s.quests.def(id)?.title ?? id, name);
    expect(lines[0]).toContain('第一道裂隙');
    expect(lines[0]).toContain('+300 经验');
    expect(s.player.gold).toBe(120);
    expect(s.world.getItemCount('rift_shard')).toBe(1);
  });
});
