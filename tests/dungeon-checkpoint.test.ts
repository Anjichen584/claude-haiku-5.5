import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import dungeonJson from '../data/dungeon.json';
import type {DungeonFloorFile} from '../src/dungeon/floors';
import {startRun,markCleared,neighbors,moveTo} from '../src/dungeon/run';
import {activeDungeon,openDungeon,parseDungeon,restoreDungeon,retreatDungeon,snapshotDungeon,type DungeonProgress} from '../src/dungeon/checkpoint';
import {newSession,toSaveFile,serializeSave,parseSave,fromSaveFile} from '../src/state/session';
import {getRun,setRun,setSession} from '../src/state/sessionStore';
import {SaveRepository,SAVE_KEY,BACKUP_KEY,type SaveStorage} from '../src/state/saveRepository';
const floors=dungeonJson as DungeonFloorFile;
const progress=():DungeonProgress=>({activeFloor:1,runs:[startRun(20261014,1,floors)]});
const saved=()=>snapshotDungeon(progress());
class MemoryStorage implements SaveStorage{
 data=new Map<string,string>();failAt:string|null=null;readFails=new Set<string>();
 getItem(key:string):string|null{if(this.readFails.has(key))throw Error('storage blocked');return this.data.get(key)??null;}
 setItem(key:string,value:string):void{if(key===this.failAt)throw Error('quota');this.data.set(key,value);}
}
const saveRaw=(gold=0)=>{const s=newSession([]);s.player.gold=gold;return serializeSave(toSaveFile(s));};
describe('dungeon snapshot and lifecycle',()=>{
 beforeEach(()=>setSession(null));afterEach(()=>setSession(null));
 it.each(Array.from({length:12},(_,i)=>i+1))('floor %s layout survives roundtrip without regeneration',(floor)=>{
  const p:DungeonProgress={activeFloor:floor,runs:[startRun(100+floor,floor,floors)]},r=p.runs[0];
  r.current=neighbors(r,r.current)[0].id;
  const claim=r.layout.rooms.find(room=>room.kind==='chest'||room.kind==='event'||room.kind==='combat'||room.kind==='rest');if(claim)markCleared(r,claim.id);
  expect(snapshotDungeon(restoreDungeon(parseDungeon(JSON.parse(JSON.stringify(snapshotDungeon(p))),floor)))).toEqual(snapshotDungeon(p));
 });
 it('snapshot and restore never alias layouts, edges or cleared arrays',()=>{
  const p=progress(),s=snapshotDungeon(p),r=restoreDungeon(s);s.runs[0].layout.rooms[0].x=90;s.runs[0].layout.edges[0][0]=90;s.runs[0].cleared.push(90);
  expect(p.runs[0].layout.rooms[0].x).toBe(0);expect(r.runs[0].layout.rooms[0].x).toBe(0);expect(p.runs[0].cleared.has(90)).toBe(false);expect(r.runs[0].cleared.has(90)).toBe(false);
 });
 it('closed floors reuse the same claims and position on re-entry, even with a new generator seed',()=>{
  const p=progress(),r=p.runs[0],room=r.layout.rooms.find(x=>x.kind==='combat'||x.kind==='event'||x.kind==='rest'||x.kind==='chest')!;
  r.current=room.id;markCleared(r,room.id);p.activeFloor=null;
  expect(openDungeon(p,999,1,floors)).toBe(r);expect(r.cleared.has(room.id)).toBe(true);expect(r.current).toBe(room.id);expect(r.seed).toBe(20261014);
 });
 it('new floor archives the previous floor and does not erase its rewards',()=>{const p=progress(),r=p.runs[0];markCleared(r,r.layout.bossId);openDungeon(p,99,2,floors);expect(p.runs).toHaveLength(2);expect(activeDungeon(p)?.floor).toBe(2);expect(p.runs[0].finished).toBe(true);});
 it('retreat preserves claims but returns the run to its entrance',()=>{const p=progress(),r=p.runs[0];r.current=neighbors(r,0)[0].id;markCleared(r,r.layout.bossId);retreatDungeon(p);expect(p.activeFloor).toBeNull();expect(r.current).toBe(0);expect(r.cleared.has(r.layout.bossId)).toBe(true);});
 it('repeated claims return false; entrances and shops cannot be claimed',()=>{const r=progress().runs[0];expect(markCleared(r,r.layout.bossId)).toBe(true);expect(markCleared(r,r.layout.bossId)).toBe(false);expect(markCleared(r,0)).toBe(false);});
 it('the session owns active run state rather than a stale global cache',()=>{const a=newSession([]),b=newSession([]),r=progress().runs[0];setSession(a);setRun(r);expect(getRun()).toBe(r);setSession(b);expect(getRun()).toBeNull();setSession(a);setRun(null);expect(getRun()).toBeNull();expect(a.dungeon?.runs[0]).toBe(r);});
 it('starting a new game never carries another character dungeon',()=>{setSession(newSession([]));setRun(progress().runs[0]);setSession(newSession([]));expect(getRun()).toBeNull();});
 it('full save roundtrip restores archived floor, active cursor, rewards and character together',()=>{const s=newSession([]);s.dungeon=progress();s.player.gold=123;s.world.addItem('rift_shard',2);moveTo(s.dungeon.runs[0],neighbors(s.dungeon.runs[0],0)[0].id);const raw=serializeSave(toSaveFile(s)),loaded=fromSaveFile(parseSave(raw),[]);expect(loaded.player.gold).toBe(123);expect(loaded.world.getItemCount('rift_shard')).toBe(2);expect(snapshotDungeon(loaded.dungeon!)).toEqual(snapshotDungeon(s.dungeon));loaded.dungeon!.runs[0].layout.rooms[0].x=9;expect(s.dungeon.runs[0].layout.rooms[0].x).toBe(0);});
 it('legacy version 1 saves remain valid with no dungeon field',()=>{expect(fromSaveFile(parseSave(saveRaw()),[]).dungeon).toBeUndefined();});
});
describe('malformed checkpoint rejection',()=>{
 const reject=(edit:(s:any)=>void)=>{const s=saved();edit(s);expect(()=>parseDungeon(s,12)).toThrow();};
 const cases:Array<[string,(s:any)=>void]>=[
  ['unsupported format',s=>s.version=2],['invalid active floor',s=>s.activeFloor=NaN],['missing active floor',s=>s.activeFloor=2],['duplicate floor',s=>s.runs.push(s.runs[0])],['locked floor',s=>{s.runs[0].floor=13;s.runs[0].layout.floor=13;}],
  ['negative seed',s=>s.runs[0].seed=-1],['seed mismatch',s=>s.runs[0].layout.seed=99],['invalid generation attempt',s=>s.runs[0].layout.attempt=-1],['empty graph',s=>s.runs[0].layout.rooms=[]],['excessive graph',s=>s.runs[0].layout.rooms=Array(129).fill({})],
  ['unknown room kind',s=>s.runs[0].layout.rooms[0].kind='portal'],['non-integer coordinate',s=>s.runs[0].layout.rooms[0].x=.5],['duplicate room id',s=>s.runs[0].layout.rooms[1].id=0],['duplicate grid cell',s=>{s.runs[0].layout.rooms[1].x=0;s.runs[0].layout.rooms[1].y=0;}],
  ['invalid boss',s=>s.runs[0].layout.bossId=0],['extra entrance',s=>s.runs[0].layout.rooms[1].kind='entrance'],['missing edges',s=>s.runs[0].layout.edges=[]],['duplicate edge',s=>s.runs[0].layout.edges.push(s.runs[0].layout.edges[0])],['self edge',s=>s.runs[0].layout.edges[0]=[0,0]],['invalid edge reference',s=>s.runs[0].layout.edges[0]=[0,999]],
  ['cursor out of bounds',s=>s.runs[0].current=999],['fractional cursor',s=>s.runs[0].current=.5],['cleared room out of bounds',s=>s.runs[0].cleared=[999]],['claimed entrance',s=>s.runs[0].cleared=[0]],['duplicate claim',s=>s.runs[0].cleared=[s.runs[0].layout.bossId,s.runs[0].layout.bossId]],['false boss completion',s=>s.runs[0].finished=true],['missing boss completion',s=>s.runs[0].cleared=[s.runs[0].layout.bossId]],
 ];
 it.each(cases)('rejects %s',(_name,edit)=>reject(edit));
 it('parseSave surfaces invalid dungeon data as a SaveError',()=>{const file=toSaveFile(newSession([]));file.dungeon=saved();file.dungeon.runs[0].current=999;expect(()=>parseSave(serializeSave(file))).toThrow(/地牢进度/);});
});
describe('primary/backup storage repository',()=>{
 it('writes a valid primary, then backs up previous complete checkpoint',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);expect(repo.write(saveRaw(10))).toBe(true);expect(repo.write(saveRaw(20))).toBe(true);expect(parseSave(st.getItem(SAVE_KEY)!).player.gold).toBe(20);expect(parseSave(st.getItem(BACKUP_KEY)!).player.gold).toBe(10);});
 it('prefers a valid primary over an older valid backup',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);repo.write(saveRaw(10));repo.write(saveRaw(20));expect(repo.read().source).toBe('primary');expect(parseSave(repo.read().raw!).player.gold).toBe(20);});
 it.each(['{broken','null',JSON.stringify({version:999})])('recovers valid backup from corrupt primary %s',(broken)=>{const st=new MemoryStorage(),repo=new SaveRepository(st);st.data.set(SAVE_KEY,broken);st.data.set(BACKUP_KEY,saveRaw(10));expect(repo.read().source).toBe('backup');expect(parseSave(repo.read().raw!).player.gold).toBe(10);});
 it('recovers a backup when primary is missing',()=>{const st=new MemoryStorage();st.data.set(BACKUP_KEY,saveRaw());expect(new SaveRepository(st).read().source).toBe('backup');});
 it('does not hide corruption if both copies are invalid',()=>{const st=new MemoryStorage();st.data.set(SAVE_KEY,'broken');st.data.set(BACKUP_KEY,'also broken');expect(new SaveRepository(st).read()).toEqual({raw:'broken',source:'invalid'});});
 it('rejects malformed writes before touching either valid copy',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);repo.write(saveRaw(10));repo.write(saveRaw(20));const before=[...st.data];expect(repo.write('{')).toBe(false);expect([...st.data]).toEqual(before);});
 it('backup failure leaves the previous primary intact',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);repo.write(saveRaw(10));st.failAt=BACKUP_KEY;expect(repo.write(saveRaw(20))).toBe(false);expect(parseSave(repo.read().raw!).player.gold).toBe(10);});
 it('primary failure preserves the previous complete checkpoint and backup',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);repo.write(saveRaw(10));st.failAt=SAVE_KEY;expect(repo.write(saveRaw(20))).toBe(false);expect(parseSave(st.getItem(SAVE_KEY)!).player.gold).toBe(10);expect(parseSave(st.getItem(BACKUP_KEY)!).player.gold).toBe(10);});
 it('recovering then saving does not overwrite good backup with corrupt primary',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st);st.data.set(SAVE_KEY,'broken');st.data.set(BACKUP_KEY,saveRaw(10));expect(repo.write(saveRaw(20))).toBe(true);expect(parseSave(st.getItem(BACKUP_KEY)!).player.gold).toBe(10);expect(parseSave(st.getItem(SAVE_KEY)!).player.gold).toBe(20);});
 it('blocked primary reads can still recover accessible backup',()=>{const st=new MemoryStorage();st.readFails.add(SAVE_KEY);st.data.set(BACKUP_KEY,saveRaw());expect(new SaveRepository(st).read().source).toBe('backup');});
 it('unavailable storage fails cleanly, without throwing',()=>{const repo=new SaveRepository(null);expect(repo.read().source).toBe('unavailable');expect(repo.write(saveRaw())).toBe(false);});
 it('empty storage is distinguishable from inaccessible storage',()=>{expect(new SaveRepository(new MemoryStorage()).read().source).toBe('none');});
 it('whole-payload recovery restores inventory AND room claims, not a mixed generation',()=>{const st=new MemoryStorage(),repo=new SaveRepository(st),s=newSession([]);s.dungeon=progress();repo.write(serializeSave(toSaveFile(s)));const room=s.dungeon.runs[0].layout.rooms.find(r=>r.kind==='combat'||r.kind==='chest'||r.kind==='event'||r.kind==='rest')!;markCleared(s.dungeon.runs[0],room.id);s.player.gold+=100;s.world.addItem('rift_shard',1);repo.write(serializeSave(toSaveFile(s)));st.data.set(SAVE_KEY,'broken');const recovered=fromSaveFile(parseSave(repo.read().raw!),[]);expect(recovered.player.gold).toBe(0);expect(recovered.world.getItemCount('rift_shard')).toBe(0);expect(recovered.dungeon!.runs[0].cleared.has(room.id)).toBe(false);});
});
