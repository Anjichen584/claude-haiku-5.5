/**
 * 主线通关检查（真实数据）：按章节顺序完成 24 个主线任务的每一个目标，
 * 检查每章都能完成、并且能走到第 24 章。
 * 这里模拟的是游戏上报事件的方式：击杀、抵达地点、持有物品（收集）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { QuestManager } from '../src/narrative/QuestManager';
import { WorldState } from '../src/state/WorldState';
import type { QuestDef } from '../src/data/schema';

const quests = (JSON.parse(readFileSync('data/quests.json', 'utf8')) as { quests: QuestDef[] }).quests;
const main = quests.filter((q) => q.type === 'main').sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));

describe('主线通关检查', () => {
  it('24 个主线任务都可以按顺序完成', () => {
    const world = new WorldState();
    const qm = new QuestManager(quests, world);
    qm.acceptAvailable((d) => d.type === 'main');
    const finished: string[] = [];

    for (const def of main) {
      expect(world.questStatus(def.id), `${def.id} 应已接取`).toBe('active');
      for (const obj of def.objectives) {
        const count = obj.count ?? 1;
        if (obj.type === 'kill') {
          qm.report({ type: 'kill', target: obj.target, amount: count });
        } else if (obj.type === 'reach') {
          qm.report({ type: 'reach', target: obj.target });
        } else if (obj.type === 'collect') {
          world.addItem(obj.target!, count);
          qm.syncCollect();
        } else {
          throw new Error(`${def.id} 出现未处理的目标类型：${obj.type}`);
        }
      }
      expect(world.questStatus(def.id), `${def.id} 应已完成`).toBe('completed');
      finished.push(def.id);
      qm.acceptAvailable((d) => d.type === 'main');
    }

    expect(finished.length).toBe(24);
    expect(finished[finished.length - 1]).toBe('main_24');
  });

  it('收集目标：已经持有的物品会在同步时直接计入', () => {
    const world = new WorldState();
    const qm = new QuestManager(quests, world);
    world.addItem('rift_shard', 10);
    qm.acceptAvailable((d) => d.id === 'main_02_ash_road' || d.id === 'main_01_first_rift');
    // 先完成第 1 章击杀
    const first = main[0];
    for (const obj of first.objectives) qm.report({ type: 'kill', target: obj.target, amount: obj.count ?? 1 });
    qm.acceptAvailable((d) => d.id === 'main_02_ash_road');
    const done = qm.syncCollect();
    expect(done.map((c) => c.questId)).toEqual([]); // 第 2 章还有“抵达”目标
    qm.report({ type: 'reach', target: 'ash_road_camp' });
    expect(world.questStatus('main_02_ash_road')).toBe('completed');
  });
});
