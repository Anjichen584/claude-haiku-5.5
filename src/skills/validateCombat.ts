import type { SkillDef } from '../data/schema';
const kinds=['strike','bolt','blast','nova','heal','buff','trap','passive'];
export function validateSkillCombat(skill:SkillDef):string[]{
 const errors:string[]=[],p=skill.combat,prefix=`skills.${skill.id}`;
 if(!p)return[`${prefix}: 缺少 combat 行为`];
 if(!kinds.includes(p.kind))errors.push(`${prefix}: 未知 combat.kind`);
 if(!p.description?.trim())errors.push(`${prefix}: 缺少 combat.description`);
 for(const k of ['manaCost','cooldown','multiplier'] as const)if(!Number.isFinite(skill[k]) || skill[k]!<0)errors.push(`${prefix}: ${k} 必须是非负有限数`);
 for(const k of ['healFraction','regenFraction','damageReduction','attackBoost','speedBoost','shieldFraction','dodgeBonus','slow','burnFraction','lifeSteal','critChanceBonus'] as const)if(p[k]!==undefined && (!Number.isFinite(p[k])||p[k]!<0||p[k]!>1))errors.push(`${prefix}: combat.${k} 必须在 0–1`);
 for(const k of ['range','radius','durationMs','invulnerabilityMs','armorShred','stunMs','retaliate','staminaRegen','sightBonus'] as const)if(p[k]!==undefined && (!Number.isFinite(p[k])||p[k]!<0))errors.push(`${prefix}: combat.${k} 必须非负`);
 if(p.targets!==undefined && (!Number.isInteger(p.targets)||p.targets<1||p.targets>30))errors.push(`${prefix}: combat.targets 必须是 1–30 的整数`);
 if(p.staminaCost!==undefined&&!Number.isFinite(p.staminaCost))errors.push(`${prefix}: combat.staminaCost 非法`);
 if(['strike','bolt','blast','trap'].includes(p.kind)&&!(p.range!>0))errors.push(`${prefix}: combat.range 必须大于 0`);
 if(['nova','blast','trap'].includes(p.kind)&&!(p.radius!>0))errors.push(`${prefix}: combat.radius 必须大于 0`);
 if(p.kind==='buff'&&!(p.durationMs!>0))errors.push(`${prefix}: buff 需要持续时间`);
 return errors;
}
