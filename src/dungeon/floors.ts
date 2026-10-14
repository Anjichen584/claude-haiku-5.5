import type { FloorParams } from './layout';

export interface DungeonFloorFile {
  maxAttempts: number;
  floors: FloorParams[];
}

/** 按楼层号查找参数，超出范围时抛出错误。 */
export function getFloorParams(file: DungeonFloorFile, floor: number): FloorParams {
  const params = file.floors.find((f) => f.floor === floor);
  if (!params) {
    throw new RangeError(`地牢楼层 ${floor} 不存在（共 ${file.floors.length} 层）`);
  }
  return params;
}
