import { describe, expect, it } from 'vitest';
import { pendingKeyChoice, resolveKeyChoice, type KeyChoiceDef } from '../src/narrative/keyChoices';
import { WorldState } from '../src/state/WorldState';
import type { QuestDef } from '../src/data/schema';

const quests = [
  { id: 'main_04', type: 'main', chapter: 4 },
  { id: 'main_10', type: 'main', chapter: 10 },
] as unknown as QuestDef[];

const choices: KeyChoiceDef[] = [
  {
    id: 'kc4', chapter: 4, question: '核心去向',
    options: [{ id: 'seal', text: '封印', flag: 'sealed' }, { id: 'study', text: '研究', flag: 'studied' }],
  },
  {
    id: 'kc10', chapter: 10, question: '是否结盟',
    options: [{ id: 'accept', text: '签约', flag: 'pact' }, { id: 'refuse', text: '拒绝', flag: 'refused' }],
  },
];

function completeQuest(w: WorldState, id: string): void {
  w.setQuest(id, { status: 'completed', progress: [] });
}

describe('关键抉择', () => {
  it('章节主线未完成时没有待选抉择', () => {
    const w = new WorldState();
    expect(pendingKeyChoice(choices, quests, w)).toBeUndefined();
  });

  it('主线完成后出现对应抉择，并按章节顺序返回', () => {
    const w = new WorldState();
    completeQuest(w, 'main_10');
    completeQuest(w, 'main_04');
    expect(pendingKeyChoice(choices, quests, w)?.id).toBe('kc4');
  });

  it('选择后写入标记，抉择消失，下一个待选出现', () => {
    const w = new WorldState();
    completeQuest(w, 'main_04');
    completeQuest(w, 'main_10');
    const first = pendingKeyChoice(choices, quests, w)!;
    resolveKeyChoice(first, 'seal', w);
    expect(w.hasFlag('sealed')).toBe(true);
    expect(pendingKeyChoice(choices, quests, w)?.id).toBe('kc10');
  });

  it('同一抉择不能选两次，选项不存在时报错', () => {
    const w = new WorldState();
    const c = choices[0];
    resolveKeyChoice(c, 'seal', w);
    expect(() => resolveKeyChoice(c, 'study', w)).toThrow();
    expect(() => resolveKeyChoice(choices[1], 'nope', w)).toThrow(RangeError);
  });

  it('选择状态会随存档保存（标记持久化）', () => {
    const w = new WorldState();
    resolveKeyChoice(choices[0], 'study', w);
    const restored = WorldState.restore(w.snapshot());
    expect(restored.hasFlag('studied')).toBe(true);
    expect(pendingKeyChoice(choices, [{ id: 'main_04', type: 'main', chapter: 4 }] as unknown as QuestDef[], restored)).toBeUndefined();
  });
});
