import Phaser from 'phaser';
import {UI} from './theme';
import {resultPages} from '../combat/results';

/** Bounded, paginated result overlay. Presentation only: callbacks never grant rewards. */
export class BattleResultView {
  readonly root:Phaser.GameObjects.Container;
  readonly status:Phaser.GameObjects.Text;
  readonly details:Phaser.GameObjects.Text;
  private pager:Phaser.GameObjects.Text;
  private confirm:Phaser.GameObjects.Text;
  private pages:string[][];
  private page=0;
  private ready=false;
  constructor(scene:Phaser.Scene,heading:string,summary:string,lines:readonly string[],private destination:string,onReturn:()=>void,onRetry:()=>void){
    this.pages=resultPages(lines);
    this.root=scene.add.container(0,0).setDepth(600);
    this.root.add(scene.add.rectangle(640,360,1280,720,0x061519,.82).setInteractive());
    this.root.add(scene.add.rectangle(640,360,860,570,0x10252b,.99).setStrokeStyle(1,UI.gold,.8));
    const label=(x:number,y:number,value:string,size:number,color:string)=>{
      const t=scene.add.text(x,y,value,{fontFamily:UI.font,fontSize:size,color});this.root.add(t);return t;
    };
    label(255,100,heading,30,'#ead6a1');
    label(255,151,summary,17,'#c4d8bd').setWordWrapWidth(760).setLineSpacing(7);
    this.details=label(255,236,'',16,'#c9d4bd').setWordWrapWidth(760).setLineSpacing(9);
    this.status=label(255,492,'',14,'#e5c88e').setWordWrapWidth(760);
    this.pager=label(640,548,'',14,'#a5bfac').setOrigin(.5);
    const action=(x:number,y:number,w:number,title:string,fn:()=>void)=>{
      const bg=scene.add.rectangle(x,y,w,36,0x29463f).setStrokeStyle(1,0x607b64).setInteractive({useHandCursor:true});
      this.root.add(bg);const text=label(x,y,title,14,'#e3d5ad').setOrigin(.5);bg.on('pointerdown',fn);return text;
    };
    action(320,548,130,'P  上一页',()=>this.turn(-1));
    action(960,548,130,'N  下一页',()=>this.turn(1));
    action(340,603,180,'R  重试保存',onRetry);
    this.confirm=action(780,603,440,'',()=>{if(this.ready)onReturn();});
    this.draw();this.setReady(false);
  }
  turn(delta:number):void{this.page=(this.page+delta+this.pages.length)%this.pages.length;this.draw();}
  private draw():void{this.details.setText(this.pages[this.page].join('\n'));this.pager.setText(`详情 ${this.page+1}/${this.pages.length}`);}
  setSaved(saved:boolean):void{
    this.status.setText(saved?'已保存 · 可以安全返回':'保存失败：请勿刷新。释放存储空间后按 R 重试；返回也会重试保存。').setColor(saved?'#a8c59c':'#ffb69c');
  }
  setReady(ready:boolean):void{
    if(this.ready===ready && this.confirm.text)return;
    this.ready=ready;this.confirm.setText(ready?`Space / 点击  ${this.destination}`:'请松开 Space，稍候确认结算').setAlpha(ready?1:.5);
  }
}
