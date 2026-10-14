/**
 * 世界状态：标记、阵营声望、任务记录、背包物品数量。
 * 所有叙事判断（对话条件、任务依赖、结局）都只读取这里的数据。
 * 支持序列化，供阶段 8 的存档系统使用。
 */

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed';

export interface QuestRecord {
  status: QuestStatus;
  /** 每个目标当前的进度，与 quests.json 中 objectives 的顺序一致 */
  progress: number[];
}

export interface WorldSnapshot {
  flags: string[];
  reputation: Record<string, number>;
  quests: Record<string, QuestRecord>;
  inventory: Record<string, number>;
  /** 裂隙稳定度 0–100，缺省为 50（旧存档兼容） */
  stability?: number;
}

export class WorldState {
  private flags = new Set<string>();
  private reputation = new Map<string, number>();
  private quests = new Map<string, QuestRecord>();
  private inventory = new Map<string, number>();
  private _stability = 50;

  // ---- 裂隙稳定度（0–100） ----
  get stability(): number {
    return this._stability;
  }
  addStability(delta: number): number {
    this._stability = Math.max(0, Math.min(100, this._stability + delta));
    return this._stability;
  }

  // ---- 标记 ----
  hasFlag(flag: string): boolean {
    return this.flags.has(flag);
  }
  setFlag(flag: string): void {
    this.flags.add(flag);
  }
  clearFlag(flag: string): void {
    this.flags.delete(flag);
  }

  // ---- 声望（范围 −100 到 +100） ----
  getReputation(faction: string): number {
    return this.reputation.get(faction) ?? 0;
  }
  addReputation(faction: string, delta: number): number {
    const next = Math.max(-100, Math.min(100, this.getReputation(faction) + delta));
    this.reputation.set(faction, next);
    return next;
  }

  // ---- 任务记录 ----
  getQuest(id: string): QuestRecord | undefined {
    return this.quests.get(id);
  }
  setQuest(id: string, record: QuestRecord): void {
    this.quests.set(id, record);
  }
  questStatus(id: string): QuestStatus {
    return this.quests.get(id)?.status ?? 'locked';
  }

  // ---- 背包（仅统计数量，物品细节由 items.json 定义） ----
  getItemCount(itemId: string): number {
    return this.inventory.get(itemId) ?? 0;
  }
  addItem(itemId: string, count: number): number {
    const next = this.getItemCount(itemId) + count;
    this.inventory.set(itemId, Math.max(0, next));
    return this.getItemCount(itemId);
  }

  // ---- 序列化 ----
  snapshot(): WorldSnapshot {
    return {
      flags: [...this.flags].sort(),
      reputation: Object.fromEntries([...this.reputation].sort()),
      quests: Object.fromEntries([...this.quests].sort(([a], [b]) => a.localeCompare(b)).map(([id,r])=>[id,{status:r.status,progress:[...r.progress]}])),
      inventory: Object.fromEntries([...this.inventory].sort()),
      stability: this._stability,
    };
  }

  static restore(snapshot: WorldSnapshot): WorldState {
    const world = new WorldState();
    snapshot.flags.forEach((f) => world.flags.add(f));
    Object.entries(snapshot.reputation).forEach(([k, v]) => world.reputation.set(k, v));
    Object.entries(snapshot.quests).forEach(([k, v]) => world.quests.set(k, {status:v.status,progress:[...v.progress]}));
    Object.entries(snapshot.inventory).forEach(([k, v]) => world.inventory.set(k, v));
    world._stability = snapshot.stability ?? 50;
    return world;
  }
}
