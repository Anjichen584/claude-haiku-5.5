import type { SkillDef } from '../data/schema';
export const SKILL_SLOTS = 4;
export interface SkillLoadoutFields { unlocked: string[]; equipped?: string[] }
/** Invalid, duplicate, reset or passive entries never become castable; legacy saves auto-fill. */
export function skillLoadout(state: SkillLoadoutFields, defs: readonly SkillDef[]): string[] {
  const active = new Set(defs.filter(s => s.combat && s.combat.kind !== 'passive').map(s => s.id));
  const learned = new Set(state.unlocked);
  const source = state.equipped ?? state.unlocked;
  return [...new Set(source)].filter(id => learned.has(id) && active.has(id)).slice(0, SKILL_SLOTS);
}
export function bindSkill(state: SkillLoadoutFields, defs: readonly SkillDef[], id: string, slot: number): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS || !state.unlocked.includes(id)) return false;
  if (!defs.some(s => s.id === id && s.combat && s.combat.kind !== 'passive')) return false;
  const slots = skillLoadout(state, defs);
  const old = slots.indexOf(id);
  if (old >= 0) slots.splice(old, 1);
  // Empty slots are compacted deliberately; there are no holes in legacy JSON arrays.
  slots.splice(Math.min(slot, slots.length), slot < slots.length ? 1 : 0, id);
  state.equipped = slots.slice(0, SKILL_SLOTS);
  return true;
}
