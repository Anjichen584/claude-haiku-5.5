import {parseSave} from './session';
export const SAVE_KEY='rift-chronicles-save-v1';
export const BACKUP_KEY=`${SAVE_KEY}-backup`;
export interface SaveStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface SaveRead {raw:string|null;source:'primary'|'backup'|'none'|'invalid'|'unavailable'}
const valid=(raw:string|null|undefined):raw is string=>{if(typeof raw!=='string')return false;try{parseSave(raw);return true;}catch{return false;}};
/** A full character+world+dungeon checkpoint is a single payload, never split keys by domain. */
export class SaveRepository {
 constructor(private storage:SaveStorage|null){}
 private readKey(key:string):string|null|undefined{try{return this.storage?.getItem(key);}catch{return undefined;}}
 read():SaveRead{
  const primary=this.readKey(SAVE_KEY);if(valid(primary))return{raw:primary,source:'primary'};
  const backup=this.readKey(BACKUP_KEY);if(valid(backup))return{raw:backup,source:'backup'};
  if(typeof primary==='string')return{raw:primary,source:'invalid'};
  if(typeof backup==='string')return{raw:backup,source:'invalid'};
  return{raw:null,source:primary===undefined&&backup===undefined?'unavailable':'none'};
 }
 write(raw:string):boolean{
  if(!this.storage||!valid(raw))return false;
  try{
   const previous=this.readKey(SAVE_KEY);
   // Never replace a good recovery copy with a corrupt primary.
   if(valid(previous))this.storage.setItem(BACKUP_KEY,previous);
   this.storage.setItem(SAVE_KEY,raw);return true;
  }catch{return false;}
 }
}
