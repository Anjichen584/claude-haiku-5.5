import Phaser from 'phaser';
import { landscape, panel, UI } from '../ui/theme';
import { settleQuestRewards } from '../state/rewards';
import { display } from '../config/display';
import { Actor } from '../combat/Actor';
import { calculateDamage, type Element } from '../combat/damage';
import {
  createEnemyBrain,
  decideEnemyAction,
  type EnemyAiConfig,
  type EnemyBrain,
} from '../combat/enemyAi';
import { loadGameData } from '../data/loader';
import type { EnemyDef } from '../data/schema';
import type { QuestCompletion } from '../narrative/QuestManager';
import { getRun, getSession, persistSession, setRun } from '../state/sessionStore';
import { applyGains } from '../state/rewards';
import { killGains, rollDrops } from '../state/killRewards';
import { combatStats } from '../state/equipment';
import { MAX_DUNGEON_FLOOR, type GameSession } from '../state/session';
import { combatGains, markCleared } from '../dungeon/run';
import type { EncounterRequest } from '../world/encounters';

/**
 * 阶段 1 测试房间：验证移动、冲刺、闪避、攻击、伤害与敌人 AI。
 * 美术使用纯色矩形占位，不依赖任何外部资源。
 *
 * 操作：WASD 移动 · Shift 冲刺 · Space 闪避 · J 攻击 · R 重置
 */

const PLAYER = {
  radius: 14,
  speed: 200,
  maxHp: 100,
  attack: 12,
  defense: 2,
  attackCooldownMs: 400,
  attackReachPx: 60,
  dashSpeed: 600,
  dashDurationMs: 150,
  dashCooldownMs: 1000,
  dodgeDistancePx: 120,
  dodgeDurationMs: 300,
  dodgeInvulnMs: 350,
};

const ENEMY_AI: EnemyAiConfig = {
  aggroRange: 220,
  leashRange: 360,
  attackRange: 40,
  attackCooldownMs: 1000,
};

const ENEMY_RADIUS = 14;
const ENEMY_SPAWNS: ReadonlyArray<{ id: string; x: number; y: number }> = [
  { id: 'ash_wolf', x: 900, y: 200 },
  { id: 'moss_golem', x: 1000, y: 480 },
  { id: 'ember_hound', x: 700, y: 560 },
];

interface EnemyUnit {
  def: EnemyDef;
  actor: Actor;
  brain: EnemyBrain;
  x: number;
  y: number;
  body: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  windup: number;
  face: number;
  hpBar: Phaser.GameObjects.Graphics;
  alive: boolean;
}

export class TestRoomScene extends Phaser.Scene {
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'SHIFT' | 'SPACE' | 'J' | 'R', Phaser.Input.Keyboard.Key>;
  private playerBody!: Phaser.GameObjects.Image;
  private effects!: Phaser.GameObjects.Graphics;
  private health!: Phaser.GameObjects.Graphics;
  private exitKey!: Phaser.Input.Keyboard.Key;
  private playerActor!: Actor;
  private px = 0;
  private py = 0;
  private facing = { x: 1, y: 0 };
  private attackCooldownMs = 0;
  private dashCooldownMs = 0;
  private dashLeftMs = 0;
  private dodgeLeftMs = 0;
  private dodgeDir = { x: 0, y: 0 };
  private enemies: EnemyUnit[] = [];
  private hud!: Phaser.GameObjects.Text;
  private log: string[] = [];
  /** 从地表进入时非空；此时胜负会写回会话并返回地表 */
  private encounter: EncounterRequest | null = null;
  /** 本场战斗使用的属性（由装备决定） */
  private stats = { attack: PLAYER.attack, defense: PLAYER.defense, maxHp: PLAYER.maxHp };
  private session: GameSession | null = null;
  private completions: QuestCompletion[] = [];
  /** 本场战斗获得的击杀奖励与掉落文字 */
  private loot: string[] = [];
  private finished = false;

  constructor() {
    super('TestRoomScene');
  }

  init(data: { encounter?: EncounterRequest } | undefined): void {
    this.encounter = data?.encounter ?? null;
    this.session = getSession();
    this.completions = [];
    this.loot = [];
    this.finished = false;
    this.won = false;
  }

  create(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    this.keys = kb.addKeys({
      W: 'W', A: 'A', S: 'S', D: 'D',
      SHIFT: 'SHIFT', SPACE: 'SPACE', J: 'J', R: 'R',
    }) as typeof this.keys;
    this.exitKey=kb.addKey("ESC");
    this.resetRoom();
  }

