import {describe,it,expect} from 'vitest';
import {roamingPacks} from '../src/world/roamingPacks';
import {surfaceSpawnsForChunk} from '../src/world/encounters';
import {generateChunk,FLAG_RIVER} from '../src/world/chunk';
import {loadGameData} from '../src/data/loader';
const {biomes,enemies}=loadGameData(),seed=20261014;
describe('additional roaming pack layer',()=>{
 it('is deterministic, does not alter legacy keys, and avoids the opening area and rivers',()=>{
  let count=0;
  for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){
   const c=generateChunk(seed,x,y,biomes),legacy=surfaceSpawnsForChunk(seed,c,biomes,enemies),packs=roamingPacks(seed,c,biomes,enemies);
   expect(packs).toEqual(roamingPacks(seed,c,biomes,enemies));
   const keys=[...legacy,...packs].map(p=>p.key);expect(new Set(keys).size).toBe(keys.length);
   for(const p of packs){count++;expect(Math.hypot(p.tileX,p.tileY)).toBeGreaterThan(42);expect(p.enemyIds.length).toBeGreaterThanOrEqual(2);expect(p.enemyIds.length).toBeLessThanOrEqual(3);
    const index=(p.tileY-y*64)*64+p.tileX-x*64;expect(c.flags[index]&FLAG_RIVER).toBe(0);
   }
  }
  expect(count).toBeGreaterThan(30);
 });
});
