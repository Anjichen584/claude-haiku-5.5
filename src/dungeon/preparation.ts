import type {GameSession} from '../state/session';
/** Read-only guidance, not a level/gear gate and never a promise of victory. */
export function expeditionPreparation(s:GameSession):string{
 const p=s.player,warnings:string[]=[];
 if(!p.equipment.main_hand)warnings.push('先装备武器');
 if(Object.keys(p.equipment).length<4)warnings.push('先完善护甲，勿硬扛 Boss');
 if(!(p.skills.equipped?.length??p.skills.unlocked.length))warnings.push('G 学习/装配技能');
 if(!s.world.getItemCount('health_potion'))warnings.push('补充治疗药剂');
 return warnings.length?warnings.join(' · '):'装备/技能/药剂已准备；注意预警与闪避，不保证通关';
}
