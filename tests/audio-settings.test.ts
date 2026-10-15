import {describe,it,expect} from 'vitest';
import {DEFAULT_AUDIO,parseAudioSettings} from '../src/audio/settings';
describe('audio preferences',()=>{
 it.each([null,'broken','null','0','false'])('handles absent/corrupt settings: %s',raw=>expect(parseAudioSettings(raw)).toEqual(DEFAULT_AUDIO));
 it('clamps volumes and validates field types',()=>expect(parseAudioSettings('{"master":5,"music":-3,"sfx":"loud","muted":"false"}')).toEqual({...DEFAULT_AUDIO,master:1,music:0}));
 it('round-trips muted and volume settings independently of saves',()=>{const s={master:.8,music:.2,sfx:0,muted:true};expect(parseAudioSettings(JSON.stringify(s))).toEqual(s);});
 it('never mutates defaults',()=>{const a=parseAudioSettings(null);a.master=0;expect(parseAudioSettings(null).master).toBe(.55);});
});
