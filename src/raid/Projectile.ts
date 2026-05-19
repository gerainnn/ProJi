import Phaser from 'phaser';
import { THEME } from '../ui/theme';

export type ProjectileTeam = 'player' | 'enemy';

export class Projectile extends Phaser.GameObjects.Container {
  team: ProjectileTeam;
  damage: number;
  vx: number;
  vy: number;
  life: number;
  core: Phaser.GameObjects.Arc;
  trail: Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    angle: number, speed: number,
    damage: number, team: ProjectileTeam,
  ) {
    super(scene, x, y);
    scene.add.existing(this as Phaser.GameObjects.GameObject);
    this.team = team;
    this.damage = damage;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.6;
    const color = team === 'player' ? 0xfff1a8 : 0xff8e8e;
    this.trail = scene.add.circle(0, 0, 8, color, 0.35).setBlendMode(Phaser.BlendModes.ADD);
    this.core = scene.add.circle(0, 0, 4, color, 1).setStrokeStyle(1, 0xffffff, 0.7);
    this.add([this.trail, this.core]);
    this.setDepth(20);
  }

  step(dt: number, bounds: Phaser.Geom.Rectangle): boolean {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) return false;
    if (!Phaser.Geom.Rectangle.Contains(bounds, this.x, this.y)) return false;
    return true;
  }
}
