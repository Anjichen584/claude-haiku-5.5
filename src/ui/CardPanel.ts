import Phaser from 'phaser';
import { UI } from './theme';
export interface PanelCard { title:string; subtitle:string; key?:string; accent?:number; onClick?:()=>void }
/** Screen-space card board, shared by inventory, equipment, factions and skills. */
export class CardPanel {
 readonly root:Phaser.GameObjects.Container;
 constructor(private scene:Phaser.Scene){this.root=scene.add.container(0,0).setScrollFactor(0).setDepth(290).setVisible(false);}
 hide():void{this.root.setVisible(false);}
 private label(x:number,y:number,t:string,size:number,color:string){const o=this.scene.add.text(x,y,t,{fontFamily:UI.font,fontSize:size,color});this.root.add(o);return o;}
 show(title:string,subtitle:string,cards:PanelCard[],columns:number,footer:string,actions:{label:string;run:()=>void}[]=[]):void{
  this.root.removeAll(true);this.root.setVisible(true);
  this.label(306,159,title,25,'#e5d5a5');this.label(306,202,subtitle,14,'#9eb8a5');
  const line=this.scene.add.graphics();line.lineStyle(1,UI.edge,.5).lineBetween(306,235,974,235);this.root.add(line);
  const rows=Math.ceil(cards.length/columns),gap=12,w=(668-gap*(columns-1))/columns,h=Math.min(84,(282-gap*(rows-1))/Math.max(1,rows));
  cards.forEach((card,i)=>{
   const x=306+(i%columns)*(w+gap),y=252+Math.floor(i/columns)*(h+gap),accent=card.accent??0x92ad91;
   const bg=this.scene.add.rectangle(x,y,w,h,0x1b3638).setOrigin(0).setStrokeStyle(1,0x3b5850);this.root.add(bg);
   this.root.add(this.scene.add.rectangle(x,y+6,3,h-12,accent).setOrigin(0));
   this.label(x+15,y+12,`${card.key?card.key+'  ':''}${card.title}`,16,'#e2dfbf');
   this.label(x+15,y+39,card.subtitle,12,'#9fb8a1').setWordWrapWidth(w-26);
   if(card.onClick){bg.setInteractive({useHandCursor:true});bg.on('pointerover',()=>bg.setFillStyle(0x2b4944));bg.on('pointerout',()=>bg.setFillStyle(0x1b3638));bg.on('pointerdown',card.onClick);}
  });
  this.label(306,548,footer,13,'#a5bea6').setWordWrapWidth(660).setLineSpacing(5);
  actions.forEach((action,i)=>{
   const x=306+i*220,y=584,b=this.scene.add.rectangle(x,y,208,27,0x25453f).setOrigin(0).setStrokeStyle(1,0x627c64);this.root.add(b);
   this.label(x+12,y+4,action.label,13,'#e4ce93');b.setInteractive({useHandCursor:true});b.on('pointerdown',action.run);
  });
  this.root.setScrollFactor(0,0,true);
 }
}
