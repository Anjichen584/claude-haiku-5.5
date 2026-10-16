import {TowerHazards,hazardContains} from '../tower/hazards';
import {finishTowerFloor,towerProfile,towerEnemies} from '../tower/run';
import {audio} from '../audio/AudioDirector';
import { retreatDungeon } from '../dungeon/checkpoint';
import { useConsumable } from '../state/consumables';
import Phaser from 'phaser';
import { bufferSceneKeys, pressed } from '../input/bufferedKeys';
import { landscape, panel, UI } from '../ui/theme';
import { settleQuestRewards } from '../state/rewards';
import { display } from '../config/display';
import { Actor } from '../combat/Actor';
import { attackIntent, cycleTarget, encounterFormation, BATTLE_PLAYER_START, ENCOUNTER_OPENING_MS } from '../combat/engagement';
import type { Element } from '../combat/damage';
import { CombatRuntime, type CombatTarget } from '../combat/CombatRuntime';
import { ARENA_BOUNDS, separateEnemies } from '../combat/crowd';
import { combatProfile } from '../combat/profile';
import { skillLoadout } from '../combat/loadout';
import { BattleHotbar } from '../ui/BattleHotbar';
import { BattleResultView } from '../ui/BattleResultView';
import { battleSnapshot, battleSummary, ResultInputGate, type BattleSnapshot } from '../combat/results';
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
 * 共用遭遇战与试炼规则，角色使用项目本地生成美术。
 *
 * 操作：WASD 手动走位 · Shift 冲刺 · Space 闪避 · 按住 J 追击/普攻 · R 重置试炼
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
  { id: 'ember_hound', x: 700, y: 480 },
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
  private hazards:TowerHazards|null=null;
  private hazardGraphics!:Phaser.GameObjects.Graphics;
  private health!: Phaser.GameObjects.Graphics;
  private exitKey!: Phaser.Input.Keyboard.Key;
  private playerActor!: Actor;
  private px = 0;
  private py = 0;
  private facing = { x: 1, y: 0 };
  private runtime!:CombatRuntime;
  private hotbar!:BattleHotbar;
  private equippedSkills:SkillDef[]=[];
  private supplyKeys!:Phaser.Input.Keyboard.Key[];
  private supplyLabels:Phaser.GameObjects.Text[]=[];
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
  private openingLeftMs = 0;
  private lockedTargetId: string | null = null;
  private targetKey!: Phaser.Input.Keyboard.Key;
  private targetLabel!: Phaser.GameObjects.Text;
  private resultView: BattleResultView | null = null;
  private resultInputGate: ResultInputGate | null = null;
  private resultKeys!: Phaser.Input.Keyboard.Key[];
  private battleBefore: BattleSnapshot | null = null;

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
    if(this.encounter?.tower){const r=this.session?.tower?.run,t=this.encounter.tower;
      if(!r||r.phase!=='ready'||r.id!==t.id||r.cleared+1!==t.floor){this.scene.start('TowerScene');return;}
    }
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    this.keys = kb.addKeys({
      W: 'W', A: 'A', S: 'S', D: 'D',
      SHIFT: 'SHIFT', SPACE: 'SPACE', J: 'J', R: 'R',
    }) as typeof this.keys;
    this.exitKey=kb.addKey("ESC");
    this.targetKey=kb.addKey('TAB');
    kb.addCapture(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.removeCapture(Phaser.Input.Keyboard.KeyCodes.TAB));
    this.supplyKeys=[kb.addKey('H'),kb.addKey('M')];
    this.resultKeys=[kb.addKey('P'),kb.addKey('N')];
    this.skillKeys=[1,2,3,4].map(n=>kb.addKey(48+n));
    bufferSceneKeys(this);
    this.resetRoom();
    this.hazards=this.encounter?.tower?new TowerHazards(this.encounter.tower.floor):null;
    this.hazardGraphics=this.add.graphics().setDepth(2);
    if(this.hazards?.rule)this.add.text(640,124,`${this.hazards.rule.name}：${this.hazards.rule.hint}`,{fontFamily:UI.font,fontSize:14,color:'#f0c18b',backgroundColor:'#172f39',padding:{x:10,y:6}}).setOrigin(.5).setDepth(205);
  }

  update(_time: number, deltaMs: number): void {
    if (audio.panelOpen) return;
    deltaMs = Math.min(deltaMs,50);
    if(!this.encounter && pressed(this.exitKey)){this.scene.start('OverworldScene');return;}
    if (this.finished) {
      if (pressed(this.resultKeys[0])) this.resultView?.turn(-1);
      if (pressed(this.resultKeys[1])) this.resultView?.turn(1);
      if (pressed(this.keys.R)) this.retryResultSave();
      if (this.resultInputGate?.update(this.time.now,this.keys.SPACE.isDown,pressed(this.keys.SPACE))) this.returnToOverworld();
      this.resultView?.setReady(this.resultInputGate?.ready ?? false);
      this.render();
      return;
    }
    // 遭遇战中不允许重置，否则击杀任务会重复计数
    if (!this.encounter && pressed(this.keys.R)) {
      this.resetRoom();
      return;
    }
    this.effects.clear();
    if(this.playerActor.isDead){this.checkEncounterEnd();this.render();return;}
    this.runtime.tick(deltaMs,this.targets());
    this.checkEncounterEnd();
    if(this.finished){this.render();return;}
    if (pressed(this.targetKey)) this.lockedTargetId = cycleTarget({x:this.px,y:this.py},this.targets(),this.currentIntent()?.targetId ?? null);
    this.updatePlayer(deltaMs);
    if(this.finished){this.render();return;}
    if (this.openingLeftMs > 0) this.openingLeftMs = Math.max(0, this.openingLeftMs-deltaMs);
    else this.updateEnemies(deltaMs);
    this.checkEncounterEnd();
    if(!this.finished&&this.openingLeftMs<=0)this.updateTowerHazards(deltaMs);
    this.checkEncounterEnd();
    this.render();
  }

  // ---------- 遭遇战结束 ----------

  private checkEncounterEnd(): void {
    if (!this.encounter || this.finished) return;
    if(this.playerActor.isDead)this.finishEncounter(false);
    else if(this.enemies.every(e=>!e.alive))this.finishEncounter(true);
  }

  private updateTowerHazards(deltaMs:number):void{
    if(!this.hazards)return;
    this.hazardGraphics.clear();
    const strike=this.hazards.tick(deltaMs,{x:this.px,y:this.py});
    // One pulse is one attack even where the two final-floor circles overlap.
    if(strike&&strike.zones.some(z=>hazardContains(z,{x:this.px,y:this.py}))){
      const applied=this.runtime.receiveAttack(strike.attack,strike.element);
      if(applied>0){audio.play('hurt');this.floatText(this.px,this.py-82,`场地 −${applied}`,'#edb799');this.pushLog(`${this.hazards.rule!.name} 命中：${applied}`);}
    }
    const warning=this.hazards.warning;if(!warning)return;
    const color=this.hazards.floor===20?0x83c8ed:this.hazards.floor===30?0xdca6ff:0xf0a263;
    const progress=1-warning.remainingMs/warning.durationMs,g=this.hazardGraphics;
    for(const zone of warning.zones){
      g.fillStyle(color,.08+progress*.22);g.lineStyle(3,color,.95);
      if(zone.kind==='circle'){
        g.fillCircle(zone.x,zone.y,zone.radius);g.strokeCircle(zone.x,zone.y,zone.radius);
        g.lineStyle(5,0xffe6ba,.95);g.beginPath();g.arc(zone.x,zone.y,zone.radius,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);g.strokePath();
      }else{
        g.fillRect(zone.left,zone.top,zone.right-zone.left,zone.bottom-zone.top);g.strokeRect(zone.left,zone.top,zone.right-zone.left,zone.bottom-zone.top);
        g.fillStyle(0xe3f4ff,.7);g.fillRect(zone.left,zone.bottom-5,(zone.right-zone.left)*progress,5);
      }
    }
  }

  private finishEncounter(won: boolean): void {
    if(this.finished)return;
    this.finished = true;
    this.hazardGraphics?.clear();
    this.won = won;
    // 地牢战斗不写入地表的击败记录
    if (won && this.encounter && this.session && !this.encounter.dungeon && !this.encounter.tower) this.session.defeated.add(this.encounter.spawnKey);

    const tower=this.encounter?.tower;
    if(tower&&this.session?.tower)finishTowerFloor(this.session.tower,tower.id,tower.floor,won);
    const milestones = tower?[won?'试炼层已完成：奖励暂存于塔内，可在每五层撤离结算。':'试炼结束：未结算奖励与临时强化已失去，最高层记录保留。']:this.encounter?.dungeon ? this.settleDungeonRoom(this.encounter.dungeon, won) : [];
    const session = this.session;
    let completed:QuestCompletion[]=[];
    if (session) {
      const items=loadGameData().items;
      const settled=settleQuestRewards(session,this.completions,
        id=>session.quests.def(id)?.title??id,id=>items.find(i=>i.id===id)?.name??id);
      completed=settled.completed;
      session.player.hp=won?Math.max(1,this.playerActor.hp):Math.max(1,Math.ceil(this.stats.maxHp*.3));
      session.player.mana=this.runtime.mana;
    }
    if(session&&tower&&!session.tower?.run)this.clampTowerExit();
    const saved=session?persistSession(session):false;
    const summary=session && this.battleBefore ? battleSummary(this.battleBefore,battleSnapshot(session)) : null;
    const data=loadGameData();
    const signed=(n:number)=>`${n>=0?'+':''}${n}`;
    const details:string[]=[];
    if(summary){
      for(const item of summary.items)details.push(`背包净变化：${data.items.find(i=>i.id===item.id)?.name??item.id} ${signed(item.delta)}`);
      for(const faction of summary.reputation)details.push(`声望：${data.factions.find(f=>f.id===faction.id)?.name??faction.id} ${signed(faction.delta)}`);
      if(summary.stability)details.push(`裂隙稳定度 ${signed(summary.stability)}`);
      if(summary.skillPoints)details.push(`技能点 ${signed(summary.skillPoints)}`);
    }
    for(const id of new Set(completed.map(c=>c.questId)))details.push(`任务完成：${session?.quests.def(id)?.title??id}`);
    details.push(...milestones);
    if(!won)details.push(`战败恢复至 ${session?.player.hp??0} 生命；${tower?'本次暂存奖励已失去，最高层记录保留。':'本次已结算的进度保留。'}`);
    const destination=this.encounter?.tower?'返回试炼塔':won && this.encounter?.dungeon?'返回地牢':'返回地表';
    const seconds=Math.floor(this.runtime.elapsedMs/1000);
    const totals=summary?`经验 ${signed(summary.exp)}    金币 ${signed(summary.gold)}    等级 ${summary.levelBefore} → ${summary.levelAfter}`:'';
    const info=`击败 ${this.enemies.filter(e=>!e.alive).length}/${this.enemies.length} 名敌人 · 用时 ${Math.floor(seconds/60)}分${seconds%60}秒\n${totals}\n返回生命 ${session?.player.hp??0}/${this.stats.maxHp} · 魔力 ${Math.floor(this.runtime.mana)}`;
    this.resultInputGate=new ResultInputGate(this.time.now);
    pressed(this.keys.SPACE); // discard a buffered dodge; holding Space must be released before confirmation
    pressed(this.keys.R);
    for(const key of this.resultKeys)pressed(key);
    this.effects.clear();
    this.resultView=new BattleResultView(this,won?'战斗胜利':'战败撤回',info,details,destination,
      ()=>{if(this.resultInputGate?.ready)this.returnToOverworld();},()=>this.retryResultSave());
    this.resultView.setSaved(saved);
  }

  private retryResultSave(): boolean {
    const saved=!!this.session && persistSession(this.session);
    this.resultView?.setSaved(saved);
    return saved;
  }

  /** 地牢房间战斗结算：胜利发放奖励、标记清理、Boss 通关后推进层数；战败结束探索。 */
  private settleDungeonRoom(dungeon: { roomId: number; boss: boolean }, won: boolean): string[] {
    const run = getRun();
    const session = this.session;
    if (!run || !session) return [];
    if (!won) {
      if(session.dungeon)retreatDungeon(session.dungeon);
      setRun(null);
      return ['战败撤回地表；已清理进度保留，下次从入口继续'];
    }
    if(!markCleared(run,dungeon.roomId))return ['此房间奖励已领取'];
    const lines = applyGains(session, combatGains(run, dungeon.boss));
    if (dungeon.boss) {
      if (session.dungeonFloor === run.floor && run.floor < MAX_DUNGEON_FLOOR) session.dungeonFloor = run.floor + 1;
      lines.push(run.floor===MAX_DUNGEON_FLOOR?'已通关全部 12 层！仍可探索本层未清理房间。':`击败了本层 Boss！下一层解锁：第 ${session.dungeonFloor} 层`);
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
    if(this.encounter?.tower&&!this.session?.tower?.run)this.clampTowerExit();
    if(this.session && !this.retryResultSave())return;
    if(this.encounter?.tower){this.scene.start('TowerScene');return;}
    if (this.encounter?.dungeon) {
      // 地牢：胜利回到地牢继续探索；战败则结束本次探索，回到地表
      if (this.won && getRun()) this.scene.start('DungeonScene', { resume: true });
      else this.scene.start('OverworldScene', { retreated: !this.won });
      return;
    }
    this.scene.start('OverworldScene', { retreated: !this.won });
  }
  private clampTowerExit():void{
    if(!this.session)return;const d=loadGameData(),p=combatProfile(this.session.player.equipment,d.items,d.affixes,d.itemSets,this.session.player.crafting);
    this.session.player.hp=Math.min(this.session.player.hp,p.maxHp);
    this.session.player.mana=Math.min(this.session.player.mana??p.maxMana,p.maxMana);
  }
  private won = false;

  // ---------- 初始化 ----------

  private resetRoom(): void {
    this.tweens.killAll();
    this.children.removeAll(true);
    this.enemies = [];
    this.log = [];
    this.lockedTargetId = null;
    this.resultView = null;
    this.resultInputGate = null;
    this.battleBefore = this.session ? battleSnapshot(this.session) : null;

    landscape(this,true);
    const floor=this.add.graphics().setDepth(-2);
    floor.fillStyle(0x324a40,.92).fillRoundedRect(76,138,1128,456,28);
    floor.lineStyle(2,0xa6ac7b,.25).strokeRoundedRect(88,150,1104,432,24);
    for(let i=0;i<30;i++){const x=110+(i*131)%1060,y=173+(i*79)%390;floor.lineStyle(1,0x9fb18b,.12).strokeCircle(x,y,12+(i%4)*5);}
    panel(this,24,22,1232,90);
    this.add.text(48,39,this.encounter?.tower?`裂隙试炼塔 / 第 ${this.encounter.tower.floor} 层`:this.encounter?.dungeon?'裂隙深处  /  房间战斗':this.encounter?'荒野遭遇':'战斗试炼', {fontFamily:UI.font,fontSize:23,color:'#e7dbb6'}).setDepth(200);
    this.add.text(48,79,'J 追击/普攻 · Tab/点击怪物换目标 · WASD 走位 · Shift 冲刺 · Space 闪避', {fontFamily:UI.font,fontSize:13,color:'#a4bcaa'}).setDepth(200);
    this.targetLabel=this.add.text(455,40,'',{fontFamily:UI.font,fontSize:14,color:'#e6cc8b',wordWrap:{width:290}}).setDepth(210);
    panel(this,24,618,1232,78);
    this.hud = this.add.text(48,632,'',{fontFamily:UI.font,fontSize:15,color:'#d5dec2',lineSpacing:7}).setDepth(200);
    if(!this.encounter)this.add.text(1125,44,'Esc 返回',{fontFamily:UI.font,fontSize:15,color:'#e3cb93'}).setDepth(200).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.scene.start('OverworldScene'));
    this.effects=this.add.graphics().setDepth(30);
    this.health=this.add.graphics().setDepth(201);

    this.px = this.encounter ? BATTLE_PLAYER_START.x : 320;
    this.py = this.encounter ? BATTLE_PLAYER_START.y : display.baseHeight / 2;
    this.facing = {x:1,y:0};
    this.openingLeftMs = this.encounter ? ENCOUNTER_OPENING_MS : 0;
    // 战斗属性由装备决定（没有会话时为基础属性）
    const gameData = loadGameData();
    let profile = combatProfile(this.session?.player.equipment ?? {}, gameData.items, gameData.affixes, gameData.itemSets,this.session?.player.crafting);
    if(this.encounter?.tower&&this.session?.tower?.run)profile=towerProfile(profile,this.session.tower.run);
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
      ? encounterFormation(this.encounter.enemyIds)
      : ENEMY_SPAWNS;
    for (const [index,spawn] of spawns.entries()) {
      const towerRun=this.session?.tower?.run;
      const def = this.encounter?.tower&&towerRun?towerEnemies(towerRun,data.enemies)[index]:data.enemies.find((e) => e.id === spawn.id);
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
      const unit = this.enemies[this.enemies.length-1];
      unit.body.setInteractive({useHandCursor:true}).on('pointerdown',()=>{
        if(!this.finished && unit.alive) this.lockedTargetId=unit.combat.id;
      });
    }
    this.supplyLabels=['治疗药剂','魔力药剂'].map((name,i)=>this.add.text(925,520+i*34,`${i?'M':'H'} ${name}`,{fontFamily:UI.font,fontSize:12,color:'#dfd3b2',backgroundColor:'#1b3638',padding:{x:10,y:7}}).setDepth(211).setInteractive({useHandCursor:true}).on('pointerdown',()=>this.useSupply(i)));
    this.hotbar=new BattleHotbar(this,this.equippedSkills,this.runtime,i=>this.castSkill(i));
    this.pushLog('按住 J 自动接近并普攻，松开停止追击；WASD 走位优先 · 1–4 技能');
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
      audio.play('dodge');
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
      if (len === 0 && this.keys.J.isDown) {
        const intent = this.currentIntent();
        if (intent) {
          this.facing = intent.direction;
          const step = Math.min(intent.approach, PLAYER.speed * this.runtime.speedMultiplier * dt);
          this.movePlayer(intent.direction.x * step, intent.direction.y * step);
        }
      } else {
        this.movePlayer(mx * PLAYER.speed * this.runtime.speedMultiplier * dt, my * PLAYER.speed * this.runtime.speedMultiplier * dt);
      }
    }

    for(let i=0;i<this.supplyKeys.length;i++)if(pressed(this.supplyKeys[i]))this.useSupply(i);
    for(let i=0;i<this.skillKeys.length;i++)if(pressed(this.skillKeys[i]))this.castSkill(i);

    // 攻击
    if (this.keys.J.isDown && this.runtime.basicCooldownMs === 0 && this.runtime.globalCooldownMs===0 && !this.playerActor.isStaggered) {
      const intent = this.currentIntent();
      if (len > 0 || (intent && intent.distance <= this.runtime.profile.weaponRange)) this.performPlayerAttack();
    }
  }

  private movePlayer(dx: number, dy: number): void {
    this.px = Phaser.Math.Clamp(this.px + dx, ARENA_BOUNDS.left, ARENA_BOUNDS.right);
    this.py = Phaser.Math.Clamp(this.py + dy, ARENA_BOUNDS.top, ARENA_BOUNDS.bottom);
  }

  private performPlayerAttack(): void {
    audio.play('swing');
    const angle=Math.atan2(this.facing.y,this.facing.x);
    const slash=this.add.graphics().setDepth(25).setPosition(this.px,this.py-12);
    slash.lineStyle(5,0xe5d4a4,.9);slash.beginPath();slash.arc(0,0,59,angle-.9,angle+.9);slash.strokePath();
    this.tweens.add({targets:slash,alpha:0,scale:1.2,duration:180,onComplete:()=>slash.destroy()});
    const hits=this.runtime.basicAttack({x:this.px,y:this.py},this.facing,this.targets());
    this.pushLog(hits.length?`攻击命中 ${hits.length} 个目标`:'攻击落空');
  }

  private currentIntent(): ReturnType<typeof attackIntent> {
    const intent=attackIntent({x:this.px,y:this.py},this.targets(),this.runtime.profile.weaponRange,this.lockedTargetId);
    this.lockedTargetId=intent?.targetId ?? null;
    return intent;
  }

  private targets():CombatTarget[]{
    return this.enemies.filter(e=>e.alive).map(e=>{e.combat.x=e.x;e.combat.y=e.y;return e.combat;});
  }

  private useSupply(index:number):void{
    if(this.finished||!this.session||!this.encounter)return;
    const item=loadGameData().items.find(i=>i.id===(index?'mana_potion':'health_potion'));if(!item)return;
    const result=useConsumable(this.session,item,this.runtime.profile,{hp:this.playerActor.hp,mana:this.runtime.mana});
    this.pushLog(result.message);if(!result.ok)return;
    audio.play('pickup');
    this.playerActor.hp=result.hp;this.runtime.mana=result.mana;this.floatText(this.px,this.py-82,result.message,'#b6dcab');
    // Save together with encounter settlement, never save partial kill rewards mid-fight.
  }

  private castSkill(index:number):void{
    if(this.finished || this.playerActor.isDead)return;
    const skill=this.equippedSkills[index];if(!skill)return;
    if (!this.keys.W.isDown && !this.keys.A.isDown && !this.keys.S.isDown && !this.keys.D.isDown
      && this.dodgeLeftMs === 0 && this.dashLeftMs === 0
      && ['strike','bolt','blast'].includes(skill.combat?.kind ?? '')) {
      const intent = this.currentIntent();
      if (intent) this.facing = intent.direction;
    }
    const result=this.runtime.cast(skill.id,{x:this.px,y:this.py},this.facing,this.targets(),this.lockedTargetId ?? undefined);
    if(!result.ok){const messages:Record<string,string>={'no-target':'前方没有射程内目标',mana:'魔力不足',stamina:'耐力不足',cooldown:'技能冷却中',busy:'正在硬直或施法间隔中'};this.pushLog(`${skill.name}：${messages[result.reason??'']??'无法施放'}`);return;}
    audio.play('skill');
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
      audio.play('hit');
      this.floatText(enemy.x,enemy.y-70,`−${applied}`,'#f2df9d');
      enemy.body.setTintFill(0xf7dfb2);this.time.delayedCall(90,()=>{if(enemy.body.active)enemy.body.clearTint();});
      if(enemy.actor.isStaggered)enemy.windup=0;
    }
    if (applied > 0 && enemy.actor.isDead) {
      audio.play('pickup');
      enemy.alive = false;
      enemy.body.disableInteractive();
      enemy.label.setVisible(false);
      this.tweens.add({targets:enemy.body,alpha:0,angle:40,y:enemy.y+12,duration:400});
      this.pushLog(`${enemy.def.name} 被击败`);
      if (this.encounter && this.session && !this.encounter.tower) {
        // 遭遇战中的击杀计入 kill 任务
        this.completions.push(...this.session.quests.report({ type: 'kill', target: enemy.def.id, amount: 1 }));
        this.session.quests.acceptAvailable((d) => d.type !== 'side');
        // 击杀奖励与掉落（掉落按 战斗键 + 敌人序号 决定，结果稳定）
        const slot = this.enemies.indexOf(enemy);
        const key = `${this.encounter.spawnKey}:${slot}`;
        const kg = killGains(enemy.def,this.runtime.profile.bonuses);
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
      // In an accepted encounter the enemy already knows we are here. Patrol/leash belongs to overworld AI.
      const ai = this.encounter ? {...enemy.tactics.ai, aggroRange:1800, leashRange:1800} : enemy.tactics.ai;
      const decision = decideEnemyAction(enemy.brain, ai, { distanceToPlayer: dist, deltaMs });

      const retreat=dist<enemy.tactics.retreatRange;
      if ((decision.moveTowardPlayer || retreat) && enemy.windup===0 && !enemy.actor.isStaggered && dist > 0) {
        const speed = enemy.def.speed * 0.5 * this.runtime.getSpeedMultiplier(enemy.combat)*(retreat?-1:1);
        enemy.x = Phaser.Math.Clamp(enemy.x+((this.px - enemy.x) / dist) * speed * dt,ARENA_BOUNDS.left,ARENA_BOUNDS.right);
        enemy.y = Phaser.Math.Clamp(enemy.y+((this.py - enemy.y) / dist) * speed * dt,ARENA_BOUNDS.top,ARENA_BOUNDS.bottom);
      }

      if (decision.shouldAttack && enemy.windup===0 && !enemy.actor.isStaggered){
        enemy.windup=enemy.tactics.windupMs;
        enemy.aimX=enemy.tactics.kind==='ranged'?this.px:enemy.x;
        enemy.aimY=enemy.tactics.kind==='ranged'?this.py:enemy.y;
      }
      if(enemy.windup>0){
        enemy.windup-=deltaMs;
        this.effects.lineStyle(2,enemy.tactics.kind==='ranged'?0x9dc4d5:0xe8a273,.7).strokeCircle(enemy.aimX,enemy.aimY,enemy.tactics.hitRadius);
        const progress = 1-Math.max(0,enemy.windup)/enemy.tactics.windupMs;
        this.effects.fillStyle(0xdb845e,.08+.18*progress).fillCircle(enemy.aimX,enemy.aimY,enemy.tactics.hitRadius);
        this.effects.lineStyle(5,0xffd18b,.95).beginPath();
        this.effects.arc(enemy.aimX,enemy.aimY,enemy.tactics.hitRadius,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);
        this.effects.strokePath();
        if(enemy.windup<=0){
          enemy.windup=0;
          if(Math.hypot(this.px-enemy.aimX,this.py-enemy.aimY)<enemy.tactics.hitRadius && !enemy.actor.isStaggered){
            enemy.combat.x=enemy.x;enemy.combat.y=enemy.y;
            const applied=this.runtime.receiveAttack(enemy.def.attack,(enemy.def.element??'none') as Element,enemy.combat);
            if(applied>0)audio.play('hurt');
            if(applied>0){this.floatText(this.px,this.py-62,`−${applied}`,'#f0aa8b');this.cameras.main.shake(90,.002);this.pushLog(`${enemy.def.name} 造成 ${applied} 点伤害`);}
          }
        }
      }
      enemy.body.setFlipX(this.px < enemy.x);
      if(decision.moveTowardPlayer && enemy.windup===0)enemy.body.setAngle(Math.sin(this.time.now/110+enemy.x)*4);
      else enemy.body.setAngle(0);

      enemy.body.setPosition(enemy.x, enemy.y);
    }
    const living=this.enemies.filter(e=>e.alive);
    const positions=separateEnemies(living.map(e=>({id:e.combat.id,x:e.x,y:e.y,
      anchored:e.windup>0 || e.actor.isStaggered || this.runtime.isStunned(e.combat)})));
    for(let i=0;i<living.length;i++) {
      const enemy=living[i],position=positions[i];
      enemy.x=position.x;enemy.y=position.y;enemy.combat.x=position.x;enemy.combat.y=position.y;
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

    const intent = this.finished ? null : this.currentIntent();
    const selected = intent ? this.enemies.find(e=>e.combat.id===intent.targetId) : undefined;
    this.targetLabel.setText(selected ? `目标：${selected.def.name}  ${Math.ceil(selected.actor.hp)}/${selected.actor.maxHp}` : '');
    if (!this.finished) {
      const target = intent ? this.enemies.find(e => e.combat.id === intent.targetId) : undefined;
      if (target) this.effects.lineStyle(2,0xe5d4a4,.85).strokeEllipse(target.x,target.y+8,60,20);
    }
    this.hotbar.update();
    const cd=Math.max(0,Math.ceil(((this.session?.player.consumableReadyAt??0)-Date.now())/1000));
    this.supplyLabels.forEach((label,i)=>label.setText(`${i?'M 魔力':'H 治疗'} ×${this.session?.world.getItemCount(i?'mana_potion':'health_potion')??0}${cd>0?` · ${cd}s`:''}`));
    for(const trap of this.runtime.traps){this.effects.lineStyle(2,0xacc79a,.7).strokeCircle(trap.x,trap.y,trap.radius);this.effects.lineBetween(trap.x-9,trap.y-9,trap.x+9,trap.y+9);}
    this.health.clear().fillStyle(0x304b44).fillRoundedRect(790,52,300,12,6).fillStyle(0xa3c18c).fillRoundedRect(790,52,300*Math.max(0,this.playerActor.hp/this.playerActor.maxHp),12,6);
    this.hud.setText([
      `生命 ${Math.ceil(this.playerActor.hp)}/${this.playerActor.maxHp}     冲刺 ${this.runtime.dashCooldownMs>0?'冷却中':'就绪'}     剩余敌人 ${this.enemies.filter(e=>e.alive).length}`,
      this.openingLeftMs>0 ? '遭遇接敌中… 可走位或按住 J 迎战；橙色圆圈是敌人攻击预警。' : (this.log[this.log.length-1]??'按住 J 追击/普攻；WASD 手动走位优先。'),
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
