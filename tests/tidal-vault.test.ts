import {describe,it,expect} from 'vitest';
import {loadGameData} from '../src/data/loader';
import {newSession,toSaveFile,fromSaveFile,parseSave,serializeSave} from '../src/state/session';
import {newForge,startForge} from '../src/dungeon/ashForge';
import {newTower} from '../src/tower/run';
import {startVault,enterVaultRoom,finishVaultCombat,chooseVault,vaultTide,vaultEnemies,vaultBossHazards,vaultReward,claimVault,retreatVault,exchangeVault,parseVault,VAULT_WINGS,VAULT_GEAR,type VaultChoice,type VaultWing} from '../src/dungeon/tidalVault';
import {inspectSaveTransfer} from '../src/state/saveTransfer';
const d=loadGameData();
function make(){const s=newSession(d.quests);s.world.setQuest('main_03',{status:'completed',progress:[]});return s;}
function wing(s:ReturnType<typeof make>,w:VaultWing,c:VaultChoice){const r=s.vault!.run!;expect(enterVaultRoom(r,w)).toBe(true);expect(finishVaultCombat(s.vault!,r.id,w,true)).toBe(true);expect(chooseVault(r,c)).toBe(true);}
function finish(s:ReturnType<typeof make>,order:readonly VaultWing[],choices:readonly VaultChoice[]){order.forEach((w,i)=>wing(s,w,choices[i]));const r=s.vault!.run!;expect(enterVaultRoom(r,'boss')).toBe(true);expect(finishVaultCombat(s.vault!,r.id,'boss',true)).toBe(true);}
describe('tidal vault route and settlement',()=>{
 it('requires chapter three and camp, no other active challenge',()=>{
  const s=newSession(d.quests);expect(startVault(s)).toBe(false);s.world.setQuest('main_03',{status:'completed',progress:[]});
  s.player.tileX=100;expect(startVault(s)).toBe(false);s.player.tileX=0;
  s.forge=newForge();s.forge.run={id:1,current:'entry',cleared:[],valveStep:0,pressure:0};expect(startVault(s)).toBe(false);s.forge.run=null;
  s.tower=newTower();s.tower.run={id:1,cleared:0,phase:'ready',boons:[]};expect(startVault(s)).toBe(false);s.tower.run=null;
  expect(startVault(s)).toBe(true);expect(startVault(s)).toBe(false);expect(s.vault!.attempts).toBe(1);
  s.world.setQuest('main_02_ash_road',{status:'completed',progress:[]});expect(startForge(s)).toBe(false);
 });
 it('gates boss, duplicate wings, unresolved choice and wrong battle callbacks',()=>{
  const s=make();startVault(s);const r=s.vault!.run!;expect(enterVaultRoom(r,'boss')).toBe(false);expect(chooseVault(r,'loot')).toBe(false);
  enterVaultRoom(r,'stacks');expect(enterVaultRoom(r,'cistern')).toBe(false);expect(retreatVault(s)).toBe(false);
  expect(finishVaultCombat(s.vault!,999,'stacks',true)).toBe(false);expect(finishVaultCombat(s.vault!,r.id,'cistern',true)).toBe(false);
  finishVaultCombat(s.vault!,r.id,'stacks',true);expect(finishVaultCombat(s.vault!,r.id,'stacks',true)).toBe(false);expect(vaultTide(r)).toBe(1);
  expect(chooseVault(r,'loot')).toBe(true);expect(chooseVault(r,'seal')).toBe(false);expect(vaultTide(r)).toBe(2);expect(enterVaultRoom(r,'stacks')).toBe(false);
 });
 for(const order of [VAULT_WINGS,[...VAULT_WINGS].reverse()])for(const a of ['seal','loot'] as const)for(const b of ['seal','loot'] as const){
  it(`settles ${order.join('/')} ${a}/${b} once and roundtrips every checkpoint`,()=>{
   const s=make();startVault(s);const check=()=>{const parsed=parseSave(serializeSave(toSaveFile(s)));expect(parsed.vault).toEqual(s.vault);expect(fromSaveFile(parsed,d.quests).vault).toEqual(s.vault);};check();
   [a,b].forEach((c,i)=>{const r=s.vault!.run!;enterVaultRoom(r,order[i]);check();finishVaultCombat(s.vault!,r.id,order[i],true);check();chooseVault(r,c);check();});
   const r=s.vault!.run!,loot=[a,b].filter(x=>x==='loot').length;expect(vaultTide(r)).toBe(loot*2);enterVaultRoom(r,'boss');check();
   expect(vaultEnemies(r,d.enemies)).toHaveLength(1+loot);const h=vaultBossHazards(r);expect(h.rule!.intervalMs).toBe(8000-loot*1500);expect(h.rule!.element).toBe('ice');
   finishVaultCombat(s.vault!,r.id,'boss',true);check();expect(s.player.gold).toBe(0);expect(s.vault!.clears).toBe(0);
   const reward=vaultReward(r);expect(reward.pages).toBe(2+loot);expect(claimVault(s)).toBe(true);expect(claimVault(s)).toBe(false);expect(s.vault!.clears).toBe(1);expect(s.vault!.pages).toBe(2+loot);expect(s.player.gold).toBe(200+loot*80);check();
  });
 }
 it('increases later-wave danger after looting; never mutates original enemies',()=>{
  const s=make();startVault(s);wing(s,'stacks','loot');enterVaultRoom(s.vault!.run!,'cistern');const before=JSON.stringify(d.enemies);
  expect(vaultEnemies(s.vault!.run!,d.enemies)).toHaveLength(3);expect(vaultEnemies(s.vault!.run!,d.enemies).every(e=>e.drops.length===0)).toBe(true);expect(JSON.stringify(d.enemies)).toBe(before);
 });
 it.each([1,2])('allows retreat after %i resolved wings, but no pages or full-clear credit',n=>{
  const s=make();startVault(s);for(let i=0;i<n;i++)wing(s,VAULT_WINGS[i],'loot');expect(retreatVault(s)).toBe(true);expect(retreatVault(s)).toBe(false);expect(claimVault(s)).toBe(false);expect(s.player.gold).toBe(25*n);expect(s.player.exp).toBe(35*n);expect(s.vault).toMatchObject({pages:0,clears:0,retreats:1,run:null});expect(parseVault(s.vault)).toEqual(s.vault);
 });
 it('preserves banked pages on defeat and rejects stale callbacks',()=>{
  const s=make();startVault(s);finish(s,VAULT_WINGS,['loot','loot']);claimVault(s);startVault(s);const r=s.vault!.run!;enterVaultRoom(r,'stacks');
  finishVaultCombat(s.vault!,r.id,'stacks',false);expect(s.vault).toMatchObject({pages:4,clears:1,run:null});expect(finishVaultCombat(s.vault!,r.id,'stacks',true)).toBe(false);expect(claimVault(s)).toBe(false);
 });
 it.each(VAULT_GEAR)('exchanges banked pages for %s only at an eligible idle camp',id=>{
  const s=make();startVault(s);finish(s,VAULT_WINGS,['loot','loot']);claimVault(s);expect(exchangeVault(s,id)).toBe(true);expect(s.vault!.pages).toBe(1);expect(s.world.getItemCount(id)).toBe(1);expect(exchangeVault(s,id)).toBe(false);
 });
 it('reports the continue location; old saves omit the optional extension',()=>{
  const old=toSaveFile(newSession(d.quests));expect(parseSave(serializeSave(old)).vault).toBeUndefined();const s=make();startVault(s);expect(inspectSaveTransfer(serializeSave(toSaveFile(s))).summary).toContain('霜潮档案馆');
  const restored=fromSaveFile(toSaveFile(s),d.quests);restored.vault!.run!.cleared.push('stacks');expect(s.vault!.run!.cleared).toEqual([]);
 });
 it('rejects concurrently active vault/forge or vault/tower saves',()=>{
  const s=make();startVault(s);const raw=toSaveFile(s);raw.forge={version:1,attempts:1,clears:0,embers:0,run:{id:1,current:'entry',cleared:[],valveStep:0,pressure:0}};
  expect(()=>parseSave(serializeSave(raw))).toThrow();delete raw.forge;raw.tower={...newTower(),attempts:1,run:{id:1,cleared:0,phase:'ready',boons:[]}};expect(()=>parseSave(serializeSave(raw))).toThrow();
 });
 const base={version:1,attempts:1,clears:0,retreats:0,pages:0};
 it.each([
  {...base,pages:1,run:null},{...base,retreats:2,run:null},{...base,run:{id:1,room:'boss',cleared:[],decisions:[]}},
  {...base,run:{id:1,room:'hub',cleared:['stacks'],decisions:[]}},
  {...base,run:{id:1,room:'cistern',cleared:['stacks'],decisions:[]}},
  {...base,run:{id:1,room:'stacks',cleared:['stacks'],decisions:[{wing:'stacks',choice:'seal'}]}},
  {...base,run:{id:1,room:'hub',cleared:['stacks'],decisions:[{wing:'cistern',choice:'loot'}]}},
  {...base,run:{id:1,room:'hub',cleared:['stacks'],decisions:[{wing:'stacks',choice:'free'}]}},
  {...base,run:{id:1,room:'exit',cleared:['stacks','stacks'],decisions:[]}},
  {...base,run:{id:2,room:'hub',cleared:[],decisions:[]}},
 ])('rejects impossible checkpoints %#',raw=>expect(()=>parseVault(raw)).toThrow());
});
