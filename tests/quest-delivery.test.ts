import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import dialoguesJson from '../data/dialogues.json';
import npcsJson from '../data/npcs.json';
import type { DialogueDef, NpcDef, QuestDef } from '../src/data/schema';
import { WorldState } from '../src/state/WorldState';
import { QuestManager } from '../src/narrative/QuestManager';
import { NpcRegistry, startTalk } from '../src/world/npcs';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;
const dialogues = (dialoguesJson as unknown as { dialogues: DialogueDef[] }).dialogues;
const npcs = (npcsJson as unknown as { npcs: NpcDef[] }).npcs;

describe('支线任务需要回到 NPC 交付', () => {
  it('side_31：打怪与收集完成后，仍需与毛皮商对话才算完成', () => {
    const world = new WorldState();
    const manager = new QuestManager(quests, world);
    const registry = new NpcRegistry(npcs);

    manager.accept('side_31_frost_pelts');
    manager.report({ type: 'kill', target: 'frost_wolf', amount: 4 });
    manager.report({ type: 'collect', target: 'rift_shard', amount: 2 });
    expect(manager.progressOf('side_31_frost_pelts')!.status).toBe('active');

    const dialogue = dialogues.find((d) => d.id === 'side_31_frost_pelt_trader_delivery')!;
    const session = startTalk(registry, 'npc_side_31_frost_pelt_trader', dialogue, world, manager);
    let guard = 0;
    while (!session.runner.finished && guard++ < 200) {
      const choices = session.runner.choices();
      if (choices.length > 0) session.runner.choose(choices[0].index);
      else session.runner.advance();
    }
    const done = session.finish();
    expect(done.map((c) => c.questId)).toContain('side_31_frost_pelts');
    expect(manager.progressOf('side_31_frost_pelts')!.status).toBe('completed');
  });
});
