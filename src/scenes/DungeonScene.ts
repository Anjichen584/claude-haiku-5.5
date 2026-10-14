import { openDungeon } from '../dungeon/checkpoint';
import { useConsumable } from '../state/consumables';
import Phaser from 'phaser';
import { bufferSceneKeys, pressed } from '../input/bufferedKeys';
import { panel, text, UI, button } from '../ui/theme';
import { ShopView } from '../ui/ShopView';
import { combatProfile } from '../combat/profile';
import { loadGameData } from '../data/loader';
import type { EnemyDef } from '../data/schema';
import {
  moveTo,
  markCleared,
  neighbors,
  roomById,
  roomOutcome,
  type DungeonRun,
} from '../dungeon/run';
import type { RoomKind } from '../dungeon/layout';
import { applyGains, describeGains, settleQuestRewards, levelForExp, type Gains } from '../state/rewards';
import { getSession, persistSession, setRun, getRun } from '../state/sessionStore';
import type { FactionDef, ItemDef } from '../data/schema';
import { type GameSession } from '../state/session';

/**
 * 地牢场景：房间图探索。
 * 操作：数字键 1–9 移动到相邻房间 · E 与当前房间互动 · L 离开地牢（保留已获得的奖励）
 *
 * 战斗房与 Boss 房会切换到战斗场景；胜利后回到这里继续探索。
 * 会话保存已生成地图与房间领取记录；退出/刷新均可继续，战败回入口。
 * 布局由 (种子, 层数) 决定，同一层每次进入的房间都相同。
 */

const DUNGEON_SEED = 20261014;
const ROOM_RADIUS = 18;

const KIND_LABEL: Record<RoomKind, string> = {
  entrance: '入口', combat: '战斗', chest: '宝箱', event: '事件', shop: '商店', rest: '休息点', boss: 'Boss',
};
const KIND_COLOR: Record<RoomKind, number> = {
  entrance: 0xbfbfbf, combat: 0xe0584f, chest: 0xffd166, event: 0xa78bfa, shop: 0x7fd1ff, rest: 0x6fd96f, boss: 0xff3b3b,
};

