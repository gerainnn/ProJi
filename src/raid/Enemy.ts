import Phaser from 'phaser';
import type { EnemyTemplate } from '../data/enemies';
import { THEME } from '../ui/theme';

export class Enemy extends Phaser.GameObjects.Container {
  tpl: EnemyTemplate;
  hp: number;
  hpMax: number;
  rangedCd = 0;
  hitFlash = 0;
  knockbackX = 0;
  knockbackY = 0;
  core: Phaser.GameObjects.Arc;
  shadow: Phaser.GameObjects.Ellipse;
  hpBarBg!: Phaser.GameObjects.Rectangle;
  hpBar!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, tpl: EnemyTemplate, hpScale = 1) {
    super(scene, x, y);
    scene.add.existing(this as Phaser.GameObjects.GameObject);
    this.tpl = tpl;
    this.hpMax = Math.round(tpl.hp * hpScale);
    this.hp = this.hpMax;
    this.shadow = scene.add.ellipse(0, tpl.size * 0.7, tpl.size * 1.6, tpl.size * 0.5, 0x000000, 0.45);
    this.core = scene.add.circle(0, 0, tpl.size, tpl.body, 1).setStrokeStyle(2, tpl.accent, 1);
    // Eyes
    const eyeOffset = tpl.size * 0.3;
    const eL = scene.add.circle(-eyeOffset, -tpl.size * 0.1, Math.max(2, tpl.size * 0.13), 0x111111);
    const eR = scene.add.circle(eyeOffset, -tpl.size * 0.1, Math.max(2, tpl.size * 0.13), 0x111111);
    this.hpBarBg = scene.add.rectangle(0, -tpl.size - 8, tpl.size * 2.2, 4, 0x000000, 0.6);
    this.hpBar = scene.add.rectangle(0, -tpl.size - 8, tpl.size * 2.2, 4, 0xff5d6c, 1);
    this.hpBar.setOrigin(0.5);
    this.add([this.shadow, this.core, eL, eR, this.hpBarBg, this.hpBar]);
    this.setDepth(8);
  }

  takeDamage(dmg: number, kx = 0, ky = 0): boolean {
    this.hp -= dmg;
    this.hitFlash = 0.12;
    this.knockbackX += kx;
    this.knockbackY += ky;
    return this.hp <= 0;
  }

  step(dt: number, target: { x: number; y: number }, bounds: Phaser.Geom.Rectangle): { fire?: { x: number; y: number; angle: number; speed: number; dmg: number } } {
    // Hit flash effect
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      this.core.setFillStyle(0xffffff);
    } else {
      this.core.setFillStyle(this.tpl.body);
    }
    // Apply knockback decay
    if (Math.abs(this.knockbackX) > 0.01 || Math.abs(this.knockbackY) > 0.01) {
      this.x += this.knockbackX * dt;
      this.y += this.knockbackY * dt;
      this.knockbackX *= Math.pow(0.001, dt);
      this.knockbackY *= Math.pow(0.001, dt);
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    let fire: { x: number; y: number; angle: number; speed: number; dmg: number } | undefined;
    if (this.tpl.ranged) {
      const desired = this.tpl.ranged.range * 0.7;
      let mx = 0, my = 0;
      if (dist > desired + 30) { mx = dx / dist; my = dy / dist; }
      else if (dist < desired - 30) { mx = -dx / dist; my = -dy / dist; }
      this.x += mx * this.tpl.speed * dt;
      this.y += my * this.tpl.speed * dt;
      this.rangedCd -= dt * 1000;
      if (this.rangedCd <= 0 && dist < this.tpl.ranged.range) {
        this.rangedCd = this.tpl.ranged.cooldown;
        const ang = Math.atan2(dy, dx);
        fire = { x: this.x, y: this.y, angle: ang, speed: this.tpl.ranged.speed, dmg: this.tpl.ranged.dmg };
      }
    } else {
      // melee chase
      if (dist > 1) {
        this.x += (dx / dist) * this.tpl.speed * dt;
        this.y += (dy / dist) * this.tpl.speed * dt;
      }
    }
    this.x = Phaser.Math.Clamp(this.x, bounds.left + this.tpl.size, bounds.right - this.tpl.size);
    this.y = Phaser.Math.Clamp(this.y, bounds.top + this.tpl.size, bounds.bottom - this.tpl.size);
    this.hpBar.scaleX = Math.max(0, this.hp / this.hpMax);
    return { fire };
  }
}
