import type Phaser from 'phaser';
import {loadGameData} from '../data/loader';
import {fromSaveFile} from '../state/session';
import {setSession} from '../state/sessionStore';
import {prepareSaveImport,commitSaveImport,readTransferSource,MAX_TRANSFER_BYTES,type ImportPlan} from '../state/saveTransfer';

function storage():Storage|null{try{return localStorage;}catch{return null;}}
function download(raw:string,source:string):void{
 const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download=`rift-${source}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
/** File contents stay local. Only validated checkpoints, never the live mid-battle session, are exported. */
export function mountSaveTools(root:HTMLElement,game:Phaser.Game):{open:()=>void;cancel:()=>void}{
 root.innerHTML=`<h2>存档备份与迁移</h2>
 <p>导出的是最近一次成功保存的进度，不是当前战斗中的临时状态。地表按 K 保存；地牢按 K 保存检查点。</p>
 <pre id="save-summary"></pre>
 <button id="save-export">导出最近存档</button><button id="save-backup-export">导出上一备份</button><button id="save-import-backup-export">导出导入前备份</button>
 <p><button id="save-title">保存并返回标题</button></p>
 <p>导入仅能在标题界面进行，会替换当前主存档。有效的旧存档会保留到独立的“导入前备份”；建议先下载一份。</p>
 <label class="rift-file-label">选择存档 JSON（最大 2 MB）<input id="save-file" type="file" accept=".json,application/json" aria-label="选择存档文件"></label>
 <section id="save-confirmation" hidden><h3>确认替换存档？</h3><pre id="save-preview"></pre><p>确认后替换本浏览器的主存档；取消不会写入任何数据。</p><button id="save-confirm">确认导入并替换</button><button id="save-cancel">取消导入</button></section>
 <p id="save-status" role="status" aria-live="polite"></p><small>文件不会上传服务器。浏览器隐私模式、清理站点数据或更换设备可能丢失本地进度；请保管下载文件。</small>`;
 const get=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
 const file=get<HTMLInputElement>('save-file'),status=get('save-status'),confirmation=get('save-confirmation');
 let pending:ImportPlan|null=null,epoch=0;
 const message=(text:string)=>{status.textContent=text;};
 const cancel=()=>{epoch++;pending=null;confirmation.hidden=true;file.value='';};
 const summary=()=>{try{get('save-summary').textContent=readTransferSource(storage(),'latest').summary;}catch(e){get('save-summary').textContent=e instanceof Error?e.message:'无法读取存档';}};
 const onExport=(source:'latest'|'backup'|'before-import')=>{try{const inspected=readTransferSource(storage(),source);download(inspected.raw,source);message('已发起下载，请检查浏览器下载列表。');}catch(e){message(e instanceof Error?e.message:'导出失败');}};
 get('save-export').onclick=()=>onExport('latest');get('save-backup-export').onclick=()=>onExport('backup');get('save-import-backup-export').onclick=()=>onExport('before-import');
 get('save-title').onclick=()=>{
  cancel();
  try{
   if(game.scene.isActive('TitleScene')){message('当前已在标题界面，可以选择文件导入。');return;}
   type ReturnScene=Phaser.Scene&{surface?:{engaged:boolean};talk?:unknown;pendingChoice?:unknown;shopOpen?:boolean;shop?:{visible:boolean};saveGame?:()=>boolean;saveCheckpoint?:()=>boolean};
   const scene=game.scene.getScenes(true).find(s=>['OverworldScene','DungeonScene','TowerScene','AshForgeScene','TidalVaultScene'].includes(s.scene.key)) as ReturnScene|undefined;
   if(!scene||scene.surface?.engaged||scene.talk||scene.pendingChoice||scene.shopOpen||scene.shop?.visible)throw new Error('请先结束战斗、对话或交易，再保存并返回标题。');
   const ok=scene.scene.key==='OverworldScene'?scene.saveGame?.():scene.saveCheckpoint?.();
   if(!ok)throw new Error('保存失败，已留在当前游戏；请先解决存储空间问题，不要刷新。');
   scene.scene.start('TitleScene');summary();message('已保存并返回标题。可以选择文件导入，或关闭面板后继续游戏。');
  }catch(e){message(e instanceof Error?e.message:'返回标题失败');}
 };
 file.onchange=async()=>{
  const selected=file.files?.[0];cancel();if(!selected)return;
  const request=epoch;
  if(!game.scene.isActive('TitleScene')){message('请先保存并返回标题，游戏进行中不能导入。');return;}
  if(selected.size>MAX_TRANSFER_BYTES){message('文件超过 2 MB 上限，未读取为存档。');return;}
  message('正在本地校验文件…');
  try{
   const raw=await selected.text();if(request!==epoch)return;
   const plan=prepareSaveImport(raw,storage());
   // Check reconstruction with current quest definitions before any write.
   fromSaveFile(plan.save,loadGameData().quests);
   pending=plan;get('save-preview').textContent=`${selected.name}\n${plan.summary}`;confirmation.hidden=false;
   message('校验通过。尚未写入，请核对进度后确认。');get('save-confirm').focus();
  }catch(e){if(request===epoch)message(e instanceof Error?e.message:'文件读取失败');}
 };
 get('save-cancel').onclick=()=>{cancel();message('已取消导入，现有存档未改变。');};
 get('save-confirm').onclick=()=>{
  if(!pending)return;
  try{
   if(!game.scene.isActive('TitleScene'))throw new Error('场景已变化，请返回标题后重新选择文件。');
   commitSaveImport(pending,storage());cancel();setSession(null);game.scene.getScene('TitleScene').scene.restart();summary();
   message('导入成功。关闭面板后选择“继续”；有效旧存档可用“导出导入前备份”下载。');
  }catch(e){message(e instanceof Error?e.message:'导入失败');}
 };
 return {open:()=>{cancel();summary();message('');},cancel};
}
