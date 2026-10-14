/** Declarative skill effects; milliseconds, pixels and 0..1 fractions. */
export interface SkillCombatDef {
  kind: 'strike' | 'bolt' | 'blast' | 'nova' | 'heal' | 'buff' | 'trap' | 'passive';
  description: string;
  range?: number;
  radius?: number;
  targets?: number;
  staminaCost?: number;
  durationMs?: number;
  healFraction?: number;
  regenFraction?: number;
  damageReduction?: number;
  attackBoost?: number;
  speedBoost?: number;
  shieldFraction?: number;
  dodgeBonus?: number;
  invulnerabilityMs?: number;
  armorShred?: number;
  slow?: number;
  stunMs?: number;
  burnFraction?: number;
  lifeSteal?: number;
  retaliate?: number;
  preventDeath?: boolean;
  staminaRegen?: number;
  critChanceBonus?: number;
  sightBonus?: number;
}
