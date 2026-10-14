/**
 * 地点注册表：把 data/locations.json 中的地点建立索引，
 * 并提供“玩家抵达某地点”的统一入口，向任务系统上报 reach 事件。
 */
import type { LocationDef } from '../data/schema';
import type { QuestCompletion, QuestManager } from '../narrative/QuestManager';

export class LocationError extends Error {}

export class LocationRegistry {
  private readonly byId: Map<string, LocationDef>;

  constructor(locations: readonly LocationDef[]) {
    this.byId = new Map();
    for (const loc of locations) {
      if (this.byId.has(loc.id)) throw new LocationError(`地点 id 重复：${loc.id}`);
      this.byId.set(loc.id, loc);
    }
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): LocationDef | undefined {
    return this.byId.get(id);
  }

  /** 返回某区域内的所有地点 */
  inRegion(region: string): LocationDef[] {
    return [...this.byId.values()].filter((l) => l.region === region);
  }

  get size(): number {
    return this.byId.size;
  }
}

/**
 * 玩家抵达地点时调用。地点 id 必须已注册，否则抛错，
 * 避免拼写错误导致任务静默失败。
 * 返回本次新完成的任务，由调用方发放奖励。
 */
export function arriveAt(
  registry: LocationRegistry,
  quests: QuestManager,
  locationId: string,
): QuestCompletion[] {
  if (!registry.has(locationId)) {
    throw new LocationError(`未知地点：${locationId}`);
  }
  return quests.report({ type: 'reach', target: locationId });
}
