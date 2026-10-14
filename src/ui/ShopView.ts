import Phaser from 'phaser';
import type { ItemDef, FactionDef } from '../data/schema';
import type { GameSession } from '../state/session';
import { buyItem, buyPrice, currentPriceMultiplier, shopStock, sellItem, sellPrice, sellStock } from '../state/shop';
import { persistSession } from '../state/sessionStore';
import { UI, pinToScreen } from './theme';

/** Paginated, screen-space merchant; shared by overworld and dungeon. */
export class ShopView {
 readonly root:Phaser.GameObjects.Container;
 private stock:ItemDef[];
 private multiplier:number;
 private rows:Phaser.GameObjects.Container[]=[];
 private gold:Phaser.GameObjects.Text;
 private note:Phaser.GameObjects.Text;
 private pageLabel:Phaser.GameObjects.Text;
 page=0;
 mode:'buy'|'sell'='buy';
 readonly pageSize=6;
 constructor(private scene:Phaser.Scene,private session:GameSession,private items:readonly ItemDef[],private factions:readonly FactionDef[],private onClose:()=>void){
  this.stock=shopStock(items);this.multiplier=currentPriceMultiplier(session.world,factions);
  this.root=scene.add.container(0,0).setScrollFactor(0).setDepth(500).setVisible(false);
  this.root.add(scene.add.rectangle(640,360,1280,720,0x031215,.82).setInteractive());
  this.root.add(scene.add.rectangle(640,360,920,560,0x112a2d).setStrokeStyle(1,UI.gold,.7));
  this.root.add(scene.add.image(260,180,'actor-merchant').setDisplaySize(114,114));
  this.label(335,116,'行旅商人 · 艾洛',28,'#eddbad');this.label(335,164,'“道路会消失，好东西不会。”',15,'#a9bca8');
  this.gold=this.label(335,204,'',16,'#e2c27d');
  this.button(1010,107,'关闭 ×',()=>this.onClose());
  this.button(790,155,'买入',()=>this.setMode('buy'));this.button(900,155,'卖出',()=>this.setMode('sell'));
  this.button(790,204,'‹',()=>this.turnPage(-1));this.pageLabel=this.label(825,204,'',14,'#e2c27d');this.button(995,204,'›',()=>this.turnPage(1));
  this.note=this.label(220,576,'选择一件物品，整备后再出发。',15,'#b6c9b5');
  this.label(220,614,'1–6 操作本页 · N/P 翻页 · V 买/卖 · E/Esc 离开 · 装备需到 C 面板穿戴',13,'#829d90');
  const handler=(e:KeyboardEvent)=>{if(!this.visible||e.repeat)return;if(e.key.toLowerCase()==='n')this.turnPage(1);if(e.key.toLowerCase()==='p')this.turnPage(-1);if(e.key.toLowerCase()==='v')this.setMode(this.mode==='buy'?'sell':'buy');};
  scene.input.keyboard?.on('keydown',handler);scene.events.once('shutdown',()=>scene.input.keyboard?.off('keydown',handler));
  this.refresh();
 }
 private label(x:number,y:number,t:string,size:number,color:string){const o=this.scene.add.text(x,y,t,{fontFamily:UI.font,fontSize:size,color});this.root.add(o);return o;}
 private button(x:number,y:number,t:string,run:()=>void){this.label(x,y,t,16,'#e4ce93').setPadding(6).setBackgroundColor('#25453f').setInteractive({useHandCursor:true}).on('pointerdown',run);}
 private available():ItemDef[]{return this.mode==='buy'?this.stock:sellStock(this.session,this.items);}
 setMode(mode:'buy'|'sell'):void{this.mode=mode;this.page=0;this.note.setText(mode==='buy'?'选择一件物品，整备后再出发。':'出售背包中的闲置物品，已穿戴装备不会出售。');this.refresh();}
 turnPage(by:number):void{const pages=Math.max(1,Math.ceil(this.available().length/this.pageSize));this.page=(this.page+by+pages)%pages;this.refresh();}
 private refresh():void{
  const available=this.available(),pages=Math.max(1,Math.ceil(available.length/this.pageSize));this.page=Math.max(0,Math.min(pages-1,this.page));
  this.gold.setText(`金币 ${this.session.player.gold} · 声望价格 ${Math.round(this.multiplier*100)}%`);
  this.pageLabel.setText(`${this.mode==='buy'?'买入':'卖出'} ${this.page+1}/${pages}`);
  for(const r of this.rows)r.destroy();this.rows=[];
  available.slice(this.page*this.pageSize,(this.page+1)*this.pageSize).forEach((item,i)=>{
   const x=220+(i%2)*430,y=262+Math.floor(i/2)*98,price=this.mode==='buy'?buyPrice(item,this.multiplier):sellPrice(item),afford=this.mode==='sell'||this.session.player.gold>=price;
   const c=this.scene.add.container(x,y);this.root.add(c);this.rows.push(c);
   const bg=this.scene.add.rectangle(0,0,406,84,0x1c3839).setOrigin(0).setStrokeStyle(1,0x466459,.8);c.add(bg);
   c.add(this.scene.add.text(17,22,item.type==='weapon'?'⚔':item.type==='consumable'?'+':'◇',{fontSize:28,color:'#d0bf8b'}));
   c.add(this.scene.add.text(62,14,`[${i+1}] ${item.name}`,{fontFamily:UI.font,fontSize:17,color:'#e5e1c4'}));
   const stat=item.consumable?`恢复 ${item.consumable.amount} ${item.consumable.resource==='hp'?'生命':'魔力'}`:item.type==='weapon'?`攻击 +${item.baseDamage??0}`:`防御 +${item.defense??0}`;
   c.add(this.scene.add.text(62,45,`${stat} · 持有 ${this.session.world.getItemCount(item.id)}`,{fontFamily:UI.font,fontSize:12,color:'#92b0a0'}));
   c.add(this.scene.add.text(386,29,`${price} 金`,{fontFamily:UI.font,fontSize:16,color:afford?'#e1be78':'#9a8378'}).setOrigin(1,0));
   bg.setInteractive({useHandCursor:true}).on('pointerover',()=>bg.setFillStyle(0x2a4b45)).on('pointerout',()=>bg.setFillStyle(0x1c3839)).on('pointerdown',()=>this.buy(i));
   c.setScrollFactor(0,0,true);
  });
  pinToScreen(this.root);
 }
 show():void{this.multiplier=currentPriceMultiplier(this.session.world,this.factions);this.root.setVisible(true);this.setMode('buy');}
 hide():void{this.root.setVisible(false);}
 get visible():boolean{return this.root.visible;}
 /** Compatibility name: dispatches to buy/sell for the numbered item on this page. */
 buy(index:number):void{
  if(!Number.isInteger(index)||index<0||index>=this.pageSize)return;
  const item=this.available()[this.page*this.pageSize+index];if(!item)return;
  const result=this.mode==='buy'?buyItem(this.session,item,this.multiplier):sellItem(this.session,item);
  this.note.setText(result.message).setColor(result.ok?'#b9d7aa':'#e4a58b');if(result.ok&&!persistSession(this.session))this.note.setText(`${result.message}；保存失败，请勿刷新`).setColor('#e4a58b');this.refresh();
 }
}
