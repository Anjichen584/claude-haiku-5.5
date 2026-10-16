import {describe,it,expect} from 'vitest';
import {newForge,startForge,moveForge,finishForgeCombat,valveOrder,operateValve,claimForge,forgeReward,forgeEnemies,forgeDifficulty,parseForge,type ForgeDifficulty} from '../src/dungeon/ashForge';
import {forgeBossHazards} from '../src/dungeon/forgeChallenge';
import {TowerHazards,towerHazardRule} from '../src/tower/hazards';
import {newSession,toSaveFile,parseSave,serializeSave,fromSaveFile} from '../src/state/session';
import {loadGameData} from '../src/data/loader';
const d=loadGameData();
function make(){const s=newSession(d.quests);s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});s.forge=newForge();return s;}
function finish(s:ReturnType<typeof make>,extra=false){const p=s.forge!,r=p.run!;
 moveForge(r,'hall');finishForgeCombat(p,r.id,'hall',true);moveForge(r,'valves');for(const id of valveOrder(r))operateValve(r,id);
 if(extra){moveForge(r,'cache');finishForgeCombat(p,r.id,'cache',true);}moveForge(r,'boss');finishForgeCombat(p,r.id,'boss',true);moveForge(r,'exit');
}
function unlocked(){const s=make();startForge(s);finish(s);claimForge(s);return s;}

