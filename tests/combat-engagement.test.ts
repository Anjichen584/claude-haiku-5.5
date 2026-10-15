import {describe,expect,it} from 'vitest';
import {attackIntent,BATTLE_PLAYER_START,encounterFormation,ENCOUNTER_OPENING_MS} from '../src/combat/engagement';
import {Actor} from '../src/combat/Actor';
import {CombatRuntime} from '../src/combat/CombatRuntime';
import {combatProfile} from '../src/combat/profile';

const origin={x:0,y:0};
describe('encounter approach assist',()=>{
  it('places supported encounter sizes inside arena with readable separation',()=>{
    for(const count of [1,2,3,8]){
      const formation=encounterFormation(Array.from({length:count},()=> 'wolf'));
      expect(formation).toHaveLength(count);
      for(const e of formation){
        expect(e.x).toBeGreaterThanOrEqual(110);expect(e.x).toBeLessThanOrEqual(1170);
        expect(e.y).toBeGreaterThanOrEqual(210);expect(e.y).toBeLessThanOrEqual(570);
        const distance=Math.hypot(e.x-BATTLE_PLAYER_START.x,e.y-BATTLE_PLAYER_START.y);
        expect(distance).toBeGreaterThan(220);expect(distance).toBeLessThan(430);
      }
    }
    expect(ENCOUNTER_OPENING_MS).toBeGreaterThanOrEqual(500);
  });
  it('returns no target for an empty or defeated group',()=>{
    expect(attackIntent(origin,[],74)).toBeNull();
    expect(attackIntent(origin,[{id:'dead',x:1,y:0,dead:true}],74)).toBeNull();
  });
  it('faces the closest living target and deterministically breaks ties',()=>{
    const intent=attackIntent(origin,[{id:'z',x:300,y:0},{id:'b',x:-100,y:0},{id:'a',x:0,y:-100}],74)!;
    expect(intent.targetId).toBe('a');expect(intent.direction).toEqual({x:0,y:-1});expect(intent.approach).toBe(34);
  });
  it('stops inside weapon reach without crossing the target',()=>{
    const intent=attackIntent(origin,[{id:'wolf',x:200,y:0}],74)!;
    expect(intent.approach).toBe(134);
    expect(attackIntent({x:intent.approach,y:0},[{id:'wolf',x:200,y:0}],74)?.approach).toBe(0);
  });
  it('handles overlapping target positions without a NaN direction',()=>{
    const intent=attackIntent(origin,[{id:'wolf',...origin}],74)!;
    expect(intent.approach).toBe(0);expect(intent.direction).toEqual({x:1,y:0});
  });
  it('respects extended weapon range',()=>{
    expect(attackIntent(origin,[{id:'wolf',x:180,y:0}],220)?.approach).toBe(0);
  });
  it('approach does not damage enemies or bypass range and attack cooldown',()=>{
    const profile=combatProfile({},[],[],[]);
    const actor=new Actor({maxHp:100,staggerMs:0});
    const runtime=new CombatRuntime(actor,profile,[],[],[]);
    const target={id:'wolf',x:260,y:0,actor:new Actor({maxHp:100,staggerMs:0}),defense:0};
    expect(runtime.basicAttack(origin,{x:1,y:0},[target])).toEqual([]);
    expect(target.actor.hp).toBe(100);
    runtime.tick(1000,[target]);runtime.tick(1000,[target]);runtime.tick(1000,[target]);runtime.tick(1000,[target]);
    const intent=attackIntent(origin,[target],profile.weaponRange)!;
    const position={x:intent.approach,y:0};
    expect(runtime.basicAttack(position,intent.direction,[target])).toHaveLength(1);
    const hp=target.actor.hp;
    expect(runtime.basicAttack(position,intent.direction,[target])).toEqual([]);
    expect(target.actor.hp).toBe(hp);
  });
});
