import Phaser from 'phaser';
import { display } from '../config/display';
import { CHUNK_SIZE, FLAG_RIVER, FLAG_ROAD, chunkOf, generateChunk, type Chunk } from '../world/chunk';
import { DAY_LENGTH_MS, getDayState } from '../world/time';
import { rollWeather, type Weather } from '../world/weather';
import { BASE_SIGHT_TILES, detectMultiplier, sightRadius } from '../world/modifiers';
import { loadGameData } from '../data/loader';
import type { BiomeDef } from '../data/schema';
import { WorldState } from '../state/WorldState';
import { QuestManager } from '../narrative/QuestManager';
import { LocationRegistry, arriveAt } from '../world/locations';
import { NpcRegistry, startTalk, type TalkSession } from '../world/npcs';
import { placeLocations, REGION_ANCHORS, type PlacedLocation } from '../world/placement';

/** 地牢传送门位于裂隙区域的锚点上 */
const GATE_TILE = REGION_ANCHORS['裂隙'];
const GATE_RADIUS = 2;
import { surfaceSpawnsForChunk, type EncounterRequest, type SurfaceSpawn } from '../world/encounters';
import { activeQuestLog, formatQuestLog } from '../narrative/questLog';
import { formatInventory, inventoryLines } from '../state/inventory';
import { combatStats, cycleSlot, EQUIP_SLOTS, equipmentDetailLines, SLOT_LABEL } from '../state/equipment';
import { getSession, persistSession, setSession } from '../state/sessionStore';
import { newSession, type GameSession } from '../state/session';
import type { AffixDef, EnemyDef, FactionDef, ItemDef, QuestDef } from '../data/schema';
import { reputationLines } from '../factions/reputation';
import { pendingKeyChoice, resolveKeyChoice, type KeyChoiceDef } from '../narrative/keyChoices';
import { resolveEnding } from '../endings/EndingResolver';
import { blockReason, type RegionGate } from '../factions/regionAccess';
import type { EndingDef } from '../data/schema';
import type { ItemSetDef } from '../items/sets';
import { grantQuestRewards, levelForExp } from '../state/rewards';
import {
  activeCombos, BRANCH_LABEL, branchSkills, indexSkills, resetBranch, resetCost, storeTree, treeOf,
  unlockBlockReason, unlockSkill, type Branch,
} from '../skills/skillTree';
import type { SkillDef } from '../data/schema';
import type { ComboDef } from '../skills/skillTree';
import type { QuestCompletion } from '../narrative/QuestManager';

/**
 * 阶段 3 地表场景：无缝区块世界、群系配色、河流与道路、昼夜光照与天气。
 * 操作：WASD 移动 · T 进入测试房间 · +/- 缩放（预留）
 *
 * 每个区块渲染为一张 64×64 的纹理，离开视野后释放，控制内存占用。
 */

const WORLD_SEED = 20261014;
const TILE_PX = 8;
const MOVE_TILES_PER_SEC = 9;
/** 以玩家为中心，加载半径（区块数） */
const LOAD_RADIUS = 2;
/** 超出该半径的区块会被卸载 */
const UNLOAD_RADIUS = 3;
/** 玩家与地点中心的距离（瓦片）小于该值即视为抵达 */
const ARRIVE_RADIUS = 1.5;
const TOAST_MS = 2600;
/** 玩家与地表敌人的距离（瓦片）小于该值即进入战斗 */
const ENCOUNTER_RADIUS = 1.2;
/** 战败返回地表后的脱离保护时间（毫秒），避免立刻再次进入同一场战斗 */
const RETREAT_GRACE_MS = 3000;
/** 玩家与 NPC 的距离小于该值时可以按 E 对话 */
const TALK_RADIUS = 2.5;
const RIVER_RGB = 0x3a6ea5;
const ROAD_RGB = 0x8a7a5c;

const WEATHER_OVERLAY: Record<Weather, { color: number; alpha: number }> = {
  clear: { color: 0x000000, alpha: 0 },
  rain: { color: 0x2a4a7a, alpha: 0.22 },
  fog: { color: 0xc8ced6, alpha: 0.45 },
  snowstorm: { color: 0xf2f6fb, alpha: 0.35 },
  sandstorm: { color: 0xc9a25a, alpha: 0.35 },
  thunder: { color: 0x101428, alpha: 0.25 },
};

