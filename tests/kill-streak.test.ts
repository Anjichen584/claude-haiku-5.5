import {describe,it,expect} from 'vitest';
import {KillStreak} from '../src/combat/KillStreak';
describe('cosmetic kill streak',()=>{
 it('counts kills and expires after ten seconds of active combat time',()=>{const s=new KillStreak();s.kill();s.kill();expect(s.count).toBe(2);expect(s.label).toBe('连斩');s.tick(9999);expect(s.count).toBe(2);s.tick(1);expect(s.count).toBe(0);expect(s.best).toBe(2);});
 it('refreshes its window, labels milestones, and resets on rescue',()=>{const s=new KillStreak();for(let i=0;i<5;i++)s.kill();expect(s.label).toBe('横扫荒野');s.tick(9000);s.kill();expect(s.remainingMs).toBe(10000);for(let i=0;i<4;i++)s.kill();expect(s.label).toBe('势不可挡');s.reset();expect(s.count).toBe(0);expect(s.remainingMs).toBe(0);expect(s.best).toBe(10);});
 it('ignores invalid time values',()=>{const s=new KillStreak();s.kill();s.tick(NaN);s.tick(-1);expect(s.remainingMs).toBe(10000);});
});
