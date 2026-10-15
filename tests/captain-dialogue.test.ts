import {describe,expect,it} from 'vitest';
import dialogues from '../data/dialogues.json';
import type {DialogueDef} from '../src/data/schema';
import {DialogueRunner} from '../src/dialogue/DialogueRunner';
import {WorldState} from '../src/state/WorldState';
const captain=dialogues.dialogues.find(d=>d.id==='ashguard_captain_intro') as unknown as DialogueDef;
const run=(world:WorldState)=>new DialogueRunner(captain,world);
function choose(r:DialogueRunner,text:string){const c=r.choices().find(c=>c.text===text);expect(c).toBeDefined();r.choose(c!.index);while(!r.finished)r.advance();}

describe('captain first meeting and revisits',()=>{
  it('grants help reputation and start request only once across repeated conversations',()=>{
    const w=new WorldState();let r=run(w);choose(r,'我需要帮助。');
    expect(w.getReputation('ashguard')).toBe(5);expect(r.pendingQuestStarts).toEqual(['main_01_first_rift']);
    for(let i=0;i<5;i++){
      r=run(w);expect(r.choices().some(c=>c.text==='我需要帮助。')).toBe(false);
      choose(r,'我想确认一下接下来的路。');expect(r.pendingQuestStarts).toEqual([]);
    }
    expect(w.getReputation('ashguard')).toBe(5);
  });
  it('applies the rude response only once without blocking a later first-help response',()=>{
    const w=new WorldState();choose(run(w),'与你无关。');expect(w.getReputation('ashguard')).toBe(-5);
    expect(run(w).choices().some(c=>c.text==='与你无关。')).toBe(false);
    choose(run(w),'我需要帮助。');expect(w.getReputation('ashguard')).toBe(0);
  });
  it('supports existing met-captain flags without retroactively rewarding again',()=>{
    const w=new WorldState();w.setFlag('met_captain');w.addReputation('ashguard',17);
    choose(run(w),'我想确认一下接下来的路。');expect(w.getReputation('ashguard')).toBe(17);
  });
  it('always provides a neutral exit across first/completed/low-reputation states',()=>{
    for(const met of [false,true])for(const insulted of [false,true])for(const completed of [false,true])for(const rep of [-100,0,100]){
      const w=new WorldState();if(met)w.setFlag('met_captain');if(insulted)w.setFlag('insulted_captain');
      w.addReputation('ashguard',rep);if(completed)w.setQuest('main_01_first_rift',{status:'completed',progress:[5]});
      const r=run(w);expect(r.choices().length).toBeGreaterThan(0);choose(r,'先告辞了。');expect(w.getReputation('ashguard')).toBe(rep);
    }
  });
  it('keeps completed-chapter lore accessible without granting reputation or restart requests',()=>{
    const w=new WorldState();w.setQuest('main_01_first_rift',{status:'completed',progress:[5]});
    for(let i=0;i<3;i++){
      const r=run(w);choose(r,'我想知道裂隙的事。');expect(r.pendingQuestStarts).toEqual([]);
    }
    expect(w.hasFlag('knows_rift')).toBe(true);expect(w.getReputation('ashguard')).toBe(0);
  });
});
