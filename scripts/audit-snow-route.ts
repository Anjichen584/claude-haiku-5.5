/** Reproducible deterministic sampling, not an exploration/balance playthrough.
 * Run: node --import tsx scripts/audit-snow-route.ts
 */
import biomesData from '../data/biomes.json';
import enemiesData from '../data/enemies.json';
import locationsData from '../data/locations.json';
import npcsData from '../data/npcs.json';
import type {BiomeDef,EnemyDef} from '../src/data/schema';
import {generateChunk} from '../src/world/chunk';
import {surfaceSpawnsForChunk} from '../src/world/encounters';
import {placeLocations} from '../src/world/placement';
import {placeNpcs,inSettlement} from '../src/world/npcPlacement';
import {snowGatePatrols} from '../src/world/storyPatrols';
const seed=20261014,biomes=biomesData.biomes as BiomeDef[],enemies=enemiesData.enemies as EnemyDef[];
const places=placeLocations(locationsData.locations,seed),npcs=placeNpcs(npcsData.npcs,places);
let groups=0,accessibleGroups=0,rawWolves=0,accessibleWolves=0;
const sources=[];
for(let cx=-7;cx<=2;cx++)for(let cy=-8;cy<=0;cy++){
  for(const s of surfaceSpawnsForChunk(seed,generateChunk(seed,cx,cy,biomes),biomes,enemies)){
    groups++;
    const clear=!inSettlement({x:s.tileX,y:s.tileY},places,npcs),wolves=s.enemyIds.filter(id=>id==='frost_wolf').length;
    if(clear)accessibleGroups++;
    rawWolves+=wolves;if(clear)accessibleWolves+=wolves;
    if(wolves)sources.push({...s,settlementFiltered:!clear});
  }
}
console.log(JSON.stringify({seed,bounds:{chunkX:[-7,2],chunkY:[-8,0]},chunks:90,
  natural:{groups,accessibleGroups,rawWolves,accessibleWolves,sources},
  story:{requiredQuest:'main_03',patrols:snowGatePatrols(places,npcs)},
  limitation:'Finite deterministic sample. Not the whole world; no walking or balance proof.'},null,2));
