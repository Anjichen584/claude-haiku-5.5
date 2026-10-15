import { describe, expect, it } from 'vitest';
import { RenderSignature } from '../src/ui/renderSignature';
import { QuestManager } from '../src/narrative/QuestManager';
import { WorldState } from '../src/state/WorldState';
import { fromSaveFile, newSession, parseSave, serializeSave, toSaveFile } from '../src/state/session';
import type { QuestDef } from '../src/data/schema';

const quest: QuestDef = {
  id: 'repair-progress', title: 'test', type: 'side', requires: [],
  objectives: [{ type: 'kill', target: 'wolf', text: 'test', count: 3 }],
  rewards: { gold: 5 },
};

describe('retained UI invalidation', () => {
  it('does not invalidate unchanged values across 600 frames', () => {
    const gate = new RenderSignature();
    expect(gate.changed(['cards', { count: 2 }])).toBe(true);
    for (let i = 0; i < 600; i++) expect(gate.changed(['cards', { count: 2 }])).toBe(false);
  });
  it('invalidates content, slot selection and reopen', () => {
    const gate = new RenderSignature();
    expect(gate.changed([['slash'], 0])).toBe(true);
    expect(gate.changed([['slash'], 1])).toBe(true);
    expect(gate.changed([['slash', 'guard'], 1])).toBe(true);
    gate.reset();
    expect(gate.changed([['slash', 'guard'], 1])).toBe(true);
  });
});

describe('quest progress recovery', () => {
  it.each([{progress: []}, {progress: [99, 7]}, {progress: [1]}])('normalizes saved active progress $progress', ({progress}) => {
    const world = new WorldState();
    world.setQuest(quest.id, { status: 'active', progress });
    const manager = new QuestManager([quest], world);
    expect(manager.progressOf(quest.id)?.progress).toEqual([progress[0] === undefined ? 0 : Math.min(3, progress[0])]);
    manager.report({ type: 'kill', target: 'wolf', amount: 3 });
    expect(manager.progressOf(quest.id)).toEqual({ status: 'completed', progress: [3] });
  });
  it('repairs a structurally valid old save, then remains saveable', () => {
    const session = newSession([quest]);
    session.world.setQuest(quest.id, { status: 'active', progress: [] });
    const restored = fromSaveFile(parseSave(serializeSave(toSaveFile(session))), [quest]);
    expect(restored.quests.report({ type: 'kill', target: 'wolf', amount: 3 })).toHaveLength(1);
    expect(() => parseSave(serializeSave(toSaveFile(restored)))).not.toThrow();
    expect(restored.quests.report({ type: 'kill', target: 'wolf' })).toEqual([]);
  });
  it('preserves completed status without reissuing rewards after content changes', () => {
    const world = new WorldState();
    world.setQuest(quest.id, { status: 'completed', progress: [] });
    const manager = new QuestManager([quest], world);
    expect(manager.progressOf(quest.id)).toEqual({ status: 'completed', progress: [3] });
    expect(manager.report({ type: 'kill', target: 'wolf' })).toEqual([]);
  });
  it.each([NaN, Infinity, -1, 0, 1.5])('ignores invalid event amounts: %s', amount => {
    const world = new WorldState();
    const manager = new QuestManager([quest], world);
    manager.accept(quest.id);
    expect(manager.report({ type: 'kill', target: 'wolf', amount })).toEqual([]);
    expect(manager.progressOf(quest.id)?.progress).toEqual([0]);
  });
});
