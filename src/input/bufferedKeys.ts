import type Phaser from 'phaser';
/** Keep fast taps until update consumes them, even if down+up arrive between two frames. */
export class PressBuffer {
 private pending=new Map<number,number>();
 constructor(private now:()=>number=()=>performance.now(),private expiryMs=1000){}
 press(code:number):void{this.pending.set(code,this.now());}
 take(code:number):boolean{const at=this.pending.get(code);this.pending.delete(code);return at!==undefined&&this.now()-at<=this.expiryMs;}
 clear():void{this.pending.clear();}
}
const buffers=new WeakMap<Phaser.Input.Keyboard.Key,{buffer:PressBuffer;code:number}>();
export function bufferSceneKeys(scene:Phaser.Scene):void{
 const buffer=new PressBuffer(),handlers:{key:Phaser.Input.Keyboard.Key;fn:()=>void}[]=[];
 for(const key of scene.input.keyboard?.keys??[]){
  if(!key)continue;const fn=()=>buffer.press(key.keyCode);key.on('down',fn);buffers.set(key,{buffer,code:key.keyCode});handlers.push({key,fn});
 }
 scene.events.once('shutdown',()=>{buffer.clear();for(const {key,fn}of handlers){key.off('down',fn);buffers.delete(key);}});
}
export function pressed(key:Phaser.Input.Keyboard.Key):boolean{const item=buffers.get(key);return item?.buffer.take(item.code)??false;}
