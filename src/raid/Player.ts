import Phaser from 'phaser';
import { THEME } from '../ui/theme';

export class Player extends Phaser.GameObjects.Container {
  hp: number;
  hpMax: number;
  speed = 220;
  invuln = 0;
  facing = { x: 1, y: 0 };
  core: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  sword: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, hp: number) {
    super(scene, x, y);
    scene.add.existing(this as Phaser.GameObjects.GameObject);
    this.hp = hp;
    this.hpMax = hp;
    this.shadow = scene.add.ellipse(0, 18, 36, 10, 0x000000, 0.45);
    this.core = scene.add.circle(0, 0, 14, 0x6ad0ff, 1).setStrokeStyle(2, 0x244a66, 1);
    this.ring = scene.add.circle(0, 0, 18, 0x6ad0ff, 0).setStrokeStyle(2, 0xffffff, 0.5);
    this.sword = scene.add.rectangle(16, 0, 22, 4, 0xffffff, 1).setOrigin(0, 0.5);
    this.add([this.shadow, this.ring, this.core, this.sword]);
    this.setDepth(10);
  }

  setFacing(x: number, y: number) {
    const len = Math.hypot(x, y);
    if (len < 0.001) return;
    this.facing.x = x / len;
    this.facing.y = y / len;
    const ang = Math.atan2(this.facing.y, this.facing.x);
    this.sword.setRotation(ang);
  }

  takeDamage(dmg: number, defenseFlat: number): number {
    if (this.invuln > 0) return 0;
    const dealt = Math.max(1, Math.round(dmg - defenseFlat * 0.4));
    this.hp = Math.max(0, this.hp - dealt);
    this.invuln = 0.6;
    return dealt;
  }

  heal(amount: number) {
    this.hp = Math.min(this.hpMax, this.hp + amount);
  }

  step(dt: number, vx: number, vy: number, bounds: Phaser.Geom.Rectangle) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.x += vx * dt;
    this.y += vy * dt;
    this.x = Phaser.Math.Clamp(this.x, bounds.left + 18, bounds.right - 18);
    this.y = Phaser.Math.Clamp(this.y, bounds.top + 18, bounds.bottom - 18);
    // Blink while invulnerable
    this.core.setAlpha(this.invuln > 0 ? (Math.floor(this.invuln * 20) % 2 === 0 ? 0.4 : 1) : 1);
  }

  meleeSwing(scene: Phaser.Scene, range: number) {
    const ang = Math.atan2(this.facing.y, this.facing.x);
    const slash = scene.add.graphics().setDepth(11);
    slash.fillStyle(0xffffff, 0.55);
    slash.beginPath();
    const arc = Math.PI * 0.55;
    const r = range;
    slash.moveTo(this.x, this.y);
    for (let i = 0; i <= 16; i++) {
      const a = ang - arc / 2 + (arc * i) / 16;
      slash.lineTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
    }
    slash.closePath();
    slash.fillPath();
    scene.tweens.add({
      targets: slash, alpha: 0, duration: 180,
      onComplete: () => slash.destroy(),
    });
    return { ang, arc, r };
  }
}
