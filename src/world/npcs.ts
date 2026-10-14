/**
 * NPC 对话：开始对话，并在对话真正结束后向任务系统上报 talk 事件。
 * 中途关闭对话不会计入任务进度。
 */
import type { DialogueDef, NpcDef } from '../data/schema';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import type { QuestCompletion, QuestManager } from '../narrative/QuestManager';
import type { WorldState } from '../state/WorldState';

export class NpcError extends Error {}

export class NpcRegistry {
  private readonly byId: Map<string, NpcDef>;

  constructor(npcs: readonly NpcDef[]) {
    this.byId = new Map();
    for (const npc of npcs) {
      if (this.byId.has(npc.id)) throw new NpcError(`NPC id 重复：${npc.id}`);
      this.byId.set(npc.id, npc);
    }
  }

  get(id: string): NpcDef | undefined {
    return this.byId.get(id);
  }

  /** 位于某地点的 NPC */
  atLocation(locationId: string): NpcDef[] {
    return [...this.byId.values()].filter((n) => n.location === locationId);
  }

  list(): NpcDef[] {
    return [...this.byId.values()];
  }
}

/** 一次对话会话：包装 DialogueRunner，结束时上报 talk 事件。 */
export class TalkSession {
  readonly runner: DialogueRunner;
  private reported = false;

  constructor(
    readonly npcId: string,
    dialogue: DialogueDef,
    world: WorldState,
    private readonly quests: QuestManager,
  ) {
    this.runner = new DialogueRunner(dialogue, world);
  }

  /** 对话结束后调用；返回本次新完成的任务。未结束时返回空数组。 */
  finish(): QuestCompletion[] {
    if (!this.runner.finished || this.reported) return [];
    this.reported = true;
    return this.quests.report({ type: 'talk', target: this.npcId });
  }
}

/** 与 NPC 开始对话。对话定义由调用方从数据中查找后传入。 */
export function startTalk(
  registry: NpcRegistry,
  npcId: string,
  dialogue: DialogueDef,
  world: WorldState,
  quests: QuestManager,
): TalkSession {
  const npc = registry.get(npcId);
  if (!npc) throw new NpcError(`未知 NPC：${npcId}`);
  if (dialogue.id !== npc.dialogueId) {
    throw new NpcError(`NPC ${npcId} 的对话应为 ${npc.dialogueId}，而不是 ${dialogue.id}`);
  }
  return new TalkSession(npcId, dialogue, world, quests);
}
