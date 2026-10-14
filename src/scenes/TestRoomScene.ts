import Phaser from 'phaser';
import { bufferSceneKeys, pressed } from '../input/bufferedKeys';
import { landscape, panel, UI } from '../ui/theme';
import { settleQuestRewards } from '../state/rewards';
import { display } from '../config/display';
import { Actor } from '../combat/Actor';
import type { Element } from '../combat/damage';
import { CombatRuntime, type CombatTarget } from '../combat/CombatRuntime';
import { combatProfile } from '../combat/profile';
import { skillLoadout } from '../combat/loadout';
import { BattleHotbar } from '../ui/BattleHotbar';
import { hashSeed } from '../core/Rng';
import { enemyTactics, type EnemyTactics } from '../combat/enemyTactics';
import type { SkillDef } from '../data/schema';
import {
  createEnemyBrain,
  decideEnemyAction,
  type EnemyBrain,
} from '../combat/enemyAi';
import { loadGameData } from '../data/loader';
import type { EnemyDef } from '../data/schema';
import type { QuestCompletion } from '../narrative/QuestManager';
import { getRun, getSession, persistSession, setRun } from '../state/sessionStore';
import { applyGains } from '../state/rewards';
import { killGains, rollDrops } from '../state/killRewards';
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
  attackReachPx: 60,
  dashSpeed: 600,
  dashDurationMs: 150,
  dodgeDistancePx: 120,
  dodgeDurationMs: 300,
};

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
  combat: CombatTarget;
  tactics:EnemyTactics;
  aimX:number;
  aimY:number;
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
  private runtime!:CombatRuntime;
  private hotbar!:BattleHotbar;
  private equippedSkills:SkillDef[]=[];
  private skillKeys:Phaser.Input.Keyboard.Key[]=[];
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
    this.skillKeys=[1,2,3,4].map(n=>kb.addKey(48+n));
    bufferSceneKeys(this);
    this.resetRoom();
  }

  update(_time: number, deltaMs: number): void {
    deltaMs = Math.min(deltaMs,50);
    if(!this.encounter && pressed(this.exitKey)){this.scene.start('OverworldScene');return;}
    if (this.finished) {
      if (pressed(this.keys.SPACE)) this.returnToOverworld();
      this.render();
      return;
    }
    // 遭遇战中不允许重置，否则击杀任务会重复计数
    if (!this.encounter && pressed(this.keys.R)) {
      this.resetRoom();
      return;
    }
    this.effects.clear();
    if(this.playerActor.isDead){this.render();return;}
    this.runtime.tick(deltaMs,this.targets());
    this.checkEncounterEnd();
    if(this.finished){this.render();return;}
    this.updatePlayer(deltaMs);
    if(this.finished){this.render();return;}
    this.updateEnemies(deltaMs);
    this.checkEncounterEnd();
    this.render();
  }

  // ---------- 遭遇战结束 ----------

  private checkEncounterEnd(): void {
    if (!this.encounter || this.finished) return;
    if(this.playerActor.isDead)this.finishEncounter(false);
    else if(this.enemies.every(e=>!e.alive))this.finishEncounter(true);
  }

  private finishEncounter(won: boolean): void {
    if(this.finished)return;
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
    if(session){session.player.hp=won?Math.max(1,this.playerActor.hp):Math.max(1,Math.ceil(this.stats.maxHp*.3));session.player.mana=this.runtime.mana;persistSession(session);}
    lines.push(won ? (this.encounter?.dungeon?'按 Space 返回地牢':'按 Space 返回地表') : '按 Space 返回地表（生命恢复少量）');
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
    if (this.session && this.encounter) this.session.player.mana=this.runtime.mana;
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
    const profile = combatProfile(this.session?.player.equipment ?? {}, gameData.items, gameData.affixes, gameData.itemSets);
    this.stats=profile;
    this.playerActor = new Actor({ maxHp: this.stats.maxHp, staggerMs: 150 });
    this.runtime=new CombatRuntime(this.playerActor,profile,gameData.skills,this.session?.player.skills.unlocked??[],gameData.combos,hashSeed('combat',this.encounter?.spawnKey??'training'));
    this.runtime.mana=Math.min(profile.maxMana,this.session?.player.mana??profile.maxMana);
    this.runtime.onDamage=(target,damage)=>{const e=this.enemies.find(e=>e.combat.id===target.id);return e?this.damageEnemy(e,damage):0;};
    const loadout=skillLoadout(this.session?.player.skills??{unlocked:[]},gameData.skills);
    this.equippedSkills=loadout.map(id=>gameData.skills.find(s=>s.id===id)!);
    if (this.session) {
      // 生命从会话带入（已被击败的刷新点不会再次进入）
      this.playerActor.hp = Math.max(1, Math.min(this.stats.maxHp, this.session.player.hp));
    }
    this.playerBody = this.add.image(this.px,this.py,'actor-hero').setDisplaySize(84,84).setOrigin(.5,.82).setDepth(10);
    this.dashLeftMs = 0;
    this.dodgeLeftMs = 0;

    const data = loadGameData();
    const spawns = this.encounter
      ? this.encounter.enemyIds.map((id, i) => ({ id, x: 820 + (i % 2) * 80, y: 200 + i * 120 }))
      : ENEMY_SPAWNS;
    for (const [index,spawn] of spawns.entries()) {
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
        tactics:enemyTactics(def),aimX:spawn.x,aimY:spawn.y,
        windup:0, combat:{id:`enemy-${index}`,x:spawn.x,y:spawn.y,actor,defense:def.defense,element:(def.element??'none') as Element,boss:def.boss,elite:def.elite,controlImmune:def.staggerImmune},
        hpBar: this.add.graphics(),
        alive: true,
      });
    }
    this.hotbar=new BattleHotbar(this,this.equippedSkills,this.runtime,i=>this.castSkill(i));
    this.pushLog('1–4 施放技能 · J 普攻 · Space 闪避（消耗耐力）');
  }

  // ---------- 玩家 ----------

  private updatePlayer(deltaMs: number): void {
    const dt = deltaMs / 1000;
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
    if (pressed(this.keys.SPACE) && this.dodgeLeftMs === 0 && this.runtime.tryDodge()) {
      const dir = len > 0 ? { x: mx, y: my } : this.facing;
      this.dodgeDir = dir;
      this.dodgeLeftMs = PLAYER.dodgeDurationMs;

      this.pushLog('闪避');
    }

    // 冲刺
    if (pressed(this.keys.SHIFT) && this.runtime.tryDash()) {
      this.dashLeftMs = PLAYER.dashDurationMs;
    }

    if (this.dodgeLeftMs > 0) {
      const step = (PLAYER.dodgeDistancePx / (PLAYER.dodgeDurationMs / 1000)) * dt;
      this.movePlayer(this.dodgeDir.x * step, this.dodgeDir.y * step);
    } else if (this.dashLeftMs > 0) {
      this.movePlayer(this.facing.x * PLAYER.dashSpeed * dt, this.facing.y * PLAYER.dashSpeed * dt);
    } else if (!this.playerActor.isStaggered) {
      this.movePlayer(mx * PLAYER.speed * this.runtime.speedMultiplier * dt, my * PLAYER.speed * this.runtime.speedMultiplier * dt);
    }

    for(let i=0;i<this.skillKeys.length;i++)if(pressed(this.skillKeys[i]))this.castSkill(i);

    // 攻击
    if (this.keys.J.isDown && this.runtime.basicCooldownMs === 0 && this.runtime.globalCooldownMs===0 && !this.playerActor.isStaggered) {
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
    const hits=this.runtime.basicAttack({x:this.px,y:this.py},this.facing,this.targets());
    this.pushLog(hits.length?`攻击命中 ${hits.length} 个目标`:'攻击落空');
  }

  private targets():CombatTarget[]{
    return this.enemies.filter(e=>e.alive).map(e=>{e.combat.x=e.x;e.combat.y=e.y;return e.combat;});
  }

  private castSkill(index:number):void{
    if(this.finished || this.playerActor.isDead)return;
    const skill=this.equippedSkills[index];if(!skill)return;
    const result=this.runtime.cast(skill.id,{x:this.px,y:this.py},this.facing,this.targets());
    if(!result.ok){const messages:Record<string,string>={'no-target':'前方没有射程内目标',mana:'魔力不足',stamina:'耐力不足',cooldown:'技能冷却中',busy:'正在硬直或施法间隔中'};this.pushLog(`${skill.name}：${messages[result.reason??'']??'无法施放'}`);return;}
    const colors:Record<string,number>={fire:0xf3ae73,ice:0xa9e5ec,lightning:0xe8cf89,dark:0xbca1dc,holy:0xeae8ae,none:0xcdddab};
    const color=colors[skill.element??'none']??0xcdddab;
    const effect=this.add.graphics().setDepth(28);
    if(skill.combat?.kind==='bolt'){
      effect.lineStyle(6,color,.8);for(const t of result.targets)effect.lineBetween(this.px,this.py-20,t.x,t.y-20);
    }else if(['nova','blast','strike','trap'].includes(skill.combat?.kind??'')){
      const center=result.center??{x:this.px,y:this.py};const radius=skill.combat?.radius??skill.combat?.range??80;
      effect.setPosition(center.x,center.y);effect.lineStyle(4,color,.8).strokeCircle(0,0,radius);effect.fillStyle(color,.12).fillCircle(0,0,radius);
    }else{effect.setPosition(this.px,this.py);effect.lineStyle(4,color,.8).strokeCircle(0,-18,48);}
    this.tweens.add({targets:effect,alpha:0,scale:1.15,duration:420,onComplete:()=>effect.destroy()});
    this.floatText(this.px,this.py-95,result.combo?`组合技 · ${result.combo.name}`:skill.name,result.combo?'#f2d08c':'#c9e3cc');
    this.pushLog(result.combo?`${skill.name} → ${result.combo.name}！`:`施放 ${skill.name}`);
    this.checkEncounterEnd();
  }

  // ---------- 敌人 ----------

  private damageEnemy(enemy: EnemyUnit, amount: number): number {
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
    return applied;
  }

  private updateEnemies(deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.actor.tick(deltaMs);

      if(this.runtime.isStunned(enemy.combat)){enemy.windup=0;enemy.body.setTint(0x9fcde0);continue;}else enemy.body.clearTint();
      const dist = Math.hypot(this.px - enemy.x, this.py - enemy.y);
      const decision = decideEnemyAction(enemy.brain, enemy.tactics.ai, { distanceToPlayer: dist, deltaMs });

      const retreat=dist<enemy.tactics.retreatRange;
      if ((decision.moveTowardPlayer || retreat) && enemy.windup===0 && !enemy.actor.isStaggered && dist > 0) {
        const speed = enemy.def.speed * 0.5 * this.runtime.getSpeedMultiplier(enemy.combat)*(retreat?-1:1);
        enemy.x = Phaser.Math.Clamp(enemy.x+((this.px - enemy.x) / dist) * speed * dt,105,1175);
        enemy.y = Phaser.Math.Clamp(enemy.y+((this.py - enemy.y) / dist) * speed * dt,200,555);
      }

      if (decision.shouldAttack && enemy.windup===0 && !enemy.actor.isStaggered){
        enemy.windup=enemy.tactics.windupMs;
        enemy.aimX=enemy.tactics.kind==='ranged'?this.px:enemy.x;
        enemy.aimY=enemy.tactics.kind==='ranged'?this.py:enemy.y;
      }
      if(enemy.windup>0){
        enemy.windup-=deltaMs;
        this.effects.lineStyle(2,enemy.tactics.kind==='ranged'?0x9dc4d5:0xe8a273,.7).strokeCircle(enemy.aimX,enemy.aimY,enemy.tactics.hitRadius);
        this.effects.fillStyle(0xdb845e,.12).fillCircle(enemy.aimX,enemy.aimY,enemy.tactics.hitRadius);
        if(enemy.windup<=0){
          enemy.windup=0;
          if(Math.hypot(this.px-enemy.aimX,this.py-enemy.aimY)<enemy.tactics.hitRadius && !enemy.actor.isStaggered){
            enemy.combat.x=enemy.x;enemy.combat.y=enemy.y;
            const applied=this.runtime.receiveAttack(enemy.def.attack,(enemy.def.element??'none') as Element,enemy.combat);
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

    this.hotbar.update();
    for(const trap of this.runtime.traps){this.effects.lineStyle(2,0xacc79a,.7).strokeCircle(trap.x,trap.y,trap.radius);this.effects.lineBetween(trap.x-9,trap.y-9,trap.x+9,trap.y+9);}
    this.health.clear().fillStyle(0x304b44).fillRoundedRect(790,52,300,12,6).fillStyle(0xa3c18c).fillRoundedRect(790,52,300*Math.max(0,this.playerActor.hp/this.playerActor.maxHp),12,6);
    this.hud.setText([
      `生命 ${Math.ceil(this.playerActor.hp)}/${this.playerActor.maxHp}     冲刺 ${this.runtime.dashCooldownMs>0?'冷却中':'就绪'}     剩余敌人 ${this.enemies.filter(e=>e.alive).length}`,
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
