/**
 * 任务状态机：locked → available → active → completed / failed。
 *
 * - locked：前置任务未全部完成；
 * - available：前置已满足，可以接取；
 * - active：进行中，接收事件并累计进度；
 * - completed：所有目标完成，发放奖励；
 * - failed：被脚本标记失败（例如护送目标死亡）。
 */
import type { QuestDef } from '../data/schema';
import type { QuestRecord, WorldState } from '../state/WorldState';

export interface QuestEvent {
  /** 与 objectives.type 对应：kill、collect、reach、talk、deliver 等 */
  type: string;
  target: string;
  amount?: number;
}

export interface QuestRewards {
  exp?: number;
  gold?: number;
  items?: string[];
}

export interface QuestCompletion {
  questId: string;
  rewards: QuestRewards;
}

export class QuestError extends Error {}

export class QuestManager {
  private defs: Map<string, QuestDef>;

  constructor(
    quests: readonly QuestDef[],
    private world: WorldState,
  ) {
    this.defs = new Map(quests.map((q) => [q.id, q]));
    for (const id of this.defs.keys()) {
      if (!world.getQuest(id)) {
        world.setQuest(id, { status: 'locked', progress: [] });
      }
    }
    this.refreshAvailability();
  }

  def(id: string): QuestDef | undefined {
    return this.defs.get(id);
  }

  /** 前置任务全部完成的 locked 任务变为 available */
  refreshAvailability(): string[] {
    const unlocked: string[] = [];
    for (const def of this.defs.values()) {
      const rec = this.world.getQuest(def.id)!;
      if (rec.status !== 'locked') continue;
      const ready = def.requires.every((r) => this.world.questStatus(r) === 'completed');
      if (ready) {
        this.world.setQuest(def.id, { status: 'available', progress: [] });
        unlocked.push(def.id);
      }
    }
    return unlocked;
  }

  /**
   * 接取所有 available 的任务，返回接取的 id。
   * 原型阶段还没有任务发布 NPC，所以可接取的任务会自动进入进行中。
   */
  acceptAvailable(): string[] {
    const accepted: string[] = [];
    for (const id of this.defs.keys()) {
      if (this.world.questStatus(id) === 'available') {
        this.accept(id);
        accepted.push(id);
      }
    }
    return accepted;
  }

  accept(id: string): void {
    const def = this.requireDef(id);
    const rec = this.world.getQuest(id)!;
    if (rec.status !== 'available') {
      throw new QuestError(`任务 ${id} 当前状态为 ${rec.status}，无法接取`);
    }
    this.world.setQuest(id, { status: 'active', progress: def.objectives.map(() => 0) });
  }

  fail(id: string): void {
    const rec = this.world.getQuest(id);
    if (!rec || rec.status !== 'active') throw new QuestError(`任务 ${id} 不在进行中`);
    this.world.setQuest(id, { ...rec, status: 'failed' });
  }

  /**
   * 上报事件，累计所有进行中任务的相关目标进度。
   * 返回本次新完成的任务（已标记为 completed），由调用方发放奖励。
   */
  report(event: QuestEvent): QuestCompletion[] {
    const completed: QuestCompletion[] = [];
    for (const def of this.defs.values()) {
      const rec = this.world.getQuest(def.id);
      if (!rec || rec.status !== 'active') continue;

      const progress = [...rec.progress];
      let changed = false;
      def.objectives.forEach((obj, i) => {
        if (obj.type !== event.type || obj.target !== event.target) return;
        const need = obj.count ?? 1;
        const next = Math.min(need, progress[i] + (event.amount ?? 1));
        if (next !== progress[i]) {
          progress[i] = next;
          changed = true;
        }
      });
      if (!changed) continue;

      const allDone = def.objectives.every((obj, i) => progress[i] >= (obj.count ?? 1));
      if (allDone) {
        this.world.setQuest(def.id, { status: 'completed', progress });
        completed.push({ questId: def.id, rewards: def.rewards ?? {} });
        this.refreshAvailability();
      } else {
        this.world.setQuest(def.id, { ...rec, progress });
      }
    }
    return completed;
  }

  progressOf(id: string): QuestRecord | undefined {
    return this.world.getQuest(id);
  }

  private requireDef(id: string): QuestDef {
    const def = this.defs.get(id);
    if (!def) throw new QuestError(`未知任务 ${id}`);
    return def;
  }
}
