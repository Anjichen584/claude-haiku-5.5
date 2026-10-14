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
import { placeLocations, type PlacedLocation } from '../world/placement';

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
  private visited = new Set<string>();
  private toast!: Phaser.GameObjects.Text;
  private toastUntil = 0;

  constructor() {
    super('OverworldScene');
  }

  create(): void {
    const data = loadGameData();
    this.biomes = data.biomes;
    this.world = new WorldState();
    this.quests = new QuestManager(data.quests, this.world);
    this.locationRegistry = new LocationRegistry(data.locations);
    this.places = placeLocations(data.locations, WORLD_SEED);
    this.toast = this.add.text(display.baseWidth / 2, 80, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffe9a8',
      backgroundColor: '#00000088', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200).setVisible(false);
    this.drawLocationMarkers();
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
    this.add.text(16, display.baseHeight - 28, 'WASD 移动 · T 测试房间', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#c9c3dd',
      backgroundColor: '#00000066', padding: { x: 6, y: 3 },
    }).setScrollFactor(0).setDepth(200);

    // 从第一个群系附近出生，保证在有内容的区域
    this.tileX = 0;
    this.tileY = 0;
    this.player.setPosition(this.tileX * TILE_PX, this.tileY * TILE_PX);
    this.syncChunks();
  }

  update(_time: number, deltaMs: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.T)) {
      this.scene.start('TestRoomScene');
      return;
    }
    this.elapsedMs += deltaMs;
    const dt = deltaMs / 1000;

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
    if (this.toast.visible && this.time.now > this.toastUntil) this.toast.setVisible(false);
    this.updateEnvironment();
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
      if (this.visited.has(p.id)) continue;
      const d = Math.hypot(this.tileX - p.x, this.tileY - p.y);
      if (d > ARRIVE_RADIUS) continue;
      this.visited.add(p.id);
      const done = arriveAt(this.locationRegistry, this.quests, p.id);
      const lines = [`抵达：${p.name}`];
      for (const c of done) {
        const title = this.quests.def(c.questId)?.title ?? c.questId;
        lines.push(`任务完成：${title}`);
      }
      this.showToast(lines.join('\n'));
    }
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
    this.chunks.set(key, { chunk, image: img, textureKey });
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
