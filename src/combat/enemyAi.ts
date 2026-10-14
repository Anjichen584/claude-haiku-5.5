/**
 * 基础敌人 AI（纯逻辑）。状态：巡逻 → 追击 → 攻击，失去目标后回到巡逻。
 * 场景每帧调用 decide()，根据返回的动作执行移动或攻击。
 */

export type EnemyState = 'patrol' | 'chase' | 'attack';

export interface EnemyBrain {
  state: EnemyState;
  /** 攻击冷却剩余时间（毫秒） */
  attackCooldownMs: number;
}

export interface EnemyAiConfig {
  /** 发现玩家的距离（像素） */
  aggroRange: number;
  /** 丢失玩家的距离（像素），应大于 aggroRange，避免抖动 */
  leashRange: number;
  /** 进入攻击的距离（像素） */
  attackRange: number;
  attackCooldownMs: number;
}

export interface EnemyAiInput {
  distanceToPlayer: number;
  deltaMs: number;
}

export interface EnemyAiDecision {
  state: EnemyState;
  /** 本帧是否触发攻击（攻击状态且冷却结束） */
  shouldAttack: boolean;
  /** 是否应朝玩家移动 */
  moveTowardPlayer: boolean;
}

export function createEnemyBrain(): EnemyBrain {
  return { state: 'patrol', attackCooldownMs: 0 };
}

export function decideEnemyAction(
  brain: EnemyBrain,
  config: EnemyAiConfig,
  input: EnemyAiInput,
): EnemyAiDecision {
  brain.attackCooldownMs = Math.max(0, brain.attackCooldownMs - input.deltaMs);
  const d = input.distanceToPlayer;

  if (brain.state === 'patrol') {
    if (d <= config.aggroRange) brain.state = 'chase';
  } else if (d > config.leashRange) {
    brain.state = 'patrol';
  } else if (d <= config.attackRange) {
    brain.state = 'attack';
  } else {
    brain.state = 'chase';
  }

  let shouldAttack = false;
  if (brain.state === 'attack' && brain.attackCooldownMs === 0) {
    shouldAttack = true;
    brain.attackCooldownMs = config.attackCooldownMs;
  }

  return {
    state: brain.state,
    shouldAttack,
    moveTowardPlayer: brain.state === 'chase',
  };
}
