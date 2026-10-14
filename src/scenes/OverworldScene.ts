import Phaser from 'phaser';
import { display } from '../config/display';
import { CHUNK_SIZE, FLAG_RIVER, FLAG_ROAD, chunkOf, generateChunk, type Chunk } from '../world/chunk';
import { DAY_LENGTH_MS, getDayState } from '../world/time';
import { rollWeather, type Weather } from '../world/weather';
import { loadGameData } from '../data/loader';
import type { BiomeDef } from '../data/schema';
import { WorldState } from '../state/WorldState';
import { QuestManager } from '../narrative/QuestManager';
import { LocationRegistry, arriveAt } from '../world/locations';
import { NpcRegistry, startTalk, type TalkSession } from '../world/npcs';
import { placeLocations, type PlacedLocation } from '../world/placement';
import { surfaceSpawnsForChunk, type EncounterRequest, type SurfaceSpawn } from '../world/encounters';
import { activeQuestLog, formatQuestLog } from '../narrative/questLog';
import { getSession, setSession, writeSaveRaw } from '../state/sessionStore';
import { newSession, serializeSave, toSaveFile, type GameSession } from '../state/session';
import type { EnemyDef, QuestDef } from '../data/schema';

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
  markers: Phaser.GameObjects.GameObject[];
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
  private questPanel!: Phaser.GameObjects.Text;
  private questPanelOpen = false;
  private keyQ!: Phaser.Input.Keyboard.Key;
  private keyK!: Phaser.Input.Keyboard.Key;
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
    this.keyK = keyboard.addKey('K');
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
    this.add.text(16, display.baseHeight - 28, 'WASD 移动 · E 对话 · Q 任务 · K 存档 · T 测试房间', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#c9c3dd',
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setScrollFactor(0).setDepth(200);
    this.questPanel = this.add.text(display.baseWidth - 16, 12, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#f4f0ff', lineSpacing: 4,
      backgroundColor: '#0b0a1acc', padding: { x: 10, y: 8 }, wordWrap: { width: 360 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(250).setVisible(false);

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
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) this.saveGame();
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
    const ok = writeSaveRaw(serializeSave(toSaveFile(this.session)));
    this.showToast(ok ? '已存档' : '存档失败：浏览器拒绝写入（可能存储空间已满）');
    return ok;
  }

  // ---------- 任务日志 ----------

  private toggleQuestPanel(): void {
    this.questPanelOpen = !this.questPanelOpen;
    this.questPanel.setVisible(this.questPanelOpen);
    if (this.questPanelOpen) this.refreshQuestPanel();
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
        if (d > ENCOUNTER_RADIUS) continue;
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
      if (d > ARRIVE_RADIUS) continue;
      this.session.visited.add(p.id);
      const done = arriveAt(this.locationRegistry, this.quests, p.id);
      const lines = [`抵达：${p.name}`];
      for (const c of done) {
        const title = this.quests.def(c.questId)?.title ?? c.questId;
        lines.push(`任务完成：${title}`);
      }
      this.showToast(lines.join('\n'));
      // 抵达新地点时自动存档（写入失败不打断游戏）
      this.syncToSession();
      writeSaveRaw(serializeSave(toSaveFile(this.session)));
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
      this.add.text(px, py - TILE_PX * 2, npc.name, {
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

  private tryStartTalk(): void {
    const npcId = this.nearestNpcId();
    if (!npcId) return;
    const npc = this.npcRegistry.get(npcId)!;
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
      const lines: string[] = [];
      for (const c of done) lines.push(`任务完成：${this.quests.def(c.questId)?.title ?? c.questId}`);
      this.closeTalk(lines.join('\n'));
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
        for (const m of loaded.markers) m.destroy();
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
    const markers = spawns.flatMap((s) => this.drawSpawnMarker(s));
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

    const tile = ((ty % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE * CHUNK_SIZE + (((tx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE);
    const onRiver = chunk ? (chunk.flags[tile] & FLAG_RIVER) !== 0 : false;
    const onRoad = chunk ? (chunk.flags[tile] & FLAG_ROAD) !== 0 : false;
    const place = onRiver ? '河流' : onRoad ? '道路' : '野外';

    this.hud.setText([
      `群系 ${biome?.name ?? '未知'} · ${place}   坐标 ${tx}, ${ty}`,
      `第 ${time.day} 日 · ${phaseName(time.phase)}   天气 ${weatherName(weather)}`,
      `已加载区块 ${this.chunks.size}`,
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
