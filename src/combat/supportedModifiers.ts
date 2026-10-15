/** Public UI support list: unconnected affixes must not be presented as active bonuses. */
const SUPPORTED_MODIFIERS=new Set([
 'attack','defense','maxHp','maxMana','maxStamina','manaRegen','staminaRegen','speed','critRate','critDamage','attackSpeed','cooldownReduction','weaponRange','lifeSteal','dodgeChance','blockChance','invulnDuration','healingReceived','spellDamage','rangedDamage','meleeDamage','bossDamage','eliteDamage','armorShred','burnChance','freezeChance','shockChance','thorns','goldFind','expGain','potionEfficiency','fireReflect','spellNextCrit','dashAttackBonus',
 ...['fire','ice','lightning','holy','dark','none'].flatMap(e=>[`${e}Damage`,`${e}SkillDamage`,`${e}Resist`]),
]);
export function isSupportedModifier(stat:string):boolean{return SUPPORTED_MODIFIERS.has(stat);}
