/**
 * 昼夜周期。一个游戏日约 24 分钟现实时间（见 README）。
 * 纯函数：输入已经过去的毫秒数，输出当前时段与光照强度。
 */

export const DAY_LENGTH_MS = 24 * 60 * 1000;

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface DayState {
  /** 从 1 开始的游戏日编号 */
  day: number;
  /** 当日进度 [0, 1) */
  progress: number;
  phase: TimeOfDay;
  /** 光照强度 [0.25, 1] */
  light: number;
}

const NIGHT_LIGHT = 0.25;

export function getDayState(elapsedMs: number): DayState {
  const total = Math.max(0, elapsedMs);
  const day = Math.floor(total / DAY_LENGTH_MS) + 1;
  const progress = (total % DAY_LENGTH_MS) / DAY_LENGTH_MS;

  let phase: TimeOfDay;
  if (progress < 0.2) phase = 'night';
  else if (progress < 0.3) phase = 'dawn';
  else if (progress < 0.7) phase = 'day';
  else if (progress < 0.8) phase = 'dusk';
  else phase = 'night';

  // 白昼段内光照呈半正弦变化，夜晚保持最低值
  let light = NIGHT_LIGHT;
  if (progress >= 0.2 && progress < 0.8) {
    const t = (progress - 0.2) / 0.6;
    light = NIGHT_LIGHT + (1 - NIGHT_LIGHT) * Math.sin(Math.PI * t);
  }

  return { day, progress, phase, light };
}
