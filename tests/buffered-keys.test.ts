import {describe,it,expect} from 'vitest';
import {PressBuffer} from '../src/input/bufferedKeys';
describe('fast-tap input buffering',()=>{
 it('preserves a tap until the next frame and consumes once',()=>{let now=0;const b=new PressBuffer(()=>now);b.press(69);now=40;expect(b.take(69)).toBe(true);expect(b.take(69)).toBe(false);});
 it('independent keys do not consume each other',()=>{const b=new PressBuffer(()=>10);b.press(49);b.press(50);expect(b.take(51)).toBe(false);expect(b.take(49)).toBe(true);expect(b.take(50)).toBe(true);});
 it('stale modal inputs do not execute long after the panel closes',()=>{let now=0;const b=new PressBuffer(()=>now);b.press(69);now=1001;expect(b.take(69)).toBe(false);});
 it('repeated down events coalesce rather than overflowing an action queue',()=>{const b=new PressBuffer(()=>0);for(let i=0;i<50;i++)b.press(71);expect(b.take(71)).toBe(true);expect(b.take(71)).toBe(false);});
 it('scene shutdown clears old taps',()=>{const b=new PressBuffer(()=>0);b.press(69);b.clear();expect(b.take(69)).toBe(false);});
});
