import { describe, expect, it } from 'vitest';
import factionsJson from '../data/factions.json';
import endingsJson from '../data/endings.json';
import type { EndingDef, FactionDef } from '../src/data/schema';
import { WorldState } from '../src/state/WorldState';
import {
  canEnter,
  changeReputation,
  priceMultiplier,
  tierOf,
} from '../src/factions/reputation';
import { resolveEnding } from '../src/endings/EndingResolver';

const factions = (factionsJson as { factions: FactionDef[] }).factions;
const endings = (endingsJson as { endings: EndingDef[] }).endings;

describe('声望档位', () => {
  it('档位边界正确', () => {
    expect(tierOf(-100)).toBe('hostile');
    expect(tierOf(-50)).toBe('hostile');
    expect(tierOf(-49)).toBe('cold');
    expect(tierOf(-10)).toBe('cold');
    expect(tierOf(-9)).toBe('neutral');
    expect(tierOf(9)).toBe('neutral');
    expect(tierOf(10)).toBe('friendly');
    expect(tierOf(49)).toBe('friendly');
    expect(tierOf(50)).toBe('trusted');
    expect(tierOf(100)).toBe('trusted');
  });

  it('档位越高价格越低', () => {
    const w = new WorldState();
    w.addReputation('red_tide', 60);
    expect(priceMultiplier(w, 'red_tide')).toBe(0.9);
    w.addReputation('wild_tribes', -70);
    expect(priceMultiplier(w, 'wild_tribes')).toBe(1.3);
  });

  it('区域进入条件按档位判断', () => {
    const w = new WorldState();
    w.addReputation('ashguard', 15);
    expect(canEnter(w, { faction: 'ashguard', minTier: 'friendly' })).toBe(true);
    expect(canEnter(w, { faction: 'ashguard', minTier: 'trusted' })).toBe(false);
  });
});

describe('敌对阵营联动', () => {
  it('提升声望时，敌对阵营按 50% 同步下降', () => {
    const w = new WorldState();
    changeReputation(w, factions, 'ashguard', 20);
    expect(w.getReputation('ashguard')).toBe(20);
    expect(w.getReputation('rift_institute')).toBe(-10);
  });

  it('降低声望时不影响敌对阵营', () => {
    const w = new WorldState();
    w.addReputation('rift_institute', 30);
    changeReputation(w, factions, 'ashguard', -20);
    expect(w.getReputation('rift_institute')).toBe(30);
  });

  it('没有敌对阵营的阵营不会产生联动', () => {
    const w = new WorldState();
    const changes = changeReputation(w, factions, 'red_tide', 30);
    expect(changes).toHaveLength(1);
  });

  it('未知阵营会报错，敌对关系在数据中是对称的', () => {
    expect(() => changeReputation(new WorldState(), factions, 'nobody', 1)).toThrow(RangeError);
    for (const f of factions) {
      for (const r of f.rivals) {
        expect(factions.find((x) => x.id === r)!.rivals).toContain(f.id);
      }
    }
  });
});

describe('裂隙稳定度', () => {
  it('稳定度被限制在 0–100 之间', () => {
    const w = new WorldState();
    expect(w.stability).toBe(50);
    expect(w.addStability(80)).toBe(100);
    expect(w.addStability(-300)).toBe(0);
  });

  it('旧存档缺少稳定度字段时使用默认值 50', () => {
    const snap = new WorldState().snapshot();
    delete (snap as { stability?: number }).stability;
    expect(WorldState.restore(snap).stability).toBe(50);
  });
});

describe('结局判定', () => {
  function stateWith(setup: (w: WorldState) => void): WorldState {
    const w = new WorldState();
    setup(w);
    return w;
  }

  it('每个结局都有一条可复现的判定路径', () => {
    const paths: Record<string, (w: WorldState) => void> = {
      ending_guardian: (w) => {
        w.setFlag('sealed_rift_core');
        w.addReputation('ashguard', 80);
        w.addStability(40);
      },
      ending_scholar: (w) => {
        w.setFlag('studied_rift_core');
        w.addReputation('rift_institute', 80);
      },
      ending_merchant: (w) => {
        w.addReputation('red_tide', 80);
        w.addItem('rift_shard', 20);
      },
      ending_chieftain: (w) => {
        w.addReputation('wild_tribes', 80);
        w.addStability(-20);
      },
      ending_emperor: (w) => {
        w.setFlag('sealed_rift_core');
        w.addReputation('remnant_empire', 80);
      },
      ending_rift_born: (w) => {
        w.setFlag('hidden_whisper_heard');
        w.addStability(-40);
      },
      ending_default: () => {},
    };
    for (const [id, setup] of Object.entries(paths)) {
      const result = resolveEnding(endings, stateWith(setup));
      expect(result?.id, `结局 ${id} 的路径判定失败`).toBe(id);
    }
  });

  it('多个结局同时满足时，优先级数值最小者胜出', () => {
    const w = stateWith((s) => {
      s.setFlag('sealed_rift_core');
      s.addReputation('ashguard', 80);
      s.addStability(40);
      s.addReputation('red_tide', 80);
      s.addItem('rift_shard', 20);
    });
    expect(resolveEnding(endings, w)?.id).toBe('ending_guardian');
  });

  it('稳定度处于中间值时不会误判为荒原或裂隙结局', () => {
    const w = stateWith((s) => s.addReputation('wild_tribes', 80));
    expect(resolveEnding(endings, w)?.id).toBe('ending_default');
  });
});
