import Phaser from 'phaser';
import { THEME } from '../ui/theme';

/**
 * Generates programmatic textures used across the game.
 * Keeps the build asset-free so it runs on mobile out of the box.
 */
export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    this.makeCircle('px-circle-w', 64, 0xffffff);
    this.makeCircle('px-circle-soft', 128, 0xffffff, 0.6);
    this.makeRing('px-ring', 64, 6, 0xffffff);
    this.makeRect('px-rect-w', 8, 8, 0xffffff);
    this.makeRect('px-pixel', 2, 2, 0xffffff);
    this.makeStar('px-star', 64, 5, 0xffffff);
    this.makeArrow('px-arrow', 0xffffff);
    // Particle dot
    this.makeCircle('px-dot', 16, 0xffffff);

    // Tile texture for raid floor
    this.makeFloorTile('floor-tile', 64);

    // Done — start clicker + persistent HUD
    this.scene.start('ClickerScene');
    this.scene.launch('HudScene');
  }

  private makeCircle(key: string, size: number, color: number, alpha = 1) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, alpha);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeRing(key: string, size: number, thickness: number, color: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.lineStyle(thickness, color, 1);
    g.strokeCircle(size / 2, size / 2, size / 2 - thickness / 2);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeRect(key: string, w: number, h: number, color: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private makeStar(key: string, size: number, points: number, color: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const cx = size / 2, cy = size / 2;
    const outer = size / 2, inner = outer * 0.45;
    g.fillStyle(color, 1);
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / points) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillPath();
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeArrow(key: string, color: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(color, 1);
    // arrow pointing right, shape 24x8
    g.beginPath();
    g.moveTo(0, 2);
    g.lineTo(16, 2);
    g.lineTo(16, 0);
    g.lineTo(24, 4);
    g.lineTo(16, 8);
    g.lineTo(16, 6);
    g.lineTo(0, 6);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, 24, 8);
    g.destroy();
  }

  private makeFloorTile(key: string, size: number) {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(THEME.panel, 1);
    g.fillRect(0, 0, size, size);
    g.lineStyle(1, THEME.border, 0.6);
    g.strokeRect(0.5, 0.5, size - 1, size - 1);
    // subtle inner decoration
    g.fillStyle(THEME.panelLight, 0.6);
    g.fillRect(size / 2 - 2, size / 2 - 2, 4, 4);
    g.generateTexture(key, size, size);
    g.destroy();
  }
}
