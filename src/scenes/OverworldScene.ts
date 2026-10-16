import {buildHuntJournal,type HuntJournalEntry} from '../world/huntJournal';
import {placeHunts,huntState,huntProgress,startHunt,type HuntSpawn} from '../world/hunts';
import {KillStreak} from '../combat/KillStreak';
import {roamingPacks} from '../world/roamingPacks';
import {audio} from '../audio/AudioDirector';
import {SurfaceCombat} from '../combat/SurfaceCombat';
import {enemyTactics} from '../combat/enemyTactics';
import {settleSurfaceKill} from '../state/surfaceRewards';
import { claimCampSupplies, CAMP_SUPPLIES_FLAG } from '../state/campSupplies';
import { useConsumable } from '../state/consumables';
import Phaser from 'phaser';
import { bufferSceneKeys, pressed } from '../input/bufferedKeys';
import { npcRole } from '../art/sprites';
import { pinToScreen, UI, panel, text, button, styleModal } from '../ui/theme';
import { ShopView } from '../ui/ShopView';
import { CardPanel } from '../ui/CardPanel';
import { RenderSignature } from '../ui/renderSignature';
import { skillLoadout, bindSkill } from '../combat/loadout';
import { combatProfile, isSupportedModifier } from '../combat/profile';
import { settleQuestRewards } from '../state/rewards';
import { display } from '../config/display';
import { CHUNK_SIZE, FLAG_RIVER, FLAG_ROAD, chunkOf, generateChunk, type Chunk } from '../world/chunk';
import { DAY_LENGTH_MS, getDayState } from '../world/time';
import { rollWeather, type Weather } from '../world/weather';
import { BASE_SIGHT_TILES, sightRadius } from '../world/modifiers';
import { loadGameData } from '../data/loader';
import type { BiomeDef } from '../data/schema';
import { WorldState } from '../state/WorldState';
import { QuestManager } from '../narrative/QuestManager';
import { LocationRegistry, arriveAt } from '../world/locations';
import { NpcRegistry, startTalk, type TalkSession } from '../world/npcs';
import { placeNpcs, nearestNpc, inSettlement, type PlacedNpc } from '../world/npcPlacement';
import { placeLocations, REGION_ANCHORS, type PlacedLocation } from '../world/placement';

