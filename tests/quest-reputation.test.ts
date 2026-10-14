import { describe, expect, it } from 'vitest';
import { grantQuestRewards } from '../src/state/rewards';
import { newSession } from '../src/state/session';
import type { QuestDef } from '../src/data/schema';

describe('任务声望奖励', () => {
  it('完成任务后增加对应阵营声望，并给出提示', () => {
    const session = newSession([] as QuestDef[]);
    const lines = grantQuestRewards(
      session,
      [{ questId: 'q1', rewards: { reputation: { ashguard: 8 } } } as never],
      () => '测试任务',
      (id) => id,
    );
    expect(session.world.getReputation('ashguard')).toBe(8);
    expect(lines.some((l) => l.includes('声望变化') && l.includes('ashguard') && l.includes('+8'))).toBe(true);
  });

  it('主线任务都带有声望奖励，且阵营 id 合法', () => {
    const quests = JSON.parse(require('node:fs').readFileSync('data/quests.json', 'utf8')).quests as QuestDef[];
    const factions = JSON.parse(require('node:fs').readFileSync('data/factions.json', 'utf8')).factions as Array<{ id: string }>;
    const ids = new Set(factions.map((f) => f.id));
    const main = quests.filter((q) => q.type === 'main');
    expect(main.length).toBe(24);
    for (const q of main) {
      const rep = (q.rewards as { reputation?: Record<string, number> }).reputation ?? {};
      expect(Object.keys(rep).length).toBeGreaterThan(0);
      for (const f of Object.keys(rep)) expect(ids.has(f)).toBe(true);
    }
  });
});
