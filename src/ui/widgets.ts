import Phaser from 'phaser';
import { THEME } from './theme';

export interface ButtonOpts {
  scene: Phaser.Scene;
  x: number; y: number;
  w: number; h: number;
  label: string;
  fontSize?: number;
  color?: number;
  textColor?: string;
  onTap: () => void;
  disabled?: boolean;
}

export function makeButton(opts: ButtonOpts): Phaser.GameObjects.Container {
  const { scene, x, y, w, h, label } = opts;
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, opts.color ?? THEME.panelLight, 1).setStrokeStyle(2, THEME.border, 1);
  const txt = scene.add.text(0, 0, label, {
    fontFamily: THEME.font.body,
    fontSize: `${opts.fontSize ?? 18}px`,
    color: opts.textColor ?? THEME.text,
    fontStyle: '600',
  }).setOrigin(0.5);
  c.add([bg, txt]);
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  let isDown = false;
  if (opts.disabled) {
    bg.setFillStyle(THEME.panel, 1);
    txt.setAlpha(0.5);
  } else {
    c.on('pointerdown', () => {
      isDown = true;
      scene.tweens.add({ targets: c, scale: 0.94, duration: 60 });
    });
    c.on('pointerup', () => {
      if (!isDown) return;
      isDown = false;
      scene.tweens.add({ targets: c, scale: 1, duration: 80 });
      opts.onTap();
    });
    c.on('pointerout', () => {
      isDown = false;
      scene.tweens.add({ targets: c, scale: 1, duration: 80 });
    });
  }
  return c;
}

export function showToast(scene: Phaser.Scene, text: string, color = THEME.text) {
  const cam = scene.cameras.main;
  const t = scene.add.text(cam.width / 2, cam.height - 140, text, {
    fontFamily: THEME.font.body,
    fontSize: '18px',
    color,
    backgroundColor: '#1c2230',
    padding: { left: 12, right: 12, top: 8, bottom: 8 },
    fontStyle: '600',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
  scene.tweens.add({
    targets: t,
    y: cam.height - 180,
    alpha: 0,
    duration: 1400,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

export function floatingNumber(scene: Phaser.Scene, x: number, y: number, text: string, color = '#ffffff', big = false) {
  const t = scene.add.text(x, y, text, {
    fontFamily: THEME.font.body,
    fontSize: big ? '32px' : '20px',
    color,
    fontStyle: '800',
    stroke: '#000',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(900);
  scene.tweens.add({
    targets: t,
    y: y - (big ? 90 : 60),
    alpha: 0,
    scale: big ? 1.4 : 1.1,
    duration: big ? 900 : 700,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

export function shake(scene: Phaser.Scene, intensity = 0.005, duration = 120) {
  scene.cameras.main.shake(duration, intensity, true);
}