interface LoadedChunk {
  chunk: Chunk;
  image: Phaser.GameObjects.Image;
  textureKey: string;
  /** 尚未击败的地表刷新点 */
  spawns: SurfaceSpawn[];
  /** 每个刷新点的标记（按刷新点分组，便于按视野显示） */
  markers: Array<{ spawn: SurfaceSpawn; objs: Phaser.GameObjects.GameObject[] }>;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export class OverworldScene extends Phaser.Scene {
  private biomes: readonly BiomeDef[] = [];
  private chunks = new Map<string, LoadedChunk>();
  private player!: Phaser.GameObjects.Rectangle;
  private tileX = 0;
  private tileY = 0;
  private elapsedMs = DAY_LENGTH_MS * 0.3;
  private weatherCache = { day: -1, key: '', weather: 'clear' as Weather };
  private lightOverlay!: Phaser.GameObjects.Rectangle;
  private weatherOverlay!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'T', Phaser.Input.Keyboard.Key>;
  private world!: WorldState;
  private quests!: QuestManager;
  private locationRegistry!: LocationRegistry;
  private places: PlacedLocation[] = [];
  private session!: GameSession;
  private enemyDefs: readonly EnemyDef[] = [];
  private questDefs: readonly QuestDef[] = [];
  private itemNames = new Map<string, string>();
  private questPanel!: Phaser.GameObjects.Text;
  private questPanelOpen = false;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyR!: Phaser.Input.Keyboard.Key;
  private keyG!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private keyN!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private skillPanel!: Phaser.GameObjects.Text;
  private skillPanelOpen = false;
  private skillBranchIdx = 0;
  private skillPage = 0;
  private skillDefs: readonly SkillDef[] = [];
  private comboDefs: readonly ComboDef[] = [];
  private readonly branches: Branch[] = ['martial', 'arcane', 'survival'];
  private repPanel!: Phaser.GameObjects.Text;
  private repPanelOpen = false;
  private keyK!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private invPanel!: Phaser.GameObjects.Text;
  private invPanelOpen = false;
  private keyC!: Phaser.Input.Keyboard.Key;
  private equipPanel!: Phaser.GameObjects.Text;
  private equipPanelOpen = false;
  private itemDefs: readonly ItemDef[] = [];
  private factionDefs: readonly FactionDef[] = [];
  private keyChoiceDefs: readonly KeyChoiceDef[] = [];
  private endingDefs: readonly EndingDef[] = [];
  private regionGates: readonly RegionGate[] = [];
  /** 当前在门槛提示范围内的地点（进入范围时只提示一次） */
  private gateNoticed = new Set<string>();
  private endingPanel!: Phaser.GameObjects.Text;
  private questList: readonly QuestDef[] = [];
  private pendingChoice: KeyChoiceDef | undefined;
  private choicePrompt!: Phaser.GameObjects.Text;
  private affixDefs: readonly AffixDef[] = [];
  private itemSetDefs: readonly ItemSetDef[] = [];
  /** 战败返回后的剩余保护时间 */
  private graceMs = 0;
  /** 已进入战斗，正在切换场景，阻止重复触发 */
  private transitioning = false;
  private toast!: Phaser.GameObjects.Text;
  private toastUntil = 0;
  private npcRegistry!: NpcRegistry;
  private npcDialogues = new Map<string, import('../data/schema').DialogueDef>();
  private talk: TalkSession | null = null;
  private dialogueBox!: Phaser.GameObjects.Rectangle;
  private dialogueText!: Phaser.GameObjects.Text;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('OverworldScene');
  }

