import type {QuestDef} from '../data/schema';
import type {GameSession} from '../state/session';
import {huntState,huntProgress,type HuntSpawn} from './hunts';

export interface HuntJournalEntry {
 key:string;
 title:string;
 level:number;
 state:ReturnType<typeof huntState>;
 prerequisite:string;
 position:{x:number;y:number};
 distance:number;
 progress:number;
 total:number;
 reward:{exp:number;gold:number;items:string[]};
}

/** A read-only projection: opening a journal cannot accept challenges or issue rewards. */
export function buildHuntJournal(session:GameSession,hunts:readonly HuntSpawn[],quests:readonly QuestDef[],itemNames:ReadonlyMap<string,string>):HuntJournalEntry[]{
 return hunts.map(h=>({
  key:h.key,title:h.hunt.title,level:h.hunt.level,state:huntState(session,h),
  prerequisite:quests.find(q=>q.id===h.unlockQuest)?.title??h.unlockQuest,
  position:{x:h.tileX,y:h.tileY},
  distance:Math.round(Math.hypot(h.tileX-session.player.tileX,h.tileY-session.player.tileY)),
  progress:huntProgress(session,h),total:h.enemyIds.length,
  reward:{exp:h.hunt.reward.exp,gold:h.hunt.reward.gold,items:h.hunt.reward.items.map(id=>itemNames.get(id)??id)},
 }));
}
