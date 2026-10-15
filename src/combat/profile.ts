import type {GearCrafting} from '../items/gearCraft';
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
export function combatProfile(equipment:Partial<Record<string,string>>,items:readonly ItemDef[],affixes:readonly AffixDef[]=[],sets:readonly ItemSetDef[]=[],craft:GearCrafting={}):CombatProfile {
  const bonuses=equipmentBonuses(equipment,items,affixes,sets,craft);
  const n=(key:string)=>bonuses[key]??0;
  return {...combatStats(equipment,items,affixes,sets,craft),bonuses,
    maxMana:Math.max(1,PLAYER_MAX_MANA+n('maxMana')),maxStamina:Math.max(1,PLAYER_MAX_STAMINA+n('maxStamina')),
    manaRegen:Math.max(0,6+n('manaRegen')),staminaRegen:Math.max(0,20+n('staminaRegen')),
    speedMultiplier:clamp(1+n('speed')/100,.5,2.5),critChance:clamp(.05+n('critRate')/100,0,.8),
    critMultiplier:clamp(1.5+n('critDamage')/100,1,4),attackIntervalMs:400/clamp(1+n('attackSpeed')/100,.5,3),
    cooldownMultiplier:1-clamp(n('cooldownReduction')/100,0,.6),weaponRange:clamp(74+n('weaponRange'),30,220),
    lifeSteal:clamp(n('lifeSteal')/100,0,.5),dodgeChance:clamp(n('dodgeChance')/100,0,.5),blockChance:clamp(n('blockChance')/100,0,.6),
  };
}

export {isSupportedModifier} from './supportedModifiers';
