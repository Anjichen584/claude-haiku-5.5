import type {BiomeDef,EnemyDef} from '../data/schema';
import type {Chunk} from './chunk';
import {surfaceSpawnsForChunk,type SurfaceSpawn} from './encounters';
/** Additional independent spawn layer; legacy spawn keys and positions never change.
 * Keep the opening camp route readable; denser 2–3 enemy packs live outside it.
 */
export function roamingPacks(seed:number,chunk:Chunk,biomes:readonly BiomeDef[],enemies:readonly EnemyDef[]):SurfaceSpawn[]{
 return [0x39f131,0x829b17].flatMap((salt,layer)=>surfaceSpawnsForChunk(seed^salt,chunk,biomes,enemies).filter(s=>Math.hypot(s.tileX,s.tileY)>42).map(s=>({...s,key:`roam:${layer}:${s.key}`,enemyIds:[...s.enemyIds,s.enemyIds[0]]})));
}