  update(_time: number, deltaMs: number): void {
    deltaMs = Math.min(deltaMs,50);
    if(!this.encounter && Phaser.Input.Keyboard.JustDown(this.exitKey)){this.scene.start('OverworldScene');return;}
    if (this.finished) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.returnToOverworld();
      this.render();
      return;
    }
    // 遭遇战中不允许重置，否则击杀任务会重复计数
    if (!this.encounter && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.resetRoom();
      return;
    }
    this.effects.clear();
    if(this.playerActor.isDead){this.render();return;}
    this.playerActor.tick(deltaMs);
    this.updatePlayer(deltaMs);
    this.updateEnemies(deltaMs);
    this.checkEncounterEnd();
    this.render();
  }

  // ---------- 遭遇战结束 ----------

  private checkEncounterEnd(): void {
    if (!this.encounter) return;
    if (this.enemies.every((e) => !e.alive)) {
      this.finishEncounter(true);
    } else if (this.playerActor.isDead) {
      this.finishEncounter(false);
    }
  }

  private finishEncounter(won: boolean): void {
    this.finished = true;
    this.won = won;
    // 地牢战斗不写入地表的击败记录
    if (won && this.encounter && this.session && !this.encounter.dungeon) this.session.defeated.add(this.encounter.spawnKey);

    const lines = [won ? '胜利！' : '你倒下了……', ...this.loot.slice(0, 8)];
    if (this.loot.length > 8) lines.push(`…另有 ${this.loot.length - 8} 条记录`);
    if (this.encounter?.dungeon) lines.push(...this.settleDungeonRoom(this.encounter.dungeon, won));
    const session = this.session;
    if (session) {
      const items = loadGameData().items;
      lines.push(
        ...settleQuestRewards(
          session,
          this.completions,
          (id) => session.quests.def(id)?.title ?? id,
          (id) => items.find((i) => i.id === id)?.name ?? id,
        ).lines,
      );
    }
    lines.push(won ? '按 Space 返回地表' : '按 Space 返回地表（生命恢复少量）');
    this.add
      .text(display.baseWidth / 2, display.baseHeight / 2 - 60, lines.join('\n'), {
        fontFamily: 'sans-serif', fontSize: '24px', color: '#fff3c4',
        backgroundColor: '#00000099', padding: { x: 16, y: 12 }, align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  /** 地牢房间战斗结算：胜利发放奖励、标记清理、Boss 通关后推进层数；战败结束探索。 */
  private settleDungeonRoom(dungeon: { roomId: number; boss: boolean }, won: boolean): string[] {
    const run = getRun();
    const session = this.session;
    if (!run || !session) return [];
    if (!won) {
      setRun(null);
      return ['地牢探索失败，已返回地表'];
    }
    markCleared(run, dungeon.roomId);
    const lines = applyGains(session, combatGains(run, dungeon.boss));
    if (dungeon.boss) {
      if (session.dungeonFloor === run.floor && run.floor < MAX_DUNGEON_FLOOR) session.dungeonFloor = run.floor + 1;
      lines.push(`击败了本层 Boss！下一层解锁：第 ${session.dungeonFloor} 层`);
    }
    return lines;
  }

  private returnToOverworld(): void {
    if (this.session && this.encounter) {
      // 胜利保留剩余生命；战败恢复到最大生命的 30%，且地表给予短暂的脱离保护
      this.session.player.hp = this.won
        ? Math.max(1, this.playerActor.hp)
        : Math.max(1, Math.ceil(this.stats.maxHp * 0.3));
    }
    if (this.session) persistSession(this.session);
    if (this.encounter?.dungeon) {
      // 地牢：胜利回到地牢继续探索；战败则结束本次探索，回到地表
      if (this.won && getRun()) this.scene.start('DungeonScene', { resume: true });
      else this.scene.start('OverworldScene', { retreated: !this.won });
      return;
    }
    this.scene.start('OverworldScene', { retreated: !this.won });
  }
  private won = false;

  // ---------- 初始化 ----------

  private resetRoom(): void {
    this.tweens.killAll();
    this.children.removeAll(true);
    this.enemies = [];
    this.log = [];

    landscape(this,true);
    const floor=this.add.graphics().setDepth(-2);
    floor.fillStyle(0x324a40,.92).fillRoundedRect(76,138,1128,456,28);
    floor.lineStyle(2,0xa6ac7b,.25).strokeRoundedRect(88,150,1104,432,24);
    for(let i=0;i<30;i++){const x=110+(i*131)%1060,y=173+(i*79)%390;floor.lineStyle(1,0x9fb18b,.12).strokeCircle(x,y,12+(i%4)*5);}
    panel(this,24,22,1232,90);
    this.add.text(48,39,this.encounter?.dungeon?'裂隙深处  /  房间战斗':this.encounter?'荒野遭遇':'战斗试炼', {fontFamily:UI.font,fontSize:23,color:'#e7dbb6'}).setDepth(200);
    this.add.text(48,79,'W A S D 移动   ·   J 挥剑   ·   Shift 冲刺   ·   Space 闪避', {fontFamily:UI.font,fontSize:13,color:'#a4bcaa'}).setDepth(200);
    panel(this,24,618,1232,78);
    this.hud = this.add.text(48,632,'',{fontFamily:UI.font,fontSize:15,color:'#d5dec2',lineSpacing:7}).setDepth(200);
    if(!this.encounter)this.add.text(1125,44,'Esc 返回',{fontFamily:UI.font,fontSize:15,color:'#e3cb93'}).setDepth(200).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.scene.start('OverworldScene'));
    this.effects=this.add.graphics().setDepth(30);
    this.health=this.add.graphics().setDepth(201);

    this.px = 320;
    this.py = display.baseHeight / 2;
    // 战斗属性由装备决定（没有会话时为基础属性）
    const gameData = loadGameData();
    this.stats = combatStats(this.session?.player.equipment ?? {}, gameData.items, gameData.affixes, gameData.itemSets);
    this.playerActor = new Actor({ maxHp: this.stats.maxHp, staggerMs: 150 });
    if (this.session) {
      // 生命从会话带入（已被击败的刷新点不会再次进入）
      this.playerActor.hp = Math.max(1, Math.min(this.stats.maxHp, this.session.player.hp));
    }
    this.playerBody = this.add.image(this.px,this.py,'actor-hero').setDisplaySize(84,84).setOrigin(.5,.82).setDepth(10);
    this.attackCooldownMs = 0;
    this.dashCooldownMs = 0;
    this.dashLeftMs = 0;
    this.dodgeLeftMs = 0;

    const data = loadGameData();
    const spawns = this.encounter
      ? this.encounter.enemyIds.map((id, i) => ({ id, x: 820 + (i % 2) * 80, y: 200 + i * 120 }))
      : ENEMY_SPAWNS;
    for (const spawn of spawns) {
      const def = data.enemies.find((e) => e.id === spawn.id);
      if (!def) continue;
      const actor = new Actor({ maxHp: def.hp, staggerMs: def.staggerImmune || def.boss || def.elite || def.id === 'moss_golem' ? 0 : 200 });
      this.enemies.push({
        def,
        actor,
        brain: createEnemyBrain(),
        x: spawn.x,
        y: spawn.y,
        body: this.add.image(spawn.x,spawn.y,`enemy-${def.id}`).setDisplaySize(def.boss?122:88,def.boss?122:88).setOrigin(.5,.82).setDepth(9),
        label: this.add.text(spawn.x,spawn.y-88,`${def.boss?'◆ ':def.elite?'◇ ':''}${def.name}`,{fontFamily:UI.font,fontSize:14,color:def.boss?'#ecc18d':'#d8dfc1',backgroundColor:'#122b2b',padding:{x:6,y:3}}).setOrigin(.5),
        windup:0, face:-1,
        hpBar: this.add.graphics(),
        alive: true,
      });
    }
    this.pushLog('房间已重置');
  }

  // ---------- 玩家 ----------

  private updatePlayer(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - deltaMs);
    this.dashCooldownMs = Math.max(0, this.dashCooldownMs - deltaMs);
    this.dashLeftMs = Math.max(0, this.dashLeftMs - deltaMs);
    this.dodgeLeftMs = Math.max(0, this.dodgeLeftMs - deltaMs);

    // 输入方向
    let mx = 0;
    let my = 0;
    if (this.keys.A.isDown) mx -= 1;
    if (this.keys.D.isDown) mx += 1;
    if (this.keys.W.isDown) my -= 1;
    if (this.keys.S.isDown) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
      this.facing = { x: mx, y: my };
    }

    // 闪避：位移 + 无敌帧
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && this.dodgeLeftMs === 0) {
      const dir = len > 0 ? { x: mx, y: my } : this.facing;
      this.dodgeDir = dir;
      this.dodgeLeftMs = PLAYER.dodgeDurationMs;
      this.playerActor.grantInvulnerability(PLAYER.dodgeInvulnMs);
      this.pushLog('闪避');
    }

    // 冲刺
    if (Phaser.Input.Keyboard.JustDown(this.keys.SHIFT) && this.dashCooldownMs === 0) {
      this.dashLeftMs = PLAYER.dashDurationMs;
      this.dashCooldownMs = PLAYER.dashCooldownMs;
    }

    if (this.dodgeLeftMs > 0) {
      const step = (PLAYER.dodgeDistancePx / (PLAYER.dodgeDurationMs / 1000)) * dt;
      this.movePlayer(this.dodgeDir.x * step, this.dodgeDir.y * step);
    } else if (this.dashLeftMs > 0) {
      this.movePlayer(this.facing.x * PLAYER.dashSpeed * dt, this.facing.y * PLAYER.dashSpeed * dt);
    } else if (!this.playerActor.isStaggered) {
      this.movePlayer(mx * PLAYER.speed * dt, my * PLAYER.speed * dt);
    }

    // 攻击
    if (Phaser.Input.Keyboard.JustDown(this.keys.J) && this.attackCooldownMs === 0) {
      this.attackCooldownMs = PLAYER.attackCooldownMs;
      this.performPlayerAttack();
    }
  }

  private movePlayer(dx: number, dy: number): void {
    this.px = Phaser.Math.Clamp(this.px + dx, 110, display.baseWidth - 110);
    this.py = Phaser.Math.Clamp(this.py + dy, 210, display.baseHeight - 150);
  }

  private performPlayerAttack(): void {
    const angle=Math.atan2(this.facing.y,this.facing.x);
    const slash=this.add.graphics().setDepth(25).setPosition(this.px,this.py-12);
    slash.lineStyle(5,0xe5d4a4,.9);slash.beginPath();slash.arc(0,0,59,angle-.9,angle+.9);slash.strokePath();
    this.tweens.add({targets:slash,alpha:0,scale:1.2,duration:180,onComplete:()=>slash.destroy()});
    const hits: string[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - this.px;
      const dy = enemy.y - this.py;
      const dist = Math.hypot(dx, dy);
      const inFront = dx * this.facing.x + dy * this.facing.y > 0;
      if (dist <= PLAYER.attackReachPx + ENEMY_RADIUS && inFront) {
        const element: Element = 'none';
        const dmg = calculateDamage(
          { attack: this.stats.attack, multiplier: 1, element, critical: false },
          { defense: enemy.def.defense, element: (enemy.def.element as Element) ?? 'none' },
        );
        this.damageEnemy(enemy, dmg);
        hits.push(`${enemy.def.name} -${dmg}`);
      }
    }
    this.pushLog(hits.length ? `攻击命中：${hits.join('，')}` : '攻击落空');
  }

  // ---------- 敌人 ----------

  private damageEnemy(enemy: EnemyUnit, amount: number): void {
    const applied = enemy.actor.receiveDamage(amount);
    if(applied>0){
      this.floatText(enemy.x,enemy.y-70,`−${applied}`,'#f2df9d');
      enemy.body.setTintFill(0xf7dfb2);this.time.delayedCall(90,()=>{if(enemy.body.active)enemy.body.clearTint();});
      if(enemy.actor.isStaggered)enemy.windup=0;
    }
    if (applied > 0 && enemy.actor.isDead) {
      enemy.alive = false;
      enemy.label.setVisible(false);
      this.tweens.add({targets:enemy.body,alpha:0,angle:40,y:enemy.y+12,duration:400});
      this.pushLog(`${enemy.def.name} 被击败`);
      if (this.encounter && this.session) {
        // 遭遇战中的击杀计入 kill 任务
        this.completions.push(...this.session.quests.report({ type: 'kill', target: enemy.def.id, amount: 1 }));
        this.session.quests.acceptAvailable((d) => d.type !== 'side');
        // 击杀奖励与掉落（掉落按 战斗键 + 敌人序号 决定，结果稳定）
        const slot = this.enemies.indexOf(enemy);
        const key = `${this.encounter.spawnKey}:${slot}`;
        const kg = killGains(enemy.def);
        this.loot.push(`击杀 ${enemy.def.name}：+${kg.exp} 经验、+${kg.gold} 金币`);
        this.loot.push(...applyGains(this.session, kg));
        for (const item of rollDrops(enemy.def, key)) {
          this.session.world.addItem(item, 1);
          this.loot.push(`掉落：${loadGameData().items.find((i) => i.id === item)?.name ?? item}`);
        }
      }
    }
  }

  private updateEnemies(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.actor.tick(deltaMs);

      const dist = Math.hypot(this.px - enemy.x, this.py - enemy.y);
      const decision = decideEnemyAction(enemy.brain, ENEMY_AI, { distanceToPlayer: dist, deltaMs });

      if (decision.moveTowardPlayer && enemy.windup===0 && !enemy.actor.isStaggered && dist > 0) {
        const speed = enemy.def.speed * 0.5;
        enemy.x += ((this.px - enemy.x) / dist) * speed * dt;
        enemy.y += ((this.py - enemy.y) / dist) * speed * dt;
      }

      if (decision.shouldAttack && enemy.windup===0 && !enemy.actor.isStaggered) enemy.windup=450;
      if(enemy.windup>0){
        enemy.windup-=deltaMs;
        this.effects.lineStyle(2,0xe8a273,.7).strokeCircle(enemy.x,enemy.y,50);
        this.effects.fillStyle(0xdb845e,.12).fillCircle(enemy.x,enemy.y,50);
        if(enemy.windup<=0){
          enemy.windup=0;
          if(dist<65 && !enemy.actor.isStaggered){
            const dmg=calculateDamage({attack:enemy.def.attack,multiplier:1,element:(enemy.def.element as Element)??'none',critical:false},{defense:this.stats.defense});
            const applied=this.playerActor.receiveDamage(dmg);
            if(applied>0){this.floatText(this.px,this.py-62,`−${applied}`,'#f0aa8b');this.cameras.main.shake(90,.002);this.pushLog(`${enemy.def.name} 造成 ${applied} 点伤害`);}
          }
        }
      }
      enemy.body.setFlipX(this.px < enemy.x);
      if(decision.moveTowardPlayer && enemy.windup===0)enemy.body.setAngle(Math.sin(this.time.now/110+enemy.x)*4);
      else enemy.body.setAngle(0);

      enemy.body.setPosition(enemy.x, enemy.y);
    }
  }

  // ---------- 渲染与 HUD ----------

  private render(): void {
    this.playerBody.setPosition(this.px, this.py);
    this.playerBody.setFlipX(this.facing.x<0);
    this.playerBody.setAngle(this.dodgeLeftMs>0?(this.facing.x<0?-18:18):Math.sin(this.time.now/100)*(this.keys.W.isDown||this.keys.A.isDown||this.keys.S.isDown||this.keys.D.isDown?4:0));
    this.playerBody.setAlpha(this.playerActor.isInvulnerable ? 0.5 : 1);

    for (const enemy of this.enemies) {
      enemy.body.setPosition(enemy.x, enemy.y);
      enemy.hpBar.clear();
      if (!enemy.alive) continue;
      enemy.label.setPosition(enemy.x,enemy.y-(enemy.def.boss?108:82));
      const ratio = enemy.actor.hp / enemy.actor.maxHp;
      enemy.hpBar.fillStyle(0x222222, 1).fillRect(enemy.x - 20, enemy.y - (enemy.def.boss?82:58), 40, 5);
      enemy.hpBar.fillStyle(0xc18b62, 1).fillRect(enemy.x - 20, enemy.y - (enemy.def.boss?82:58), 40 * ratio, 5);
    }

    this.health.clear().fillStyle(0x304b44).fillRoundedRect(790,52,300,12,6).fillStyle(0xa3c18c).fillRoundedRect(790,52,300*Math.max(0,this.playerActor.hp/this.playerActor.maxHp),12,6);
    this.hud.setText([
      `生命 ${this.playerActor.hp}/${this.playerActor.maxHp}     冲刺 ${this.dashCooldownMs>0?'冷却中':'就绪'}     剩余敌人 ${this.enemies.filter(e=>e.alive).length}`,
      this.log[this.log.length-1]??'靠近敌人，面向目标挥剑；橙色圆圈表示攻击预警。',
    ]);
  }

  private floatText(x:number,y:number,value:string,color:string):void{
    const t=this.add.text(x,y,value,{fontFamily:UI.font,fontSize:24,color,stroke:'#10252b',strokeThickness:4}).setOrigin(.5).setDepth(60);
    this.tweens.add({targets:t,y:y-40,alpha:0,duration:720,onComplete:()=>t.destroy()});
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 20) this.log.shift();
  }
}
