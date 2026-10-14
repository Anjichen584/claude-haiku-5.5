import type { AffixDef, ItemDef } from '../data/schema';
import { combatStats, equipmentBonuses, type CombatStats } from '../state/equipment';
import type { ItemSetDef } from '../items/sets';
import { PLAYER_MAX_MANA, PLAYER_MAX_STAMINA } from '../state/constants';

export interface CombatProfile extends CombatStats {
  maxMana: number; maxStamina: number; manaRegen: number; staminaRegen: number;
  speedMultiplier: number; critChance: number; critMultiplier: number;
  attackIntervalMs: number; cooldownMultiplier: number; weaponRange: number;
  lifeSteal: number; dodgeChance: number; blockChance: number;
  bonuses: Readonly<Record<string, number>>;
}
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
export function combatProfile(equipment:Partial<Record<string,string>>,items:readonly ItemDef[],affixes:readonly AffixDef[]=[],sets:readonly ItemSetDef[]=[]):CombatProfile {
  const bonuses=equipmentBonuses(equipment,items,affixes,sets);
  const n=(key:string)=>bonuses[key]??0;
  return {...combatStats(equipment,items,affixes,sets),bonuses,
    maxMana:Math.max(1,PLAYER_MAX_MANA+n('maxMana')),maxStamina:Math.max(1,PLAYER_MAX_STAMINA+n('maxStamina')),
    manaRegen:Math.max(0,6+n('manaRegen')),staminaRegen:Math.max(0,20+n('staminaRegen')),
    speedMultiplier:clamp(1+n('speed')/100,.5,2.5),critChance:clamp(.05+n('critRate')/100,0,.8),
    critMultiplier:clamp(1.5+n('critDamage')/100,1,4),attackIntervalMs:400/clamp(1+n('attackSpeed')/100,.5,3),
    cooldownMultiplier:1-clamp(n('cooldownReduction')/100,0,.6),weaponRange:clamp(74+n('weaponRange'),30,220),
    lifeSteal:clamp(n('lifeSteal')/100,0,.5),dodgeChance:clamp(n('dodgeChance')/100,0,.5),blockChance:clamp(n('blockChance')/100,0,.6),
  };
}

/** Public UI support list: unconnected affixes must not be presented as active bonuses. */
const SUPPORTED_MODIFIERS=new Set([
 'attack','defense','maxHp','maxMana','maxStamina','manaRegen','staminaRegen','speed','critRate','critDamage','attackSpeed','cooldownReduction','weaponRange','lifeSteal','dodgeChance','blockChance','invulnDuration','healingReceived','spellDamage','rangedDamage','meleeDamage','bossDamage','eliteDamage','armorShred','burnChance','freezeChance','shockChance','thorns','goldFind','expGain','potionEfficiency','fireReflect','spellNextCrit','dashAttackBonus',
 ...['fire','ice','lightning','holy','dark','none'].flatMap(e=>[`${e}Damage`,`${e}SkillDamage`,`${e}Resist`]),
]);
export function isSupportedModifier(stat:string):boolean{return SUPPORTED_MODIFIERS.has(stat);}
