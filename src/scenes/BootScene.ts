import Phaser from 'phaser';
import { display } from '../config/display';
import { loadGameData } from '../data/loader';

/**
 * 启动场景：加载数据、校验基本结构，然后进入占位场景。
 * 阶段 1 之后会替换为真正的主菜单。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    const data = loadGameData();

    this.add
      .text(display.baseWidth / 2, display.baseHeight / 2 - 40, '裂隙编年史', {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: '#e6d9ff',
      })
      .setOrigin(0.5);

    this.add
      .text(
        display.baseWidth / 2,
        display.baseHeight / 2 + 30,
        `数据已加载：物品 ${data.items.length}，技能 ${data.skills.length}，敌人 ${data.enemies.length}`,
        { fontFamily: 'sans-serif', fontSize: '20px', color: '#9aa0b4' },
      )
      .setOrigin(0.5);

    // 短暂展示启动信息后进入标题菜单
    this.time.delayedCall(800, () => this.scene.start('TitleScene'));
  }
}
