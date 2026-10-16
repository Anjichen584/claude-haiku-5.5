import {describe,it,expect} from 'vitest';
import {newTower,startTower,finishTowerFloor,chooseBoon,boonChoices,towerReward,cashOutTower,parseTower,towerEnemies,towerProfile,canCashOut} from '../src/tower/run';
import {newSession,toSaveFile,serializeSave,parseSave,fromSaveFile} from '../src/state/session';
import {loadGameData} from '../src/data/loader';
import {combatProfile} from '../src/combat/profile';
const d=loadGameData();
function make(){const s=newSession(d.quests);s.tower=newTower();startTower(s.tower);return s;}
function clear(s:ReturnType<typeof make>,n:number){for(let i=0;i<n;i++){const r=s.tower!.run!;expect(finishTowerFloor(s.tower!,r.id,r.cleared+1,true)).toBe(true);if(r.phase==='boon')chooseBoon(r,boonChoices(r)[0]);}}

describe('trial tower bounded state machine',()=>{
 it('starts one attempt at a time; stale and duplicate callbacks are ignored',()=>{
  const p=newTower();expect(startTower(p)).toBe(true);expect(startTower(p)).toBe(false);
  expect(finishTowerFloor(p,2,1,true)).toBe(false);expect(finishTowerFloor(p,1,2,true)).toBe(false);
  expect(finishTowerFloor(p,1,1,true)).toBe(true);expect(finishTowerFloor(p,1,1,true)).toBe(false);
  expect(finishTowerFloor(p,1,2,true)).toBe(false);
  const r=p.run!;const ids=boonChoices(r);expect(new Set(ids).size).toBe(3);expect(ids).toEqual(boonChoices(r));
  expect(chooseBoon(r,ids[0])).toBe(true);expect(chooseBoon(r,ids[1])).toBe(false);
  expect(finishTowerFloor(p,1,1,true)).toBe(false);expect(p.best).toBe(1);
 });
 it('rejects a boon not in the offered three',()=>{const s=make(),r=s.tower!.run!;finishTowerFloor(s.tower!,r.id,1,true);const offered=boonChoices(r);const absent=(['might','vitality','armor','spring','haste','leech'] as const).find(id=>!offered.includes(id))!;expect(chooseBoon(r,absent)).toBe(false);});
 it.each([5,10,15,20,25,30])('allows one-time cashout at stage %i',n=>{
  const s=make();clear(s,n);const expected=towerReward(n),gold=s.player.gold,exp=s.player.exp;
  expect(canCashOut(s.tower!.run!)).toBe(true);expect(cashOutTower(s)).toBe(true);
  expect(s.player.gold).toBe(gold+expected.gold);expect(s.player.exp).toBe(exp+expected.exp);
  expect(s.world.getItemCount('rift_shard')).toBe(expected.items.length);
  expect(cashOutTower(s)).toBe(false);expect(s.tower!.run).toBeNull();expect(s.tower!.best).toBe(n);
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),d.quests);expect(cashOutTower(restored)).toBe(false);
 });
 it('does not reward kills/floors before cashout and loses unbanked rewards on defeat',()=>{
  const s=make();clear(s,6);expect(cashOutTower(s)).toBe(false);expect(s.player.gold).toBe(0);expect(s.player.exp).toBe(0);
  expect(s.world.getItemCount('rift_shard')).toBe(0);const r=s.tower!.run!;
  expect(finishTowerFloor(s.tower!,r.id,7,false)).toBe(true);expect(s.tower!.run).toBeNull();expect(s.tower!.best).toBe(6);
  expect(startTower(s.tower!)).toBe(true);expect(s.tower!.run!.id).toBe(2);
 });
 it('ends at floor 30 rather than claiming to be infinite',()=>{const s=make();clear(s,30);const r=s.tower!.run!;expect(r.phase).toBe('complete');expect(r.boons).toHaveLength(29);expect(finishTowerFloor(s.tower!,r.id,31,true)).toBe(false);expect(parseTower(s.tower)).toEqual(s.tower);});
 it('roundtrips both choice and ready checkpoints without rerolling',()=>{
  const s=make();clear(s,7);const r=s.tower!.run!;finishTowerFloor(s.tower!,r.id,8,true);
  const raw=serializeSave(toSaveFile(s)),copy=fromSaveFile(parseSave(raw),d.quests);
  expect(copy.tower).toEqual(s.tower);expect(boonChoices(copy.tower!.run!)).toEqual(boonChoices(r));
  copy.tower!.run!.boons.push('might');expect(s.tower!.run!.boons).not.toEqual(copy.tower!.run!.boons);
 });
 it('keeps optional extension compatible with old v1 saves',()=>{const s=newSession(d.quests);const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),d.quests);expect(restored.tower).toBeUndefined();});
 it('supports tower-boosted vital bounds and rejects excess',()=>{
  const s=make();clear(s,20);const r=s.tower!.run!;
  const p=combatProfile({},d.items,d.affixes,d.itemSets),boost=towerProfile(p,r);
  s.player.hp=boost.maxHp;s.player.mana=boost.maxMana;
  expect(parseSave(serializeSave(toSaveFile(s))).player.hp).toBe(boost.maxHp);
  s.player.hp=boost.maxHp+1;expect(()=>parseSave(serializeSave(toSaveFile(s)))).toThrow();
 });
 it('does not mutate base profiles or enemy data; every wave has valid enemies and expected milestones',()=>{
  const s=make(),base=combatProfile({},d.items,d.affixes,d.itemSets),before=JSON.stringify(d.enemies),baseBefore=JSON.stringify(base);
  for(let i=1;i<=30;i++){
   const r=s.tower!.run!,wave=towerEnemies(r,d.enemies);expect(wave).toEqual(towerEnemies(r,d.enemies));
   expect(wave.length).toBeGreaterThan(0);expect(wave.every(e=>e.hp>0&&e.drops.length===0)).toBe(true);
   if(i%10===0)expect(wave.some(e=>e.boss)).toBe(true);else if(i%5===0)expect(wave.some(e=>e.elite)).toBe(true);
   towerProfile(base,r);clear(s,1);
  }
  expect(JSON.stringify(base)).toBe(baseBefore);expect(JSON.stringify(d.enemies)).toBe(before);
 });
 it('applies each boon, preserves base stats and respects caps without weakening equipment',()=>{
  const p=combatProfile({},d.items,d.affixes,d.itemSets),r={id:1,cleared:6,phase:'ready' as const,boons:['might','vitality','armor','spring','haste','leech'] as const};
  const boosted=towerProfile(p,{...r,boons:[...r.boons]});
  expect(boosted.attack).toBe(p.attack+4);expect(boosted.defense).toBe(p.defense+2);
  expect(boosted.maxHp).toBe(p.maxHp+18);expect(boosted.maxMana).toBe(p.maxMana+12);
  expect(boosted.manaRegen).toBe(p.manaRegen+1);expect(boosted.cooldownMultiplier).toBeCloseTo(p.cooldownMultiplier*.94);
  expect(boosted.lifeSteal).toBeCloseTo(p.lifeSteal+.02);
  const haste=towerProfile(p,{...r,boons:Array(29).fill('haste')});expect(haste.cooldownMultiplier).toBe(.35);
  expect(towerProfile({...p,lifeSteal:.45},{...r,boons:['leech']}).lifeSteal).toBe(.45);
 });
 it('rejects a historical boon which was not offered for that exact floor',()=>{
  const p=newTower();startTower(p);finishTowerFloor(p,1,1,true);
  const ids=boonChoices(p.run!),absent=(['might','vitality','armor','spring','haste','leech'] as const).find(id=>!ids.includes(id))!;
  p.run!.phase='ready';p.run!.boons=[absent];expect(()=>parseTower(p)).toThrow('强化记录');
 });
 it.each([
  {},{version:1,attempts:NaN,best:0,run:null},{version:1,attempts:0,best:31,run:null},
  {version:1,attempts:1,best:1,run:{id:1,cleared:1,phase:'ready',boons:[]}},
  {version:1,attempts:1,best:0,run:{id:1,cleared:0,phase:'boon',boons:[]}},
  {version:1,attempts:1,best:30,run:{id:1,cleared:30,phase:'ready',boons:[]}},
  {version:1,attempts:1,best:2,run:{id:1,cleared:1,phase:'ready',boons:['unknown']}},
 ])('rejects malformed tower state %#',raw=>{expect(()=>parseTower(raw)).toThrow();});
});
