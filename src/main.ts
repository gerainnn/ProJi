import Phaser from 'phaser';
import { THEME } from './ui/theme';
import { BootScene } from './scenes/BootScene';
import { ClickerScene } from './scenes/ClickerScene';
import { RaidScene } from './scenes/RaidScene';
import { HudScene } from './scenes/HudScene';
import { InventoryScene } from './scenes/InventoryScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { ResultScene } from './scenes/ResultScene';
import { store } from './core/store';

// Boot the store first so everything else has state
store.load();

const parent = document.getElementById('app')!;
const boot = document.getElementById('boot');
if (boot) boot.remove();

new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: THEME.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  input: { activePointers: 3 },
  fps: { target: 60, smoothStep: true },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  scene: [BootScene, ClickerScene, RaidScene, InventoryScene, UpgradeScene, HudScene, ResultScene],
});
