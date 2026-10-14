import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import type { QuestDef } from '../src/data/schema';
import { newSession } from '../src/state/session';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;

/** 一个带击杀目标、并以某 NPC 为交付对象的支线任务 */
function sideWithKillAndDelivery(): { def: QuestDef; npcId: string; killTarget: string } {
  const def = quests.find(
    (q) => q.type === 'side' && q.objectives.some((o) => o.type === 'kill') && q.objectives.some((o) => o.type === 'talk'),
  )!;
  const talk = def.objectives.find((o) => o.type === 'talk')!;
  const kill = def.objectives.find((o) => o.type === 'kill')!;
  return { def, npcId: talk.target, killTarget: kill.target };
}

describe('任务发布', () => {
  it('开局不会自动接取支线任务，主线会自动接取', () => {
    const s = newSession(quests);
    const { def } = sideWithKillAndDelivery();
    expect(s.world.questStatus(def.id)).toBe('available');
    expect(s.world.questStatus('main_01_first_rift')).toBe('active');
  });

  it('与发布者对话时接取任务，且只接取一次', () => {
    const s = newSession(quests);
    const { def, npcId } = sideWithKillAndDelivery();
    expect(s.quests.acceptFromNpc(npcId)).toContain(def.id);
    expect(s.world.questStatus(def.id)).toBe('active');
    expect(s.quests.acceptFromNpc(npcId)).not.toContain(def.id);
  });

  it('交付对话在击杀之前不计入进度', () => {
    const s = newSession(quests);
    const { def, npcId } = sideWithKillAndDelivery();
    s.quests.acceptFromNpc(npcId);
    const done = s.quests.report({ type: 'talk', target: npcId });
    expect(done.map((c) => c.questId)).not.toContain(def.id);
    expect(s.world.questStatus(def.id)).toBe('active');
  });

  it('先完成击杀，再与 NPC 对话才完成任务', () => {
    const s = newSession(quests);
    const { def, npcId, killTarget } = sideWithKillAndDelivery();
    s.quests.acceptFromNpc(npcId);
    const killCount = def.objectives.find((o) => o.type === 'kill')!.count ?? 1;
    s.quests.report({ type: 'kill', target: killTarget, amount: killCount });
    const done = s.quests.report({ type: 'talk', target: npcId });
    expect(done.map((c) => c.questId)).toContain(def.id);
    expect(s.world.questStatus(def.id)).toBe('completed');
  });
});
