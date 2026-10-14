import { describe, expect, it } from 'vitest';
import { Actor } from '../src/combat/Actor';
import { calculateDamage, hasElementAdvantage, CRIT_MULTIPLIER } from '../src/combat/damage';
import { createEnemyBrain, decideEnemyAction, type EnemyAiConfig } from '../src/combat/enemyAi';

describe('calculateDamage', () => {
  const base = { attack: 10, multiplier: 1, element: 'none' as const, critical: false };

  it('按公式计算普通伤害：攻击 − 防御 × 0.5', () => {
    // 10 − 4 × 0.5 = 8
    expect(calculateDamage(base, { defense: 4 })).toBe(8);
  });

  it('最低伤害为 1', () => {
    expect(calculateDamage(base, { defense: 1000 })).toBe(1);
  });

  it('技能倍率生效', () => {
    expect(calculateDamage({ ...base, multiplier: 2 }, { defense: 0 })).toBe(20);
  });

  it('暴击伤害为 1.5 倍', () => {
    const normal = calculateDamage(base, { defense: 0 });
    const crit = calculateDamage({ ...base, critical: true }, { defense: 0 });
    expect(crit).toBe(Math.round(normal * CRIT_MULTIPLIER));
  });

  it('元素克制时伤害提高 25%', () => {
    const plain = calculateDamage({ ...base, element: 'fire' }, { defense: 0, element: 'none' });
    const advantage = calculateDamage({ ...base, element: 'fire' }, { defense: 0, element: 'ice' });
    expect(advantage).toBe(Math.round(plain * 1.25));
  });

  it('抗性按比例减少伤害，并限制在 0–1 之间', () => {
    const half = calculateDamage({ ...base, element: 'fire' }, { defense: 0, resistances: { fire: 0.5 } });
    expect(half).toBe(5);
    const over = calculateDamage({ ...base, element: 'fire' }, { defense: 0, resistances: { fire: 2 } });
    expect(over).toBe(1);
  });
});

describe('hasElementAdvantage', () => {
  it('克制关系单向成立', () => {
    expect(hasElementAdvantage('fire', 'ice')).toBe(true);
    expect(hasElementAdvantage('ice', 'fire')).toBe(false);
    expect(hasElementAdvantage('none', 'fire')).toBe(false);
  });
});

describe('Actor', () => {
  it('受到伤害后扣血并进入硬直', () => {
    const a = new Actor({ maxHp: 100, staggerMs: 200 });
    expect(a.receiveDamage(30)).toBe(30);
    expect(a.hp).toBe(70);
    expect(a.isStaggered).toBe(true);
    a.tick(250);
    expect(a.isStaggered).toBe(false);
  });

  it('无敌期间不受伤害', () => {
    const a = new Actor({ maxHp: 100 });
    a.grantInvulnerability(350);
    expect(a.receiveDamage(50)).toBe(0);
    expect(a.hp).toBe(100);
    a.tick(400);
    expect(a.receiveDamage(50)).toBe(50);
  });

  it('精英与 Boss（staggerMs = 0）不会硬直', () => {
    const boss = new Actor({ maxHp: 500, staggerMs: 0 });
    boss.receiveDamage(10);
    expect(boss.isStaggered).toBe(false);
  });

  it('生命归零后死亡，且不再受伤', () => {
    const a = new Actor({ maxHp: 10 });
    expect(a.receiveDamage(999)).toBe(10);
    expect(a.isDead).toBe(true);
    expect(a.receiveDamage(5)).toBe(0);
  });

  it('治疗不超过最大生命', () => {
    const a = new Actor({ maxHp: 50 });
    a.receiveDamage(20);
    a.heal(100);
    expect(a.hp).toBe(50);
  });
});

describe('decideEnemyAction', () => {
  const config: EnemyAiConfig = {
    aggroRange: 200,
    leashRange: 300,
    attackRange: 40,
    attackCooldownMs: 1000,
  };

  it('玩家进入发现范围后开始追击', () => {
    const brain = createEnemyBrain();
    expect(decideEnemyAction(brain, config, { distanceToPlayer: 500, deltaMs: 16 }).state).toBe('patrol');
    expect(decideEnemyAction(brain, config, { distanceToPlayer: 150, deltaMs: 16 }).state).toBe('chase');
  });

  it('进入攻击距离后攻击，并受冷却限制', () => {
    const brain = createEnemyBrain();
    decideEnemyAction(brain, config, { distanceToPlayer: 100, deltaMs: 16 });
    const first = decideEnemyAction(brain, config, { distanceToPlayer: 20, deltaMs: 16 });
    expect(first.state).toBe('attack');
    expect(first.shouldAttack).toBe(true);
    const cooling = decideEnemyAction(brain, config, { distanceToPlayer: 20, deltaMs: 500 });
    expect(cooling.shouldAttack).toBe(false);
    const ready = decideEnemyAction(brain, config, { distanceToPlayer: 20, deltaMs: 600 });
    expect(ready.shouldAttack).toBe(true);
  });

  it('超出 leash 距离后放弃追击，回到巡逻', () => {
    const brain = createEnemyBrain();
    decideEnemyAction(brain, config, { distanceToPlayer: 100, deltaMs: 16 });
    const lost = decideEnemyAction(brain, config, { distanceToPlayer: 400, deltaMs: 16 });
    expect(lost.state).toBe('patrol');
    expect(lost.moveTowardPlayer).toBe(false);
  });
});
