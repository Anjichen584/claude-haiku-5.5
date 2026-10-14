import {SaveRepository,type SaveRead} from './saveRepository';
/**
 * 当前会话、当前地牢探索与浏览器存档（localStorage）。
 * 场景之间通过这里共享同一个会话对象；存档读写失败时返回 null，不抛出异常。
 */
import { activeDungeon } from '../dungeon/checkpoint';
import type { DungeonRun } from '../dungeon/run';
import { serializeSave, toSaveFile, type GameSession } from './session';


let current: GameSession | null = null;


export function getSession(): GameSession | null {
  return current;
}

export function setSession(session: GameSession | null): void {
  current = session;
}

export function getRun(): DungeonRun | null {
  return activeDungeon(current?.dungeon);
}

export function setRun(run: DungeonRun | null): void {
  if(!current)return;
  if(!current.dungeon){if(!run)return;current.dungeon={activeFloor:null,runs:[]};}
  if(run){const at=current.dungeon.runs.findIndex(r=>r.floor===run.floor);if(at<0)current.dungeon.runs.push(run);else current.dungeon.runs[at]=run;}
  current.dungeon.activeFloor=run?.floor??null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSaveState():SaveRead{return new SaveRepository(storage()).read();}
export function readSaveRaw():string|null{return readSaveState().raw;}

/** Save failure is reported, never silently replace known-good progress with malformed data. */
export function writeSaveRaw(raw:string):boolean{return new SaveRepository(storage()).write(raw);}

/** 把会话写入浏览器存档。返回是否写入成功。 */
export function persistSession(session: GameSession): boolean {
  try{return writeSaveRaw(serializeSave(toSaveFile(session)));}catch{return false;}
}
