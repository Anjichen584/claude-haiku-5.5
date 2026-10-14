import { describe, expect, it } from 'vitest';
import questsJson from '../data/quests.json';
import type { QuestDef } from '../src/data/schema';
import {
  PLAYER_MAX_HP,
  SAVE_VERSION,
  SaveError,
  fromSaveFile,
  newSession,
  parseSave,
  serializeSave,
  toSaveFile,
} from '../src/state/session';

const quests = (questsJson as unknown as { quests: QuestDef[] }).quests;

describe('新会话', () => {
  it('出生在原点、满血，只有没有前置的任务可接取', () => {
    const s = newSession(quests);
    expect(s.player).toEqual({ tileX: 0, tileY: 0, hp: PLAYER_MAX_HP });
    expect(s.world.questStatus('main_01_first_rift')).toBe('available');
    expect(s.world.questStatus('main_02_ash_road')).toBe('locked');
  });
});

describe('存档往返', () => {
  it('保存后再读取，世界、位置、访问与击败记录完全一致', () => {
    const s = newSession(quests);
    s.quests.accept('main_01_first_rift');
    s.quests.report({ type: 'kill', target: 'ash_wolf', amount: 2 });
    s.world.setFlag('met_guide');
    s.world.addReputation('ashguard', 15);
    s.world.addStability(-7);
    s.player = { tileX: 120, tileY: -33, hp: 64 };
    s.elapsedMs = 98765;
    s.visited.add('ash_road');
    s.defeated.add('0,0,1');

    const raw = serializeSave(toSaveFile(s, new Date('2026-10-14T10:00:00Z')));
    const loaded = fromSaveFile(parseSave(raw), quests);

    expect(loaded.player).toEqual(s.player);
    expect(loaded.elapsedMs).toBe(98765);
    expect([...loaded.visited]).toEqual(['ash_road']);
    expect([...loaded.defeated]).toEqual(['0,0,1']);
    expect(loaded.world.snapshot()).toEqual(s.world.snapshot());
    expect(loaded.world.getQuest('main_01_first_rift')?.progress).toEqual([2]);
  });

  it('存档包含版本号与保存时间', () => {
    const file = toSaveFile(newSession(quests), new Date('2026-10-14T10:00:00Z'));
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.savedAt).toBe('2026-10-14T10:00:00.000Z');
  });
});

describe('存档校验', () => {
  const valid = () => JSON.parse(serializeSave(toSaveFile(newSession(quests))));

  it('拒绝非法 JSON', () => {
    expect(() => parseSave('{not json')).toThrow(SaveError);
  });

  it('拒绝版本不匹配的存档', () => {
    expect(() => parseSave(JSON.stringify({ ...valid(), version: 999 }))).toThrow(/版本/);
  });

  it('拒绝生命值越界', () => {
    const data = valid();
    data.player.hp = PLAYER_MAX_HP + 1;
    expect(() => parseSave(JSON.stringify(data))).toThrow(/生命值/);
  });

  it('拒绝缺少世界状态的存档', () => {
    const data = valid();
    delete data.world;
    expect(() => parseSave(JSON.stringify(data))).toThrow(SaveError);
  });

  it('拒绝记录类型错误的存档', () => {
    const data = valid();
    data.defeated = [1, 2];
    expect(() => parseSave(JSON.stringify(data))).toThrow(SaveError);
  });
});
