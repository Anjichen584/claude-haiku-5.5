import Phaser from 'phaser';
import { display } from '../config/display';
import { loadGameData } from '../data/loader';
import type { EnemyDef } from '../data/schema';
import {
  moveTo,
  markCleared,
  neighbors,
  roomById,
  roomOutcome,
  startRun,
  type DungeonRun,
} from '../dungeon/run';
import type { RoomKind } from '../dungeon/layout';
import { applyGains, describeGains, grantQuestRewards, levelForExp, type Gains } from '../state/rewards';
import { getSession, persistSession, setRun, getRun } from '../state/sessionStore';
import { buyItem, currentPriceMultiplier, shopLines, shopStock } from '../state/shop';
import type { FactionDef, ItemDef } from '../data/schema';
import { PLAYER_MAX_HP, type GameSession } from '../state/session';

/**
 * 地牢场景：房间图探索。
 * 操作：数字键 1–9 移动到相邻房间 · E 与当前房间互动 · L 离开地牢（保留已获得的奖励）
 *
 * 战斗房与 Boss 房会切换到战斗场景；胜利后回到这里继续探索。
 * 布局由 (种子, 层数) 决定，同一层每次进入的房间都相同。
 */

const DUNGEON_SEED = 20261014;
const CELL_X = 96;
const CELL_Y = 84;
const ROOM_RADIUS = 18;
const MAP_CENTER_Y = 300;

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
  private shopItems: ItemDef[] = [];
  private shopMultiplier = 1;
  private graphics!: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private hud!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('DungeonScene');
  }

  create(init?: { resume?: boolean }): void {
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

    // 从战斗返回时沿用当前探索；否则开始新的探索
    const existing = init?.resume ? getRun() : null;
    this.run = existing ?? startRun(DUNGEON_SEED, session.dungeonFloor, data.dungeon);
    setRun(this.run);

    this.add.rectangle(display.baseWidth / 2, display.baseHeight / 2, display.baseWidth, display.baseHeight, 0x0c0a16);
    this.graphics = this.add.graphics();
    this.hud = this.add.text(16, 12, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#00000066', padding: { x: 8, y: 6 },
    }).setDepth(200);
    this.message = this.add.text(display.baseWidth / 2, display.baseHeight - 150, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#fff3c4', align: 'center',
      backgroundColor: '#00000099', padding: { x: 12, y: 8 }, wordWrap: { width: display.baseWidth - 120 },
    }).setOrigin(0.5, 0).setDepth(200);
    this.add.text(16, display.baseHeight - 28, '数字键 移动到相邻房间 · E 互动 · L 离开地牢', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#c9c3dd',
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setDepth(200);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    this.keyE = keyboard.addKey('E');
    this.keyL = keyboard.addKey('L');
    keyboard.on('keydown', this.onDigit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', this.onDigit, this));

    if (this.run.finished) this.say('本层 Boss 已击败，按 L 离开地牢');
    else if (existing) this.say('返回地牢，继续探索。');
    else this.say(`第 ${this.run.floor} 层。按数字键前进，按 E 与房间互动。`);
    this.render();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
      this.leave();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
      if (this.shopOpen) this.closeShop();
      else this.interact();
    }
  }

  // ---------- 移动 ----------

  private onDigit(e: KeyboardEvent): void {
    if (!/^[1-9]$/.test(e.key)) return;
    // 商店打开时，数字键用于购买，不移动
    if (this.shopOpen) {
      const item = this.shopItems[Number(e.key) - 1];
      if (!item) return;
      const result = buyItem(this.session, item, this.shopMultiplier);
      persistSession(this.session);
      this.showShop(result.message);
      return;
    }
    const next = neighbors(this.run, this.run.current)[Number(e.key) - 1];
    if (!next) return;
    moveTo(this.run, next.id);
    const cleared = this.run.cleared.has(next.id) ? '（已清理）' : '';
    this.say(`进入：${KIND_LABEL[next.kind]}房间${cleared}`);
    this.render();
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
        const max = PLAYER_MAX_HP;
        const before = this.session.player.hp;
        this.session.player.hp = Math.min(max, before + Math.ceil(max * out.healFraction));
        markCleared(this.run, room.id);
        this.say(`休息：恢复 ${this.session.player.hp - before} 点生命`);
        break;
      }
      case 'shop':
        this.openShop();
        break;
      case 'entrance':
        this.say('这里是入口，没有可以互动的内容');
        break;
    }
    persistSession(this.session);
    this.render();
  }

  // ---------- 商店 ----------

  private openShop(): void {
    this.shopItems = shopStock(this.itemDefs);
    this.shopMultiplier = currentPriceMultiplier(this.session.world, this.factionDefs);
    this.shopOpen = true;
    this.showShop('欢迎光临。');
  }

  private showShop(note: string): void {
    const gold = this.session.player.gold;
    this.say([`商店（数字键购买 · E 离开）  金币 ${gold}`, note, ...shopLines(this.shopItems, this.shopMultiplier)].join('\n'));
  }

  private closeShop(): void {
    this.shopOpen = false;
    this.say('离开了商店。');
  }

  private grant(gains: Gains, roomId: number, label: string): void {
    markCleared(this.run, roomId);
    const levelUps = applyGains(this.session, gains);
    const text = describeGains(gains, (id) => this.itemNames.get(id) ?? id);
    // 宝箱等获得的物品可能完成收集任务
    const done = this.session.quests.syncCollect();
    const questLines = grantQuestRewards(
      this.session,
      done,
      (id) => this.session.quests.def(id)?.title ?? id,
      (id) => this.itemNames.get(id) ?? id,
    );
    this.say([`${label}：${text || '无'}`, ...levelUps, ...questLines].join('\n'));
  }

  private leave(): void {
    setRun(null);
    persistSession(this.session);
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
    const toScreen = (x: number, y: number) => ({
      x: display.baseWidth / 2 + (x - cx) * CELL_X,
      y: MAP_CENTER_Y + (y - cy) * CELL_Y,
    });

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
      this.graphics.fillCircle(p.x, p.y, ROOM_RADIUS);
      if (room.id === this.run.current) {
        this.graphics.lineStyle(3, 0xffffff, 1);
        this.graphics.strokeCircle(p.x, p.y, ROOM_RADIUS + 5);
      }
      const label = this.add.text(p.x, p.y + ROOM_RADIUS + 4, KIND_LABEL[room.kind], {
        fontFamily: 'sans-serif', fontSize: '12px', color: cleared ? '#6b7089' : '#e6d9ff',
      }).setOrigin(0.5, 0).setDepth(20);
      this.dynamic.push(label);
      if (reachable.has(room.id)) {
        index++;
        const key = this.add.text(p.x, p.y - ROOM_RADIUS - 4, `[${index}]`, {
          fontFamily: 'monospace', fontSize: '14px', color: '#fff3c4',
        }).setOrigin(0.5, 1).setDepth(20);
        this.dynamic.push(key);
      }
    }

    const { player } = this.session;
    const level = levelForExp(player.exp);
    const kind = KIND_LABEL[roomById(this.run, this.run.current).kind];
    this.hud.setText([
      `地牢 第 ${this.run.floor} 层 · 当前：${kind}房间`,
      `生命 ${player.hp}/${PLAYER_MAX_HP}   金币 ${player.gold}   经验 ${player.exp}   等级 ${level}`,
      `已清理 ${this.run.cleared.size}/${rooms.length} 个房间`,
    ]);
  }
}
