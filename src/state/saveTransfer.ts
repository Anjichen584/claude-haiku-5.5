import {parseSave,type SaveFile} from './session';
import {SaveRepository,SAVE_KEY,BACKUP_KEY,type SaveStorage} from './saveRepository';
import {levelForExp} from './rewards';
export const IMPORT_BACKUP_KEY=`${SAVE_KEY}-before-import`;
export const MAX_TRANSFER_BYTES=2*1024*1024;
export interface SaveInspection {raw:string;save:SaveFile;summary:string}
export interface ImportPlan extends SaveInspection {previousPrimary:string|null;previousBackup:string|null}
export function inspectSaveTransfer(raw:string):SaveInspection{
 if(new TextEncoder().encode(raw).length>MAX_TRANSFER_BYTES)throw new Error('文件超过 2 MB 上限，未读取为存档');
 const save=parseSave(raw);
 const date=new Date(save.savedAt),stamp=Number.isFinite(date.getTime())?date.toLocaleString('zh-CN'):'未知时间';
 const completed=Object.values(save.world.quests).filter(q=>q.status==='completed').length;
 const location=save.dungeon?.activeFloor!=null?`地牢第 ${save.dungeon.activeFloor} 层`:save.forge?.run?'灰烬熔炉':save.tower?.run?`试炼塔（已通过 ${save.tower.run.cleared} 层）`:'地表';
 return {raw,save,summary:`Lv.${levelForExp(save.player.exp)} · ${save.player.gold} 金币 · ${location}\n已完成 ${completed} 个任务 · 保存于 ${stamp}`};
}
export function prepareSaveImport(raw:string,storage:SaveStorage|null):ImportPlan{
 const inspected=inspectSaveTransfer(raw);if(!storage)throw new Error('浏览器存储不可用，不能导入');
 try{return {...inspected,previousPrimary:storage.getItem(SAVE_KEY),previousBackup:storage.getItem(BACKUP_KEY)};}
 catch{throw new Error('无法读取现有存档，已阻止覆盖');}
}
function valid(raw:string|null):raw is string{if(raw===null)return false;try{parseSave(raw);return true;}catch{return false;}}
/** Confirm uses compare-before-write; never replace progress changed since preview.
 * A dedicated recovery slot survives subsequent normal autosaves.
 */
export function commitSaveImport(plan:ImportPlan,storage:SaveStorage|null):void{
 inspectSaveTransfer(plan.raw);if(!storage)throw new Error('浏览器存储不可用，不能导入');
 if(storage.getItem(SAVE_KEY)!==plan.previousPrimary||storage.getItem(BACKUP_KEY)!==plan.previousBackup)throw new Error('存档在预览后发生变化，请重新选择文件后确认');
 const previous=valid(plan.previousPrimary)?plan.previousPrimary:valid(plan.previousBackup)?plan.previousBackup:null;
 if(previous){try{storage.setItem(IMPORT_BACKUP_KEY,previous);}catch{throw new Error('无法保留导入前备份，已取消导入；请先导出存档并释放存储空间');}}
 if(!new SaveRepository(storage).write(plan.raw))throw new Error('导入写入失败，原主存档未被替换；请检查浏览器存储空间');
}
export function readTransferSource(storage:SaveStorage|null,source:'latest'|'backup'|'before-import'):SaveInspection{
 if(!storage)throw new Error('浏览器存储不可用');
 const latest=source==='latest'?new SaveRepository(storage).read():null;
 const raw=latest?latest.raw:storage.getItem(source==='backup'?BACKUP_KEY:IMPORT_BACKUP_KEY);
 if(raw===null)throw new Error('没有可导出的存档；请先返回游戏按 K 保存');
 const inspected=inspectSaveTransfer(raw);
 if(latest?.source==='backup')inspected.summary='主存档异常：当前使用上一备份，进度可能回退。\n'+inspected.summary;
 return inspected;
}
