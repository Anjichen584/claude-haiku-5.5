import { Rng, hashSeed } from '../core/Rng';
import type { RoomKind } from './layout';

/** 房间模板：决定房间的瓦片尺寸与布局风格。 */
export interface RoomTemplate {
  id: string;
  kind: RoomKind;
  width: number;
  height: number;
  weight: number;
}

export interface RoomTemplateFile {
  templates: RoomTemplate[];
}

export interface PlacedRoom {
  roomId: number;
  template: RoomTemplate;
}

/**
 * 为每个房间选择模板。同一 (seed, floor, roomId) 的选择结果稳定。
 * 没有对应类型的模板时抛出错误，避免生成出没有外观的房间。
 */
export function assignTemplates(
  rooms: ReadonlyArray<{ id: number; kind: RoomKind }>,
  library: RoomTemplateFile,
  seed: number,
  floor: number,
): PlacedRoom[] {
  return rooms.map((room) => {
    const candidates = library.templates.filter((t) => t.kind === room.kind);
    if (candidates.length === 0) {
      throw new Error(`缺少房间类型 "${room.kind}" 的模板`);
    }
    const rng = new Rng(hashSeed('template', seed, floor, room.id));
    const template = rng.weighted(candidates.map((t) => ({ value: t, weight: t.weight })));
    return { roomId: room.id, template };
  });
}
