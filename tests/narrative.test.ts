import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import dialoguesJson from '../data/dialogues.json';
import type { DialogueDef, QuestDef } from '../src/data/schema';
import { WorldState } from '../src/state/WorldState';
import { evaluateCondition } from '../src/narrative/conditions';
import { QuestError, QuestManager } from '../src/narrative/QuestManager';
import { DialogueRunner, DialogueError } from '../src/dialogue/DialogueRunner';

const quests = (questsJson as { quests: QuestDef[] }).quests;
const dialogues = (dialoguesJson as { dialogues: DialogueDef[] }).dialogues;
const captain = dialogues.find((d) => d.id === 'ashguard_captain_intro')!;

function newGame() {
  const world = new WorldState();
  const manager = new QuestManager(quests, world);
  return { world, manager };
}

describe('WorldState', () => {
  it('声望被限制在 −100 到 +100 之间', () => {
    const w = new WorldState();
    expect(w.addReputation('ashguard', 150)).toBe(100);
    expect(w.addReputation('ashguard', -500)).toBe(-100);
  });

  it('快照可以完整还原', () => {
    const w = new WorldState();
    w.setFlag('met_captain');
    w.addReputation('ashguard', 12);
    w.addItem('rift_shard', 4);
    w.setQuest('main_01_first_rift', { status: 'active', progress: [2] });
    const restored = WorldState.restore(JSON.parse(JSON.stringify(w.snapshot())));
    expect(restored.snapshot()).toEqual(w.snapshot());
  });
});

describe('条件判断', () => {
  it('缺省条件视为通过', () => {
    expect(evaluateCondition(undefined, new WorldState())).toBe(true);
  });

  it('标记、声望、物品、任务状态都能正确判断', () => {
    const w = new WorldState();
    w.setFlag('met_captain');
    w.addReputation('ashguard', 10);
    w.addItem('rift_shard', 3);
    w.setQuest('main_01_first_rift', { status: 'completed', progress: [] });

    expect(evaluateCondition({ flags: ['met_captain'] }, w)).toBe(true);
    expect(evaluateCondition({ notFlags: ['met_captain'] }, w)).toBe(false);
    expect(evaluateCondition({ reputation: { ashguard: { gte: 10 } } }, w)).toBe(true);
    expect(evaluateCondition({ reputation: { ashguard: { gte: 11 } } }, w)).toBe(false);
    expect(evaluateCondition({ items: { rift_shard: { gte: 3, lte: 3 } } }, w)).toBe(true);
    expect(evaluateCondition({ quests: { main_01_first_rift: 'completed' } }, w)).toBe(true);
    expect(evaluateCondition({ quests: { main_01_first_rift: 'active' } }, w)).toBe(false);
  });
});