/** 地牢传送门位于裂隙区域的锚点上 */
const GATE_TILE = REGION_ANCHORS['裂隙'];
const GATE_RADIUS = 2;
import { surfaceSpawnsForChunk, type SurfaceSpawn } from '../world/encounters';
import {snowGatePatrols,spawnAvailable} from '../world/storyPatrols';
import { questGuidance, directionHint, npcQuestState } from '../narrative/questGuidance';
import { trackedQuest, trackedObjective, questPage } from '../narrative/questTracking';
import { activeQuestLog, formatQuestLog } from '../narrative/questLog';
import { formatInventory, inventoryLines } from '../state/inventory';
import { combatStats, cycleSlot, equipItem, itemAffixes, EQUIP_SLOTS, equipmentDetailLines, SLOT_LABEL } from '../state/equipment';
import { getSession, persistSession, setSession } from '../state/sessionStore';
import { newSession, type GameSession } from '../state/session';
import type { AffixDef, EnemyDef, FactionDef, ItemDef, QuestDef } from '../data/schema';
import { reputationLines } from '../factions/reputation';
import { pendingKeyChoice, resolveKeyChoice, type KeyChoiceDef } from '../narrative/keyChoices';
import { resolveEnding } from '../endings/EndingResolver';
import { blockReason, type RegionGate } from '../factions/regionAccess';
import type { EndingDef } from '../data/schema';
import { activeSetBonuses, type ItemSetDef } from '../items/sets';
import { levelForExp } from '../state/rewards';
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
const TILE_PX = 16;
const MOVE_TILES_PER_SEC = 9;
/** 以玩家为中心，加载半径（区块数） */
const LOAD_RADIUS = 1;
/** 超出该半径的区块会被卸载 */
const UNLOAD_RADIUS = 2;
/** 玩家与地点中心的距离（瓦片）小于该值即视为抵达 */
const ARRIVE_RADIUS = 1.5;
const TOAST_MS = 2600;
/** 战败返回地表后的脱离保护时间（毫秒），避免立刻再次进入同一场战斗 */
const RETREAT_GRACE_MS = 3000;
/** 玩家与 NPC 的距离小于该值时可以按 E 对话 */

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
  decor: Phaser.GameObjects.Image[];
  markers: Array<{ spawn: SurfaceSpawn; objs: Phaser.GameObjects.GameObject[] }>;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export class OverworldScene extends Phaser.Scene {
  private biomes: readonly BiomeDef[] = [];
  private chunks = new Map<string, LoadedChunk>();
  private player!: Phaser.GameObjects.Image;
  private cards!: CardPanel;
  private modalBackdrop!: Phaser.GameObjects.Rectangle;
  private modalFrame!: Phaser.GameObjects.Graphics;
  private status!: Phaser.GameObjects.Text;
  private tracker!: Phaser.GameObjects.Text;
  private contextHint!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Graphics;
  private mini!: Phaser.GameObjects.Graphics;
  private shop!: ShopView;
  private esc!: Phaser.Input.Keyboard.Key;
  private miniTimer = 0;
  private tileX = 0;
  private tileY = 0;
  private elapsedMs = DAY_LENGTH_MS * 0.3;
  private weatherCache = { day: -1, key: '', weather: 'clear' as Weather };
  private lightOverlay!: Phaser.GameObjects.Rectangle;
  private weatherOverlay!: Phaser.GameObjects.Rectangle;
  private hud!: Phaser.GameObjects.Text;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'T' | 'H' | 'M', Phaser.Input.Keyboard.Key>;
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
  private keyV!: Phaser.Input.Keyboard.Key;
  private keyY!:Phaser.Input.Keyboard.Key;
  private keyF!: Phaser.Input.Keyboard.Key;
  private bindSlot=0;
  private loadoutUI!:Phaser.GameObjects.Container;
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
  private campSupplyLabel!: Phaser.GameObjects.Text;
  private snowPatrols:SurfaceSpawn[]=[];
  private npcRegistry!: NpcRegistry;
  private npcPositions = new Map<string, PlacedNpc>();
  private npcLabels = new Map<string, Phaser.GameObjects.Text>();
  private npcQuestMarkers = new Map<string, Phaser.GameObjects.Text>();
  private npcHighlights = new Map<string, Phaser.GameObjects.Ellipse>();
  private npcLabelTimer = 0;
  private npcDialogues = new Map<string, import('../data/schema').DialogueDef>();
  private talk: TalkSession | null = null;
  private dialogueBox!: Phaser.GameObjects.Rectangle;
  private dialogueText!: Phaser.GameObjects.Text;
  private dialoguePortrait!: Phaser.GameObjects.Image;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('OverworldScene');
  }

  private hunts:HuntSpawn[]=[];
  private huntMarkers=new Map<string,{root:Phaser.GameObjects.Container;label:Phaser.GameObjects.Text}>();
  private huntHud!:Phaser.GameObjects.Text;
  private hudHunt:HuntSpawn|undefined;
  private streakHud!:Phaser.GameObjects.Text;
  private streak=new KillStreak();
  private surfaceEffects!:Phaser.GameObjects.Graphics;
  private surface!: SurfaceCombat;
  private surfaceVisuals=new Map<string,{body:Phaser.GameObjects.Image;label:Phaser.GameObjects.Text;bar:Phaser.GameObjects.Graphics;warning:Phaser.GameObjects.Graphics}>();
  private keyJ!:Phaser.Input.Keyboard.Key;
  private keyZ!:Phaser.Input.Keyboard.Key;
  private facing={x:1,y:0};
  private dodgeMs=0;
  private dodgeDirection={x:1,y:0};
  private autoAttack=false;
  private surfaceSavePending=false;
  private combatHud!:Phaser.GameObjects.Text;
  private surfaceSlots:{bg:Phaser.GameObjects.Rectangle;label:Phaser.GameObjects.Text}[]=[];

  private saveWarning!: Phaser.GameObjects.Text;
  private readonly loadoutSignature = new RenderSignature();

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
    this.loadoutSignature.reset();
    this.talk = null;
    this.transitioning = false;
    this.questPanelOpen = false;
    this.skillPanelOpen = false;
    this.repPanelOpen = false;
    this.invPanelOpen = false;
    this.equipPanelOpen = false;
    this.gateNoticed.clear();
    this.weatherCache = { day: -1, key: '', weather: 'clear' };
    this.miniTimer = 0;
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
    this.saveWarning = this.add.text(display.baseWidth / 2, 52,
      '保存失败：进度仅在当前页面保留，请释放存储空间后按 K 重试', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffb99b', backgroundColor: '#271b1bee',
        padding: {x: 8, y: 6},
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(500).setVisible(false);
    this.toast = this.add.text(display.baseWidth / 2, 80, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffe9a8',
      backgroundColor: '#00000088', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.drawLocationMarkers();
    this.drawGate();

    this.npcRegistry = new NpcRegistry(data.npcs);
    this.npcPositions = placeNpcs(data.npcs, this.places, [
      {x: 4, y: 4, radius: 7}, {x: -5, y: -2, radius: 6},
      {x: -5, y: 4, radius: 4}, {x: 0, y: 0, radius: 4},
      {...GATE_TILE, radius: 7},
    ]);
    this.snowPatrols=snowGatePatrols(this.places,this.npcPositions);
    this.hunts=placeHunts(this.places,this.npcPositions,this.biomes,WORLD_SEED);
    this.npcLabels.clear();
    this.npcQuestMarkers.clear();
    this.npcHighlights.clear();
    this.npcDialogues.clear();
    this.npcLabelTimer = 0;
    this.questPageIndex=0;this.questDetails=false;this.questDetailPage=0;
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
    this.keyJ=keyboard.addKey('J');this.keyZ=keyboard.addKey('Z');
    this.keyQ = keyboard.addKey('Q');
    this.keyR = keyboard.addKey('R');
    this.keyG = keyboard.addKey('G');
    this.keyB = keyboard.addKey('B');
    this.keyN = keyboard.addKey('N');
    this.keyX = keyboard.addKey('X');
    this.keyF = keyboard.addKey('F');
    this.keyY = keyboard.addKey('Y');
    this.keyV = keyboard.addKey('V');
    this.bindSlot=0;
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
    this.keys = kb.addKeys({ W: 'W', A: 'A', S: 'S', D: 'D', T: 'T', H:'H', M:'M' }) as typeof this.keys;

    this.player = this.add.image(0, 0, 'actor-hero').setDisplaySize(52,52).setOrigin(.5,.85).setDepth(10);
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
    this.add.text(16, display.baseHeight - 28, 'WASD 移动 · E 对话/进入 · Q 任务 · I 背包 · Y 试炼塔 · K 存档', {
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
    this.initSurfaceCombat();
    this.createHuntMarkers();
    this.syncChunks();
    this.events.once('shutdown',()=>{for(const c of this.chunks.values())if(this.textures.exists(c.textureKey))this.textures.remove(c.textureKey);});
    this.createInterface();
    const craftRefresh=()=>{const lines=this.rewardLines([]);if(lines.length)this.showToast(lines.join('\n'));if(this.equipPanelOpen)this.refreshEquipPanel();if(this.invPanelOpen)this.refreshInventoryPanel();};
    this.events.on('craft-updated',craftRefresh);
    this.events.once('shutdown',()=>this.events.off('craft-updated',craftRefresh));
    const towerSign=this.add.text(160,64,'◇ 裂隙试炼塔\n营地附近按 Y',{fontFamily:'sans-serif',fontSize:'13px',color:'#d9c4ff',backgroundColor:'#15263cdd',padding:{x:8,y:6}}).setDepth(12).setOrigin(.5).setInteractive({useHandCursor:true});
    towerSign.on('pointerdown',()=>this.enterTower());
    bufferSceneKeys(this);
    this.updateEnvironment();
  }

  update(_time: number, deltaMs: number): void {
    if (audio.panelOpen || this.transitioning) return;
    if (this.shop.visible) {
      if (pressed(this.keyE) || pressed(this.esc)) this.shop.hide();
      return;
    }
    if (pressed(this.esc)) this.closePanels();
    if (pressed(this.keys.T) && !this.talk) {
      this.syncToSession();
      this.scene.start('TestRoomScene');
      return;
    }
    deltaMs=Math.min(Math.max(0,deltaMs),100);
    const profile=combatProfile(this.session.player.equipment,this.itemDefs,this.affixDefs,this.itemSetDefs,this.session.player.crafting);
    this.surface.syncProfile(profile,this.session.player.skills.unlocked,this.session.player.hp,this.session.player.mana??profile.maxMana);
    this.elapsedMs += deltaMs;
    this.graceMs = Math.max(0, this.graceMs - deltaMs);
    const dt = deltaMs / 1000;

    if (this.talk) {
      if (pressed(this.keySpace)) this.advanceTalk();
      this.updateEnvironment();
      return;
    }
    if (pressed(this.keyQ)) this.toggleQuestPanel();
    if (pressed(this.keyR)) this.toggleRepPanel();
    if (pressed(this.keyG)) this.toggleSkillPanel();
    if (this.skillPanelOpen && !this.talk) {
      if (pressed(this.keyB)) {
        this.skillBranchIdx = (this.skillBranchIdx + 1) % this.branches.length;
        this.skillPage = 0;
        this.refreshSkillPanel();
      }
      if (pressed(this.keyN)) {
        this.skillPage += 1;
        this.refreshSkillPanel();
      }
      if (pressed(this.keyX)) this.resetSkillBranch();
      if (pressed(this.keyF)) {this.bindSlot=(this.bindSlot+1)%4;this.refreshSkillPanel();}
    }
    if(this.questPanelOpen){
      if(pressed(this.keyN)){this.turnQuestPage(1);}
      if(pressed(this.keyB)){this.turnQuestPage(-1);}
      if(pressed(this.keyV)){this.questDetails=!this.questDetails;this.refreshQuestPanel();}
    }
    if(this.invPanelOpen){if(pressed(this.keyN)){this.inventoryPage++;this.refreshInventoryPanel();}if(pressed(this.keyB)){this.inventoryPage--;this.refreshInventoryPanel();}}
    if(!this.talk&&!this.pendingChoice&&!this.endingPanel.visible){if(pressed(this.keys.H))this.useSupply('health_potion');if(pressed(this.keys.M))this.useSupply('mana_potion');}
    if (pressed(this.keyK)) this.saveGame();
    // 结局面板打开时，E 只用于关闭它（先于对话处理消费这次按键）
    if (this.endingPanel.visible && pressed(this.keyE)) {
      this.endingPanel.setVisible(false);
      return;
    }
    if (pressed(this.keyI)) this.toggleInventoryPanel();
    if (pressed(this.keyC)) this.toggleEquipPanel();
    if (pressed(this.keyE) && !this.anyPanel()) this.tryStartTalk();
    if (this.talk || this.transitioning) return;
    if (this.anyPanel() || this.endingPanel.visible || this.pendingChoice) {
      this.syncToSession();this.updateEnvironment();return;
    }

    if(pressed(this.keyY)){this.enterTower();if(this.transitioning)return;}
    if(pressed(this.keyF))this.startNearbyHunt();
    let mx = 0;
    let my = 0;
    if (this.keys.A.isDown) mx -= 1;
    if (this.keys.D.isDown) mx += 1;
    if (this.keys.W.isDown) my -= 1;
    if (this.keys.S.isDown) my += 1;
    let len = Math.hypot(mx, my);
    if(len>0)this.facing={x:mx/len,y:my/len};
    if(pressed(this.keySpace)&&this.surface.runtime.tryDodge()){
      this.dodgeMs=220;this.dodgeDirection={...this.facing};audio.play('dodge');
    }
    if(this.dodgeMs>0){mx=this.dodgeDirection.x;my=this.dodgeDirection.y;len=1;this.dodgeMs=Math.max(0,this.dodgeMs-deltaMs);}
    else if(len===0&&this.keyJ.isDown&&!this.safeSurface(this.player.x,this.player.y)){
      const target=this.surface.nearest(this.player.x,this.player.y,200);
      if(target&&Math.hypot(target.x-this.player.x,target.y-this.player.y)>55){mx=target.x-this.player.x;my=target.y-this.player.y;len=Math.hypot(mx,my);}
    }
    const moveBoost=this.dodgeMs>0?2.8:1;
    if (len > 0) {
      this.tileX += (mx / len) * MOVE_TILES_PER_SEC * this.surface.runtime.speedMultiplier * dt * moveBoost;
      this.tileY += (my / len) * MOVE_TILES_PER_SEC * this.surface.runtime.speedMultiplier * dt * moveBoost;
      this.player.setPosition(this.tileX * TILE_PX, this.tileY * TILE_PX);
      this.player.setFlipX(mx < 0 || (mx === 0 && this.player.flipX));
      this.player.setAngle(Math.sin(this.time.now / 90) * 4);
      this.syncChunks();
    } else this.player.setAngle(0);

    this.checkArrivals();
    this.checkCampSupplies();
    this.updateSurface(deltaMs);
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
  private persistProgress(): boolean {
    this.syncToSession();
    this.session.trackedQuestId=trackedQuest(this.questDefs,this.world,this.session.trackedQuestId)?.id;
    const ok = persistSession(this.session);
    this.saveWarning.setVisible(!ok);
    return ok;
  }

  private saveGame(): boolean {
    this.syncToSession();
    const ok = this.persistProgress();
    if(ok)audio.play('save');
    this.showToast(ok ? '已存档' : '存档失败：浏览器拒绝写入（可能存储空间已满）');
    return ok;
  }

  // ---------- 任务日志 ----------

  private toggleQuestPanel(): void {
    const open = !this.questPanelOpen;
    this.closePanels();
    this.questPanelOpen = open;
    this.questPanel.setVisible(this.questPanelOpen);
    if (this.questPanelOpen) this.refreshQuestPanel();
  }

  /** 主线第 24 章完成时，根据当前标记判定结局并显示（每次完成时判定一次）。 */
  private showEndingIfReached(done: QuestCompletion[]): void {
    if (!done.some((c) => c.questId === 'main_24') && (this.world.questStatus('main_24') !== 'completed' || this.world.hasFlag('ending_reached'))) return;
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

  /** 当前视野（格），由时段和天气决定 */
  private sightTiles = BASE_SIGHT_TILES;

  private toggleSkillPanel(): void {
    const open = !this.skillPanelOpen;
    this.closePanels();
    this.skillPanelOpen = open;
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
    this.skillPanel.setData('full',null).setData('offset',0);
    this.skillPanel.setText([
      '技能树    G 关闭 · B 分支 · N 翻页 · X 重置 · 数字键学习',
      `技能点 ${state.points}   分支：${BRANCH_LABEL[branch]}（第 ${this.skillPage + 1}/${pages} 页）`,
      ...rows,
      `组合技：${combos.length > 0 ? combos.join('、') : '无'}（4 秒内连用对应技能触发）`,
      `重置本分支费用：${resetCost(level)} 金币`,
    ].join('\n'));
    this.renderCards();
  }

  private learnSkill(index: number): void {
    const target = this.skillPageItems()[index];
    if (!target) return;
    const state = treeOf(this.session.player);
    const reason = unlockBlockReason(state, target);
    if (reason === 'already') {
      if(target.combat?.kind==='passive'){this.showToast(`${target.name}：被动已生效 · ${target.combat.description}`);return;}
      bindSkill(this.session.player.skills,this.skillDefs,target.id,this.bindSlot);
      this.persistProgress();this.refreshSkillPanel();this.showToast(`技能栏 ${this.bindSlot+1}：${target.name}`);return;
    }
    if (reason !== null) {
      const text = { already: '已经学会了', 'missing-prereq': '需要先学习前置技能', 'no-points': '技能点不足', unknown: '未知技能' }[reason];
      this.showToast(`${target.name}：${text}`);
      return;
    }
    const before=skillLoadout(this.session.player.skills,this.skillDefs);
    this.session.player.skills.equipped=before;
    unlockSkill(state, target);
    storeTree(this.session.player, state);
    if(before.length<4 && target.combat?.kind!=='passive')bindSkill(this.session.player.skills,this.skillDefs,target.id,before.length);
    this.showToast(`学会了 ${target.name}`);
    this.syncToSession();
    this.persistProgress();
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
    this.persistProgress();
    this.refreshSkillPanel();
  }

  private toggleRepPanel(): void {
    const open = !this.repPanelOpen;
    this.closePanels();
    this.repPanelOpen = open;
    this.repPanel.setVisible(this.repPanelOpen);
    if (this.repPanelOpen) this.refreshRepPanel();
  }

  private refreshRepPanel(): void {
    this.repPanel.setData('full',null).setData('offset',0);
    this.repPanel.setText(['阵营声望（R 关闭）', ...reputationLines(this.world, this.factionDefs)].join('\n'));
    this.renderCards();
  }

  private toggleEquipPanel(): void {
    const open = !this.equipPanelOpen;
    this.closePanels();
    this.equipPanelOpen = open;
    this.equipPanel.setVisible(this.equipPanelOpen);
    if (this.equipPanelOpen) this.refreshEquipPanel();
  }

  private refreshEquipPanel(): void {
    const eq = this.session.player.equipment;
    const stats = combatStats(eq, this.itemDefs, this.affixDefs, this.itemSetDefs,this.session.player.crafting);
    const rows = EQUIP_SLOTS.map((slot, i) => {
      const id = eq[slot];
      const name = id ? (this.itemNames.get(id) ?? id) : '—';
      return `[${i + 1}] ${SLOT_LABEL[slot]}：${name}`;
    });
    this.equipPanel.setData('full',null).setData('offset',0);
    this.equipPanel.setText([
      '装备（C 关闭 · 数字键切换）',
      ...rows,
      `攻击 ${stats.attack}   防御 ${stats.defense}   生命 ${stats.maxHp}`,
      ...equipmentDetailLines(eq, this.itemDefs, this.affixDefs, this.itemSetDefs,this.session.player.crafting),
    ].join('\n'));
    this.renderCards();
  }

  private toggleInventoryPanel(): void {
    const open = !this.invPanelOpen;
    this.closePanels();
    this.invPanelOpen = open;
    this.invPanel.setVisible(this.invPanelOpen);
    if (this.invPanelOpen) this.refreshInventoryPanel();
  }

  private inventoryPageItems():ItemDef[]{
    const items=this.itemDefs.filter(i=>this.world.getItemCount(i.id)>0),pages=Math.max(1,Math.ceil(items.length/6));
    this.inventoryPage=(this.inventoryPage%pages+pages)%pages;return items.slice(this.inventoryPage*6,(this.inventoryPage+1)*6);
  }
  private useInventoryItem(item:ItemDef):void{
    if(item.consumable){this.useSupply(item.id);return;}
    if(equipItem(this.session,item.id,this.itemDefs,this.affixDefs,this.itemSetDefs)){this.persistProgress();this.showToast(`已装备 ${item.name}`);this.refreshInventoryPanel();}
  }
  private useSupply(id:string):void{
    const item=this.itemDefs.find(i=>i.id===id);if(!item)return;
    const p=this.session.player,profile=combatProfile(p.equipment,this.itemDefs,this.affixDefs,this.itemSetDefs,p.crafting);
    const result=useConsumable(this.session,item,profile,{hp:p.hp,mana:p.mana??profile.maxMana});
    this.showToast(result.message);if(!result.ok)return;
    audio.play('pickup');p.hp=result.hp;p.mana=result.mana;this.surface?.syncProfile(profile,p.skills.unlocked,p.hp,p.mana);this.persistProgress();if(this.invPanelOpen)this.refreshInventoryPanel();
  }

  private refreshInventoryPanel(): void {
    const lines = inventoryLines(this.world, [...this.itemNames].map(([id, name]) => ({ id, name })));
    this.invPanel.setData('full',null).setData('offset',0);
    this.invPanel.setText(formatInventory(lines));
    this.renderCards();
  }

  private refreshQuestPanel(): void {
    this.questPanel.setData('full',null).setData('offset',0);
    this.questPanel.setText(formatQuestLog(activeQuestLog(this.questDefs, this.world)));
    this.renderCards();
  }

  private turnQuestPage(delta:number):void {
    if(this.questDetails)this.questDetailPage+=delta;else this.questPageIndex+=delta;
    this.refreshQuestPanel();
  }

  private trackQuest(id:string):void {
    if(this.world.questStatus(id)!=='active')return;
    this.session.trackedQuestId=id;
    this.persistProgress();
    this.refreshQuestPanel();
    this.showToast(`正在追踪：${this.quests.def(id)?.title??id}`);
  }

  // ---------- 地表遭遇 ----------

  // ---------- Seamless surface combat ----------
  private initSurfaceCombat(): void {
    this.streak=new KillStreak();
    this.surfaceEffects=this.add.graphics().setDepth(12);
    const p=this.session.player,profile=combatProfile(p.equipment,this.itemDefs,this.affixDefs,this.itemSetDefs,p.crafting);
    this.surface=new SurfaceCombat(profile,this.skillDefs,p.skills.unlocked,this.comboDefs,p.hp,p.mana??profile.maxMana);
    this.surfaceVisuals=new Map();this.facing={x:1,y:0};this.dodgeMs=0;this.autoAttack=false;this.surfaceSavePending=false;
    this.surface.onHit=(enemy,damage)=>{
      this.floatWorld(enemy.x,enemy.y-40,`−${damage}`,'#ffe4a1');audio.play('hit');
      const view=this.surfaceVisuals.get(enemy.id);if(view){view.body.setTintFill(0xffe8bc);this.time.delayedCall(70,()=>{if(view.body.active)view.body.clearTint();});}
    };
    this.surface.onKill=enemy=>{
      const oldLevel=levelForExp(p.exp),lines=settleSurfaceKill(this.session,enemy,this.surface.runtime.profile.bonuses,id=>this.itemNames.get(id)??id);
      if(!lines.length)return;this.streak.kill();this.showToast(lines.slice(0,4).join('\n'));audio.play(levelForExp(p.exp)>oldLevel?'level':'pickup');
      this.floatWorld(enemy.x,enemy.y-12,'✦ 已拾取','#c7ecad');
      this.surfaceSavePending=true;
    };
    this.surface.onHurt=damage=>{audio.play('hurt');this.floatWorld(this.player.x,this.player.y-50,`−${damage}`,'#ff9c86');this.cameras.main.shake(90,.002);};
    this.combatHud=text(this,640,510,'',13,'#d8d9b2').setOrigin(.5).setBackgroundColor('#10252be6').setPadding(10,5);
    this.surfaceSlots=[];
    for(let i=0;i<4;i++){
      const x=407+i*155,bg=this.add.rectangle(x,559,147,51,0x132e33,.94).setScrollFactor(0).setDepth(215).setStrokeStyle(1,0x68877a).setInteractive({useHandCursor:true});
      const label=text(this,x,559,'',12).setOrigin(.5).setDepth(216);
      bg.on('pointerdown',()=>this.castSurfaceSkill(i));this.surfaceSlots.push({bg,label});
    }
  }

  private floatWorld(x:number,y:number,value:string,color:string):void{
    const t=this.add.text(x,y,value,{fontFamily:UI.font,fontSize:15,color,stroke:'#12282d',strokeThickness:3}).setOrigin(.5).setDepth(25);
    this.tweens.add({targets:t,y:y-32,alpha:0,duration:750,onComplete:()=>t.destroy()});
  }

  private surfaceBlocked():boolean{return audio.panelOpen||!!this.talk||this.anyPanel()||!!this.pendingChoice||this.endingPanel.visible||this.shop.visible||this.transitioning;}
  private safeSurface(x:number,y:number):boolean{
    return Math.hypot(x/16,y/16)<7||Math.hypot(x/16-4,y/16-4)<5||inSettlement({x:x/16,y:y/16},this.places,this.npcPositions);
  }
  private aimSurface():void{
    const target=this.surface.nearest(this.player.x,this.player.y,320);
    if(target){const dx=target.x-this.player.x,dy=target.y-this.player.y,d=Math.hypot(dx,dy)||1;this.facing={x:dx/d,y:dy/d};}
  }
  private castSurfaceSkill(index:number):void{
    if(!this.surface||this.surfaceBlocked())return;
    if(this.safeSurface(this.player.x,this.player.y)){this.showToast('安全区内不能攻击');return;}
    const skill=this.skillDefs.find(s=>s.id===skillLoadout(this.session.player.skills,this.skillDefs)[index]);
    if(!skill){this.showToast('按 G 学习并装配主动技能');return;}
    this.aimSurface();
    const r=this.surface.runtime,result=r.cast(skill.id,this.player,this.facing,this.surface.targets());
    if(result.ok){
      audio.play('skill');
      const color=({fire:0xf1a363,ice:0x9fe3ec,lightning:0xf1df84,dark:0xc5a3ed,holy:0xf4efb3,none:0xa8d7af} as Record<string,number>)[skill.element??'none']??0x9fdaf0;
      const center=result.center??this.player;
      this.surfaceRing(center.x,center.y,skill.combat?.radius??65,color);
      if(['bolt','blast'].includes(skill.combat?.kind??'')){
        const beam=this.add.graphics().setDepth(23).lineStyle(5,color,.8).lineBetween(this.player.x,this.player.y-16,center.x,center.y-16);
        this.tweens.add({targets:beam,alpha:0,duration:230,onComplete:()=>beam.destroy()});
      }
      this.showToast(result.combo?`组合技 · ${result.combo.name}`:skill.name);
    }
    else this.showToast(({mana:'魔力不足',stamina:'耐力不足',cooldown:'技能冷却中',busy:'动作尚未结束',locked:'尚未学会',passive:'被动技能无需释放','no-target':'范围内没有目标',unknown:'技能不可用',dead:'当前无法施法'} as Record<string,string>)[result.reason??'']??'当前无法施法');
    this.session.player.hp=r.actor.hp;this.session.player.mana=r.mana;
  }
  private surfaceRing(x:number,y:number,radius:number,color:number):void{
    const ring=this.add.circle(x,y,radius,color,.08).setStrokeStyle(3,color,.8).setDepth(20);
    this.tweens.add({targets:ring,scale:1.2,alpha:0,duration:240,onComplete:()=>ring.destroy()});
  }
  private updateSurface(deltaMs:number):void{
    const r=this.surface.runtime,p=this.session.player;
    this.streak.tick(deltaMs);
    const available=new Set<string>();
    for(const c of this.chunks.values())for(const spawn of c.spawns){
      if(spawnAvailable(spawn,this.world)&&!this.session.defeated.has(spawn.key)&&Math.hypot(spawn.tileX*16-this.player.x,spawn.tileY*16-this.player.y)<720){available.add(spawn.key);this.surface.addPack(spawn,this.enemyDefs,this.session.defeated);}
    }
    for(const enemy of this.surface.enemies.values())if(!available.has(enemy.spawn.key))this.surface.removePack(enemy.spawn.key);
    const safe=this.safeSurface(this.player.x,this.player.y);
    this.surface.tick(deltaMs,{x:this.player.x,y:this.player.y,safe,protected:this.graceMs>0},(x,y)=>this.safeSurface(x,y));
    if(pressed(this.keyZ)){this.autoAttack=!this.autoAttack;this.showToast(`自动攻击${this.autoAttack?'开启：附近有怪时挥砍':'关闭'}`);}
    if(!safe&&(this.keyJ.isDown||this.autoAttack)&&!r.actor.isDead&&r.basicCooldownMs===0){
      this.aimSurface();const before=r.basicCooldownMs;r.basicAttack(this.player,this.facing,this.surface.targets());
      if(r.basicCooldownMs>before){audio.play('swing');const x=this.player.x+this.facing.x*34,y=this.player.y+this.facing.y*34;this.surfaceRing(x,y,36,0xf0d58c);}
    }
    p.hp=r.actor.hp;p.mana=r.mana;
    if(r.actor.isDead){
      // Rescue to a known safe start. Completed/partial kills stay settled; no gold penalty.
      audio.play('defeat');p.hp=Math.max(1,Math.ceil(r.profile.maxHp*.5));r.actor.hp=p.hp;
      this.streak.reset();
      this.tileX=0;this.tileY=0;this.player.setPosition(0,0);this.graceMs=6000;this.autoAttack=false;this.dodgeMs=0;
      for(const enemy of this.surface.enemies.values()){enemy.engaged=false;enemy.windup=0;}
      this.syncChunks();this.surfaceSavePending=true;this.showToast('旅人将你救回营地 · 恢复一半生命 · 已获得的奖励保留');
    }
    for(const [id,v]of this.surfaceVisuals)if(!this.surface.enemies.has(id)||this.surface.enemies.get(id)!.actor.isDead){v.body.destroy();v.label.destroy();v.bar.destroy();v.warning.destroy();this.surfaceVisuals.delete(id);}
    for(const e of this.surface.targets()){
      let v=this.surfaceVisuals.get(e.id);
      if(!v){
        const body=this.add.image(e.x,e.y,`enemy-${e.def.id}`).setDisplaySize(e.elite?64:44,e.elite?64:44).setOrigin(.5,.85).setDepth(8);
        const label=this.add.text(e.x,e.y-48,`${e.elite?'◆ 精英 · ':''}${e.def.name}`,{fontFamily:UI.font,fontSize:11,color:e.elite?'#ffd17c':'#f3d7b8',backgroundColor:'#10252bb0'}).setOrigin(.5).setDepth(9);
        v={body,label,bar:this.add.graphics().setDepth(10),warning:this.add.graphics().setDepth(7)};this.surfaceVisuals.set(e.id,v);
      }
      const visible=Math.hypot(e.x-this.player.x,e.y-this.player.y)<Math.max(16,this.sightTiles)*16;
      v.body.setPosition(e.x,e.y).setVisible(visible).setFlipX(e.engaged&&e.x>this.player.x);
      v.label.setPosition(e.x,e.y-48).setVisible(visible);
      v.bar.clear();v.warning.clear();
      if(visible){v.bar.fillStyle(0x172b2b,.9).fillRect(e.x-20,e.y-39,40,4).fillStyle(e.engaged?0xe58b72:0x9cbb8c).fillRect(e.x-20,e.y-39,40*Math.max(0,e.actor.hp/e.actor.maxHp),4);
        if(e.windup>0){const radius=enemyTactics(e.def).hitRadius*.65;v.warning.fillStyle(0xff795b,.22).fillCircle(e.aimX,e.aimY,radius).lineStyle(2,0xffaa78,.9).strokeCircle(e.aimX,e.aimY,radius);}
      }
    }
    this.surfaceEffects.clear();
    for(const trap of r.traps){
      this.surfaceEffects.lineStyle(2,0x9bdcbd,.75).strokeCircle(trap.x,trap.y,trap.radius).fillStyle(0x8cddbb,.08).fillCircle(trap.x,trap.y,trap.radius);
      this.surfaceEffects.lineStyle(2,0x9bdcbd,.8).lineBetween(trap.x-8,trap.y,trap.x+8,trap.y).lineBetween(trap.x,trap.y-8,trap.x,trap.y+8);
    }
    if(r.shield>0)this.surfaceEffects.lineStyle(3,0xaed7f1,.65).strokeCircle(this.player.x,this.player.y-15,32);
    this.player.setAlpha(r.actor.isInvulnerable?.55:1);
    const hidden=this.surfaceBlocked();this.combatHud.setVisible(!hidden);
    this.combatHud.setText(`${safe?'安全区':this.surface.engaged?'交战中 · 红圈为攻击预警':'荒野探索'}  ·  魔力 ${Math.floor(r.mana)}  耐力 ${Math.floor(r.stamina)}  ·  J 挥砍  Space 闪避  Z 自动攻击${this.autoAttack?'●':'○'}`);
    const slots=skillLoadout(p.skills,this.skillDefs).map(id=>this.skillDefs.find(s=>s.id===id));
    this.surfaceSlots.forEach((v,i)=>{const s=slots[i],cd=s?r.cooldowns.get(s.id)??0:0;v.bg.setVisible(!hidden);v.label.setVisible(!hidden).setText(s?`${i+1}  ${s.name}\n${cd>0?`冷却 ${(cd/1000).toFixed(1)} 秒`:`${s.manaCost??0} 魔力`}`:`${i+1}  空技能槽\nG 学习 / 装配`);v.bg.setFillStyle(s&&!r.canCast(s.id)?0x2a5047:0x132e33);});
    if(this.surfaceSavePending){this.surfaceSavePending=false;this.rewardLines([]);this.persistProgress();}
  }

  private enterTower():void{
    if(this.surfaceBlocked())return;
    if(this.surface.engaged){this.showToast('请先脱战，再进入试炼塔');return;}
    if(Math.hypot(this.tileX-4,this.tileY-4)>10){this.showToast('返回起始营地商人附近十格内，按 Y 进入试炼塔');return;}
    this.syncToSession();if(!persistSession(this.session)){this.showToast('保存失败，未进入试炼塔，请按 K 重试');return;}
    this.transitioning=true;this.scene.start('TowerScene');
  }

  /** Read-only snapshot used by the paused DOM journal; never accepts a hunt remotely. */
  getHuntJournal():HuntJournalEntry[]{
    return buildHuntJournal(this.session,this.hunts,this.questDefs,this.itemNames);
  }

  private createHuntMarkers():void {
    this.huntMarkers=new Map();
    for(const hunt of this.hunts){
      const flag=this.add.graphics().lineStyle(3,0xd8bb79).lineBetween(0,0,0,-44);
      flag.fillStyle(0xe6b963).fillTriangle(1,-44,29,-34,1,-24);
      const label=this.add.text(0,14,'',{fontFamily:UI.font,fontSize:12,color:'#f2d79c',backgroundColor:'#142a2bdc',align:'center',padding:{x:6,y:4}}).setOrigin(.5,0);
      const root=this.add.container(hunt.tileX*16,hunt.tileY*16,[flag,label]).setDepth(6).setVisible(false);
      this.huntMarkers.set(hunt.key,{root,label});
    }
    this.huntHud=text(this,700,26,'',12,'#e4cea0').setOrigin(.5,0).setAlign('center').setWordWrapWidth(416).setLineSpacing(4).setBackgroundColor('#12282de8').setPadding(12,8).setInteractive({useHandCursor:true});
    this.huntHud.on('pointerdown',()=>{if(!this.surfaceBlocked()&&this.hudHunt&&huntState(this.session,this.hudHunt)==='ready')this.startNearbyHunt(this.hudHunt);});
    this.streakHud=text(this,640,118,'',19,'#f4d18c').setOrigin(.5,0).setVisible(false);
  }
  private startNearbyHunt(requested?:HuntSpawn):void {
    const hunt=requested??this.hunts.filter(h=>huntState(this.session,h)==='ready').sort((a,b)=>Math.hypot(a.tileX-this.tileX,a.tileY-this.tileY)-Math.hypot(b.tileX-this.tileX,b.tileY-this.tileY))[0];
    if(!hunt||Math.hypot(hunt.tileX-this.tileX,hunt.tileY-this.tileY)>5){this.showToast('靠近金色讨伐旗帜后，按 F 开始挑战');return;}
    if(this.surface.engaged){this.showToast('请先脱离当前战斗，再开始讨伐');return;}
    if(startHunt(this.session,hunt,{x:this.tileX,y:this.tileY})){
      this.persistProgress();audio.play('skill');this.showToast(`讨伐开始：${hunt.hunt.title} · 击败首领与全部护卫`);
    }
  }
  private updateHunts():void {
    if(!this.huntHud)return;
    for(const h of this.hunts){
      const view=this.huntMarkers.get(h.key)!,state=huntState(this.session,h);
      view.root.setVisible(state!=='locked'&&Math.hypot(h.tileX-this.tileX,h.tileY-this.tileY)<36);
      view.label.setText(state==='completed'?`${h.hunt.title}\n✓ 已完成`: `${h.hunt.title} · 推荐 Lv.${h.hunt.level}\n${state==='active'?`${huntProgress(this.session,h)}/${h.enemyIds.length} 已击败`:'靠近按 F 接受 · 可选挑战'}`);
      view.root.setAlpha(state==='completed'?.45:1);
    }
    const done=this.hunts.filter(h=>huntState(this.session,h)==='completed').length;
    const choices=this.hunts.filter(h=>['ready','active'].includes(huntState(this.session,h))).sort((a,b)=>Number(huntState(this.session,b)==='active')-Number(huntState(this.session,a)==='active')||Math.hypot(a.tileX-this.tileX,a.tileY-this.tileY)-Math.hypot(b.tileX-this.tileX,b.tileY-this.tileY));
    const hunt=choices[0],hidden=this.surfaceBlocked();
    this.hudHunt=hunt;
    this.huntHud.setVisible(!hidden&&!!hunt);
    if(hunt){const active=huntState(this.session,hunt)==='active',near=Math.hypot(hunt.tileX-this.tileX,hunt.tileY-this.tileY)<=5;
      this.huntHud.setText(`可选讨伐 ${done}/${this.hunts.length} · ${hunt.hunt.title} · 推荐 Lv.${hunt.hunt.level}\n${active?`击败首领与护卫 ${huntProgress(this.session,hunt)}/${hunt.enemyIds.length}`:near?'F / 点击此处接受挑战（不会自动开战）':directionHint({x:this.tileX,y:this.tileY},{x:hunt.tileX,y:hunt.tileY})}\n奖励 ${hunt.hunt.reward.gold} 金币 · ${this.itemNames.get(hunt.hunt.reward.items[0])??'装备'}`);
    }
    this.streakHud.setVisible(!hidden&&this.streak.count>=2).setText(`${this.streak.label} ×${this.streak.count}  ${(this.streak.remainingMs/1000).toFixed(1)}s`);
  }

  private drawSpawnMarker(_spawn:SurfaceSpawn):Phaser.GameObjects.GameObject[]{return [];}

  // ---------- 地点 ----------

  private drawLocationMarkers(): void {
    for (const p of this.places) {
      const px = p.x * TILE_PX;
      const py = p.y * TILE_PX;
      this.add.image(px, py-12, /rift|core|whisper|gate/.test(p.id) ? 'portal' : 'house').setDisplaySize(80,80).setOrigin(.5,.85).setDepth(5);
      if(p.id==='ash_road_camp')this.campSupplyLabel=this.add.text(px,py+32,'营地中心 · 首次补给',{
        fontFamily:UI.font,fontSize:11,color:'#d8d4a4',backgroundColor:'#10252bdd',padding:{x:4,y:2},
      }).setOrigin(.5,0).setDepth(6).setVisible(false);
      this.add.text(px, py - TILE_PX * 5, p.name, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#fff3c4',
        backgroundColor: '#00000088', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 1).setDepth(6);
    }
  }

  private checkCampSupplies():void {
    const camp=this.places.find(p=>p.id==='ash_road_camp');
    const supplies=claimCampSupplies(this.session,camp,{x:this.tileX,y:this.tileY});
    if(!supplies.claimed)return;
    const lines=this.rewardLines([]);
    this.persistProgress();
    this.showToast([`营地首次补给：裂隙碎片 ×${supplies.shards} · 治疗药剂 ×${supplies.potions}`,...lines].join('\n'));
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
      this.persistProgress();
    }
  }

  /** One authoritative layout for sprites, interaction, labels and navigation. */
  private npcTile(npcId: string): PlacedNpc | null {
    return this.npcPositions.get(npcId) ?? null;
  }

  private drawNpcMarkers(): void {
    for (const npc of this.npcRegistry.list()) {
      const tile = this.npcTile(npc.id);
      if (!tile) continue;
      const px = tile.x * TILE_PX, py = tile.y * TILE_PX;
      const highlight = this.add.ellipse(px, py, 40, 15, 0xe0c786, .28)
        .setStrokeStyle(1, 0xe0c786, .8).setDepth(6).setVisible(false);
      this.npcHighlights.set(npc.id, highlight);
      this.add.image(px, py, `actor-${npcRole(npc)}`).setDisplaySize(45,45).setOrigin(.5,.85).setDepth(7);
      const label = this.add.text(px, py - 44, npc.name, {
        fontFamily: UI.font, fontSize: '12px', color: '#d8f2ff',
        backgroundColor: '#10252bee', padding: { x: 5, y: 3 },
      }).setOrigin(.5, 1).setDepth(9).setVisible(false);
      this.npcLabels.set(npc.id, label);
      this.npcQuestMarkers.set(npc.id,this.add.text(px+24,py-30,'',{
        fontFamily:UI.font,fontSize:20,color:'#edcc85',stroke:'#10252b',strokeThickness:4,
      }).setOrigin(.5).setDepth(10).setVisible(false));
    }
  }

  private nearestNpcId(): string | null {
    return nearestNpc(this.npcPositions, {x: this.tileX, y: this.tileY});
  }

  private updateNpcLabels(): void {
    if (this.time.now < this.npcLabelTimer) return;
    this.npcLabelTimer = this.time.now + 100;
    const selected = this.nearestNpcId();
    const hidden = this.anyPanel() || !!this.talk;
    for (const [id, ring] of this.npcHighlights) ring.setVisible(!hidden && id === selected);
    for (const label of this.npcLabels.values()) label.setVisible(false);
    for (const [id,marker] of this.npcQuestMarkers) {
      const tile=this.npcPositions.get(id)!;
      const visible=!hidden && Math.hypot(tile.x-this.tileX,tile.y-this.tileY)<=20;
      const state=visible?npcQuestState(id,this.questDefs,this.world):null;
      marker.setVisible(visible && state?.kind!=='none');
      if(state)marker.setText(state.kind==='ready'?'?':state.kind==='available'?'!':'·').setColor(state.kind==='active'?'#a4b9ad':'#f0d08a');
    }
    if (hidden) return;
    const nearby = [...this.npcPositions.values()]
      .map(n => ({...n, distance: Math.hypot(n.x-this.tileX, n.y-this.tileY)}))
      .filter(n => n.distance <= 12)
      .sort((a,b) => Number(b.id === selected)-Number(a.id === selected) || a.distance-b.distance || (a.id < b.id ? -1 : 1));
    const occupied: Phaser.Geom.Rectangle[] = [];
    for (const npc of nearby) {
      const label = this.npcLabels.get(npc.id)!;
      const state=npcQuestState(npc.id,this.questDefs,this.world);
      const name=this.npcRegistry.get(npc.id)?.name??npc.id;
      label.setText(name+(npc.id===selected?(state.kind==='ready'?' · 可交付':state.kind==='available'?' · 可接取':state.kind==='active'?' · 任务进行中':''):''));
      const bounds = label.getBounds();
      Phaser.Geom.Rectangle.Inflate(bounds, 5, 4);
      if (occupied.some(rect => Phaser.Geom.Intersects.RectangleToRectangle(rect, bounds))) continue;
      label.setVisible(true).setColor(npc.id === selected ? '#ffe5a2' : '#c1d5ca');
      occupied.push(bounds);
    }
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
    this.add.image(px,py,'portal').setDisplaySize(96,112).setOrigin(.5,.85).setDepth(6);
    this.add.text(px, py - TILE_PX * 7, `裂隙地牢 · 第 ${this.session.dungeonFloor} 层（按 E 进入）`, {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#e6d9ff',
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(6);
  }

  private tryStartTalk(): void {
    if (Math.hypot(this.tileX-4,this.tileY-4) <= 3) { this.closePanels(); this.shop.show(); return; }
    const npcId = this.nearestNpcId();
    if (!npcId) {
      this.tryEnterGate();
      return;
    }
    const npc = this.npcRegistry.get(npcId)!;
    // 先接取该 NPC 发布的任务（不进入对话）；再次按 E 才开始对话
    const state=npcQuestState(npcId,this.questDefs,this.world);
    const offered = state.ready>0?[]:this.quests.acceptFromNpc(npcId);
    this.rewardLines([]);
    if (offered.length > 0) {
      this.persistProgress();
      this.npcLabelTimer=0;
      const titles = offered.slice(0,2).map((id) => this.quests.def(id)?.title ?? id).join('、');
      this.showToast(`${npc.name}：已接取 ${offered.length} 项任务\n${titles}${offered.length>2?'…':''} · Q 选择追踪，E 对话交付`);
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
    if(audio.panelOpen || e.repeat)return;
    if (this.shop.visible) { if (/^[1-9]$/.test(e.key)) this.shop.buy(Number(e.key)-1); return; }
    // 有待选的关键抉择且不在对话中：数字键选择选项
    const option = this.pendingChoice && !this.talk && !this.anyPanel() ? this.pendingChoice.options[Number(e.key) - 1] : undefined;
    if (this.pendingChoice && option) {
      resolveKeyChoice(this.pendingChoice, option.id, this.world);
      this.showToast(`你选择了：${option.text}`);
      this.syncToSession();
      this.refreshKeyChoice();
      this.persistProgress();
      return;
    }
    if(this.questPanelOpen && !this.questDetails && !this.talk && /^[1-3]$/.test(e.key)) {
      const item=questPage(this.questDefs,this.world,this.questPageIndex).items[Number(e.key)-1];
      if(item)this.trackQuest(item.id);
      return;
    }
    // 技能面板打开且不在对话中：数字键学习列表中的技能
    if (this.skillPanelOpen && !this.talk && /^[1-9]$/.test(e.key)) {
      this.learnSkill(Number(e.key) - 1);
      return;
    }
    if(!this.talk&&this.invPanelOpen&&/^[1-6]$/.test(e.key)){const item=this.inventoryPageItems()[Number(e.key)-1];if(item)this.useInventoryItem(item);return;}
    // 装备面板打开且不在对话中：数字键 1–6 切换对应槽位
    if (!this.talk && this.equipPanelOpen && /^[1-6]$/.test(e.key)) {
      cycleSlot(this.session, EQUIP_SLOTS[Number(e.key) - 1], this.itemDefs, this.affixDefs, this.itemSetDefs);
      this.persistProgress();
      this.refreshEquipPanel();
      return;
    }
    if(!this.surfaceBlocked()&&/^[1-4]$/.test(e.key)){this.castSurfaceSkill(Number(e.key)-1);return;}
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
      this.persistProgress();
      this.npcLabelTimer=0;
      return;
    }
    this.renderTalk();
  }

  private closeTalk(message: string): void {
    this.talk = null;
    this.dialogueBox.setVisible(false);
    this.dialogueText.setVisible(false);
    this.dialoguePortrait?.setVisible(false);
    if (message) this.showToast(message);
  }

  private renderTalk(): void {
    if (!this.talk) return;
    const node = this.talk.runner.current();
    if (!node) return;
    const npc=this.npcRegistry.get(this.talk.npcId);
    this.dialoguePortrait.setTexture(`actor-${npc?npcRole(npc):'villager'}`).setVisible(true);
    const opts = this.talk.runner.choices();
    const optText = opts.length > 0 ? '\n' + opts.map((o, i) => `[${i + 1}] ${o.text}`).join('\n') : '\n[空格] 继续';
    this.dialogueText.setText(`${node.speaker}\n${node.text}${optText}`).setVisible(true);
    this.dialogueBox.setVisible(true);
  }

  /** 发放任务奖励并返回提示文本行（含升级提示）。 */
  private rewardLines(finished: QuestCompletion[]): string[] {
    const result = settleQuestRewards(this.session, finished,
      (id) => this.quests.def(id)?.title ?? id,
      (id) => this.itemNames.get(id) ?? id);
    const { lines, completed: done } = result;
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
        for(const spawn of loaded.spawns)this.surface.removePack(spawn.key);
        loaded.image.destroy();
        for (const d of loaded.decor) d.destroy();
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
      image.data[o] = Math.min(255, r * shade * .57 + 17);
      image.data[o + 1] = Math.min(255, g * shade * .59 + 20);
      image.data[o + 2] = Math.min(255, b * shade * .60 + 19);
      image.data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const ground=document.createElement('canvas');ground.width=256;ground.height=256;
    const detail=ground.getContext('2d')!;detail.imageSmoothingEnabled=false;detail.drawImage(tex.canvas,0,0,256,256);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const hash=Math.abs(Math.imul((cx*64+x)^374761393,(cy*64+y)^668265263));
      if(chunk.flags[y*64+x] & FLAG_RIVER){if(hash%6===0){detail.fillStyle='rgba(182,211,186,.18)';detail.fillRect(x*4,y*4,3,1);}}
      else if(hash%4===0){detail.fillStyle=hash%2?'rgba(29,57,36,.18)':'rgba(212,212,154,.13)';detail.fillRect(x*4+(hash%3),y*4,1,2);}
    }
    tex.setSize(256,256);ctx.clearRect(0,0,256,256);ctx.drawImage(ground,0,0);tex.refresh();

    const img = this.add
      .image(cx * CHUNK_SIZE * TILE_PX, cy * CHUNK_SIZE * TILE_PX, textureKey)
      .setOrigin(0, 0)
      .setScale(TILE_PX/4)
      .setDepth(0);
    let spawns = surfaceSpawnsForChunk(WORLD_SEED, chunk, this.biomes, this.enemyDefs)
      .filter((s) => !this.session.defeated.has(s.key));
    for(const [i,t] of [[18,-5],[-17,13],[8,22]].entries()){
      const key=`camp-wolves-${i}`;
      if(Math.floor(t[0]/64)===cx && Math.floor(t[1]/64)===cy && !this.session.defeated.has(key))spawns.push({key,tileX:t[0],tileY:t[1],enemyIds:i===2?['ash_wolf']:['ash_wolf','ash_wolf']});
    }
    spawns.push(...roamingPacks(WORLD_SEED,chunk,this.biomes,this.enemyDefs).filter(s=>!this.session.defeated.has(s.key)));
    spawns.push(...this.hunts.filter(h=>Math.floor(h.tileX/64)===cx&&Math.floor(h.tileY/64)===cy&&!this.session.defeated.has(h.key)));
    spawns.push(...this.snowPatrols.filter(s=>Math.floor(s.tileX/64)===cx&&Math.floor(s.tileY/64)===cy&&!this.session.defeated.has(s.key)));
    spawns = spawns.filter(spawn => !inSettlement({x: spawn.tileX, y: spawn.tileY}, this.places, this.npcPositions));
    const markers = spawns.map((s) => ({ spawn: s, objs: this.drawSpawnMarker(s) }));
    const decor: Phaser.GameObjects.Image[] = [];
    for (let i=0; i<80; i++) {
      const lx=(i*23+Math.abs(cx*17))%64,ly=(i*37+Math.abs(cy*11))%64;
      const wx=cx*64+lx,wy=cy*64+ly;
      if (chunk.flags[ly*64+lx] || (Math.abs(wx)<8 && Math.abs(wy)<8) || inSettlement({x: wx, y: wy}, this.places, this.npcPositions)) continue;
      const snowy = this.biomes[chunk.biome[ly*64+lx]]?.id === 'snow';
      decor.push(this.add.image(wx*TILE_PX,wy*TILE_PX,i%5===0?'rock':i%3===0?'bush':'tree').setDisplaySize(i%5===0?36:i%3===0?40:60,i%5===0?32:i%3===0?40:82).setOrigin(.5,.9).setTint(snowy?0xc7ded0:0xffffff).setDepth(3));
    }
    this.chunks.set(key, { chunk, image: img, textureKey, spawns, markers, decor });
  }

  // ---------- 环境与 HUD ----------

  private currentChunk(): Chunk | undefined {
    const { cx, cy } = chunkOf(Math.floor(this.tileX), Math.floor(this.tileY));
    return this.chunks.get(`${cx},${cy}`)?.chunk;
  }

  private inventoryPage=0;
  private questPageIndex=0;
  private questDetails=false;
  private questDetailPage=0;

  private anyPanel(): boolean { return this.questPanelOpen || this.invPanelOpen || this.equipPanelOpen || this.repPanelOpen || this.skillPanelOpen; }

  private closePanels(): void {
    this.questPanelOpen = this.invPanelOpen = this.equipPanelOpen = this.repPanelOpen = this.skillPanelOpen = false;
    this.modalBackdrop?.setVisible(false);this.modalFrame?.setVisible(false);this.cards?.hide();this.loadoutUI?.setVisible(false);
    for (const p of [this.questPanel,this.invPanel,this.equipPanel,this.repPanel,this.skillPanel]) {p?.setVisible(false);p?.setData('full',null);p?.setData('offset',0);}
  }

  private renderLoadout():void{
    if(!this.loadoutUI)return;this.loadoutUI.setVisible(true);
    const slots=skillLoadout(this.session.player.skills,this.skillDefs);
    if (!this.loadoutSignature.changed([slots, this.bindSlot])) return;
    this.loadoutUI.removeAll(true);
    for(let i=0;i<4;i++){
      const x=365+i*182,y=631,chosen=i===this.bindSlot;
      const bg=this.add.rectangle(x,y,172,30,chosen?0x385347:0x172e32).setStrokeStyle(1,chosen?0xd6bf88:0x4e6c60).setInteractive({useHandCursor:true});
      const name=this.skillDefs.find(s=>s.id===slots[i])?.name??'空';
      const t=this.add.text(x,y,`${i+1}  ${name}`,{fontFamily:UI.font,fontSize:13,color:'#dfd3b2'}).setOrigin(.5);
      this.loadoutUI.add([bg,t]);bg.on('pointerdown',()=>{this.bindSlot=i;this.refreshSkillPanel();});
    }
    pinToScreen(this.loadoutUI);
  }

  private renderCards():void {
    if(!this.cards)return;
    if(this.questPanelOpen){
      const page=questPage(this.questDefs,this.world,this.questPageIndex);this.questPageIndex=page.page;
      const selected=trackedQuest(this.questDefs,this.world,this.session.trackedQuestId);
      if(this.questDetails && selected){
        const pages=Math.max(1,Math.ceil(selected.objectives.length/3));
        this.questDetailPage=(this.questDetailPage%pages+pages)%pages;
        const cards=selected.objectives.slice(this.questDetailPage*3,(this.questDetailPage+1)*3).map((obj,i)=>{
          const index=this.questDetailPage*3+i,have=this.world.getQuest(selected.id)?.progress[index]??0,need=obj.count??1;
          return {identity:`${selected.id}:${index}`,title:`${have>=need?'✓':'·'} ${obj.text}`,
            subtitle:`进度 ${Math.min(have,need)}/${need}${obj.type==='talk'?' · 完成其他目标后，对话结束才计入交付':''}`,accent:have>=need?0x91b888:0xd1bd86};
        });
        this.cards.show('任务详情',`${selected.title} · 目标第 ${this.questDetailPage+1}/${pages} 页`,cards,1,
          `奖励：${selected.rewards?.exp??0} 经验 · ${selected.rewards?.gold??0} 金币 · ${selected.rewards?.items?.length??0} 件物品`,[
            {label:'B 上一页',run:()=>this.turnQuestPage(-1)},
            {label:'N 下一页',run:()=>this.turnQuestPage(1)},
            {label:'V 返回列表',run:()=>{this.questDetails=false;this.refreshQuestPanel();}},
          ]);return;
      }
      const cards=page.items.map((q,i)=>{
        const oi=trackedObjective(q,this.world),obj=q.objectives[oi],progress=this.world.getQuest(q.id)?.progress[oi]??0;
        return {identity:q.id,title:`${selected?.id===q.id?'◆ ':''}${q.title}`,key:`${i+1}`,
          subtitle:`${q.type==='main'?'主线':q.type==='side'?'支线':'隐藏'} · ${obj?.text??'等待结算'} ${obj?`${progress}/${obj.count??1}`:''} · 点击追踪`,
          accent:selected?.id===q.id?0xd6bb7c:0x88a98e,onClick:()=>this.trackQuest(q.id)};
      });
      this.cards.show('任务日志',`第 ${page.page+1}/${page.pages} 页 · 点击或数字键 1–3 追踪任务`,cards,1,
        selected?`当前追踪：${selected.title} · Esc 返回探索`:'暂无进行中的任务，靠近 NPC 按 E 接取任务。',[
          {label:'B 上一页',run:()=>this.turnQuestPage(-1)},
          {label:'N 下一页',run:()=>this.turnQuestPage(1)},
          {label:'V 任务详情',run:()=>{this.questDetails=true;this.questDetailPage=0;this.refreshQuestPanel();}},
        ]);return;
    }
    if(this.skillPanelOpen){
      const state=treeOf(this.session.player),branch=this.currentBranch(),pages=Math.ceil(branchSkills(this.skillDefs,branch).length/9);
      const cards=this.skillPageItems().map((skill,i)=>{
        const reason=unlockBlockReason(state,skill),learned=state.unlocked.has(skill.id);
        const equipped=skillLoadout(this.session.player.skills,this.skillDefs).indexOf(skill.id);
        const status=learned?(skill.combat?.kind==='passive'?'被动已生效':equipped>=0?`已装配 ${equipped+1}`:'点击装配'):reason==='missing-prereq'?'需要前置技能':reason==='no-points'?'技能点不足':`消耗 ${skill.cost.skillPoints} 点`;
        return {title:skill.name,key:`${i+1}`,subtitle:`${status} · ${skill.manaCost??0} 魔力\n${skill.combat?.description??''}`,accent:learned?0xd6bb7c:reason?0x4e6861:0x99b88b,onClick:()=>this.learnSkill(i)};
      });
      this.cards.show(`技能树 / ${BRANCH_LABEL[branch]}`,`技能点 ${state.points} · ${this.skillPage+1}/${pages} 页 · 再次点击已学技能装配到栏 ${this.bindSlot+1}`,cards,3,'战斗按 1–4 施放 · 下方选槽位（F 切换） · 4 秒内连用组合技能触发额外效果',[
        {label:'B  切换分支',run:()=>{this.skillBranchIdx=(this.skillBranchIdx+1)%3;this.skillPage=0;this.refreshSkillPanel();}},
        {label:'N  下一页',run:()=>{this.skillPage++;this.refreshSkillPanel();}},
        {label:`X  重置 / ${resetCost(levelForExp(this.session.player.exp))} 金`,run:()=>this.resetSkillBranch()},
      ]);this.renderLoadout();return;
    }
    if(this.equipPanelOpen){
      const p=this.session.player,stats=combatProfile(p.equipment,this.itemDefs,this.affixDefs,this.itemSetDefs,p.crafting);
      const cards=EQUIP_SLOTS.map((slot,i)=>{const item=this.itemDefs.find(t=>t.id===p.equipment[slot]);return {title:`${SLOT_LABEL[slot]}  /  ${item?.name??'未装备'}${item&&p.crafting?.[item.id]?.rank?` +${p.crafting[item.id].rank}`:''}`,key:`${i+1}`,subtitle:item?`基础攻击 +${item.baseDamage??0} 防御 +${item.defense??0}\n${itemAffixes(item,this.affixDefs,p.crafting).map(a=>`${a.name}+${Math.round(a.value*100)/100}${isSupportedModifier(a.stat)?'':'(预留)'}`).join(' · ')}`:'点击从背包中切换装备',accent:item?0xd6bb7c:0x536b62,onClick:()=>{cycleSlot(this.session,slot,this.itemDefs,this.affixDefs,this.itemSetDefs);this.persistProgress();this.refreshEquipPanel();}};});
      this.cards.show('旅人装备',`攻击 ${stats.attack} · 防御 ${stats.defense} · 生命 ${stats.maxHp} · 魔力 ${stats.maxMana} · 暴击 ${Math.round(stats.critChance*100)}%`,cards,2,this.itemSetDefs.map(set=>{const count=Object.values(p.equipment).filter(id=>this.itemDefs.find(i=>i.id===id)?.setId===set.id).length;return `${set.name} ${count}/6 件`;}).join(' · ')+'\n'+(activeSetBonuses(this.itemSetDefs,Object.values(p.equipment).map(id=>this.itemDefs.find(i=>i.id===id)!).filter(Boolean)).map(b=>`${b.pieces}件：${b.text}`).join('；')||'数字键 1–6 切换槽位 · 行囊中点击装备可直接穿戴'),[{label:'营地装备工坊',run:()=>window.dispatchEvent(new Event('rift-open-workshop'))}]);return;
    }
    if(this.invPanelOpen){
      const total=this.itemDefs.filter(i=>this.world.getItemCount(i.id)>0).length,pages=Math.max(1,Math.ceil(total/6));
      const cards=this.inventoryPageItems().map((i,index)=>({title:i.name,key:`${index+1}`,subtitle:`持有 ${this.world.getItemCount(i.id)} 件 · ${i.consumable?`恢复 ${i.consumable.amount} ${i.consumable.resource==='hp'?'生命':'魔力'}`:i.slot?`${SLOT_LABEL[i.slot as keyof typeof SLOT_LABEL]} · 点击装备`:'任务/制作材料'}`,accent:i.type==='material'?0x88b4a2:0xd6bb7c,onClick:i.type==='material'?undefined:()=>this.useInventoryItem(i)}));
      this.cards.show('行囊',`金币 ${this.session.player.gold} · ${total} 种物品 · ${this.inventoryPage+1}/${pages} 页`,cards,2,total?'数字键/点击使用本页物品 · H 治疗 / M 魔力 · 药剂共享 8 秒冷却':'行囊还空着。探索裂隙、完成任务，或者拜访行旅商人。',[{label:'B 上一页',run:()=>{this.inventoryPage--;this.refreshInventoryPanel();}},{label:'N 下一页',run:()=>{this.inventoryPage++;this.refreshInventoryPanel();}}]);return;
    }
    if(this.repPanelOpen){
      const lines=reputationLines(this.world,this.factionDefs);
      this.cards.show('阵营声望','你作出的选择，会被这片大陆记住。',this.factionDefs.map((f,i)=>({title:f.name,subtitle:lines[i]??`${this.world.getReputation(f.id)}`,accent:[0xd5b676,0x8ebbb7,0xc28b76,0x9baa7c,0xa69bc3][i]})),1,'任务与关键抉择影响声望；声望影响部分区域抵达与商店价格。');
    }
  }

  private createInterface(): void {
    this.esc = this.input.keyboard!.addKey('ESC');
    this.shop = new ShopView(this,this.session,this.itemDefs,this.factionDefs,()=>this.shop.hide());
    const camp=this.add.graphics().setDepth(1);
    camp.fillStyle(0x9c9870,.7).fillEllipse(32,64,290,180);
    for(let i=0;i<38;i++){const x=-105+(i*47)%274,y=10+(i*31)%104;camp.fillStyle(i%2?0x808269:0xb0a780,.7).fillEllipse(x,y,12+i%4,7);}
    this.add.image(-5*TILE_PX,-2*TILE_PX,'house').setDisplaySize(122,122).setOrigin(.5,.85).setDepth(5);
    this.add.image(-5*TILE_PX,4*TILE_PX,'actor-guard').setDisplaySize(50,50).setOrigin(.5,.85).setDepth(7);
    this.add.image(4*TILE_PX,2*TILE_PX,'stall').setDisplaySize(110,110).setOrigin(.5,.9).setDepth(6);
    this.add.image(4*TILE_PX,4*TILE_PX,'actor-merchant').setDisplaySize(50,50).setOrigin(.5,.85).setDepth(8);
    this.add.text(4*TILE_PX,4*TILE_PX-58,'行旅商人 · 艾洛',{fontFamily:UI.font,fontSize:12,color:'#e8ce91',backgroundColor:'#132c2c',padding:{x:6,y:4}}).setOrigin(.5).setDepth(8);
    // Replace development diagnostics with a stable, screen-space dashboard.
    for(const child of this.children.list) {
      if(child instanceof Phaser.GameObjects.Text && child.text.startsWith('WASD 移动 · E')) child.setVisible(false);
    }
    panel(this,20,20,420,98);
    this.add.image(66,67,'actor-hero').setDisplaySize(68,68).setScrollFactor(0).setDepth(200);
    text(this,110,37,'裂隙旅人',19,'#e7d9ae');
    this.status=text(this,110,72,'',13,'#b0c7b7');
    this.hpBar=this.add.graphics().setScrollFactor(0).setDepth(201);
    this.hud.setPosition(32,132).setStyle({fontFamily:UI.font,fontSize:'13px',backgroundColor:'#10252be6',padding:{x:12,y:9},color:'#c1cdb1'});
    panel(this,960,20,300,207);
    text(this,979,36,'区域图',13,'#d5bd84');
    this.mini=this.add.graphics().setScrollFactor(0).setDepth(201);
    panel(this,960,242,300,230);
    text(this,980,260,'当前旅程',14,'#d7bd80');
    this.tracker=text(this,980,292,'',13,'#d5dfc8').setWordWrapWidth(256).setLineSpacing(5);
    panel(this,230,650,820,52);
    const actions:[string,()=>void][]=[['Q 任务',()=>this.toggleQuestPanel()],['I 背包',()=>this.toggleInventoryPanel()],['C 装备',()=>this.toggleEquipPanel()],['G 技能',()=>this.toggleSkillPanel()],['R 声望',()=>this.toggleRepPanel()],['K 存档',()=>this.saveGame()]];
    actions.forEach(([label,fn],i)=>button(this,303+i*135,676,124,label,()=>{if(!this.shop.visible && !this.talk && !this.pendingChoice && !this.endingPanel.visible)fn();}));
    this.contextHint=text(this,640,611,'',15,'#eddaad').setOrigin(.5).setBackgroundColor('#10252be8').setPadding(16,9);
    this.modalBackdrop=this.add.rectangle(640,360,1280,720,0x04171a,.65).setScrollFactor(0).setDepth(270).setVisible(false).setInteractive();
    this.modalBackdrop.on('pointerdown',()=>this.closePanels());
    this.modalFrame=panel(this,272,132,736,486,275).setVisible(false);
    for(const p of [this.questPanel,this.invPanel,this.equipPanel,this.repPanel,this.skillPanel])styleModal(p,720,470);
    const wheel=(_pointer:Phaser.Input.Pointer,_objects:unknown,_dx:number,dy:number)=>{
      const p=[this.questPanel,this.invPanel,this.equipPanel,this.repPanel,this.skillPanel].find(p=>p.visible);if(!p)return;
      const full:string=p.getData('full')??p.text;p.setData('full',full);
      const lines=full.split('\n');const offset=Math.max(0,Math.min(Math.max(0,lines.length-12),(p.getData('offset')??0)+(dy>0?2:-2)));
      p.setData('offset',offset);p.setText(lines.slice(offset).join('\n'));
    };
    this.input.on('wheel',wheel);this.events.once('shutdown',()=>this.input.off('wheel',wheel));
    text(this,640,624,'面板支持滚轮浏览 · Esc 关闭',12,'#90a997').setOrigin(.5).setDepth(281).setVisible(false).setName('scrollHint');
    this.toast.setPosition(640,176).setStyle({fontFamily:UI.font,fontSize:15,backgroundColor:'#183832',color:'#e5d4a8',padding:{x:20,y:13}}).setDepth(450);
    this.dialogueBox.setFillStyle(0x10252b,.98).setStrokeStyle(1,UI.gold,.8).setSize(1040,202).setPosition(640,525);
    this.dialogueText.setPosition(280,448).setStyle({fontFamily:UI.font,fontSize:18,lineSpacing:9,wordWrap:{width:840}});
    this.dialoguePortrait=this.add.image(200,530,'actor-villager').setDisplaySize(140,140).setScrollFactor(0).setDepth(302).setVisible(false);
    styleModal(this.endingPanel,800,400);this.endingPanel.setDepth(400);
    this.choicePrompt.setPosition(640,250).setStyle({fontFamily:UI.font,fontSize:18,backgroundColor:'#183832',padding:{x:28,y:28},lineSpacing:16,wordWrap:{width:650}}).setDepth(390);
    this.cards=new CardPanel(this);
    this.loadoutUI=this.add.container(0,0).setScrollFactor(0).setDepth(295).setVisible(false);
    for(const p of [this.questPanel,this.skillPanel,this.invPanel,this.equipPanel,this.repPanel])p.setAlpha(0);
    this.updateInterface();
  }

  private updateInterface(): void {
    if(!this.status)return;
    this.updateNpcLabels();
    this.campSupplyLabel?.setVisible(this.world.questStatus('main_02_ash_road')==='active' && !this.world.hasFlag(CAMP_SUPPLIES_FLAG) && !this.anyPanel() && !this.talk);
    this.modalBackdrop?.setVisible(this.anyPanel());this.modalFrame?.setVisible(this.anyPanel());
    this.children.getByName("scrollHint")?.setActive(this.anyPanel());
    const hint=this.children.getByName("scrollHint") as Phaser.GameObjects.Text|undefined;hint?.setVisible(false);
    const p=this.session.player,stats=combatStats(p.equipment,this.itemDefs,this.affixDefs,this.itemSetDefs,p.crafting);
    this.status.setText(`Lv.${levelForExp(p.exp)}  生命 ${Math.ceil(p.hp)}/${stats.maxHp}  金币 ${p.gold}${p.mana!==undefined?`  魔力 ${Math.floor(p.mana)}`:''}`);
    this.hpBar.clear().fillStyle(0x294343).fillRoundedRect(111,61,300,4,2).fillStyle(0x91b78c).fillRoundedRect(111,61,300*Math.max(0,Math.min(1,p.hp/stats.maxHp)),4,2);
    const active=trackedQuest(this.questList,this.world,this.session.trackedQuestId);
    this.session.trackedQuestId=active?.id;
    const record=active?this.quests.progressOf(active.id):undefined;
    const oi=active?trackedObjective(active,this.world):-1;
    const objective=active?.objectives[oi];
    const guidance=active?questGuidance(active,this.world,{x:this.tileX,y:this.tileY},this.places,this.npcRegistry.list(),this.npcPositions,
      [...new Map([...this.chunks.values()].flatMap(c=>c.spawns).concat(this.snowPatrols).map(s=>[s.key,s])).values()]
        .filter(s=>!this.session.defeated.has(s.key)&&spawnAvailable(s,this.world)),this.enemyDefs):undefined;
    const nav=guidance?.point;
    const destination=guidance?.label?`目标：${guidance.label}`:'';
    const directions=nav?directionHint({x:this.tileX,y:this.tileY},nav):guidance?.hint??'';
    const location=guidance?.location?this.locationRegistry.get(guidance.location):undefined;
    const blocked=location && objective?.type==='reach'?blockReason(this.world,location.region,this.regionGates,this.factionDefs):null;
    const shorten=(s:string,n=21)=>s.length>n?s.slice(0,n-1)+'…':s;
    this.tracker.setText(active?[
      `${active.type==='main'?'主线':active.type==='side'?'支线':'隐藏'} · ${shorten(active.title)}`,
      `${shorten(objective?.text??'目标已达成')} ${oi>=0?`${record?.progress[oi]??0}/${objective?.count??1}`:''}`,
      shorten(destination),directions,blocked?'区域受限：需提升对应阵营声望':(objective?.type==='collect'||objective?.type==='reach'||objective?.type==='kill')&&nav?guidance?.hint??'':'Q 打开日志切换追踪',
    ].filter(Boolean).join('\n'):'暂无进行中的任务 · 靠近 ! NPC 按 E 接取');
    const npc=this.nearestNpcId();
    const merchant=Math.hypot(this.tileX-4,this.tileY-4)<=3;
    const atGate=Math.hypot(this.tileX-GATE_TILE.x,this.tileY-GATE_TILE.y)<=GATE_RADIUS;
    const npcState=npc?npcQuestState(npc,this.questDefs,this.world):undefined;
    const npcAction=npcState?.ready?'交付任务':npcState?.available?'接取任务':npcState?.active?'交谈（任务进行中）':'交谈';
    this.contextHint.setText(this.anyPanel()?'Esc 关闭面板':merchant?'E  与行旅商人交易':npc?`E  与 ${this.npcRegistry.get(npc)?.name} ${npcAction}`:atGate?'E  进入裂隙地牢':'WASD 移动 · J 砍怪 · Space 闪避 · E 互动 · H/M 药剂');
    if(this.time.now<this.miniTimer)return;this.miniTimer=this.time.now+150;
    const g=this.mini;g.clear();
    g.lineStyle(1,0x56746a,.25);for(let i=0;i<5;i++){g.lineBetween(980+i*65,65,980+i*65,205);g.lineBetween(980,65+i*35,1240,65+i*35);}
    const scale=.25;
    for(const place of this.places){const x=1110+(place.x-this.tileX)*scale,y=135+(place.y-this.tileY)*scale;if(x<985||x>1235||y<65||y>201)continue;g.fillStyle(this.session.visited.has(place.id)?0x8bad87:0xd4ba7e).fillCircle(x,y,3);}
    if(nav){const dx=(nav.x-this.tileX)*scale,dy=(nav.y-this.tileY)*scale;const ratio=Math.min(1,115/Math.max(1,Math.abs(dx)),64/Math.max(1,Math.abs(dy)));g.lineStyle(1,0xe1c282,.6).lineBetween(1110,135,1110+dx*ratio,135+dy*ratio);g.fillStyle(0xe1c282).fillCircle(1110+dx*ratio,135+dy*ratio,4);}
    for(const h of this.hunts){if(['locked','completed'].includes(huntState(this.session,h)))continue;const x=1110+(h.tileX-this.tileX)*scale,y=135+(h.tileY-this.tileY)*scale;if(x>985&&x<1235&&y>65&&y<201)g.fillStyle(0xf0b85e).fillRect(x-3,y-3,6,6);}
    g.fillStyle(0xdce7cf).fillTriangle(1110,128,1105,140,1115,140);
  }

  private updateEnvironment(): void {
    if(this.toast.visible && this.time.now>this.toastUntil)this.toast.setVisible(false);
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
    audio.setWeather(weather);
    this.updateHunts();
    const combatHidden=this.surfaceBlocked();
    this.combatHud?.setVisible(!combatHidden);
    this.surfaceSlots.forEach(v=>{v.bg.setVisible(!combatHidden);v.label.setVisible(!combatHidden);});

    // 光照：夜晚越暗，覆盖层越不透明
    this.lightOverlay.setAlpha((1 - time.light) * 0.6);

    const w = WEATHER_OVERLAY[weather];
    this.weatherOverlay.setFillStyle(w.color, w.alpha);

    // 视野：只显示视野内的敌人刷新点；夜晚侦测距离变大
    this.sightTiles = sightRadius(time.phase, weather)+this.skillDefs.filter(s=>s.combat?.kind==='passive'&&this.session.player.skills.unlocked.includes(s.id)).reduce((n,s)=>n+(s.combat?.sightBonus??0),0);
    for (const loaded of this.chunks.values()) {
      for (const m of loaded.markers) {
        const d = Math.hypot(this.tileX - m.spawn.tileX, this.tileY - m.spawn.tileY);
        const visible = d <= this.sightTiles && spawnAvailable(m.spawn,this.world);
        for (const o of m.objs) (o as unknown as { setVisible(v: boolean): unknown }).setVisible(visible);
      }
    }

    const tile = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE * CHUNK_SIZE + (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
    const onRiver = chunk ? (chunk.flags[tile] & FLAG_RIVER) !== 0 : false;
    const onRoad = chunk ? (chunk.flags[tile] & FLAG_ROAD) !== 0 : false;
    const place = onRiver ? '河流' : onRoad ? '道路' : '野外';

    this.hud.setText(`${biome?.name ?? '荒野'}  /  ${place}     第 ${time.day} 日 · ${phaseName(time.phase)} · ${weatherName(weather)}`);
    this.updateInterface();
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
