import {AshForgeScene} from './scenes/AshForgeScene';
import {TowerScene} from './scenes/TowerScene';
import {installAudio} from './audio/installAudio';
import Phaser from 'phaser';
import { display } from './config/display';
import { BootScene } from './scenes/BootScene';
import { OverworldScene } from './scenes/OverworldScene';
import { TestRoomScene } from './scenes/TestRoomScene';
import { TitleScene } from './scenes/TitleScene';
import { DungeonScene } from './scenes/DungeonScene';

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
  scene: [BootScene, TitleScene, AshForgeScene, TowerScene, OverworldScene, TestRoomScene, DungeonScene],
});

// 便于调试时在控制台访问
(window as unknown as { __game: Phaser.Game }).__game = game;

installAudio(game);
