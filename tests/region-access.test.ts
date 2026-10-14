import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { blockReason, type RegionGate } from '../src/factions/regionAccess';
import { TIER_LABEL } from '../src/factions/reputation';
import { QuestManager } from '../src/narrative/QuestManager';
import { grantQuestRewards } from '../src/state/rewards';
import { newSession } from '../src/state/session';
import { WorldState } from '../src/state/WorldState';
import type { FactionDef, QuestDef } from '../src/data/schema';

const read = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
const factions = read<{ factions: FactionDef[] }>('data/factions.json').factions;
const gates = read<{ gates: RegionGate[] }>('data/region-gates.json').gates;
const quests = read<{ quests: QuestDef[] }>('data/quests.json').quests;
const locations = read<{ locations: Array<{ id: string; region: string }> }>('data/locations.json').locations;
const regionOf = new Map(locations.map((l) => [l.id, l.region]));

describe('区域门槛', () => {
  it('没有门槛的区域总是可以进入', () => {
    expect(blockReason(new WorldState(), '灰烬之路', gates, factions)).toBeNull();
  });

  it('声望不足时给出提示，包含阵营名与所需档位', () => {
    const w = new WorldState();
    const reason = blockReason(w, '泥沼', gates, factions);
    expect(reason).not.toBeNull();
    expect(reason).toContain('赤潮商盟');
    expect(reason).toContain(TIER_LABEL.friendly);
  });

  it('声望达到要求后解锁', () => {
    const w = new WorldState();
    w.addReputation('red_tide', 10);
    expect(blockReason(w, '泥沼', gates, factions)).toBeNull();
  });

  it('门槛引用的阵营和区域必须存在', () => {
    const factionIds = new Set(factions.map((f) => f.id));
    const regions = new Set(locations.map((l) => l.region));
    for (const g of gates) {
      expect(factionIds.has(g.faction), `未知阵营 ${g.faction}`).toBe(true);
      expect(regions.has(g.region), `未知区域 ${g.region}`).toBe(true);
    }
  });

  it('主线不会被门槛卡住：每个主线抵达点，在主线需要它时门槛已经解锁', () => {
    const session = newSession(quests);
    const qm = new QuestManager(quests, session.world);
    const main = quests.filter((q) => q.type === 'main').sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
    qm.acceptAvailable((d) => d.type === 'main');

    for (const def of main) {
      for (const obj of def.objectives) {
        if (obj.type !== 'reach') continue;
        const region = regionOf.get(obj.target!);
        const reason = region ? blockReason(session.world, region, gates, factions) : null;
        expect(reason, `${def.id} 抵达 ${obj.target} 时被门槛拦住`).toBeNull();
      }
      // 按主线进度处理：先上报目标，再发奖励（奖励决定之后的声望）
      for (const obj of def.objectives) {
        const count = obj.count ?? 1;
        if (obj.type === 'kill') qm.report({ type: 'kill', target: obj.target, amount: count });
        else if (obj.type === 'reach') qm.report({ type: 'reach', target: obj.target });
        else if (obj.type === 'collect') {
          session.world.addItem(obj.target!, count);
          qm.syncCollect();
        }
      }
      grantQuestRewards(session, [{ questId: def.id, rewards: def.rewards ?? {} } as never], (id) => id, (id) => id);
      qm.acceptAvailable((d) => d.type === 'main');
    }
  });
});
