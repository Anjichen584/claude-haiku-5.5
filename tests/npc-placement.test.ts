import {describe, expect, it} from 'vitest';
import npcData from '../data/npcs.json';
import locationsData from '../data/locations.json';
import {placeLocations} from '../src/world/placement';
import {inSettlement, nearestNpc, NPC_SPACING, NPC_TALK_RADIUS, placeNpcs, SETTLEMENT_CLEARANCE} from '../src/world/npcPlacement';

const reserved = [{x:4,y:4,radius:7}, {x:-5,y:-2,radius:6}, {x:400,y:0,radius:7}];
const positions = (seed = 20261014) => {
  const places = placeLocations(locationsData.locations, seed);
  return {places, npcs: placeNpcs(npcData.npcs, places, reserved)};
};

describe('settlement layout', () => {
  it('places every NPC exactly once without mutating source locations', () => {
    const places = placeLocations(locationsData.locations, 20261014);
    const before = JSON.stringify(places);
    const npcs = placeNpcs(npcData.npcs, places, reserved);
    expect(npcs.size).toBe(npcData.npcs.length);
    expect(JSON.stringify(places)).toBe(before);
    for (const n of npcData.npcs) expect(npcs.get(n.id)?.location).toBe(n.location);
  });
  it('is deterministic and independent of NPC and location input order', () => {
    const {places,npcs} = positions();
    const reverse = placeNpcs([...npcData.npcs].reverse(), [...places].reverse(), reserved);
    expect([...reverse]).toEqual([...npcs]);
  });
  it.each([20261014, 8, 113, 941])('keeps all bodies, buildings and interaction circles separate for seed %s', seed => {
    const {places,npcs} = positions(seed);
    const list = [...npcs.values()];
    expect(NPC_SPACING).toBeGreaterThan(2 * NPC_TALK_RADIUS);
    for (let i=0;i<list.length;i++) {
      const n=list[i];
      for (let j=i+1;j<list.length;j++) expect(Math.hypot(n.x-list[j].x,n.y-list[j].y)).toBeGreaterThanOrEqual(NPC_SPACING);
      for (const p of places) expect(Math.hypot(n.x-p.x,n.y-p.y)).toBeGreaterThanOrEqual(SETTLEMENT_CLEARANCE);
      for (const p of reserved) expect(Math.hypot(n.x-p.x,n.y-p.y)).toBeGreaterThanOrEqual(p.radius);
      const home=places.find(p=>p.id===n.location)!;
      expect(Math.hypot(n.x-home.x,n.y-home.y)).toBeLessThanOrEqual(26);
      expect(nearestNpc(npcs,n)).toBe(n.id);
    }
  });
  it('supports large settlements without a single horizontal queue', () => {
    const npcs=Array.from({length:48},(_,i)=>({id:`n-${i}`,name:'n',location:'camp',dialogueId:'d'}));
    const layout=placeNpcs(npcs,[{id:'camp',name:'camp',region:'r',x:0,y:0}]);
    expect(layout.size).toBe(48);
    expect(new Set([...layout.values()].map(n=>n.y)).size).toBeGreaterThan(4);
  });
  it('rejects invalid references and duplicate NPCs', () => {
    expect(()=>placeNpcs(npcData.npcs,[])).toThrow('unknown location');
    expect(()=>placeNpcs([npcData.npcs[0],npcData.npcs[0]],positions().places)).toThrow('Duplicate NPC');
  });
  it('uses a stable nearest target and returns null outside range', () => {
    const npcs=new Map([
      ['b',{id:'b',location:'camp',x:1,y:0}],
      ['a',{id:'a',location:'camp',x:-1,y:0}],
    ]);
    expect(nearestNpc(npcs,{x:0,y:0})).toBe('a');
    expect(nearestNpc(npcs,{x:1,y:0})).toBe('b');
    expect(nearestNpc(npcs,{x:10,y:0})).toBeNull();
  });
  it('reserves interaction space without disabling encounters everywhere', () => {
    const {places,npcs}=positions();
    for (const n of npcs.values()) expect(inSettlement(n,places,npcs)).toBe(true);
    expect(inSettlement({x:10000,y:10000},places,npcs)).toBe(false);
  });
});
