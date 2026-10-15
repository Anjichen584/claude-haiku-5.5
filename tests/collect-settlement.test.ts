import {describe, expect, it} from 'vitest';
import type {QuestDef} from '../src/data/schema';
import {QuestManager} from '../src/narrative/QuestManager';
import {WorldState} from '../src/state/WorldState';

const collect: QuestDef = {
  id: 'collect', title: 'Collect', type: 'main', chapter: 1, requires: [],
  objectives: [{type: 'collect', target: 'shard', text: 'Collect shards', count: 2}],
  rewards: {gold: 25},
};

function restored(def: QuestDef, progress: number[]) {
  const world = new WorldState();
  world.setQuest(def.id, {status: 'active', progress});
  const next: QuestDef = {...collect, id: 'next', requires: [def.id]};
  return {world, manager: new QuestManager([def, next], world)};
}

describe('collection settlement after restoring capped progress', () => {
  it.each([0, 2, 5])('settles once with %i shards still in inventory', count => {
    const {world, manager} = restored(collect, [2]);
    world.addItem('shard', count);
    expect(manager.syncCollect()).toEqual([{questId: 'collect', rewards: {gold: 25}}]);
    expect(world.questStatus('collect')).toBe('completed');
    expect(world.questStatus('next')).toBe('available');
    expect(manager.syncCollect()).toEqual([]);
    expect(world.getItemCount('shard')).toBe(count);
  });

  it('still requires NPC delivery for mixed objectives', () => {
    const def: QuestDef = {...collect, objectives: [...collect.objectives, {type: 'talk', target: 'npc', text: 'Deliver'}]};
    const {world, manager} = restored(def, [2, 0]);
    expect(manager.syncCollect()).toEqual([]);
    expect(world.questStatus('collect')).toBe('active');
    expect(manager.report({type: 'talk', target: 'npc'})).toHaveLength(1);
    expect(manager.syncCollect()).toEqual([]);
  });

  it('does not settle unrelated capped kill quests during inventory sync', () => {
    const def: QuestDef = {...collect, objectives: [{type: 'kill', target: 'wolf', text: 'Kill', count: 2}]};
    const {world, manager} = restored(def, [2]);
    expect(manager.syncCollect()).toEqual([]);
    expect(world.questStatus('collect')).toBe('active');
  });
});