  create(init?: { retreated?: boolean }): void {
    const data = loadGameData();
    this.biomes = data.biomes;
    this.enemyDefs = data.enemies;
    this.questDefs = data.quests;
    this.itemNames = new Map(data.items.map((i) => [i.id, i.name]));
    this.itemDefs = data.items;
    this.factionDefs = data.factions;
    this.keyChoiceDefs = data.keyChoices;
    this.endingDefs = data.endings;
    this.skillDefs = data.skills;
    this.comboDefs = data.combos;
    this.regionGates = data.regionGates;
    this.questList = data.quests;
    this.affixDefs = data.affixes;
    this.itemSetDefs = data.itemSets;

    // 场景实例会被复用，所有运行时状态都要在这里重置
    this.chunks = new Map();
    this.talk = null;
    this.transitioning = false;
    this.questPanelOpen = false;
    this.graceMs = init?.retreated ? RETREAT_GRACE_MS : 0;

    // 会话在整局游戏中唯一；标题菜单负责创建或读取
    this.session = getSession() ?? newSession(data.quests);
    setSession(this.session);
    this.world = this.session.world;
    this.quests = this.session.quests;
    this.elapsedMs = this.session.elapsedMs;
    this.tileX = this.session.player.tileX;
    this.tileY = this.session.player.tileY;

    this.locationRegistry = new LocationRegistry(data.locations);
    this.places = placeLocations(data.locations, WORLD_SEED);
    this.toast = this.add.text(display.baseWidth / 2, 80, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffe9a8',
      backgroundColor: '#00000088', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.drawLocationMarkers();
    this.drawGate();

    this.npcRegistry = new NpcRegistry(data.npcs);
    for (const d of data.dialogues) this.npcDialogues.set(d.id, d);
    this.drawNpcMarkers();

    this.dialogueBox = this.add.rectangle(display.baseWidth / 2, display.baseHeight - 90, display.baseWidth - 60, 150, 0x0b0a1a, 0.9)
      .setScrollFactor(0).setDepth(300).setVisible(false);
    this.dialogueText = this.add.text(40, display.baseHeight - 160, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#f4f0ff', wordWrap: { width: display.baseWidth - 100 },
    }).setScrollFactor(0).setDepth(301).setVisible(false);
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    this.keyE = keyboard.addKey('E');
    this.keySpace = keyboard.addKey('SPACE');
    this.keyQ = keyboard.addKey('Q');
    this.keyR = keyboard.addKey('R');
    this.keyG = keyboard.addKey('G');
    this.keyB = keyboard.addKey('B');
    this.keyN = keyboard.addKey('N');
    this.keyX = keyboard.addKey('X');
    this.skillPanel = this.add.text(16, 300, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 },
    }).setScrollFactor(0).setDepth(250).setVisible(false);
    this.choicePrompt = this.add.text(display.baseWidth / 2, 130, '', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#fff3c4', align: 'center',
      backgroundColor: '#2a1a4acc', padding: { x: 12, y: 8 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(260).setVisible(false);
    this.endingPanel = this.add.text(display.baseWidth / 2, display.baseHeight / 2, '', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#fff3c4', align: 'center',
      backgroundColor: '#0b0a1aee', padding: { x: 24, y: 20 }, wordWrap: { width: display.baseWidth - 200 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(400).setVisible(false);
    const early = this.rewardLines([]);
    if (early.length > 0) this.showToast(early.join('\n'));
    this.refreshKeyChoice();
    this.repPanel = this.add.text(16, 420, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 },
    }).setScrollFactor(0).setDepth(250).setVisible(false);
    this.keyK = keyboard.addKey('K');
    this.keyI = keyboard.addKey('I');
    this.keyC = keyboard.addKey('C');
    keyboard.on('keydown', this.onDigitKey, this);
    // 场景重新进入时移除旧监听，否则数字键会重复触发
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', this.onDigitKey, this));
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    this.keys = kb.addKeys({ W: 'W', A: 'A', S: 'S', D: 'D', T: 'T' }) as typeof this.keys;

    this.player = this.add.rectangle(0, 0, TILE_PX, TILE_PX, 0xffffff).setDepth(10);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBackgroundColor('#000000');

    // 屏幕空间覆盖层（不随相机滚动）
    this.lightOverlay = this.add
      .rectangle(0, 0, display.baseWidth, display.baseHeight, 0x000022, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(100);
    this.weatherOverlay = this.add
      .rectangle(0, 0, display.baseWidth, display.baseHeight, 0x000000, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(101);
    this.hud = this.add.text(16, 12, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#f4f0ff',
      backgroundColor: '#00000066', padding: { x: 8, y: 6 },
    }).setScrollFactor(0).setDepth(200);
    this.add.text(16, display.baseHeight - 28, 'WASD 移动 · E 对话/进入 · Q 任务 · I 背包 · K 存档 · T 测试房间', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#c9c3dd',
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setScrollFactor(0).setDepth(200);
    this.questPanel = this.add.text(display.baseWidth - 16, 12, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 }, wordWrap: { width: 360 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(250).setVisible(false);
    this.invPanel = this.add.text(16, 110, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 },
    }).setScrollFactor(0).setDepth(250).setVisible(false);
    this.invPanelOpen = false;
    this.equipPanel = this.add.text(16, 260, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 },
    }).setScrollFactor(0).setDepth(250).setVisible(false);
    this.equipPanelOpen = false;

    this.player.setPosition(this.tileX * TILE_PX, this.tileY * TILE_PX);
    this.syncChunks();
  }

  update(_time: number, deltaMs: number): void {
    if (this.transitioning) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.T) && !this.talk) {
      this.syncToSession();
      this.scene.start('TestRoomScene');
      return;
    }
    this.elapsedMs += deltaMs;
    this.graceMs = Math.max(0, this.graceMs - deltaMs);
    const dt = deltaMs / 1000;

    if (this.talk) {
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.advanceTalk();
      this.updateEnvironment();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyQ)) this.toggleQuestPanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.toggleRepPanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyG)) this.toggleSkillPanel();
    if (this.skillPanelOpen && !this.talk) {
      if (Phaser.Input.Keyboard.JustDown(this.keyB)) {
        this.skillBranchIdx = (this.skillBranchIdx + 1) % this.branches.length;
        this.skillPage = 0;
        this.refreshSkillPanel();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
        this.skillPage += 1;
        this.refreshSkillPanel();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.resetSkillBranch();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) this.saveGame();
    // 结局面板打开时，E 只用于关闭它（先于对话处理消费这次按键）
    if (this.endingPanel.visible && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.endingPanel.setVisible(false);
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyI)) this.toggleInventoryPanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.toggleEquipPanel();
    if (Phaser.Input.Keyboard.JustDown(this.keyE)) this.tryStartTalk();

    let mx = 0;
    let my = 0;
    if (this.keys.A.isDown) mx -= 1;
    if (this.keys.D.isDown) mx += 1;
    if (this.keys.W.isDown) my -= 1;
    if (this.keys.S.isDown) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      this.tileX += (mx / len) * MOVE_TILES_PER_SEC * dt;
      this.tileY += (my / len) * MOVE_TILES_PER_SEC * dt;
      this.player.setPosition(this.tileX * TILE_PX, this.tileY * TILE_PX);
      this.syncChunks();
    }

    this.checkArrivals();
    this.checkEncounters();
    if (this.toast.visible && this.time.now > this.toastUntil) this.toast.setVisible(false);
    if (this.questPanelOpen) this.refreshQuestPanel();
    if (this.invPanelOpen) this.refreshInventoryPanel();
    if (this.equipPanelOpen) this.refreshEquipPanel();
    if (this.repPanelOpen) this.refreshRepPanel();
    if (this.skillPanelOpen) this.refreshSkillPanel();
    this.syncToSession();
    this.updateEnvironment();
  }

  // ---------- 会话与存档 ----------

  /** 把玩家位置与游戏时间写回会话，供存档与场景切换使用。 */
  private syncToSession(): void {
    this.session.player.tileX = this.tileX;
    this.session.player.tileY = this.tileY;
    this.session.elapsedMs = this.elapsedMs;
  }

  /** 写入浏览器存档；成功与否都给出提示。 */
  private saveGame(): boolean {
    this.syncToSession();
    const ok = persistSession(this.session);
    this.showToast(ok ? '已存档' : '存档失败：浏览器拒绝写入（可能存储空间已满）');
    return ok;
  }

  // ---------- 任务日志 ----------

  private toggleQuestPanel(): void {
    this.questPanelOpen = !this.questPanelOpen;
    this.questPanel.setVisible(this.questPanelOpen);
    if (this.questPanelOpen) this.refreshQuestPanel();
  }

  /** 主线第 24 章完成时，根据当前标记判定结局并显示（每次完成时判定一次）。 */
  private showEndingIfReached(done: QuestCompletion[]): void {
    if (!done.some((c) => c.questId === 'main_24')) return;
    this.world.setFlag('ending_reached');
    const ending = resolveEnding(this.endingDefs, this.world);
    if (!ending) return;
    this.endingPanel.setText(`【结局：${ending.name}】\n\n${ending.text}\n\n主线已完成，你可以继续探索这片大陆。（按 E 关闭）`).setVisible(true);
  }

  /** 重新计算待选抉择并更新提示（任务完成、选择后、进入地表时调用）。 */
  private refreshKeyChoice(): void {
    this.pendingChoice = pendingKeyChoice(this.keyChoiceDefs, this.questList, this.world);
    if (!this.pendingChoice) {
      this.choicePrompt.setVisible(false);
      return;
    }
    const c = this.pendingChoice;
    const opts = c.options.map((o, i) => `[${i + 1}] ${o.text}`).join('   ');
    this.choicePrompt.setText(`关键抉择：${c.question}\n${opts}`).setVisible(true);
  }

  private detectMult = 1;
  /** 当前视野（格），由时段和天气决定 */
  private sightTiles = BASE_SIGHT_TILES;

  private toggleSkillPanel(): void {
    this.skillPanelOpen = !this.skillPanelOpen;
    this.skillPanel.setVisible(this.skillPanelOpen);
    if (this.skillPanelOpen) this.refreshSkillPanel();
  }

  private currentBranch(): Branch {
    return this.branches[this.skillBranchIdx];
  }

  /** 当前分支、当前页的技能列表（最多 9 个，对应数字键 1–9） */
  private skillPageItems(): SkillDef[] {
    const list = branchSkills(this.skillDefs, this.currentBranch());
    const pages = Math.max(1, Math.ceil(list.length / 9));
    this.skillPage = ((this.skillPage % pages) + pages) % pages;
    return list.slice(this.skillPage * 9, this.skillPage * 9 + 9);
  }

  private refreshSkillPanel(): void {
    const branch = this.currentBranch();
    const pages = Math.max(1, Math.ceil(branchSkills(this.skillDefs, branch).length / 9));
    const items = this.skillPageItems();
    const state = treeOf(this.session.player);
    const rows = items.map((skill, i) => {
      const reason = unlockBlockReason(state, skill);
      const mark = state.unlocked.has(skill.id)
        ? '已学会'
        : reason === 'missing-prereq' ? '需要前置'
        : reason === 'no-points' ? '点数不足'
        : '可学习';
      return `[${i + 1}] ${skill.name}（层 ${skill.tier}）  ${mark}`;
    });
    const combos = activeCombos(state, this.comboDefs).map((c) => c.name);
    const level = levelForExp(this.session.player.exp);
    this.skillPanel.setText([
      '技能（G 关闭 · B 切换分支 · 数字键学习 · N 翻页 · X 重置分支）',
      `技能点 ${state.points}   分支：${BRANCH_LABEL[branch]}（第 ${this.skillPage + 1}/${pages} 页）`,
      ...rows,
      `已激活组合技：${combos.length > 0 ? combos.join('、') : '无'}`,
      `重置本分支费用：${resetCost(level)} 金币`,
    ].join('\n'));
  }

  private learnSkill(index: number): void {
    const target = this.skillPageItems()[index];
    if (!target) return;
    const state = treeOf(this.session.player);
    const reason = unlockBlockReason(state, target);
    if (reason !== null) {
      const text = { already: '已经学会了', 'missing-prereq': '需要先学习前置技能', 'no-points': '技能点不足', unknown: '未知技能' }[reason];
      this.showToast(`${target.name}：${text}`);
      return;
    }
    unlockSkill(state, target);
    storeTree(this.session.player, state);
    this.showToast(`学会了 ${target.name}`);
    this.syncToSession();
    persistSession(this.session);
    this.refreshSkillPanel();
  }

  /** 重置当前分支：返还技能点，需要支付金币。分支内没有已学技能时不收费。 */
  private resetSkillBranch(): void {
    const branch = this.currentBranch();
    const state = treeOf(this.session.player);
    const inBranch = branchSkills(this.skillDefs, branch).some((s) => state.unlocked.has(s.id));
    if (!inBranch) {
      this.showToast(`${BRANCH_LABEL[branch]} 分支没有已学技能`);
      return;
    }
    const cost = resetCost(levelForExp(this.session.player.exp));
    if (this.session.player.gold < cost) {
      this.showToast(`金币不足：重置需要 ${cost}`);
      return;
    }
    this.session.player.gold -= cost;
    const refunded = resetBranch(state, branch, indexSkills(this.skillDefs));
    storeTree(this.session.player, state);
    this.showToast(`已重置${BRANCH_LABEL[branch]}分支，返还 ${refunded} 点技能点（-${cost} 金币）`);
    this.syncToSession();
    persistSession(this.session);
    this.refreshSkillPanel();
  }

  private toggleRepPanel(): void {
    this.repPanelOpen = !this.repPanelOpen;
    this.repPanel.setVisible(this.repPanelOpen);
    if (this.repPanelOpen) this.refreshRepPanel();
  }

  private refreshRepPanel(): void {
    this.repPanel.setText(['阵营声望（R 关闭）', ...reputationLines(this.world, this.factionDefs)].join('\n'));
  }

  private toggleEquipPanel(): void {
    this.equipPanelOpen = !this.equipPanelOpen;
    this.equipPanel.setVisible(this.equipPanelOpen);
    if (this.equipPanelOpen) this.refreshEquipPanel();
  }

  private refreshEquipPanel(): void {
    const eq = this.session.player.equipment;
    const stats = combatStats(eq, this.itemDefs, this.affixDefs, this.itemSetDefs);
    const rows = EQUIP_SLOTS.map((slot, i) => {
      const id = eq[slot];
      const name = id ? (this.itemNames.get(id) ?? id) : '—';
      return `[${i + 1}] ${SLOT_LABEL[slot]}：${name}`;
    });
    this.equipPanel.setText([
      '装备（C 关闭 · 数字键切换）',
      ...rows,
      `攻击 ${stats.attack}   防御 ${stats.defense}   生命 ${stats.maxHp}`,
      ...equipmentDetailLines(eq, this.itemDefs, this.affixDefs, this.itemSetDefs),
    ].join('\n'));
  }

  private toggleInventoryPanel(): void {
    this.invPanelOpen = !this.invPanelOpen;
    this.invPanel.setVisible(this.invPanelOpen);
    if (this.invPanelOpen) this.refreshInventoryPanel();
  }

  private refreshInventoryPanel(): void {
    const lines = inventoryLines(this.world, [...this.itemNames].map(([id, name]) => ({ id, name })));
    this.invPanel.setText(formatInventory(lines));
  }

  private refreshQuestPanel(): void {
    this.questPanel.setText(formatQuestLog(activeQuestLog(this.questDefs, this.world)));
  }

  // ---------- 地表遭遇 ----------

  /** 玩家走到未击败的刷新点附近时，切换到战斗场景。 */
  private checkEncounters(): void {
    if (this.graceMs > 0) return;
    for (const loaded of this.chunks.values()) {
      for (const spawn of loaded.spawns) {
        const d = Math.hypot(this.tileX - spawn.tileX, this.tileY - spawn.tileY);
        if (d > ENCOUNTER_RADIUS * this.detectMult) continue;
        this.transitioning = true;
        this.syncToSession();
        const request: EncounterRequest = { enemyIds: spawn.enemyIds, spawnKey: spawn.key };
        this.scene.start('TestRoomScene', { encounter: request });
        return;
      }
    }
  }

  private drawSpawnMarker(spawn: SurfaceSpawn): Phaser.GameObjects.GameObject[] {
    const px = spawn.tileX * TILE_PX;
    const py = spawn.tileY * TILE_PX;
    const names = spawn.enemyIds
      .map((id) => this.enemyDefs.find((e) => e.id === id)?.name ?? id)
      .join('、');
    const dot = this.add.circle(px, py, TILE_PX * 0.9, 0xe0584f, 0.85).setDepth(8);
    const label = this.add.text(px, py - TILE_PX * 1.8, names, {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#ffd6d1',
      backgroundColor: '#00000088', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(8);
    return [dot, label];
  }

  // ---------- 地点 ----------

  private drawLocationMarkers(): void {
    for (const p of this.places) {
      const px = p.x * TILE_PX;
      const py = p.y * TILE_PX;
      this.add.circle(px, py, TILE_PX * 1.2, 0xffd166, 0.9).setDepth(6);
      this.add.text(px, py - TILE_PX * 2.5, p.name, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#fff3c4',
        backgroundColor: '#00000088', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 1).setDepth(6);
    }
  }

  /** 玩家走近未访问的地点时，上报一次 reach 事件并提示。 */
  private checkArrivals(): void {
    for (const p of this.places) {
      if (this.session.visited.has(p.id)) continue;
      const d = Math.hypot(this.tileX - p.x, this.tileY - p.y);
      if (d > ARRIVE_RADIUS) {
        this.gateNoticed.delete(p.id);
        continue;
      }
      // 区域门槛：声望不足时不算抵达，离开后再回来会再次检查
      const region = this.locationRegistry.get(p.id)?.region ?? '';
      const reason = blockReason(this.world, region, this.regionGates, this.factionDefs);
      if (reason) {
        if (!this.gateNoticed.has(p.id)) {
          this.gateNoticed.add(p.id);
          this.showToast(`${p.name}：${reason}`);
        }
        continue;
      }
      this.session.visited.add(p.id);
      const done = arriveAt(this.locationRegistry, this.quests, p.id);
      this.quests.acceptAvailable((d) => d.type !== 'side');
      const lines = [`抵达：${p.name}`, ...this.rewardLines(done)];
      this.showToast(lines.join('\n'));
      // 抵达新地点时自动存档（写入失败不打断游戏）
      this.syncToSession();
      persistSession(this.session);
    }
  }

  /** NPC 在地表上的瓦片坐标：地点旁边按序号横向错开，避免重叠。 */
  private npcTile(npcId: string): { x: number; y: number } | null {
    const npc = this.npcRegistry.get(npcId);
    const place = npc && this.places.find((p) => p.id === npc.location);
    if (!npc || !place) return null;
    const index = this.npcRegistry.atLocation(place.id).findIndex((n) => n.id === npcId);
    return { x: place.x + 2 + index * 2, y: place.y };
  }

  private drawNpcMarkers(): void {
    for (const npc of this.npcRegistry.list()) {
      const tile = this.npcTile(npc.id);
      if (!tile) continue;
      const px = tile.x * TILE_PX;
      const py = tile.y * TILE_PX;
      this.add.rectangle(px, py, TILE_PX * 1.6, TILE_PX * 1.6, 0x7fd1ff).setDepth(7);
      // 同一地点的 NPC 名字交替抬高，避免标签重叠
      const index = this.npcRegistry.atLocation(npc.location).findIndex((n) => n.id === npc.id);
      this.add.text(px, py - TILE_PX * 2 - (index % 2) * 14, npc.name, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#d8f2ff',
        backgroundColor: '#00000088', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 1).setDepth(7);
    }
  }

  private nearestNpcId(): string | null {
    let best: { id: string; d: number } | null = null;
    for (const npc of this.npcRegistry.list()) {
      const tile = this.npcTile(npc.id);
      if (!tile) continue;
      const d = Math.hypot(this.tileX - tile.x, this.tileY - tile.y);
      if (d <= TALK_RADIUS && (!best || d < best.d)) best = { id: npc.id, d };
    }
    return best?.id ?? null;
  }

  /** 靠近地牢传送门时按 E 进入地牢。 */
  private tryEnterGate(): void {
    if (this.transitioning) return;
    const d = Math.hypot(this.tileX - GATE_TILE.x, this.tileY - GATE_TILE.y);
    if (d > GATE_RADIUS) return;
    this.transitioning = true;
    this.syncToSession();
    this.scene.start('DungeonScene');
  }

  private drawGate(): void {
    const px = GATE_TILE.x * TILE_PX;
    const py = GATE_TILE.y * TILE_PX;
    this.add.circle(px, py, TILE_PX * 2.2, 0x7a3cff, 0.35).setDepth(6);
    this.add.circle(px, py, TILE_PX * 1.2, 0xb89cff, 0.9).setDepth(6);
    this.add.text(px, py - TILE_PX * 3, `裂隙地牢 · 第 ${this.session.dungeonFloor} 层（按 E 进入）`, {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#e6d9ff',
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(6);
  }

  private tryStartTalk(): void {
    const npcId = this.nearestNpcId();
    if (!npcId) {
      this.tryEnterGate();
      return;
    }
    const npc = this.npcRegistry.get(npcId)!;
    // 先接取该 NPC 发布的任务（不进入对话）；再次按 E 才开始对话
    const offered = this.quests.acceptFromNpc(npcId);
    if (offered.length > 0) {
      const titles = offered.map((id) => this.quests.def(id)?.title ?? id).join('、');
      this.showToast(`${npc.name} 发布了任务：${titles}\n完成目标后再来交付（再次按 E 对话）`);
      return;
    }
    const dialogue = this.npcDialogues.get(npc.dialogueId);
    if (!dialogue) return;
    this.talk = startTalk(this.npcRegistry, npcId, dialogue, this.world, this.quests);
    this.renderTalk();
  }

  /** 无选项节点按空格推进；有选项时需按数字键。 */
  private advanceTalk(): void {
    if (!this.talk) return;
    const runner = this.talk.runner;
    const node = runner.current();
    if (node?.choices && node.choices.length > 0) {
      // 所有选项都因条件被隐藏时，允许退出，且不计入任务进度
      if (runner.choices().length === 0) this.closeTalk('对话已中断');
      return;
    }
    runner.advance();
    this.afterTalkStep();
  }

  private onDigitKey(e: KeyboardEvent): void {
    // 有待选的关键抉择且不在对话中：数字键选择选项
    const option = this.pendingChoice && !this.talk ? this.pendingChoice.options[Number(e.key) - 1] : undefined;
    if (this.pendingChoice && option) {
      resolveKeyChoice(this.pendingChoice, option.id, this.world);
      this.showToast(`你选择了：${option.text}`);
      this.syncToSession();
      this.refreshKeyChoice();
      return;
    }
    // 技能面板打开且不在对话中：数字键学习列表中的技能
    if (this.skillPanelOpen && !this.talk && /^[1-9]$/.test(e.key)) {
      this.learnSkill(Number(e.key) - 1);
      return;
    }
    // 装备面板打开且不在对话中：数字键 1–4 切换对应槽位
    if (!this.talk && this.equipPanelOpen && /^[1-4]$/.test(e.key)) {
      cycleSlot(this.session, EQUIP_SLOTS[Number(e.key) - 1], this.itemDefs);
      this.refreshEquipPanel();
      return;
    }
    if (!this.talk || !/^[1-9]$/.test(e.key)) return;
    const visible = this.talk.runner.choices();
    const pick = visible[Number(e.key) - 1];
    if (!pick) return;
    this.talk.runner.choose(pick.index);
    this.afterTalkStep();
  }

  private afterTalkStep(): void {
    if (!this.talk) return;
    if (this.talk.runner.finished) {
      const done = this.talk.finish();
      this.quests.acceptAvailable((d) => d.type !== 'side');
      this.closeTalk(this.rewardLines(done).join('\n'));
      return;
    }
    this.renderTalk();
  }

  private closeTalk(message: string): void {
    this.talk = null;
    this.dialogueBox.setVisible(false);
    this.dialogueText.setVisible(false);
    if (message) this.showToast(message);
  }

  private renderTalk(): void {
    if (!this.talk) return;
    const node = this.talk.runner.current();
    if (!node) return;
    const opts = this.talk.runner.choices();
    const optText = opts.length > 0 ? '\n' + opts.map((o, i) => `[${i + 1}] ${o.text}`).join('\n') : '\n[空格] 继续';
    this.dialogueText.setText(`${node.speaker}\n${node.text}${optText}`).setVisible(true);
    this.dialogueBox.setVisible(true);
  }

  /** 发放任务奖励并返回提示文本行（含升级提示）。 */
  private rewardLines(finished: QuestCompletion[]): string[] {
    // 收集目标按背包持有数量判定，每次发奖时一并检查
    const done = [...finished, ...this.quests.syncCollect()];
    const lines = grantQuestRewards(
      this.session,
      done,
      (id) => this.quests.def(id)?.title ?? id,
      (id) => this.itemNames.get(id) ?? id,
    );
    this.refreshKeyChoice();
    this.showEndingIfReached(done);
    return lines;
  }

  private showToast(text: string): void {
    this.toast.setText(text).setVisible(true);
    this.toastUntil = this.time.now + TOAST_MS;
  }

  // ---------- 区块加载 ----------

  private syncChunks(): void {
    const center = chunkOf(Math.floor(this.tileX), Math.floor(this.tileY));

    for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
        this.ensureChunk(center.cx + dx, center.cy + dy);
      }
    }

    for (const [key, loaded] of this.chunks) {
      const { cx, cy } = loaded.chunk;
      if (Math.abs(cx - center.cx) > UNLOAD_RADIUS || Math.abs(cy - center.cy) > UNLOAD_RADIUS) {
        loaded.image.destroy();
        for (const m of loaded.markers) for (const o of m.objs) o.destroy();
        if (this.textures.exists(loaded.textureKey)) this.textures.remove(loaded.textureKey);
        this.chunks.delete(key);
      }
    }
  }

  private ensureChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    if (this.chunks.has(key)) return;

    const chunk = generateChunk(WORLD_SEED, cx, cy, this.biomes);
    const textureKey = `chunk:${key}`;
    // 纹理在场景之间共享；重新进入地表时旧纹理可能仍然存在
    if (this.textures.exists(textureKey)) this.textures.remove(textureKey);
    const tex = this.textures.createCanvas(textureKey, CHUNK_SIZE, CHUNK_SIZE);
    if (!tex) throw new Error(`无法创建区块纹理 ${textureKey}`);
    const ctx = tex.getContext();
    const image = ctx.createImageData(CHUNK_SIZE, CHUNK_SIZE);

    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      const biome = this.biomes[chunk.biome[i]];
      let [r, g, b] = hexToRgb(biome.color);
      const flags = chunk.flags[i];
      if (flags & FLAG_RIVER) [r, g, b] = [(RIVER_RGB >> 16) & 0xff, (RIVER_RGB >> 8) & 0xff, RIVER_RGB & 0xff];
      else if (flags & FLAG_ROAD) [r, g, b] = [(ROAD_RGB >> 16) & 0xff, (ROAD_RGB >> 8) & 0xff, ROAD_RGB & 0xff];

      // 按高度做轻微明暗，让地形有起伏感
      const shade = 0.85 + (chunk.height[i] / 255) * 0.3;
      const o = i * 4;
      image.data[o] = Math.min(255, r * shade);
      image.data[o + 1] = Math.min(255, g * shade);
      image.data[o + 2] = Math.min(255, b * shade);
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    tex.refresh();

    const img = this.add
      .image(cx * CHUNK_SIZE * TILE_PX, cy * CHUNK_SIZE * TILE_PX, textureKey)
      .setOrigin(0, 0)
      .setScale(TILE_PX)
      .setDepth(0);
    const spawns = surfaceSpawnsForChunk(WORLD_SEED, chunk, this.biomes, this.enemyDefs)
      .filter((s) => !this.session.defeated.has(s.key));
    const markers = spawns.map((s) => ({ spawn: s, objs: this.drawSpawnMarker(s) }));
    this.chunks.set(key, { chunk, image: img, textureKey, spawns, markers });
  }

  // ---------- 环境与 HUD ----------

  private currentChunk(): Chunk | undefined {
    const { cx, cy } = chunkOf(Math.floor(this.tileX), Math.floor(this.tileY));
    return this.chunks.get(`${cx},${cy}`)?.chunk;
  }

  private updateEnvironment(): void {
    const time = getDayState(this.elapsedMs);
    const tx = Math.floor(this.tileX);
    const ty = Math.floor(this.tileY);
    const { cx, cy } = chunkOf(tx, ty);
    const chunk = this.currentChunk();

    // 天气：按区块与日期决定，每天变化一次
    const biomeIdx = chunk ? chunk.biome[((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE * CHUNK_SIZE + (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE)] : 0;
    const biome = this.biomes[biomeIdx];
    const weatherKey = `${cx},${cy},${biome?.id ?? ''}`;
    if (this.weatherCache.day !== time.day || this.weatherCache.key !== weatherKey) {
      this.weatherCache = {
        day: time.day,
        key: weatherKey,
        weather: rollWeather(WORLD_SEED, cx, cy, time.day, biome?.weatherWeights ?? {}),
      };
    }
    const weather = this.weatherCache.weather;

    // 光照：夜晚越暗，覆盖层越不透明
    this.lightOverlay.setAlpha((1 - time.light) * 0.6);

    const w = WEATHER_OVERLAY[weather];
    this.weatherOverlay.setFillStyle(w.color, w.alpha);

    // 视野：只显示视野内的敌人刷新点；夜晚侦测距离变大
    this.sightTiles = sightRadius(time.phase, weather);
    this.detectMult = detectMultiplier(time.phase);
    for (const loaded of this.chunks.values()) {
      for (const m of loaded.markers) {
        const d = Math.hypot(this.tileX - m.spawn.tileX, this.tileY - m.spawn.tileY);
        const visible = d <= this.sightTiles;
        for (const o of m.objs) (o as unknown as { setVisible(v: boolean): unknown }).setVisible(visible);
      }
    }

    const tile = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE * CHUNK_SIZE + (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
    const onRiver = chunk ? (chunk.flags[tile] & FLAG_RIVER) !== 0 : false;
    const onRoad = chunk ? (chunk.flags[tile] & FLAG_ROAD) !== 0 : false;
    const place = onRiver ? '河流' : onRoad ? '道路' : '野外';

    this.hud.setText([
      `群系 ${biome?.name ?? '未知'} · ${place}   坐标 ${tx}, ${ty}`,
      `第 ${time.day} 日 · ${phaseName(time.phase)}   天气 ${weatherName(weather)}`,
      `视野 ${Math.round(this.sightTiles)} 格   已加载区块 ${this.chunks.size}`,
    ]);
  }
}

function phaseName(p: 'dawn' | 'day' | 'dusk' | 'night'): string {
  return { dawn: '黎明', day: '白昼', dusk: '黄昏', night: '夜晚' }[p];
}

function weatherName(w: Weather): string {
  return {
    clear: '晴', rain: '雨', fog: '雾', snowstorm: '暴风雪', sandstorm: '沙尘', thunder: '雷暴',
  }[w];
}
