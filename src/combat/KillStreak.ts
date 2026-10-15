/** Cosmetic only: no extra persistent rewards to farm by reloading. Time pauses with combat. */
export class KillStreak {
 count=0;
 remainingMs=0;
 best=0;
 tick(deltaMs:number):void{
  if(!Number.isFinite(deltaMs)||deltaMs<0)return;
  this.remainingMs=Math.max(0,this.remainingMs-deltaMs);
  if(this.remainingMs===0)this.count=0;
 }
 kill():number{this.count++;this.best=Math.max(this.best,this.count);this.remainingMs=10000;return this.count;}
 reset():void{this.count=0;this.remainingMs=0;}
 get label():string{return this.count>=10?'势不可挡':this.count>=5?'横扫荒野':this.count>=2?'连斩':'';}
}
