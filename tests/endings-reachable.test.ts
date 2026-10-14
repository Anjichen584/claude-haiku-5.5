/**
 * 用真实数据验证：每个结局至少有一条路径可以达成。
 * 路径：完成全部 24 个主线任务的奖励（声望、物品）+ 若干关键抉择。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveEnding } from '../src/endings/EndingResolver';
import { grantQuestRewards } from '../src/state/rewards';
import { newSession } from '../src/state/session';
import { resolveKeyChoice, type KeyChoiceDef } from '../src/narrative/keyChoices';
import type { EndingDef, QuestDef } from '../src/data/schema';

const read = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const quests = read<{ quests: QuestDef[] }>('data/quests.json').quests;
const endings = read<{ endings: EndingDef[] }>('data/endings.json').endings;
const choices = read<{ keyChoices: KeyChoiceDef[] }>('data/key-choices.json').keyChoices;
const choiceOf = (chapter: number) => choices.find((c) => c.chapter === chapter)!;

function playThrough(picks: Record<number, string | null>, shards = 0) {
  const session = newSession(quests);
  const main = quests.filter((q) => q.type === 'main');
  grantQuestRewards(
    session,
    main.map((q) => ({ questId: q.id, rewards: q.rewards }) as never),
    (id) => id,
    (id) => id,
  );
  if (shards > 0) session.world.addItem('rift_shard', shards);
  for (const [chapter, option] of Object.entries(picks)) {
    if (option === null) continue;
    resolveKeyChoice(choiceOf(Number(chapter)), option, session.world);
  }
  return resolveEnding(endings, session.world)?.id;
}

describe('结局可达性（真实数据）', () => {
  it('守望者：封印核心，拒绝协议，不推荐他人，无视低语', () => {
    expect(playThrough({ 4: 'seal', 10: 'refuse', 16: 'decline', 22: 'ignore' })).toBe('ending_guardian');
  });
  it('求知者：研究核心', () => {
    expect(playThrough({ 4: 'study', 10: 'refuse', 16: 'decline', 22: 'ignore' })).toBe('ending_scholar');
  });
  it('行商：签订协议（需要 20 个裂隙碎片）', () => {
    expect(playThrough({ 10: 'accept', 16: 'decline', 22: 'ignore' }, 20)).toBe('ending_merchant');
  });
  it('荒原之主：接受王座，稳定度降低', () => {
    expect(playThrough({ 10: 'refuse', 16: 'lead', 22: 'ignore' })).toBe('ending_chieftain');
  });
  it('裂隙之子：回应低语，稳定度降到 20', () => {
    expect(playThrough({ 10: 'refuse', 16: 'decline', 22: 'answer' })).toBe('ending_rift_born');
  });
  it('帝国的归还：封印核心，拒绝协议（帝国 +20），回应低语导致稳定度降到 40', () => {
    expect(playThrough({ 4: 'seal', 10: 'refuse', 16: 'decline', 22: 'answer' })).toBe('ending_emperor');
  });
  it('无名者：什么都不选', () => {
    expect(playThrough({})).toBe('ending_default');
  });
});
