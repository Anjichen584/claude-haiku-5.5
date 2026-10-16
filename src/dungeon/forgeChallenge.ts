import {TowerHazards} from '../tower/hazards';
import {forgeDifficulty,type ForgeRun} from './ashForge';
/** Reuse the proven telegraph scheduler/geometry without changing any tower rules. */
export function forgeBossHazards(run:ForgeRun):TowerHazards{
 return forgeDifficulty(run)==='challenge'?new TowerHazards(30,{
  name:'熔炉双焰',hint:'双火圈锁定玩家与镜像落点；避开两圈或在爆发时闪避',
  element:'fire',attack:34,windupMs:1300,intervalMs:5000,
 }):new TowerHazards(10);
}
