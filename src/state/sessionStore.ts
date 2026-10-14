/**
 * 当前会话与浏览器存档（localStorage）。
 * 场景之间通过这里共享同一个会话对象；存档读写失败时返回 null，不抛出异常。
 */
import { serializeSave, toSaveFile, type GameSession } from './session';

const SAVE_KEY = 'rift-chronicles-save-v1';

let current: GameSession | null = null;

export function getSession(): GameSession | null {
  return current;
}

export function setSession(session: GameSession | null): void {
  current = session;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSaveRaw(): string | null {
  try {
    return storage()?.getItem(SAVE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** 写入失败（配额满、隐私模式等）时返回 false，由界面提示玩家。 */
export function writeSaveRaw(raw: string): boolean {
  try {
    storage()?.setItem(SAVE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** 把会话写入浏览器存档。返回是否写入成功。 */
export function persistSession(session: GameSession): boolean {
  return writeSaveRaw(serializeSave(toSaveFile(session)));
}
