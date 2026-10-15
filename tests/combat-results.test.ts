import {describe,expect,it} from 'vitest';
import {battleSnapshot,battleSummary,resultPages,ResultInputGate} from '../src/combat/results';
import {newSession} from '../src/state/session';
import {applyGains} from '../src/state/rewards';

describe('battle result accounting',()=>{
  it('uses actual session changes including repeated drops and consumables',()=>{
    const session=newSession([]),before=battleSnapshot(session);
    session.world.addItem('health_potion',-1);
    applyGains(session,{exp:120,gold:23,items:['rift_shard','rift_shard']});
    session.world.addReputation('ashguard',8);session.world.addStability(-3);
    const result=battleSummary(before,battleSnapshot(session));
    expect(result).toMatchObject({exp:120,gold:23,levelBefore:1,levelAfter:2,skillPoints:1,stability:-3});
    expect(result.items).toEqual([{id:'health_potion',delta:-1},{id:'rift_shard',delta:2}]);
    expect(result.reputation).toEqual([{id:'ashguard',delta:8}]);
    expect(before.inventory.health_potion).toBe(2);
  });
  it('does not invent rewards or mutate state when rendered repeatedly',()=>{
    const session=newSession([]),before=battleSnapshot(session);
    const unchanged=JSON.stringify(battleSnapshot(session));
    for(let i=0;i<20;i++)expect(battleSummary(before,battleSnapshot(session))).toMatchObject({exp:0,gold:0,items:[],reputation:[]});
    expect(JSON.stringify(battleSnapshot(session))).toBe(unchanged);
  });
  it('reports net zero when a consumed item is replaced by a drop',()=>{
    const session=newSession([]),before=battleSnapshot(session);
    session.world.addItem('health_potion',-1);session.world.addItem('health_potion',1);
    expect(battleSummary(before,battleSnapshot(session)).items).toEqual([]);
  });
  it('paginates without truncation or duplication',()=>{
    const lines=Array.from({length:45},(_,i)=>`line ${i}`),pages=resultPages(lines);
    expect(pages).toHaveLength(8);expect(pages.flat()).toEqual(lines);
    expect(pages.every(p=>p.length<=6)).toBe(true);
    expect(resultPages([])).toHaveLength(1);
    expect(()=>resultPages(lines,0)).toThrow(RangeError);
  });
});

describe('result confirmation guard',()=>{
  it('discards the finishing dodge and refuses a held Space past the delay',()=>{
    const gate=new ResultInputGate(1000);
    expect(gate.update(1000,true,true)).toBe(false);
    expect(gate.update(2000,true,true)).toBe(false);expect(gate.ready).toBe(false);
    expect(gate.update(2010,false,true)).toBe(false);expect(gate.ready).toBe(true);
    expect(gate.update(2020,true,true)).toBe(true);
  });
  it('arms only after the minimum delay and requires a fresh press',()=>{
    const gate=new ResultInputGate(0);
    expect(gate.update(100,false,true)).toBe(false);
    expect(gate.update(450,false,false)).toBe(false);expect(gate.ready).toBe(true);
    expect(gate.update(500,false,false)).toBe(false);
    expect(gate.update(520,true,true)).toBe(true);
  });
});
