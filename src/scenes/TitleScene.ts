import Phaser from 'phaser';
import { display } from '../config/display';
import { loadGameData } from '../data/loader';
import { newSession, fromSaveFile, parseSave, SaveError } from '../state/session';
import { readSaveRaw, setSession } from '../state/sessionStore';

/**
 * 标题菜单：新游戏 / 继续。
 * 操作：W/S 或 ↑/↓ 选择 · Enter 或 Space 确认 · 也可以直接点击。
 * 存档损坏或版本不匹配时，“继续”会显示原因，并保留“新游戏”。
 */

type Choice = 'new' | 'continue';

export class TitleScene extends Phaser.Scene {
  private choices: Choice[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private selected = 0;
  private message!: Phaser.GameObjects.Text;
  private continueError: string | null = null;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.selected = 0;
    this.labels = [];
    this.add.rectangle(display.baseWidth / 2, display.baseHeight / 2, display.baseWidth, display.baseHeight, 0x0b0a1a);
    this.add
      .text(display.baseWidth / 2, display.baseHeight / 2 - 120, '裂隙编年史', {
        fontFamily: 'sans-serif', fontSize: '56px', color: '#e6d9ff',
      })
      .setOrigin(0.5);
    this.add
      .text(display.baseWidth / 2, display.baseHeight / 2 - 60, 'Rift Chronicles', {
        fontFamily: 'sans-serif', fontSize: '20px', color: '#8f88aa',
      })
      .setOrigin(0.5);

    const raw = readSaveRaw();
    this.choices = ['new'];
    this.continueError = null;
    if (raw !== null) {
      try {
        parseSave(raw);
        this.choices.push('continue');
      } catch (e) {
        this.continueError = e instanceof SaveError ? e.message : '存档无法读取';
      }
    }

    this.choices.forEach((choice, i) => {
      const label = this.add
        .text(display.baseWidth / 2, display.baseHeight / 2 + 10 + i * 56, choice === 'new' ? '新游戏' : '继续', {
          fontFamily: 'sans-serif', fontSize: '28px', color: '#c9c3dd',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.select(i));
      label.on('pointerdown', () => this.activate(i));
      this.labels.push(label);
    });

    this.message = this.add
      .text(display.baseWidth / 2, display.baseHeight - 90, this.continueError ? `无法继续：${this.continueError}` : '', {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#ff9b9b',
      })
      .setOrigin(0.5);

    this.add
      .text(display.baseWidth / 2, display.baseHeight - 40, 'W/S 选择 · Enter 确认', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#6b7089',
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    const handlers: Array<[string, () => void]> = [
      ['keydown-UP', () => this.move(-1)],
      ['keydown-W', () => this.move(-1)],
      ['keydown-DOWN', () => this.move(1)],
      ['keydown-S', () => this.move(1)],
      ['keydown-ENTER', () => this.activate(this.selected)],
      ['keydown-SPACE', () => this.activate(this.selected)],
    ];
    for (const [event, fn] of handlers) kb.on(event, fn);
    // 场景重新进入时移除旧监听，避免重复触发
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [event, fn] of handlers) kb.off(event, fn);
    });

    this.select(0);
  }

  private move(delta: number): void {
    const n = this.choices.length;
    this.select((this.selected + delta + n) % n);
  }

  private select(index: number): void {
    this.selected = index;
    this.labels.forEach((label, i) => {
      const active = i === index;
      label.setColor(active ? '#fff3c4' : '#c9c3dd').setScale(active ? 1.08 : 1);
    });
  }

  private activate(index: number): void {
    const choice = this.choices[index];
    if (!choice) return;
    const quests = loadGameData().quests;

    if (choice === 'new') {
      setSession(newSession(quests));
      this.scene.start('OverworldScene');
      return;
    }

    try {
      const raw = readSaveRaw();
      if (raw === null) throw new SaveError('没有找到存档');
      setSession(fromSaveFile(parseSave(raw), quests));
      this.scene.start('OverworldScene');
    } catch (e) {
      this.message.setText(`无法继续：${e instanceof Error ? e.message : '未知错误'}`);
    }
  }
}
