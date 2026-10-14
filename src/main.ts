import Phaser from 'phaser';
import { display } from './config/display';
import { BootScene } from './scenes/BootScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: display.baseWidth,
  height: display.baseHeight,
  backgroundColor: display.backgroundColor,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});

// 便于调试时在控制台访问
(window as unknown as { __game: Phaser.Game }).__game = game;