export class DungeonScene extends Phaser.Scene {
  private run!: DungeonRun;
  private session!: GameSession;
  private enemies: readonly EnemyDef[] = [];
  private itemNames = new Map<string, string>();
  private itemDefs: readonly ItemDef[] = [];
  private factionDefs: readonly FactionDef[] = [];
  /** 商店状态：是否打开、当前库存与价格倍率 */
  private shopOpen = false;
  private shop!: ShopView;
  private portrait!: Phaser.GameObjects.Image;
  private roomTitle!: Phaser.GameObjects.Text;
  private escape!: Phaser.Input.Keyboard.Key;
  private graphics!: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private hud!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private keyE!: Phaser.Input.Keyboard.Key;
  private supplyKeys!:Phaser.Input.Keyboard.Key[];
  private keyK!:Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('DungeonScene');
  }

  create(): void {
    const session = getSession();
    if (!session) {
      this.scene.start('TitleScene');
      return;
    }
    this.session = session;
    const data = loadGameData();
    this.enemies = data.enemies;
    this.itemNames = new Map(data.items.map((i) => [i.id, i.name]));
    this.itemDefs = data.items;
    this.factionDefs = data.factions;
    this.dynamic = [];
    this.shopOpen = false;

    // The session owns active and archived floors; do not regenerate on re-entry/reload.
    const existing=getRun()??session.dungeon?.runs.find(r=>r.floor===session.dungeonFloor);
    session.dungeon??={activeFloor:null,runs:[]};
    this.run=existing??openDungeon(session.dungeon,DUNGEON_SEED,session.dungeonFloor,data.dungeon);
    setRun(this.run);

    this.cameras.main.setBackgroundColor('#0b2028');
    const bg=this.add.graphics();bg.fillGradientStyle(0x132c35,0x132c35,0x16332f,0x16332f,1).fillRect(0,0,1280,720);
    text(this,42,24,'裂隙地牢',28,'#e7dab5');text(this,44,67,'向更深处，寻找被遗忘的回响。',14,'#94b1a1');
    panel(this,24,106,860,414,0);panel(this,904,106,352,414,0);panel(this,24,536,1232,100,0);
    this.graphics=this.add.graphics().setDepth(1);
    this.hud=this.add.text(1228,29,'',{fontFamily:UI.font,fontSize:14,color:'#bcd0b6',align:'right',lineSpacing:7}).setOrigin(1,0).setDepth(200);
    this.message=this.add.text(48,552,'',{fontFamily:UI.font,fontSize:16,color:'#ded8b4',lineSpacing:7,wordWrap:{width:1160}}).setDepth(200);
    this.portrait=this.add.image(1080,239,'portal').setDisplaySize(152,152).setDepth(20);
    this.roomTitle=text(this,1080,337,'',22,'#e4ce99').setOrigin(.5);
    text(this,1080,381,'数字键选择相邻房间\nE 与当前房间互动',14,'#9bb5a3').setOrigin(.5).setAlign('center').setLineSpacing(12);
    button(this,1080,468,260,'E  探索当前房间',()=>{if(!this.shopOpen)this.interact();});
    button(this,770,674,200,'K  保存 / 重试',()=>{if(!this.shopOpen&&this.saveCheckpoint())this.say('地牢进度已保存');});
    button(this,1120,674,260,'L  返回地表',()=>{if(!this.shopOpen)this.leave();});
    text(this,42,661,'每次移动自动存档 · H/M 药剂 · L 退出保留探索进度',14,'#8da996');
    this.shop=new ShopView(this,this.session,this.itemDefs,this.factionDefs,()=>this.closeShop());

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    this.keyE = keyboard.addKey('E');
    this.keyL = keyboard.addKey('L');
    this.keyK = keyboard.addKey('K');
    this.escape=keyboard.addKey('ESC');
    this.supplyKeys=[keyboard.addKey('H'),keyboard.addKey('M')];
    bufferSceneKeys(this);
    keyboard.on('keydown', this.onDigit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', this.onDigit, this));

    if (this.run.finished) this.say('本层 Boss 已击败，按 L 离开地牢');
    else if (existing) this.say('已恢复地牢进度；房间位置和已领取奖励均已保留。');
    else this.say(`第 ${this.run.floor} 层。按数字键前进，按 E 与房间互动。`);
    this.render();
    this.saveCheckpoint();
  }

  update(_time:number,deltaMs:number): void {
    if(this.session.player.mana!==undefined){const d=loadGameData(),p=combatProfile(this.session.player.equipment,d.items,d.affixes,d.itemSets);this.session.player.mana=Math.min(p.maxMana,this.session.player.mana+p.manaRegen*Math.min(100,Math.max(0,deltaMs))/1000);}
    if(!this.shopOpen&&pressed(this.keyK)&&this.saveCheckpoint())this.say('地牢进度已保存');
    if(!this.shopOpen)for(let i=0;i<this.supplyKeys.length;i++)if(pressed(this.supplyKeys[i]))this.useSupply(i);
    if(this.shopOpen && pressed(this.escape)){this.closeShop();return;}
    if (!this.shopOpen && pressed(this.keyL)) {
      this.leave();
      return;
    }
    if (pressed(this.keyE)) {
      if (this.shopOpen) this.closeShop();
      else this.interact();
    }
  }

  private useSupply(index:number):void{
    const data=loadGameData(),p=this.session.player,profile=combatProfile(p.equipment,data.items,data.affixes,data.itemSets);
    const item=data.items.find(i=>i.id===(index?'mana_potion':'health_potion'));if(!item)return;
    const result=useConsumable(this.session,item,profile,{hp:p.hp,mana:p.mana??profile.maxMana});this.say(result.message);
    if(result.ok){p.hp=result.hp;p.mana=result.mana;this.saveCheckpoint();this.render();}
  }

  // ---------- 移动 ----------

  private onDigit(e: KeyboardEvent): void {
    if (!/^[1-9]$/.test(e.key)) return;
    // 商店打开时，数字键用于购买，不移动
    if (this.shopOpen) {
      this.shop.buy(Number(e.key)-1);
      return;
    }
    const next = neighbors(this.run, this.run.current)[Number(e.key) - 1];
    if (!next) return;
    this.travelTo(next.id);
  }

  private saveCheckpoint():boolean{
    const ok=persistSession(this.session);if(!ok)this.say('保存失败：进度仅保留在当前页面，请勿刷新；请检查浏览器存储空间。');return ok;
  }
  private travelTo(id:number):void{
    if(this.shopOpen)return;moveTo(this.run,id);const room=roomById(this.run,id);
    this.say(`进入：${KIND_LABEL[room.kind]}房间${this.run.cleared.has(id)?'（已清理）':''}`);this.render();this.saveCheckpoint();
  }

  // ---------- 房间互动 ----------

  private interact(): void {
    if (this.run.finished) {
      this.say('本层 Boss 已击败，按 L 离开地牢');
      return;
    }
    const room = roomById(this.run, this.run.current);
    if (this.run.cleared.has(room.id)) {
      this.say('此房间已清理');
      return;
    }
    const out = roomOutcome(this.run, room.id, this.enemies);
    switch (out.type) {
      case 'combat': {
        const names = out.enemyIds.map((id) => this.enemies.find((e) => e.id === id)?.name ?? id).join('、');
        this.say(`${out.boss ? 'Boss' : '遭遇'}：${names}`);
        if(!this.saveCheckpoint())return;
        this.scene.start('TestRoomScene', {
          encounter: {
            enemyIds: out.enemyIds,
            spawnKey: `dungeon-${this.run.floor}-${room.id}`,
            dungeon: { roomId: room.id, boss: out.boss },
          },
        });
        return;
      }
      case 'chest':
      case 'event':
        this.grant(out.gains, room.id, out.type === 'chest' ? '宝箱' : '残影事件');
        break;
      case 'rest': {
        const data = loadGameData();
        const stats=combatProfile(this.session.player.equipment,data.items,data.affixes,data.itemSets),max=stats.maxHp;
        const before = this.session.player.hp;
        this.session.player.hp = Math.min(max, before + Math.ceil(max * out.healFraction));
        const manaBefore=this.session.player.mana??stats.maxMana;
        this.session.player.mana=Math.min(stats.maxMana,manaBefore+Math.ceil(stats.maxMana*out.healFraction));
        markCleared(this.run, room.id);
        this.say(`休息：恢复 ${Math.ceil(this.session.player.hp-before)} 生命、${Math.ceil(this.session.player.mana-manaBefore)} 魔力`);
        break;
      }
      case 'shop':
        this.openShop();
        break;
      case 'entrance':
        this.say('这里是入口，没有可以互动的内容');
        break;
    }
    this.saveCheckpoint();
    this.render();
  }

  // ---------- 商店 ----------

  private openShop(): void {
    this.shopOpen=true;this.shop.show();
  }

  private closeShop():void { this.shopOpen=false;this.shop.hide();this.say('交易结束，祝你一路平安。'); }

  private grant(gains: Gains, roomId: number, label: string): void {
    if(!markCleared(this.run,roomId)){this.say('此房间奖励已领取');return;}
    const levelUps = applyGains(this.session, gains);
    const text = describeGains(gains, (id) => this.itemNames.get(id) ?? id);
    // 宝箱等获得的物品可能完成收集任务
    const done = this.session.quests.syncCollect();
    const questLines = settleQuestRewards(
      this.session,
      done,
      (id) => this.session.quests.def(id)?.title ?? id,
      (id) => this.itemNames.get(id) ?? id,
    ).lines;
    this.say([`${label}：${text || '无'}`, ...levelUps, ...questLines].join('\n'));
  }

  private leave(): void {
    const active=getRun();setRun(null);
    if(!this.saveCheckpoint()){setRun(active);return;}
    this.scene.start('OverworldScene', { retreated: false });
  }

  // ---------- 渲染 ----------

  private say(text: string): void {
    this.message.setText(text);
  }

  private render(): void {
    for (const obj of this.dynamic) obj.destroy();
    this.dynamic = [];
    this.graphics.clear();

    const rooms = this.run.layout.rooms;
    const minX = Math.min(...rooms.map((r) => r.x));
    const maxX = Math.max(...rooms.map((r) => r.x));
    const minY = Math.min(...rooms.map((r) => r.y));
    const maxY = Math.max(...rooms.map((r) => r.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const sx=Math.min(96,740/Math.max(1,maxX-minX)),sy=Math.min(72,280/Math.max(1,maxY-minY));
    const toScreen = (x: number, y: number) => ({x:454+(x-cx)*sx,y:300+(y-cy)*sy});

    // 连线
    this.graphics.lineStyle(2, 0x3a3560, 1);
    for (const [a, b] of this.run.layout.edges) {
      const pa = toScreen(roomById(this.run, a).x, roomById(this.run, a).y);
      const pb = toScreen(roomById(this.run, b).x, roomById(this.run, b).y);
      this.graphics.lineBetween(pa.x, pa.y, pb.x, pb.y);
    }

    const reachable = new Set(neighbors(this.run, this.run.current).map((r) => r.id));
    let index = 0;
    for (const room of rooms) {
      const p = toScreen(room.x, room.y);
      const cleared = this.run.cleared.has(room.id);
      this.graphics.fillStyle(KIND_COLOR[room.kind], cleared ? 0.3 : 0.95);
      this.graphics.fillRoundedRect(p.x-19,p.y-19,38,38,9);
      if (room.id === this.run.current) {
        this.graphics.lineStyle(3, 0xffffff, 1);
        this.graphics.strokeRoundedRect(p.x-24,p.y-24,48,48,12);
      }
      const icons:Record<RoomKind,string>={entrance:'◇',combat:'⚔',chest:'▣',event:'✧',shop:'¤',rest:'+',boss:'♜'};
      this.dynamic.push(this.add.text(p.x,p.y,icons[room.kind],{fontSize:22,color:'#10292b'}).setOrigin(.5).setDepth(15));
      if(reachable.has(room.id)){
        const hit=this.add.rectangle(p.x,p.y,46,46,0xffffff,0).setDepth(25).setInteractive({useHandCursor:true});
        hit.on('pointerdown',()=>this.travelTo(room.id));this.dynamic.push(hit);
      }
      const label = this.add.text(p.x, p.y + ROOM_RADIUS + 4, KIND_LABEL[room.kind], {
        fontFamily: 'sans-serif', fontSize: '12px', color: cleared ? '#6b7089' : '#e6d9ff',
      }).setOrigin(0.5, 0).setDepth(20);
      this.dynamic.push(label);
      if (reachable.has(room.id)) {
        index++;
        const key = this.add.text(p.x+14, p.y-18, `${index}`, {
          fontFamily: 'monospace', fontSize: '12px', color: '#fff3c4',backgroundColor:'#17333a',padding:{x:4,y:2},
        }).setOrigin(0,.5).setDepth(30).setInteractive({useHandCursor:true});
        key.on('pointerdown',()=>this.travelTo(room.id));
        this.dynamic.push(key);
      }
    }

    const { player } = this.session;
    const level = levelForExp(player.exp);
    const kind = KIND_LABEL[roomById(this.run, this.run.current).kind];
    const data=loadGameData(),stats=combatProfile(player.equipment,data.items,data.affixes,data.itemSets),maxHp=stats.maxHp;
    const current=roomById(this.run,this.run.current);
    const art=current.kind==='shop'?'actor-merchant':current.kind==='combat'?`enemy-${this.enemies[0].id}`:current.kind==='boss'?`enemy-${this.enemies.find(e=>e.boss)!.id}`:current.kind==='rest'?'actor-mage':'portal';
    this.portrait.setTexture(art);this.roomTitle.setText(`${kind}房间`);
    this.hud.setText([
      `地牢 第 ${this.run.floor} 层 · 当前：${kind}房间`,
      `生命 ${Math.ceil(player.hp)}/${maxHp}   魔力 ${Math.floor(player.mana??stats.maxMana)}/${stats.maxMana}   金币 ${player.gold}   经验 ${player.exp}   等级 ${level}`,
      `已清理 ${this.run.cleared.size}/${rooms.length} 个房间`,
    ]);
  }
}
