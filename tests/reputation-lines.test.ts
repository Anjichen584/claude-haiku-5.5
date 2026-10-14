import { describe, expect, it } from 'vitest';
import { reputationLines, TIER_LABEL } from '../src/factions/reputation';
import { WorldState } from '../src/state/WorldState';
import type { FactionDef } from '../src/data/schema';

const factions: FactionDef[] = [
  { id: 'ashguard', name: '灰烬守望会', rivals: ['rift_institute'] },
  { id: 'rift_institute', name: '裂隙研究所', rivals: ['ashguard'] },
];

describe('声望面板文本', () => {
  it('每个阵营一行，显示档位与带符号的数值', () => {
    const w = new WorldState();
    w.addReputation('ashguard', 25);
    expect(reputationLines(w, factions)).toEqual([
      `灰烬守望会：${TIER_LABEL.friendly}（+25）`,
      `裂隙研究所：${TIER_LABEL.neutral}（0）`,
    ]);
  });

  it('负数声望显示为敌对或冷淡', () => {
    const w = new WorldState();
    w.addReputation('ashguard', -60);
    expect(reputationLines(w, factions)[0]).toBe(`灰烬守望会：${TIER_LABEL.hostile}（-60）`);
  });
});
