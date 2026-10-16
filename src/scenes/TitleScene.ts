import {audio} from '../audio/AudioDirector';
import Phaser from 'phaser';
import { landscape, panel, text, UI } from '../ui/theme';
import { loadGameData } from '../data/loader';
import { newSession, fromSaveFile, parseSave, SaveError } from '../state/session';
import { readSaveRaw, readSaveState, setSession } from '../state/sessionStore';

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
  private continueFloor:number|null=null;
  private continueForge=false;
  private continueError: string | null = null;
  private newGamePrompt: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.newGamePrompt = null;
    this.selected = 0;
    this.labels = [];
    landscape(this);
    this.add.rectangle(300,360,650,720,0x0a2027,.65);
    text(this, 92, 100, 'R I F T   C H R O N I C L E S', 15, '#cfbd8d');
    text(this, 88, 158, '裂隙编年史', 66, '#eee8ce');
    text(this, 94, 253, '在破碎的世界里，寻找归途。', 20, '#a9c2b4');
    this.add.graphics().lineStyle(1,UI.gold,.5).lineBetween(95,305,450,305);
    text(this, 94, 332, '第一卷   /   灰烬之路', 14, '#cfbd8d');
    panel(this, 88, 382, 365, 156, 0);
    text(this, 94, 590, '地图砍怪  ·  深入裂隙  ·  原创配乐', 14, '#b6c8b7');
    text(this, 94, 663, '离线单人冒险', 12, '#87a496');
    text(this, 1100, 663, '无缝战斗 · 0.2', 12, '#a7b6a1');

    const saved=readSaveState(),raw=saved.raw;
    this.continueFloor=null;this.continueForge=false;
    this.choices = ['new'];
    this.continueError = null;
    if (raw !== null) {
      try {
        const checkpoint=parseSave(raw);this.continueFloor=checkpoint.dungeon?.activeFloor??null;this.continueForge=!!checkpoint.forge?.run;
        this.choices.push('continue');
      } catch (e) {
        this.continueError = e instanceof SaveError ? e.message : '存档无法读取';
      }
    }

    if(raw===null)text(this,122,475,'尚无存档 · 从第一道裂隙开始',14,'#7f9a8b');
    this.choices.forEach((choice, i) => {
      const label = this.add
        .text(122, 403 + i * 62, choice === 'new' ? '启程  /  新的旅途' : this.continueFloor!==null?`继续  /  地牢第 ${this.continueFloor} 层`:this.continueForge?'继续  /  灰烬熔炉':'继续  /  重返世界', {
          fontFamily: UI.font, fontSize: '22px', color: '#c9c3dd',
        })
        .setOrigin(0,0)
        .setInteractive({ useHandCursor: true });
      label.on('pointerover', () => this.select(i));
      label.on('pointerdown', () => this.activate(i));
      this.labels.push(label);
    });

    this.message = this.add
      .text(94, 553, this.continueError ? `无法继续：${this.continueError}` : saved.source==='backup'?'主存档异常，继续将恢复上一备份（进度可能回退）':'', {
        fontFamily: 'sans-serif', fontSize: '14px', color: saved.source==='backup'?'#e6c685':'#ff9b9b',wordWrap:{width:420},
      })
      .setOrigin(0,0);

    this.add
      .text(94, 625, 'W / S 选择     ↵ 确认     或点击开始', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#91ad9d',
      })
      .setOrigin(0,0);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input is not available');
    const handlers: Array<[string, () => void]> = [
      ['keydown-Y', () => { if (this.newGamePrompt) this.startNewGame(); }],
      ['keydown-N', () => this.cancelNewGame()],
      ['keydown-ESC', () => this.cancelNewGame()],
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
    if (this.newGamePrompt) return;
    this.selected = index;
    this.labels.forEach((label, i) => {
      const active = i === index;
      label.setColor(active ? '#e7cb8c' : '#91aa9c').setScale(active ? 1.02 : 1);
    });
  }

  private activate(index: number): void {
    if (this.newGamePrompt) return;
    if (audio.panelOpen) return;
    const choice = this.choices[index];
    if (!choice) return;
    const quests = loadGameData().quests;

    if (choice === 'new') {
      if (readSaveState().raw !== null) this.confirmNewGame();
      else this.startNewGame();
      return;
    }

    try {
      const raw = readSaveRaw();
      if (raw === null) throw new SaveError('没有找到存档');
      const session=fromSaveFile(parseSave(raw),quests);setSession(session);
      this.scene.start(session.dungeon?.activeFloor!=null?'DungeonScene':session.forge?.run?'AshForgeScene':session.tower?.run?'TowerScene':'OverworldScene',{resume:true});
    } catch (e) {
      this.message.setText(`无法继续：${e instanceof Error ? e.message : '未知错误'}`);
    }
  }
  private confirmNewGame(): void {
    const shade = this.add.rectangle(640, 360, 1280, 720, 0x000000, .8)
      .setInteractive();
    const box = this.add.rectangle(640, 350, 670, 260, 0x14252c)
      .setStrokeStyle(2, UI.gold);
    const heading = text(this, 370, 260, '要开始新的旅途吗？', 28, '#eee8ce');
    const warning = text(this, 370, 318, '新游戏的自动保存会替换当前进度。\n想保留原来的旅途，请取消并选择“继续”。', 19, '#e6c685');
    const yes = text(this, 370, 411, '[Y] 确认新游戏', 22, '#e7cb8c')
      .setInteractive({useHandCursor: true});
    const no = text(this, 690, 411, '[N / Esc] 取消', 22, '#b6c8b7')
      .setInteractive({useHandCursor: true});
    yes.on('pointerdown', () => this.startNewGame());
    no.on('pointerdown', () => this.cancelNewGame());
    this.newGamePrompt = this.add.container(0, 0, [shade, box, heading, warning, yes, no])
      .setDepth(100);
  }

  private cancelNewGame(): void {
    this.newGamePrompt?.destroy();
    this.newGamePrompt = null;
  }

  private startNewGame(): void {
    this.cancelNewGame();
    setSession(newSession(loadGameData().quests));
    this.scene.start('OverworldScene');
  }

}
