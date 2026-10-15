import {describe,it,expect} from 'vitest';
import {inspectSaveTransfer,prepareSaveImport,commitSaveImport,readTransferSource,IMPORT_BACKUP_KEY,MAX_TRANSFER_BYTES} from '../src/state/saveTransfer';
import {SaveRepository,SAVE_KEY,BACKUP_KEY,type SaveStorage} from '../src/state/saveRepository';
import {newSession,toSaveFile,serializeSave,parseSave} from '../src/state/session';
class Memory implements SaveStorage{
 data=new Map<string,string>();failAt='';readFails=false;
 getItem(key:string){if(this.readFails)throw new Error('blocked');return this.data.get(key)??null;}
 setItem(key:string,value:string){if(key===this.failAt)throw new Error('quota');this.data.set(key,value);}
}
function raw(gold=10){const s=newSession([]);s.player.gold=gold;return serializeSave(toSaveFile(s,new Date('2026-10-15T00:00:00Z')));}
describe('local save transfers',()=>{
 it('validates and previews without modifying the original file',()=>{const value=raw();const inspected=inspectSaveTransfer(value);expect(inspected.raw).toBe(value);expect(inspected.summary).toContain('10 金币');expect(inspected.summary).toContain('地表');});
 it.each(['no json','null','{"version":999}'])('rejects invalid input before storage writes: %s',value=>{const st=new Memory();st.setItem(SAVE_KEY,raw());expect(()=>prepareSaveImport(value,st)).toThrow();expect(st.getItem(SAVE_KEY)).toBe(raw());expect(st.data.size).toBe(1);});
 it('enforces a UTF-8 byte limit, not a character count',()=>{const huge='雪'.repeat(Math.ceil(MAX_TRANSFER_BYTES/3)+1);expect(huge.length).toBeLessThan(MAX_TRANSFER_BYTES);expect(()=>inspectSaveTransfer(huge)).toThrow(/2 MB/);});
 it('previewing or discarding an import plan writes nothing',()=>{const st=new Memory();st.setItem(SAVE_KEY,raw());prepareSaveImport(raw(30),st);expect([...st.data]).toEqual([[SAVE_KEY,raw()]]);});
 it('imports once and retains an independent pre-import backup across normal saves',()=>{
  const st=new Memory();st.setItem(SAVE_KEY,raw(10));const plan=prepareSaveImport(raw(30),st);commitSaveImport(plan,st);
  expect(st.getItem(SAVE_KEY)).toBe(raw(30));expect(st.getItem(IMPORT_BACKUP_KEY)).toBe(raw(10));
  new SaveRepository(st).write(raw(40));expect(readTransferSource(st,'before-import').raw).toBe(raw(10));expect(readTransferSource(st,'backup').raw).toBe(raw(30));
  expect(()=>commitSaveImport(plan,st)).toThrow(/变化/);expect(parseSave(st.getItem(SAVE_KEY)!).player.gold).toBe(40);
 });
 it('protects writes made by another tab after the import preview',()=>{const st=new Memory();st.setItem(SAVE_KEY,raw(10));const plan=prepareSaveImport(raw(30),st);st.setItem(SAVE_KEY,raw(20));expect(()=>commitSaveImport(plan,st)).toThrow(/变化/);expect(st.getItem(SAVE_KEY)).toBe(raw(20));expect(st.getItem(IMPORT_BACKUP_KEY)).toBeNull();});
 it.each([IMPORT_BACKUP_KEY,BACKUP_KEY,SAVE_KEY])('write failure at %s preserves original primary',key=>{const st=new Memory();st.setItem(SAVE_KEY,raw(10));const plan=prepareSaveImport(raw(30),st);st.failAt=key;expect(()=>commitSaveImport(plan,st)).toThrow();expect(st.getItem(SAVE_KEY)).toBe(raw(10));});
 it('backs up a recovered save rather than a corrupt primary',()=>{const st=new Memory();st.setItem(SAVE_KEY,'broken');st.setItem(BACKUP_KEY,raw(15));commitSaveImport(prepareSaveImport(raw(30),st),st);expect(readTransferSource(st,'before-import').raw).toBe(raw(15));expect(readTransferSource(st,'latest').raw).toBe(raw(30));});
 it('imports into a new browser without an existing save',()=>{const st=new Memory();commitSaveImport(prepareSaveImport(raw(30),st),st);expect(st.getItem(SAVE_KEY)).toBe(raw(30));expect(st.getItem(IMPORT_BACKUP_KEY)).toBeNull();});
 it('refuses to import when existing data cannot be read',()=>{const st=new Memory();st.readFails=true;expect(()=>prepareSaveImport(raw(),st)).toThrow(/读取/);expect(()=>prepareSaveImport(raw(),null)).toThrow(/不可用/);expect(st.data.size).toBe(0);});
 it('exports the recovered backup and rejects missing/corrupt snapshots',()=>{const st=new Memory();st.setItem(SAVE_KEY,'broken');st.setItem(BACKUP_KEY,raw(20));expect(readTransferSource(st,'latest').raw).toBe(raw(20));expect(readTransferSource(st,'latest').summary).toContain('上一备份');expect(()=>readTransferSource(st,'before-import')).toThrow(/没有/);st.setItem(BACKUP_KEY,'broken');expect(()=>readTransferSource(st,'latest')).toThrow();});
});
