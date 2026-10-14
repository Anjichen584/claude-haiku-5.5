import Phaser from 'phaser';
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
import { getSession, persistSession } from '../state/sessionStore';
import { PLAYER_MAX_HP, type GameSession } from '../state/session';
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
  body: Phaser.GameObjects.Arc;
  hpBar: Phaser.GameObjects.Graphics;
  alive: boolean;
}

export class TestRoomScene extends Phaser.Scene {
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'SHIFT' | 'SPACE' | 'J' | 'R', Phaser.Input.Keyboard.Key>;
  private playerBody!: Phaser.GameObjects.Arc;
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
  private session: GameSession | null = null;
  private completions: QuestCompletion[] = [];
  private finished = false;

  constructor() {
    super('TestRoomScene');
  }

  init(data: { encounter?: EncounterRequest } | undefined): void {
    this.encounter = data?.encounter ?? null;
    this.session = getSession();
    this.completions = [];
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
    this.resetRoom();
  }

  update(_time: number, deltaMs: number): void {
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
    if (won && this.encounter && this.session) this.session.defeated.add(this.encounter.spawnKey);

    const lines = [won ? '胜利！' : '你倒下了……'];
    for (const c of this.completions) {
      lines.push(`任务完成：${this.session?.quests.def(c.questId)?.title ?? c.questId}`);
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

  private returnToOverworld(): void {
    if (this.session && this.encounter) {
      // 胜利保留剩余生命；战败恢复到最大生命的 30%，且地表给予短暂的脱离保护
      this.session.player.hp = this.won
        ? Math.max(1, this.playerActor.hp)
        : Math.max(1, Math.ceil(PLAYER_MAX_HP * 0.3));
    }
    if (this.session) persistSession(this.session);
    this.scene.start('OverworldScene', { retreated: !this.won });
  }
  private won = false;

  // ---------- 初始化 ----------

  private resetRoom(): void {
    this.children.removeAll(true);
    this.enemies = [];
    this.log = [];

    this.add.rectangle(display.baseWidth / 2, display.baseHeight / 2, display.baseWidth, display.baseHeight, 0x14141c);
    this.add.text(16, 12, this.encounter ? '遭遇战' : '测试房间', { fontFamily: 'sans-serif', fontSize: '18px', color: '#9aa0b4' });
    this.add.text(16, display.baseHeight - 28,
      this.encounter ? 'WASD 移动 · Shift 冲刺 · Space 闪避 · J 攻击' : 'WASD 移动 · Shift 冲刺 · Space 闪避 · J 攻击 · R 重置',
      { fontFamily: 'sans-serif', fontSize: '14px', color: '#6b7089' });
    this.hud = this.add.text(16, display.baseHeight - 110, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#e6d9ff', lineSpacing: 4,
    });

    this.px = 320;
    this.py = display.baseHeight / 2;
    this.playerActor = new Actor({ maxHp: PLAYER.maxHp, staggerMs: 150 });
    if (this.session) {
      // 生命从会话带入（已被击败的刷新点不会再次进入）
      this.playerActor.hp = Math.max(1, Math.min(PLAYER.maxHp, this.session.player.hp));
    }
    this.playerBody = this.add.circle(this.px, this.py, PLAYER.radius, 0x7aa2ff);
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
      const actor = new Actor({ maxHp: def.hp, staggerMs: def.id === 'moss_golem' ? 0 : 200 });
      this.enemies.push({
        def,
        actor,
        brain: createEnemyBrain(),
        x: spawn.x,
        y: spawn.y,
        body: this.add.circle(spawn.x, spawn.y, ENEMY_RADIUS, 0xe0584f),
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
    this.px = Phaser.Math.Clamp(this.px + dx, PLAYER.radius, display.baseWidth - PLAYER.radius);
    this.py = Phaser.Math.Clamp(this.py + dy, PLAYER.radius + 40, display.baseHeight - 130);
  }

  private performPlayerAttack(): void {
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
          { attack: PLAYER.attack, multiplier: 1, element, critical: false },
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
    if (applied > 0 && enemy.actor.isDead) {
      enemy.alive = false;
      enemy.body.setFillStyle(0x3a3a44);
      this.pushLog(`${enemy.def.name} 被击败`);
      if (this.encounter && this.session) {
        // 遭遇战中的击杀计入 kill 任务
        this.completions.push(...this.session.quests.report({ type: 'kill', target: enemy.def.id, amount: 1 }));
        this.session.quests.acceptAvailable();
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

      if (decision.moveTowardPlayer && !enemy.actor.isStaggered && dist > 0) {
        const speed = enemy.def.speed * 0.5;
        enemy.x += ((this.px - enemy.x) / dist) * speed * dt;
        enemy.y += ((this.py - enemy.y) / dist) * speed * dt;
      }

      if (decision.shouldAttack) {
        const dmg = calculateDamage(
          { attack: enemy.def.attack, multiplier: 1, element: (enemy.def.element as Element) ?? 'none', critical: false },
          { defense: PLAYER.defense },
        );
        const applied = this.playerActor.receiveDamage(dmg);
        if (applied > 0) this.pushLog(`${enemy.def.name} 造成 ${applied} 点伤害`);
        if (this.playerActor.isDead) this.pushLog('你已倒下，按 R 重新开始');
      }

      enemy.body.setPosition(enemy.x, enemy.y);
    }
  }

  // ---------- 渲染与 HUD ----------

  private render(): void {
    this.playerBody.setPosition(this.px, this.py);
    this.playerBody.setAlpha(this.playerActor.isInvulnerable ? 0.5 : 1);

    for (const enemy of this.enemies) {
      enemy.body.setPosition(enemy.x, enemy.y);
      enemy.hpBar.clear();
      if (!enemy.alive) continue;
      const ratio = enemy.actor.hp / enemy.actor.maxHp;
      enemy.hpBar.fillStyle(0x222222, 1).fillRect(enemy.x - 20, enemy.y - 26, 40, 5);
      enemy.hpBar.fillStyle(0x6fd96f, 1).fillRect(enemy.x - 20, enemy.y - 26, 40 * ratio, 5);
    }

    const state = this.enemies
      .filter((e) => e.alive)
      .map((e) => `${e.def.name}:${e.brain.state}`)
      .join('  ');
    this.hud.setText([
      `生命 ${this.playerActor.hp}/${this.playerActor.maxHp}   冲刺 ${this.dashCooldownMs > 0 ? '冷却中' : '就绪'}`,
      `敌人 ${state || '全部击败'}`,
      ...this.log.slice(-3),
    ]);
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > 20) this.log.shift();
  }
}
