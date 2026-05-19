import Phaser from 'phaser';

/**
 * Floating virtual joystick. Activates wherever the user puts a finger
 * inside the configured zone, and returns a normalized {x,y} vector
 * each frame.
 */
export class Joystick {
  private scene: Phaser.Scene;
  private base!: Phaser.GameObjects.Arc;
  private knob!: Phaser.GameObjects.Arc;
  private zone!: Phaser.GameObjects.Zone;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private maxRadius = 60;
  vec = { x: 0, y: 0 };
  active = false;

  constructor(scene: Phaser.Scene, zoneX: number, zoneY: number, zoneW: number, zoneH: number) {
    this.scene = scene;
    this.zone = scene.add.zone(zoneX, zoneY, zoneW, zoneH).setOrigin(0).setInteractive();
    this.zone.setDepth(1500);
    this.base = scene.add.circle(-200, -200, 56, 0xffffff, 0.08).setStrokeStyle(2, 0xffffff, 0.18).setDepth(1501);
    this.knob = scene.add.circle(-200, -200, 28, 0xffffff, 0.22).setStrokeStyle(2, 0xffffff, 0.5).setDepth(1502);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== null) return;
      this.pointerId = p.id;
      this.originX = p.x;
      this.originY = p.y;
      this.base.setPosition(p.x, p.y);
      this.knob.setPosition(p.x, p.y);
      this.active = true;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== p.id) return;
      let dx = p.x - this.originX;
      let dy = p.y - this.originY;
      const len = Math.hypot(dx, dy);
      const r = Math.min(len, this.maxRadius);
      if (len > 0) {
        dx = (dx / len) * r;
        dy = (dy / len) * r;
      }
      this.knob.setPosition(this.originX + dx, this.originY + dy);
      const norm = r / this.maxRadius;
      this.vec.x = (dx / this.maxRadius);
      this.vec.y = (dy / this.maxRadius);
      // Optional dead zone
      if (norm < 0.12) { this.vec.x = 0; this.vec.y = 0; }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== p.id) return;
      this.pointerId = null;
      this.active = false;
      this.vec.x = 0;
      this.vec.y = 0;
      this.base.setPosition(-200, -200);
      this.knob.setPosition(-200, -200);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    scene.input.on('pointercancel', release);
  }

  destroy() {
    this.zone.destroy();
    this.base.destroy();
    this.knob.destroy();
  }
}
