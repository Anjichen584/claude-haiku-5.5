import type Phaser from 'phaser';
import type {HuntJournalEntry} from '../world/huntJournal';

const LABELS={locked:'尚未解锁',ready:'可接受',active:'进行中',completed:'已完成'} as const;
/** No action buttons: accepting a hunt still requires approaching its world flag. */
export function mountHuntTools(root:HTMLElement,game:Phaser.Game):{open:()=>void}{
 const open=()=>{
  root.replaceChildren();
  const heading=document.createElement('h2');heading.textContent='精英讨伐手册';root.append(heading);
  if(!game.scene.isActive('OverworldScene')){
   const note=document.createElement('p');note.textContent='返回地表后可查看当前角色的讨伐进度。';root.append(note);return;
  }
  const scene=game.scene.getScene('OverworldScene') as Phaser.Scene&{getHuntJournal:()=>HuntJournalEntry[]};
  const entries=scene.getHuntJournal();
  const summary=document.createElement('p');summary.id='hunt-journal-summary';
  summary.textContent=`已完成 ${entries.filter(e=>e.state==='completed').length}/${entries.length} · 进行中 ${entries.filter(e=>e.state==='active').length} · 可接受 ${entries.filter(e=>e.state==='ready').length}`;root.append(summary);
  const note=document.createElement('p');note.textContent='每处仅奖励一次。靠近地表金色旗帜五格内按 F 接受，不会因查看手册自动开战。进度随存档保存；距离为地表直线格数，不是寻路距离。';root.append(note);
  for(const entry of entries){
   const card=document.createElement('article');card.dataset.huntKey=entry.key;card.dataset.state=entry.state;
   const title=document.createElement('h3');title.textContent=`${entry.title} · Lv.${entry.level} · ${LABELS[entry.state]}`;
   const detail=document.createElement('pre');
   detail.textContent=[`解锁条件：完成「${entry.prerequisite}」`,
    `旗帜坐标：(${entry.position.x}, ${entry.position.y}) · 距离约 ${entry.distance} 格`,
    `已击败 ${entry.progress}/${entry.total}（首领与全部护卫）`,
    `额外奖励：${entry.reward.exp} 经验 · ${entry.reward.gold} 金币`,
    ...entry.reward.items.map(item=>`物品：${item} ×1`),
    entry.state==='completed'?'奖励已结算，不可重复领取。':entry.state==='locked'?'请先推进上述主线章节。':entry.state==='active'?'已接受，可回到旗帜附近继续挑战。':'准备装备与药剂后，前往旗帜按 F 接受。'].join('\n');
   card.append(title,detail);root.append(card);
  }
 };
 return {open};
}