describe('任务状态机', () => {
  it('初始时只有无前置的任务可用，其余锁定', () => {
    const { world } = newGame();
    expect(world.questStatus('main_01_first_rift')).toBe('available');
    expect(world.questStatus('main_02_ash_road')).toBe('locked');
    expect(world.questStatus('side_01_lost_map')).toBe('available');
  });

  it('完成前置任务后，后续任务解锁为可接取', () => {
    const { world, manager } = newGame();
    manager.accept('main_01_first_rift');
    const done = manager.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    expect(done.map((d) => d.questId)).toEqual(['main_01_first_rift']);
    expect(done[0].rewards.exp).toBe(300);
    expect(world.questStatus('main_02_ash_road')).toBe('available');
  });

  it('未接取的任务不会累计进度', () => {
    const { world, manager } = newGame();
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    expect(world.questStatus('main_01_first_rift')).toBe('available');
  });

  it('进度达到要求前不会完成，且进度不超过上限', () => {
    const { world, manager } = newGame();
    manager.accept('main_01_first_rift');
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 3 });
    expect(world.getQuest('main_01_first_rift')?.progress).toEqual([3]);
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 99 });
    expect(world.questStatus('main_01_first_rift')).toBe('completed');
  });

  it('多目标任务必须全部完成', () => {
    const { world, manager } = newGame();
    manager.accept('main_01_first_rift');
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    manager.accept('main_02_ash_road');
    manager.report({ type: 'reach', target: 'ash_road_camp' });
    expect(world.questStatus('main_02_ash_road')).toBe('active');
    manager.report({ type: 'collect', target: 'rift_shard', amount: 3 });
    expect(world.questStatus('main_02_ash_road')).toBe('completed');
  });

  it('不可接取的任务与未知任务会报错', () => {
    const { manager } = newGame();
    expect(() => manager.accept('main_02_ash_road')).toThrow(QuestError);
    expect(() => manager.accept('no_such_quest')).toThrow(QuestError);
  });

  it('失败的任务不再接收事件', () => {
    const { world, manager } = newGame();
    manager.accept('main_01_first_rift');
    manager.fail('main_01_first_rift');
    expect(world.questStatus('main_01_first_rift')).toBe('failed');
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 5 });
    expect(world.questStatus('main_01_first_rift')).toBe('failed');
  });

  it('隐藏任务依赖主线，主线完成前不可见（锁定）', () => {
    const { world } = newGame();
    expect(world.questStatus('hidden_01_whisper')).toBe('locked');
  });
});

describe('对话执行器', () => {
  it('选项条件决定可见性：声望不足时“与你无关”不可见', () => {
    const w = new WorldState();
    w.addReputation('ashguard', -30);
    const runner = new DialogueRunner(captain, w);
    expect(runner.choices().map((c) => c.text)).not.toContain('与你无关。');
  });

  it('选择“我需要帮助”会设置标记、增加声望并启动任务', () => {
    const w = new WorldState();
    const runner = new DialogueRunner(captain, w);
    const choice = runner.choices().find((c) => c.text === '我需要帮助。')!;
    runner.choose(choice.index);
    expect(w.hasFlag('met_captain')).toBe(true);
    expect(w.getReputation('ashguard')).toBe(5);
    expect(runner.pendingQuestStarts).toEqual(['main_01_first_rift']);
    expect(runner.current()?.text).toContain('灰烬狼');
    runner.advance();
    expect(runner.finished).toBe(true);
  });

  it('任务完成后才出现“我想知道裂隙的事”，并解锁额外节点', () => {
    const { world, manager } = newGame();
    const runner1 = new DialogueRunner(captain, world);
    expect(runner1.choices().map((c) => c.text)).not.toContain('我想知道裂隙的事。');

    manager.accept('main_01_first_rift');
    manager.report({ type: 'kill', target: 'ash_wolf', amount: 5 });

    const runner2 = new DialogueRunner(captain, world);
    const choice = runner2.choices().find((c) => c.text === '我想知道裂隙的事。');
    expect(choice).toBeDefined();
    runner2.choose(choice!.index);
    expect(world.hasFlag('knows_rift')).toBe(true);
    expect(runner2.finished).toBe(false);
    runner2.advance();
    expect(runner2.finished).toBe(true);
  });

  it('选择条件不满足的选项会报错', () => {
    const w = new WorldState();
    const runner = new DialogueRunner(captain, w);
    const idx = captain.nodes.n1.choices!.findIndex((c) => c.text === '我想知道裂隙的事。');
    expect(() => runner.choose(idx)).toThrow(DialogueError);
  });

  it('在需要选择的节点调用 advance 会报错', () => {
    const runner = new DialogueRunner(captain, new WorldState());
    expect(() => runner.advance()).toThrow(DialogueError);
  });

  it('起始节点不存在时报错', () => {
    const broken: DialogueDef = { id: 'x', start: 'missing', nodes: {} };
    expect(() => new DialogueRunner(broken, new WorldState())).toThrow(DialogueError);
  });
});
