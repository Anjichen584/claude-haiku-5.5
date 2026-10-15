import {describe,expect,it} from 'vitest';
import {attackIntent,cycleTarget} from '../src/combat/engagement';
import {ARENA_BOUNDS,ENEMY_SEPARATION,separateEnemies} from '../src/combat/crowd';
import {Actor} from '../src/combat/Actor';
import {CombatRuntime} from '../src/combat/CombatRuntime';
import {combatProfile} from '../src/combat/profile';
import type {SkillDef} from '../src/data/schema';

const origin={x:0,y:0};
const candidates=[{id:'near',x:40,y:0},{id:'far',x:100,y:0}];
describe('stable combat target',()=>{
  it('retains a selected living target even when another becomes nearer',()=>{
    expect(attackIntent(origin,candidates,74,'far')?.targetId).toBe('far');
    expect(attackIntent(origin,[...candidates,{id:'closest',x:1,y:0}],74,'far')?.targetId).toBe('far');
  });
  it('falls back after death or removal and returns null when empty',()=>{
    expect(attackIntent(origin,[candidates[0],{...candidates[1],dead:true}],74,'far')?.targetId).toBe('near');
    expect(attackIntent(origin,[candidates[0]],74,'far')?.targetId).toBe('near');
    expect(attackIntent(origin,[],74,'far')).toBeNull();
  });
  it('cycles through living targets and wraps without array-order dependence',()=>{
    expect(cycleTarget(origin,candidates,null)).toBe('near');
    expect(cycleTarget(origin,[...candidates].reverse(),'near')).toBe('far');
    expect(cycleTarget(origin,candidates,'far')).toBe('near');
    expect(cycleTarget(origin,[{...candidates[0],dead:true},candidates[1]],'near')).toBe('far');
    expect(cycleTarget(origin,[],'far')).toBeNull();
  });
  it('prioritizes a locked bolt target only when inside its valid cone/range',()=>{
    const skill:SkillDef={id:'bolt-test',name:'bolt',branch:'arcane',tier:1,requires:[],manaCost:0,cooldown:0,cost:{skillPoints:0},combat:{kind:'bolt',range:200,targets:1,description:'test'}};
    const runtime=()=>new CombatRuntime(new Actor({maxHp:100,staggerMs:0}),combatProfile({},[],[],[]),[skill],[skill.id],[]);
    const targets=candidates.map(t=>({...t,actor:new Actor({maxHp:100,staggerMs:0}),defense:0}));
    expect(runtime().cast(skill.id,origin,{x:1,y:0},targets,'far').targets.map(t=>t.id)).toEqual(['far']);
    expect(runtime().cast(skill.id,origin,{x:1,y:0},[{...targets[1],x:500}],'far').reason).toBe('no-target');
    expect(runtime().cast(skill.id,origin,{x:-1,y:0},targets,'far').reason).toBe('no-target');
  });
});

describe('enemy crowd spacing',()=>{
  it('separates three coincident bodies without mutating input',()=>{
    const source=[{id:'a',x:640,y:380},{id:'b',x:640,y:380},{id:'c',x:640,y:380}];
    const before=JSON.stringify(source),out=separateEnemies(source);
    expect(JSON.stringify(source)).toBe(before);
    for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++)expect(Math.hypot(out[i].x-out[j].x,out[i].y-out[j].y)).toBeGreaterThan(ENEMY_SEPARATION-.1);
  });
  it('does not move a windup anchor or displace already separated units',()=>{
    const units=[{id:'anchor',x:600,y:350,anchored:true},{id:'moving',x:610,y:350}];
    const out=separateEnemies(units);
    expect(out[0]).toEqual(units[0]);expect(out[1].x).toBeGreaterThanOrEqual(672);
    expect(separateEnemies([{id:'a',x:300,y:300},{id:'b',x:600,y:400}])).toEqual([{id:'a',x:300,y:300},{id:'b',x:600,y:400}]);
  });
  it('leaves two simultaneous windup anchors fixed',()=>{
    const units=[{id:'a',x:600,y:350,anchored:true},{id:'b',x:610,y:350,anchored:true}];
    expect(separateEnemies(units)).toEqual(units);
  });
  it('is independent of input order and stays inside the actor area',()=>{
    const source=[{id:'z',x:ARENA_BOUNDS.right,y:400},{id:'a',x:ARENA_BOUNDS.right-8,y:400}];
    const first=separateEnemies(source),reverse=separateEnemies([...source].reverse());
    expect(reverse.reverse()).toEqual(first);
    for(const n of first){expect(n.x).toBeGreaterThanOrEqual(ARENA_BOUNDS.left);expect(n.x).toBeLessThanOrEqual(ARENA_BOUNDS.right);expect(n.y).toBeLessThanOrEqual(ARENA_BOUNDS.bottom);}
  });
});
