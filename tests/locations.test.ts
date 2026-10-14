import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import locationsJson from '../data/locations.json';
import npcsJson from '../data/npcs.json';
import type { LocationDef, QuestDef } from '../src/data/schema';
import { WorldState } from '../src/state/WorldState';
import { QuestManager } from '../src/narrative/QuestManager';
import { LocationError, LocationRegistry, arriveAt } from '../src/world/locations';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;
const locations = (locationsJson as unknown as { locations: LocationDef[] }).locations;
const npcs = (npcsJson as unknown as { npcs: { id: string }[] }).npcs;

function newGame(list: QuestDef[] = quests) {
  const world = new WorldState();
  const manager = new QuestManager(list, world);
  return { world, manager, registry: new LocationRegistry(locations) };
}

describe('地点注册表', () => {
  it('拒绝重复的地点 id', () => {
    expect(() => new LocationRegistry([locations[0], locations[0]])).toThrow(LocationError);
  });

  it('按区域查询地点', () => {
    const reg = new LocationRegistry(locations);
    const sand = reg.inRegion('沙丘');
    expect(sand.length).toBeGreaterThan(0);
    expect(sand.every((l) => l.region === '沙丘')).toBe(true);
  });
});

describe('抵达地点触发 reach 目标', () => {
  it('抵达地点后，reach 进度增加，并与其他目标合并判定完成（末尾需交付 NPC）', () => {
    // side_60_ash_archive：reach ash_archive + collect rift_shard ×2
    const { manager, registry } = newGame();
    manager.accept('side_60_ash_archive');

    arriveAt(registry, manager, 'ash_archive');
    expect(manager.progressOf('side_60_ash_archive')!.progress[0]).toBe(1);
    expect(manager.progressOf('side_60_ash_archive')!.status).toBe('active');

    manager.report({ type: 'collect', target: 'rift_shard', amount: 2 });
    // 任务末尾需要回到 NPC 交付（talk 目标）
    expect(manager.progressOf('side_60_ash_archive')!.status).toBe('active');
    const done = manager.report({ type: 'talk', target: 'npc_side_60_archive_keeper' });
    expect(done.map((c) => c.questId)).toContain('side_60_ash_archive');
    expect(manager.progressOf('side_60_ash_archive')!.status).toBe('completed');
  });

  it('抵达其他地点不会推进该任务', () => {
    const { manager, registry } = newGame();
    manager.accept('side_60_ash_archive');
    arriveAt(registry, manager, 'snow_gate');
    expect(manager.progressOf('side_60_ash_archive')!.progress[0]).toBe(0);
  });

  it('未知地点直接抛错，而不是静默失败', () => {
    const { manager, registry } = newGame();
    expect(() => arriveAt(registry, manager, 'no_such_place')).toThrow(LocationError);
  });
});

describe('真实数据的引用完整性', () => {
  it('每个 reach 目标都是已注册地点', () => {
    const reg = new LocationRegistry(locations);
    const missing = quests.flatMap((q) =>
      q.objectives.filter((o) => o.type === 'reach' && !reg.has(o.target)).map((o) => `${q.id}:${o.target}`),
    );
    expect(missing).toEqual([]);
  });

  it('每个 talk 目标都是已登记的 NPC', () => {
    const ids = new Set(npcs.map((n) => n.id));
    const missing = quests.flatMap((q) =>
      q.objectives.filter((o) => o.type === 'talk' && !ids.has(o.target)).map((o) => `${q.id}:${o.target}`),
    );
    expect(missing).toEqual([]);
  });
});
