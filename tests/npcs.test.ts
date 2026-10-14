import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import dialoguesJson from '../data/dialogues.json';
import npcsJson from '../data/npcs.json';
import locationsJson from '../data/locations.json';
import type { DialogueDef, LocationDef, NpcDef, QuestDef } from '../src/data/schema';
import { WorldState } from '../src/state/WorldState';
import { QuestManager } from '../src/narrative/QuestManager';
import { NpcError, NpcRegistry, startTalk } from '../src/world/npcs';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;
const dialogues = (dialoguesJson as unknown as { dialogues: DialogueDef[] }).dialogues;
const npcs = (npcsJson as unknown as { npcs: NpcDef[] }).npcs;
const locations = (locationsJson as unknown as { locations: LocationDef[] }).locations;

function setup() {
  const world = new WorldState();
  const manager = new QuestManager(quests, world);
  return { world, manager, registry: new NpcRegistry(npcs) };
}

const captainDialogue = dialogues.find((d) => d.id === 'ashguard_captain_intro')!;

describe('NPC 注册表', () => {
  it('拒绝重复 id，并能按地点查询', () => {
    expect(() => new NpcRegistry([npcs[0], npcs[0]])).toThrow(NpcError);
    const reg = new NpcRegistry(npcs);
    expect(reg.atLocation('ash_road_camp').map((n) => n.id)).toContain('ashguard_captain');
  });

  it('每个 NPC 的地点与对话都真实存在', () => {
    const locIds = new Set(locations.map((l) => l.id));
    const dialogueIds = new Set(dialogues.map((d) => d.id));
    for (const npc of npcs) {
      expect(locIds.has(npc.location)).toBe(true);
      expect(dialogueIds.has(npc.dialogueId)).toBe(true);
    }
  });
});

describe('与 NPC 对话完成 talk 目标', () => {
  it('对话未结束时不计入进度', () => {
    const { world, manager, registry } = setup();
    manager.accept('side_30_hermit_map');
    const session = startTalk(registry, 'ashguard_captain', captainDialogue, world, manager);
    expect(session.runner.finished).toBe(false);
    expect(session.finish()).toEqual([]);
    expect(manager.progressOf('side_30_hermit_map')!.status).toBe('active');
  });

  it('对话结束后完成 talk 目标并返回奖励', () => {
    const { world, manager, registry } = setup();
    manager.accept('side_30_hermit_map');
    const session = startTalk(registry, 'ashguard_captain', captainDialogue, world, manager);

    // 逐句推进直到结束（遇到选项时选第一个）
    let guard = 0;
    while (!session.runner.finished && guard++ < 200) {
      const choices = session.runner.choices();
      if (choices.length > 0) session.runner.choose(choices[0].index);
      else session.runner.advance();
    }
    expect(session.runner.finished).toBe(true);

    const done = session.finish();
    expect(done.map((c) => c.questId)).toContain('side_30_hermit_map');
    expect(manager.progressOf('side_30_hermit_map')!.status).toBe('completed');
    // 同一次对话不会重复上报
    expect(session.finish()).toEqual([]);
  });

  it('对话定义与 NPC 不匹配时报错', () => {
    const { world, manager, registry } = setup();
    const wrong = dialogues.find((d) => d.id !== 'ashguard_captain_intro')!;
    expect(() => startTalk(registry, 'ashguard_captain', wrong, world, manager)).toThrow(NpcError);
  });

  it('未知 NPC 报错', () => {
    const { world, manager, registry } = setup();
    expect(() => startTalk(registry, 'nobody', captainDialogue, world, manager)).toThrow(NpcError);
  });
});

describe('NPC 数据一致性', () => {
  it('NPC 名字与其对话的开场说话人一致', () => {
    for (const npc of npcs) {
      const d = dialogues.find((x) => x.id === npc.dialogueId)!;
      expect(d.nodes[d.start].speaker).toBe(npc.name);
    }
  });

  it('NPC id 唯一，且至少覆盖 20 个 NPC', () => {
    expect(new Set(npcs.map((n) => n.id)).size).toBe(npcs.length);
    expect(npcs.length).toBeGreaterThanOrEqual(20);
  });
});
