import Phaser from 'phaser';
import type { ItemDef, FactionDef } from '../data/schema';
import type { GameSession } from '../state/session';
import { buyItem, buyPrice, currentPriceMultiplier, shopStock } from '../state/shop';
import { persistSession } from '../state/sessionStore';
import { UI } from './theme';

/** Shared merchant storefront for the overworld and dungeon. */
export class ShopView {
  readonly root: Phaser.GameObjects.Container;
  private session: GameSession;
  private stock: ItemDef[];
  private multiplier: number;
  private rows: Phaser.GameObjects.Container[] = [];
  private gold: Phaser.GameObjects.Text;
  private note: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene, session:GameSession, items:readonly ItemDef[], factions:readonly FactionDef[], private onClose:()=>void) {
    this.session=session;this.stock=shopStock(items);this.multiplier=currentPriceMultiplier(session.world,factions);
    this.root=scene.add.container(0,0).setScrollFactor(0).setDepth(500).setVisible(false);
    const dim=scene.add.rectangle(640,360,1280,720,0x031215,.82).setInteractive();this.root.add(dim);
    const bg=scene.add.rectangle(640,360,920,560,0x112a2d).setStrokeStyle(1,UI.gold,.7);this.root.add(bg);
    this.root.add(scene.add.image(260,180,'actor-merchant').setDisplaySize(114,114));
    this.label(335,116,'行旅商人 · 艾洛',28,'#eddbad');this.label(335,164,'“道路会消失，好东西不会。”',15,'#a9bca8');
    this.gold=this.label(335,204,'',16,'#e2c27d');
    const close=this.label(1010,107,'关闭 ×',16,'#d8c89f').setInteractive({useHandCursor:true});close.on('pointerdown',()=>this.onClose());
    this.note=this.label(220,576,'选择一件物品，整备后再出发。',15,'#b6c9b5');
    this.label(220,614,'数字键购买   ·   E / Esc 离开   ·   C 在地表装备购买的物品',13,'#829d90');
    this.refresh();
  }
  private label(x:number,y:number,t:string,size:number,color:string){const o=this.scene.add.text(x,y,t,{fontFamily:UI.font,fontSize:size,color});this.root.add(o);return o;}
  private refresh():void {
    this.gold.setText(`金币  ${this.session.player.gold}     ·     声望折扣  ${Math.round(this.multiplier*100)}%`);
    for(const r of this.rows)r.destroy();this.rows=[];
    this.stock.forEach((item,i)=>{
      const x=220+(i%2)*430,y=262+Math.floor(i/2)*98,price=buyPrice(item,this.multiplier),afford=this.session.player.gold>=price;
      const c=this.scene.add.container(x,y);this.root.add(c);this.rows.push(c);
      const b=this.scene.add.rectangle(0,0,406,84,0x1c3839).setOrigin(0).setStrokeStyle(1,0x466459,.8);c.add(b);
      const icon=this.scene.add.text(18,20,item.type==='weapon'?'⚔':'◇',{fontSize:30,color:'#d0bf8b'});c.add(icon);
      const name=this.scene.add.text(65,14,`[${i+1}]  ${item.name}`,{fontFamily:UI.font,fontSize:17,color:'#e5e1c4'});c.add(name);
      const stat=item.type==='weapon'?`攻击 +${item.baseDamage??0}`:`防御 +${item.defense??0}`;
      c.add(this.scene.add.text(65,45,stat,{fontFamily:UI.font,fontSize:13,color:'#92b0a0'}));
      c.add(this.scene.add.text(386,29,`${price} 金`,{fontFamily:UI.font,fontSize:16,color:afford?'#e1be78':'#9a8378'}).setOrigin(1,0));
      c.setSize(406,84);b.setInteractive({useHandCursor:true});b.on('pointerover',()=>b.setFillStyle(0x2a4b45));b.on('pointerout',()=>b.setFillStyle(0x1c3839));b.on('pointerdown',()=>this.buy(i));
      c.setScrollFactor(0,0,true);
    });
    this.root.setScrollFactor(0,0,true);
  }
  show():void{this.root.setVisible(true);this.refresh();}
  hide():void{this.root.setVisible(false);}
  get visible():boolean{return this.root.visible;}
  buy(index:number):void{
    const item=this.stock[index];if(!item)return;
    const result=buyItem(this.session,item,this.multiplier);this.note.setText(result.message).setColor(result.ok?'#b9d7aa':'#e4a58b');
    if(result.ok)persistSession(this.session);this.refresh();
  }
}
