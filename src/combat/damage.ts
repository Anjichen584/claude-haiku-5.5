/**
 * 伤害计算（见 README「战斗」章节）。
 *
 *   最终伤害 = max(1, (攻击力 × 技能倍率 − 防御力 × 0.5) × 元素修正 × 暴击修正 × (1 − 抗性))
 *
 * 纯函数，不依赖 Phaser，便于单元测试。随机暴击由调用方传入随机值，保证可复现。
 */

export type Element = 'none' | 'fire' | 'ice' | 'lightning' | 'dark' | 'holy';

export interface DamageInput {
  attack: number;
  /** 技能倍率，普通攻击为 1 */
  multiplier: number;
  /** 攻击元素 */
  element: Element;
  /** 是否暴击（由调用方根据暴击率掷骰得出） */
  critical: boolean;
  /** Optional equipment-derived multiplier, defaults to 1.5. */
  criticalMultiplier?: number;
}

export interface DefenseProfile {
  defense: number;
  /** 0–1 的元素抗性；未列出的元素视为 0 */
  resistances?: Partial<Record<Element, number>>;
  element?: Element;
}

export const CRIT_MULTIPLIER = 1.5;
export const ELEMENT_ADVANTAGE_BONUS = 1.25;

/** 元素相克表：key 克制 value 中的元素 */
const ADVANTAGE: Readonly<Record<Element, Element | undefined>> = {
  none: undefined,
  fire: 'ice',
  ice: 'lightning',
  lightning: 'fire',
  dark: 'holy',
  holy: 'dark',
};

/** 判断攻击元素是否克制防守方元素 */
export function hasElementAdvantage(attacker: Element, defender?: Element): boolean {
  if (!defender || attacker === 'none') return false;
  return ADVANTAGE[attacker] === defender;
}

export function calculateDamage(input: DamageInput, target: DefenseProfile): number {
  const base = input.attack * input.multiplier - target.defense * 0.5;
  const elementMod = hasElementAdvantage(input.element, target.element) ? ELEMENT_ADVANTAGE_BONUS : 1;
  const critMod = input.critical ? Math.max(1, input.criticalMultiplier ?? CRIT_MULTIPLIER) : 1;
  const resistance = target.resistances?.[input.element] ?? 0;
  const clampedResist = Math.min(1, Math.max(0, resistance));

  const raw = base * elementMod * critMod * (1 - clampedResist);
  return Math.max(1, Math.round(raw));
}
