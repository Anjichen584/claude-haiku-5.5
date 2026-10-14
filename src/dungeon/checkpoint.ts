import {isConnected,type Layout,type RoomKind} from './layout';
import {startRun,type DungeonRun} from './run';
import type {DungeonFloorFile} from './floors';
import {MAX_DUNGEON_FLOOR} from '../state/constants';

export interface DungeonProgress {activeFloor:number|null;runs:DungeonRun[]}
export interface SavedDungeonRun {floor:number;seed:number;layout:Layout;current:number;cleared:number[];finished:boolean}
export interface DungeonSnapshot {version:1;activeFloor:number|null;runs:SavedDungeonRun[]}
const cloneLayout=(layout:Layout):Layout=>({...layout,rooms:layout.rooms.map(r=>({...r})),edges:layout.edges.map(([a,b])=>[a,b])});
export function snapshotDungeon(progress:DungeonProgress):DungeonSnapshot{
 return {version:1,activeFloor:progress.activeFloor,runs:progress.runs.map(run=>({...run,layout:cloneLayout(run.layout),cleared:[...run.cleared].sort((a,b)=>a-b)}))};
}
export function restoreDungeon(snapshot:DungeonSnapshot):DungeonProgress{
 return {activeFloor:snapshot.activeFloor,runs:snapshot.runs.map(run=>({...run,layout:cloneLayout(run.layout),cleared:new Set(run.cleared)}))};
}
/** Re-entering a floor reuses its layout and claims instead of regenerating free chests. */
export function openDungeon(progress:DungeonProgress,seed:number,floor:number,file:DungeonFloorFile):DungeonRun{
 let run=progress.runs.find(r=>r.floor===floor);
 if(!run){run=startRun(seed,floor,file);progress.runs.push(run);}
 progress.activeFloor=floor;return run;
}
export function activeDungeon(progress:DungeonProgress|undefined):DungeonRun|null{
 return progress?.runs.find(r=>r.floor===progress.activeFloor)??null;
}
/** A defeat returns to the entrance but does not erase already claimed rewards. */
export function retreatDungeon(progress:DungeonProgress):void{
 const run=activeDungeon(progress);if(run)run.current=run.layout.rooms.find(r=>r.kind==='entrance')!.id;
 progress.activeFloor=null;
}
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const kinds:RoomKind[]=['entrance','combat','chest','event','rest','shop','boss'];
function bad(reason:string):never{throw new Error(reason);}
/** Defensive deserializer: validate bounds/references/graph before any scene may use the data. */
export function parseDungeon(value:unknown,unlockedFloor:number):DungeonSnapshot{
 if(!record(value)||value.version!==1||!Array.isArray(value.runs)||value.runs.length>MAX_DUNGEON_FLOOR)bad('版本或楼层列表错误');
 const activeFloor=value.activeFloor;
 if(activeFloor!==null&&!integer(activeFloor,1,unlockedFloor))bad('当前楼层错误');
 const floors=new Set<number>();
 const runs:SavedDungeonRun[]=value.runs.map(raw=>{
  if(!record(raw)||!integer(raw.floor,1,unlockedFloor)||!integer(raw.seed,0,0xffffffff)||floors.has(raw.floor))bad('楼层/种子错误或重复');
  floors.add(raw.floor);
  const l=raw.layout;
  if(!record(l)||l.floor!==raw.floor||l.seed!==raw.seed||!integer(l.attempt,0,1000000)||!Array.isArray(l.rooms)||l.rooms.length<2||l.rooms.length>128||!Array.isArray(l.edges)||l.edges.length>512)bad('地图结构错误');
  const cells=new Set<string>();let entrances=0,bosses=0;
  const rooms=l.rooms.map((room,index)=>{
   if(!record(room)||room.id!==index||!integer(room.x,-256,256)||!integer(room.y,-256,256)||!kinds.includes(room.kind as RoomKind))bad('房间数据错误');
   const cell=`${room.x},${room.y}`;if(cells.has(cell))bad('房间坐标重复');cells.add(cell);
   if(room.kind==='entrance'){entrances++;if(index!==0)bad('入口编号错误');}if(room.kind==='boss')bosses++;
   return {id:index,x:room.x,y:room.y,kind:room.kind as RoomKind};
  });
  if(entrances!==1||bosses!==1||!integer(l.bossId,1,rooms.length-1)||rooms[l.bossId].kind!=='boss')bad('入口或 Boss 房间错误');
  const edgeKeys=new Set<string>();
  const edges:Array<[number,number]>=l.edges.map(edge=>{
   if(!Array.isArray(edge)||edge.length!==2||!integer(edge[0],0,rooms.length-1)||!integer(edge[1],0,rooms.length-1)||edge[0]>=edge[1])bad('地图连线错误');
   const [a,b]=edge,key=`${a}:${b}`;if(edgeKeys.has(key)||Math.abs(rooms[a].x-rooms[b].x)+Math.abs(rooms[a].y-rooms[b].y)!==1)bad('连线重复或非相邻房间');edgeKeys.add(key);return [a,b];
  });
  const layout:Layout={floor:raw.floor,seed:raw.seed,attempt:l.attempt,bossId:l.bossId,rooms,edges};
  if(!isConnected(layout))bad('地图不连通');
  if(!integer(raw.current,0,rooms.length-1)||!Array.isArray(raw.cleared)||raw.cleared.length>rooms.length||typeof raw.finished!=='boolean')bad('探索记录错误');
  const cleared:number[]=raw.cleared.map(id=>{if(!integer(id,0,rooms.length-1)||['entrance','shop'].includes(rooms[id].kind))bad('房间清理标记错误');return id;});
  if(new Set(cleared).size!==cleared.length||raw.finished!==cleared.includes(layout.bossId))bad('奖励/Boss 清理标记不一致');
  return {floor:raw.floor,seed:raw.seed,layout,current:raw.current,cleared,finished:raw.finished};
 });
 if(activeFloor!==null&&!floors.has(activeFloor))bad('当前楼层缺失');
 return {version:1,activeFloor,runs};
}