describe('forge challenge difficulty and old-save compatibility',()=>{
 it('requires a completed ordinary run, not a boss kill or an active attempt',()=>{
  const s=make();expect(startForge(s,'challenge')).toBe(false);expect(s.forge!.attempts).toBe(0);
  startForge(s);finish(s);expect(startForge(s,'challenge')).toBe(false);expect(s.forge!.clears).toBe(0);
  claimForge(s);expect(startForge(s,'challenge')).toBe(true);expect(s.forge!.run!.difficulty).toBe('challenge');
  expect(startForge(s,'challenge')).toBe(false);
 });
 it('rejects unsupported modes without consuming an attempt',()=>{const s=unlocked(),count=s.forge!.attempts;expect(startForge(s,'nightmare' as ForgeDifficulty)).toBe(false);expect(s.forge!.attempts).toBe(count);});
 it.each([false,true])('settles the extra=%s challenge route exactly once and tracks it separately',extra=>{
  const s=unlocked(),gold=s.player.gold,exp=s.player.exp,embers=s.forge!.embers;
  startForge(s,'challenge');finish(s,extra);const r=s.forge!.run!,reward=forgeReward(r);
  expect(reward.embers).toBe(extra?8:6);expect(reward.gains.gold).toBe(extra?420:300);expect(reward.gains.exp).toBe(extra?800:600);
  expect(s.forge!.challengeClears).toBe(0);expect(claimForge(s)).toBe(true);
  expect(s.forge!.clears).toBe(2);expect(s.forge!.challengeClears).toBe(1);expect(s.forge!.embers).toBe(embers+reward.embers);
  expect(s.player.gold).toBe(gold+reward.gains.gold);expect(s.player.exp).toBe(exp+reward.gains.exp);
  expect(claimForge(s)).toBe(false);expect(parseForge(s.forge)).toEqual(s.forge);
 });
 it('does not lose previously banked rewards or grant challenge credit after defeat',()=>{
  const s=unlocked();startForge(s,'challenge');const r=s.forge!.run!;moveForge(r,'hall');
  finishForgeCombat(s.forge!,r.id,'hall',false);expect(s.forge!.run).toBeNull();expect(s.forge!.clears).toBe(1);expect(s.forge!.challengeClears).toBe(0);expect(s.forge!.embers).toBe(3);
 });
 it('keeps difficulty across battle, puzzle and reward checkpoints',()=>{
  const s=unlocked();startForge(s,'challenge');const r=s.forge!.run!;moveForge(r,'hall');
  const restored=fromSaveFile(parseSave(serializeSave(toSaveFile(s))),d.quests);expect(forgeDifficulty(restored.forge!.run!)).toBe('challenge');
  restored.forge!.run!.cleared.push('hall');expect(s.forge!.run!.cleared).toEqual([]);
  finishForgeCombat(s.forge!,r.id,'hall',true);moveForge(r,'valves');operateValve(r,valveOrder(r)[0]);
  expect(parseSave(serializeSave(toSaveFile(s))).forge!.run!.difficulty).toBe('challenge');
 });
 it('adds real enemy composition and applies preparation/pressure to the boss only',()=>{
  const s=unlocked();startForge(s,'challenge');const r=s.forge!.run!,before=JSON.stringify(d.enemies);
  moveForge(r,'hall');expect(forgeEnemies(r,d.enemies).map(e=>e.id)).toContain('cinder_golem');expect(forgeEnemies(r,d.enemies)).toHaveLength(4);
  finishForgeCombat(s.forge!,r.id,'hall',true);moveForge(r,'valves');for(const id of valveOrder(r))operateValve(r,id);moveForge(r,'cache');expect(forgeEnemies(r,d.enemies)).toHaveLength(3);
  finishForgeCombat(s.forge!,r.id,'cache',true);moveForge(r,'boss');r.pressure=3;
  const wave=forgeEnemies(r,d.enemies),boss=wave.find(e=>e.boss)!,crow=wave.find(e=>!e.boss)!;
  expect(wave).toHaveLength(2);expect(boss.hp).toBe(1040);expect(boss.attack).toBe(55);
  const original=d.enemies.find(e=>e.id===crow.id)!;expect(crow.hp).toBe(Math.round(original.hp*1.3));expect(crow.attack).toBe(Math.round(original.attack*1.15));
  expect(wave.every(e=>e.drops.length===0)).toBe(true);expect(JSON.stringify(d.enemies)).toBe(before);
 });
 it('keeps normal stats/rewards and a single fire circle unchanged',()=>{
  const s=make();startForge(s);const r=s.forge!.run!;finish(s);
  expect(forgeDifficulty(r)).toBe('normal');expect(forgeReward(r)).toEqual({gains:{exp:240,gold:120,items:[]},embers:3});
  r.current='boss';const enemies=forgeEnemies(r,d.enemies);expect(enemies).toHaveLength(1);expect(enemies[0].hp).toBe(1000);expect(enemies[0].attack).toBe(40);
  const h=forgeBossHazards(r);for(let i=0;i<22;i++)h.tick(100,{x:300,y:300});expect(h.warning!.zones).toHaveLength(1);expect(h.rule).toEqual(towerHazardRule(10));
 });
 it('uses mirrored fire hazards without modifying tower defaults or override objects',()=>{
  const s=unlocked();startForge(s,'challenge');const h=forgeBossHazards(s.forge!.run!);
  for(let i=0;i<22;i++)h.tick(100,{x:300,y:300});expect(h.warning!.zones).toHaveLength(2);
  expect(h.rule!.element).toBe('fire');expect(h.rule!.windupMs).toBe(1300);expect(h.rule!.intervalMs).toBe(5000);
  let strikes=0;for(let i=0;i<13;i++)if(h.tick(100,{x:300,y:300}))strikes++;expect(strikes).toBe(1);
  expect(new TowerHazards(30).rule!.element).toBe('dark');expect(new TowerHazards(30).rule!.windupMs).toBe(1400);
  const rule=towerHazardRule(10)!,clone=new TowerHazards(10,rule);rule.attack=999;expect(clone.rule!.attack).toBe(26);
 });
 it('treats pre-upgrade saves as ordinary and defaults only the missing counter',()=>{
  const s=make();startForge(s);const raw=JSON.parse(JSON.stringify(s.forge));delete raw.challengeClears;
  const restored=parseForge(raw);expect(restored.challengeClears).toBe(0);expect(restored.run!.difficulty).toBeUndefined();expect(forgeDifficulty(restored.run!)).toBe('normal');
  expect(raw.challengeClears).toBeUndefined();expect(parseForge(restored)).toEqual(restored);
 });
 it.each([
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'cache',cleared:['hall','valves','boss'],valveStep:3,pressure:0}},
  {version:1,attempts:1,clears:1,challengeClears:1,embers:0,run:null},
  {version:1,attempts:2,clears:2,challengeClears:2,embers:0,run:null},
  {version:1,attempts:2,clears:1,challengeClears:NaN,embers:0,run:null},
  {version:1,attempts:2,clears:1,challengeClears:0,embers:6,run:null},
  {version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'entry',cleared:[],valveStep:0,pressure:0,difficulty:'challenge'}},
  {version:1,attempts:2,clears:1,embers:3,run:{id:2,current:'entry',cleared:[],valveStep:0,pressure:0,difficulty:'nightmare'}},
 ])('rejects inconsistent mode/counter/currency data %#',raw=>{expect(()=>parseForge(raw)).toThrow();});
});
