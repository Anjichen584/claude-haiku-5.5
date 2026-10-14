import Phaser from 'phaser';
export const UI = { ink: 0x10252b, edge: 0x64796b, gold: 0xd7bd80, cream: '#e6e6cf', muted: '#a2b7aa', font: '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif' };
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth=190): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
  g.fillStyle(0x061519,.3).fillRoundedRect(x+4,y+7,w,h,12);
  g.fillStyle(UI.ink,.96).fillRoundedRect(x,y,w,h,12);
  g.lineStyle(1,UI.edge,.65).strokeRoundedRect(x+.5,y+.5,w-1,h-1,12);
  g.lineStyle(2,UI.gold,.65).lineBetween(x+18,y+1,x+60,y+1);
  return g;
}
export function text(scene: Phaser.Scene,x:number,y:number,value:string,size=16,color=UI.cream): Phaser.GameObjects.Text {
  return scene.add.text(x,y,value,{fontFamily:UI.font,fontSize:size,color}).setScrollFactor(0).setDepth(200);
}
export function styleModal(t:Phaser.GameObjects.Text, width=600,height=460): void {
  t.setPosition(640,140).setOrigin(.5,0).setStyle({fontFamily:UI.font,fontSize:'17px',color:UI.cream,backgroundColor:'#10252bf5',padding:{x:28,y:26},lineSpacing:13,wordWrap:{width:width-56}}).setFixedSize(width,height).setDepth(280);
}
export function button(scene: Phaser.Scene,x:number,y:number,w:number,label:string,fn:()=>void): Phaser.GameObjects.Container {
  const bg=scene.add.rectangle(0,0,w,38,0x19353a).setStrokeStyle(1,0x637c70,.8);
  const labelObj=scene.add.text(0,0,label,{fontFamily:UI.font,fontSize:14,color:UI.cream}).setOrigin(.5);
  const c=scene.add.container(x,y,[bg,labelObj]).setDepth(220).setScrollFactor(0).setSize(w,38).setInteractive({useHandCursor:true});
  c.on('pointerover',()=>{bg.setFillStyle(0x31514c);bg.setStrokeStyle(1,UI.gold);});c.on('pointerout',()=>{bg.setFillStyle(0x19353a);bg.setStrokeStyle(1,0x637c70,.8);});c.on('pointerdown',fn);
  return c;
}
/** Deterministic scenery, no external art or network dependency. */
export function landscape(scene:Phaser.Scene, battle=false): void {
  const g=scene.add.graphics().setDepth(-20);
  g.fillGradientStyle(0x132c35,0x132c35,0x577b73,0x577b73,1).fillRect(0,0,1280,720);
  g.fillStyle(0xd8d9ad,.9).fillCircle(925,138,48);
  for(let layer=0;layer<3;layer++){
    const y=240+layer*68;g.fillStyle([0x3d615f,0x2b514d,0x203f3d][layer]);g.beginPath();g.moveTo(0,720);g.lineTo(0,y);
    for(let i=0;i<=16;i++)g.lineTo(i*90,y+Math.sin(i*1.3+layer)*60-Math.cos(i*2.8)*25);
    g.lineTo(1280,720);g.closePath();g.fillPath();
  }
  g.fillStyle(battle?0x344d43:0x183b34).fillEllipse(640,690,1700,510);
  g.fillStyle(battle?0x465e4c:0x304d3e).fillEllipse(660,590,1190,310);
  g.fillStyle(0x80936b,.12).fillEllipse(660,590,1030,230);
  for(let i=0;i<130;i++){
    const x=(i*179+41)%1280,y=420+(i*71)%290;g.lineStyle(1,0x9db28a,.2);g.lineBetween(x,y,x+4,y-5);
  }
  for(let i=0;i<18;i++){
    const x=(i*173)%1400-70,y=300+(i*97)%110;
    scene.add.image(x,y,'tree').setDisplaySize(160+(i%3)*38,190+(i%3)*42).setOrigin(.5,1).setTint(i%2?0x8aa494:0xb1c1a0).setDepth(-10);
  }
  if(!battle){
    scene.add.image(925,439,'portal').setDisplaySize(240,300).setDepth(-5);
    scene.add.image(1030,535,'rock').setDisplaySize(150,140).setDepth(-4);
    scene.add.image(827,545,'rock').setDisplaySize(100,94).setDepth(-4);
    scene.add.image(920,575,'actor-hero').setDisplaySize(104,104).setDepth(-3);
  }
  for(let i=0;i<18;i++){
    const mote=scene.add.circle((i*173+37)%1280,220+(i*83)%410,1.5+(i%2),0xe5d19a,.4).setDepth(-1);
    scene.tweens.add({targets:mote,y:mote.y-35,alpha:.08,duration:2000+i*181,yoyo:true,repeat:-1});
  }
}
