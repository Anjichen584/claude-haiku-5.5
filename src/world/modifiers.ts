/**
 * 昼夜与天气对地表的影响（纯逻辑，不依赖 Phaser）。
 *
 * - 视野：白天 12 格；夜晚与黄昏变暗，天气也会缩短视野。只有视野内的敌人刷新点会显示；
 * - 侦测：夜晚敌人察觉玩家的距离变大，遭遇会更早发生。
 */
import type { TimeOfDay } from './time';
import type { Weather } from './weather';

export const BASE_SIGHT_TILES = 12;

/** 天气对视野的倍率 */
export const WEATHER_SIGHT: Readonly<Record<Weather, number>> = {
  clear: 1,
  rain: 0.8,
  thunder: 0.7,
  snowstorm: 0.6,
  sandstorm: 0.5,
  fog: 0.4,
};

/** 时段对视野的倍率 */
export const PHASE_SIGHT: Readonly<Record<TimeOfDay, number>> = {
  day: 1,
  dawn: 0.8,
  dusk: 0.7,
  night: 0.6,
};

/** 夜晚侦测距离倍率 */
export const NIGHT_DETECT_MULTIPLIER = 1.5;

/** 视野半径（格）。至少保留 3 格，避免完全看不见。 */
export function sightRadius(phase: TimeOfDay, weather: Weather): number {
  return Math.max(3, BASE_SIGHT_TILES * PHASE_SIGHT[phase] * WEATHER_SIGHT[weather]);
}

/** 敌人侦测距离的倍率（夜晚更大）。 */
export function detectMultiplier(phase: TimeOfDay): number {
  return phase === 'night' ? NIGHT_DETECT_MULTIPLIER : 1;
}
