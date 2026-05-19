import Phaser from 'phaser';
import { alpha, darken, lighten } from './colors';

/**
 * Canvas-based sprite generator. Produces high-quality stylized art for
 * monsters, enemies, items and tiles, then registers them as Phaser textures.
 *
 * Sprites are drawn at 2x logical size for retina crispness and displayed at
 * their logical size in the scene.
 */

interface CreatureColors {
  body: string;
  accent: string;
  eyeColor?: string;
  pupilColor?: string;
}

const PIXEL_RATIO = 2; // render at 2x for crisp display

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w * PIXEL_RATIO;
  canvas.height = h * PIXEL_RATIO;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

function register(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

// ────────────────────────────────────────────────────────────────────────────
// Drawing primitives
// ────────────────────────────────────────────────────────────────────────────

function dropShadow(ctx: CanvasRenderingContext2D, w: number, h: number, scale = 0.42, opacity = 0.4) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${opacity})`;
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 6, w * scale, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function eyes(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  radius: number,
  opts: { white?: string; pupil?: string; shineOffset?: [number, number] } = {},
) {
  const white = opts.white ?? '#ffffff';
  const pupil = opts.pupil ?? '#1a1a1a';
  const so = opts.shineOffset ?? [-radius * 0.35, -radius * 0.35];

  // Whites
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.arc(x1, y1, radius, 0, Math.PI * 2);
  ctx.arc(x2, y2, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pupils
  const pr = radius * 0.55;
  ctx.fillStyle = pupil;
  ctx.beginPath();
  ctx.arc(x1 + radius * 0.1, y1 + radius * 0.1, pr, 0, Math.PI * 2);
  ctx.arc(x2 + radius * 0.1, y2 + radius * 0.1, pr, 0, Math.PI * 2);
  ctx.fill();

  // Shines
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x1 + radius * 0.1 + so[0], y1 + radius * 0.1 + so[1], pr * 0.4, 0, Math.PI * 2);
  ctx.arc(x2 + radius * 0.1 + so[0], y2 + radius * 0.1 + so[1], pr * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function strokedSmile(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, opacity = 1, color = '#1a1a1a') {
  ctx.save();
  ctx.strokeStyle = alpha(color, opacity);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0.25, Math.PI - 0.25);
  ctx.stroke();
  ctx.restore();
}

// ────────────────────────────────────────────────────────────────────────────
// Slime — drop blob with wavy bottom puddle
// ────────────────────────────────────────────────────────────────────────────

export function drawSlime(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.42, 0.45);

  // Body path
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.10);
  ctx.bezierCurveTo(w * 0.99, h * 0.20, w * 0.96, h * 0.78, w * 0.86, h * 0.90);
  ctx.bezierCurveTo(w * 0.78, h * 0.95, w * 0.70, h * 0.86, w * 0.62, h * 0.92);
  ctx.bezierCurveTo(w * 0.55, h * 0.96, w * 0.45, h * 0.96, w * 0.38, h * 0.92);
  ctx.bezierCurveTo(w * 0.30, h * 0.86, w * 0.22, h * 0.95, w * 0.14, h * 0.90);
  ctx.bezierCurveTo(w * 0.04, h * 0.78, w * 0.01, h * 0.20, cx, h * 0.10);
  ctx.closePath();

  const grad = ctx.createRadialGradient(cx - w * 0.18, h * 0.32, w * 0.04, cx, h * 0.55, w * 0.55);
  grad.addColorStop(0, lighten(c.body, 60));
  grad.addColorStop(0.45, c.body);
  grad.addColorStop(1, darken(c.body, 30));
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Big highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.18, h * 0.30, w * 0.085, h * 0.13, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Tiny highlight
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.05, h * 0.18, w * 0.035, h * 0.05, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeY = h * 0.50;
  eyes(ctx, cx - w * 0.13, eyeY, cx + w * 0.13, eyeY, w * 0.075);

  // Smile
  strokedSmile(ctx, cx, h * 0.66, w * 0.13);
}

// ────────────────────────────────────────────────────────────────────────────
// Goblin — bipedal mischief with pointed ears
// ────────────────────────────────────────────────────────────────────────────

export function drawGoblin(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.40, 0.45);

  // Body (lower torso)
  const bodyGrad = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.95);
  bodyGrad.addColorStop(0, lighten(c.body, 10));
  bodyGrad.addColorStop(1, darken(c.body, 25));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.78, w * 0.32, h * 0.20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Loincloth
  ctx.fillStyle = '#5d4034';
  ctx.fillRect(cx - w * 0.16, h * 0.78, w * 0.32, h * 0.14);
  ctx.strokeStyle = '#3a2820';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w * 0.16, h * 0.78, w * 0.32, h * 0.14);

  // Head with pointed ears
  ctx.beginPath();
  // Left ear
  ctx.moveTo(cx - w * 0.30, h * 0.30);
  ctx.lineTo(cx - w * 0.40, h * 0.18);
  ctx.lineTo(cx - w * 0.22, h * 0.22);
  // Top of head
  ctx.bezierCurveTo(cx - w * 0.20, h * 0.10, cx + w * 0.20, h * 0.10, cx + w * 0.22, h * 0.22);
  // Right ear
  ctx.lineTo(cx + w * 0.40, h * 0.18);
  ctx.lineTo(cx + w * 0.30, h * 0.30);
  // Jaw line down to chin
  ctx.bezierCurveTo(cx + w * 0.30, h * 0.50, cx + w * 0.15, h * 0.55, cx, h * 0.55);
  ctx.bezierCurveTo(cx - w * 0.15, h * 0.55, cx - w * 0.30, h * 0.50, cx - w * 0.30, h * 0.30);
  ctx.closePath();

  const headGrad = ctx.createRadialGradient(cx - w * 0.10, h * 0.25, w * 0.02, cx, h * 0.35, w * 0.40);
  headGrad.addColorStop(0, lighten(c.body, 30));
  headGrad.addColorStop(0.5, c.body);
  headGrad.addColorStop(1, darken(c.body, 20));
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.13, h * 0.25, w * 0.05, h * 0.06, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Yellow slit eyes
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.10, h * 0.36, w * 0.06, h * 0.04, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.10, h * 0.36, w * 0.06, h * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Pupils (vertical slits)
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.10, h * 0.36, w * 0.012, h * 0.025, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.10, h * 0.36, w * 0.012, h * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mischievous grin with tooth
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.10, h * 0.46);
  ctx.bezierCurveTo(cx - w * 0.05, h * 0.50, cx + w * 0.05, h * 0.50, cx + w * 0.10, h * 0.46);
  ctx.stroke();
  // Tooth
  ctx.fillStyle = '#fff8e0';
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.04, h * 0.485);
  ctx.lineTo(cx + w * 0.07, h * 0.485);
  ctx.lineTo(cx + w * 0.055, h * 0.51);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────────────────────
// Wolf — quadruped silhouette
// ────────────────────────────────────────────────────────────────────────────

export function drawWolf(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.45, 0.45);

  ctx.lineJoin = 'round';
  const bodyGrad = ctx.createLinearGradient(0, h * 0.30, 0, h * 0.85);
  bodyGrad.addColorStop(0, lighten(c.body, 25));
  bodyGrad.addColorStop(1, darken(c.body, 25));
  ctx.fillStyle = bodyGrad;

  // Legs
  ctx.fillRect(cx - w * 0.30, h * 0.60, w * 0.10, h * 0.30);
  ctx.fillRect(cx - w * 0.10, h * 0.60, w * 0.10, h * 0.30);
  ctx.fillRect(cx + w * 0.05, h * 0.60, w * 0.10, h * 0.30);
  ctx.fillRect(cx + w * 0.20, h * 0.60, w * 0.10, h * 0.30);

  // Body torso (oval)
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.58, w * 0.40, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Tail
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.38, h * 0.55);
  ctx.bezierCurveTo(cx - w * 0.55, h * 0.45, cx - w * 0.55, h * 0.30, cx - w * 0.45, h * 0.30);
  ctx.bezierCurveTo(cx - w * 0.42, h * 0.40, cx - w * 0.36, h * 0.50, cx - w * 0.36, h * 0.55);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Head + snout
  ctx.beginPath();
  // Head sphere
  ctx.moveTo(cx + w * 0.30, h * 0.45);
  ctx.bezierCurveTo(cx + w * 0.50, h * 0.40, cx + w * 0.50, h * 0.30, cx + w * 0.40, h * 0.28);
  // Top of head with ears
  ctx.lineTo(cx + w * 0.32, h * 0.18);
  ctx.lineTo(cx + w * 0.28, h * 0.30);
  ctx.lineTo(cx + w * 0.20, h * 0.18);
  ctx.lineTo(cx + w * 0.18, h * 0.32);
  // Down
  ctx.bezierCurveTo(cx + w * 0.10, h * 0.40, cx + w * 0.20, h * 0.55, cx + w * 0.30, h * 0.55);
  ctx.closePath();
  const headGrad = ctx.createLinearGradient(0, h * 0.20, 0, h * 0.55);
  headGrad.addColorStop(0, lighten(c.body, 15));
  headGrad.addColorStop(1, darken(c.body, 15));
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Snout
  ctx.fillStyle = darken(c.body, 30);
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.45, h * 0.43, w * 0.07, h * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx + w * 0.51, h * 0.41, w * 0.025, 0, Math.PI * 2);
  ctx.fill();

  // Eye (yellow)
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath();
  ctx.arc(cx + w * 0.32, h * 0.35, w * 0.030, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx + w * 0.33, h * 0.355, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
}

// ────────────────────────────────────────────────────────────────────────────
// Orc — bulky humanoid with tusks
// ────────────────────────────────────────────────────────────────────────────

export function drawOrc(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.46, 0.5);

  // Body (bulky)
  const bodyGrad = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.95);
  bodyGrad.addColorStop(0, lighten(c.body, 15));
  bodyGrad.addColorStop(1, darken(c.body, 25));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.36, h * 0.50);
  ctx.bezierCurveTo(cx - w * 0.46, h * 0.65, cx - w * 0.40, h * 0.92, cx - w * 0.20, h * 0.92);
  ctx.lineTo(cx + w * 0.20, h * 0.92);
  ctx.bezierCurveTo(cx + w * 0.40, h * 0.92, cx + w * 0.46, h * 0.65, cx + w * 0.36, h * 0.50);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Belt
  ctx.fillStyle = '#3a2820';
  ctx.fillRect(cx - w * 0.35, h * 0.78, w * 0.70, h * 0.06);
  ctx.fillStyle = '#a08050';
  ctx.fillRect(cx - w * 0.04, h * 0.78, w * 0.08, h * 0.06);

  // Head
  const headGrad = ctx.createRadialGradient(cx - w * 0.08, h * 0.20, w * 0.02, cx, h * 0.30, w * 0.40);
  headGrad.addColorStop(0, lighten(c.body, 25));
  headGrad.addColorStop(0.6, c.body);
  headGrad.addColorStop(1, darken(c.body, 20));
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.30, w * 0.30, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.10, h * 0.20, w * 0.06, h * 0.05, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Tusks
  ctx.fillStyle = '#fff8e0';
  ctx.strokeStyle = '#3a2820';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.10, h * 0.42);
  ctx.lineTo(cx - w * 0.08, h * 0.50);
  ctx.lineTo(cx - w * 0.04, h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.04, h * 0.42);
  ctx.lineTo(cx + w * 0.08, h * 0.50);
  ctx.lineTo(cx + w * 0.10, h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes (red glow)
  eyes(ctx, cx - w * 0.13, h * 0.30, cx + w * 0.13, h * 0.30, w * 0.058, {
    pupil: '#ff5d6c',
  });

  // Frown
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.08, h * 0.42);
  ctx.bezierCurveTo(cx - w * 0.04, h * 0.40, cx + w * 0.04, h * 0.40, cx + w * 0.08, h * 0.42);
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────────────────────
// Wraith — hooded ghost with glowing eyes
// ────────────────────────────────────────────────────────────────────────────

export function drawWraith(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.44, 0.35);

  // Cloak
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.10);
  ctx.bezierCurveTo(cx + w * 0.45, h * 0.25, cx + w * 0.50, h * 0.85, cx + w * 0.30, h * 0.92);
  ctx.bezierCurveTo(cx + w * 0.20, h * 0.85, cx + w * 0.10, h * 0.94, cx, h * 0.90);
  ctx.bezierCurveTo(cx - w * 0.10, h * 0.94, cx - w * 0.20, h * 0.85, cx - w * 0.30, h * 0.92);
  ctx.bezierCurveTo(cx - w * 0.50, h * 0.85, cx - w * 0.45, h * 0.25, cx, h * 0.10);
  ctx.closePath();

  const cloakGrad = ctx.createLinearGradient(0, h * 0.10, 0, h);
  cloakGrad.addColorStop(0, c.body);
  cloakGrad.addColorStop(0.6, darken(c.body, 25));
  cloakGrad.addColorStop(1, darken(c.body, 50));
  ctx.fillStyle = cloakGrad;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Hood inner shadow (face void)
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.18);
  ctx.bezierCurveTo(cx + w * 0.30, h * 0.30, cx + w * 0.30, h * 0.55, cx, h * 0.55);
  ctx.bezierCurveTo(cx - w * 0.30, h * 0.55, cx - w * 0.30, h * 0.30, cx, h * 0.18);
  ctx.closePath();
  ctx.fillStyle = '#0a0612';
  ctx.fill();

  // Glowing eyes (cyan)
  ctx.shadowColor = '#aef0ff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#aef0ff';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.08, h * 0.40, w * 0.04, h * 0.025, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.08, h * 0.40, w * 0.04, h * 0.025, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Wisps
  ctx.strokeStyle = alpha(lighten(c.body, 30), 0.5);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, h * 0.85);
  ctx.bezierCurveTo(cx - w * 0.25, h * 0.78, cx - w * 0.18, h * 0.75, cx - w * 0.22, h * 0.68);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.20, h * 0.85);
  ctx.bezierCurveTo(cx + w * 0.25, h * 0.78, cx + w * 0.18, h * 0.75, cx + w * 0.22, h * 0.68);
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────────────────────
// Golem — stacked stone cubes
// ────────────────────────────────────────────────────────────────────────────

export function drawGolem(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.50, 0.55);

  // Body cube
  const bodyGrad = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.92);
  bodyGrad.addColorStop(0, lighten(c.body, 20));
  bodyGrad.addColorStop(1, darken(c.body, 30));
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(cx - w * 0.35, h * 0.35, w * 0.70, h * 0.55);
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.accent;
  ctx.strokeRect(cx - w * 0.35, h * 0.35, w * 0.70, h * 0.55);

  // Cracks
  ctx.strokeStyle = darken(c.body, 40);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, h * 0.35);
  ctx.lineTo(cx - w * 0.18, h * 0.55);
  ctx.lineTo(cx - w * 0.10, h * 0.62);
  ctx.moveTo(cx + w * 0.20, h * 0.50);
  ctx.lineTo(cx + w * 0.10, h * 0.70);
  ctx.stroke();

  // Glowing core
  ctx.shadowColor = '#fff1a8';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath();
  ctx.arc(cx, h * 0.62, w * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Head cube
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(cx - w * 0.22, h * 0.10, w * 0.44, h * 0.27);
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.accent;
  ctx.strokeRect(cx - w * 0.22, h * 0.10, w * 0.44, h * 0.27);

  // Glowing eyes
  ctx.shadowColor = '#fff1a8';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#fff1a8';
  ctx.fillRect(cx - w * 0.13, h * 0.20, w * 0.06, h * 0.04);
  ctx.fillRect(cx + w * 0.07, h * 0.20, w * 0.06, h * 0.04);
  ctx.shadowBlur = 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Demon — horned, fanged, fierce
// ────────────────────────────────────────────────────────────────────────────

export function drawDemon(ctx: CanvasRenderingContext2D, w: number, h: number, c: CreatureColors) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.46, 0.55);

  // Wings
  const wingGrad = ctx.createLinearGradient(0, h * 0.20, 0, h * 0.60);
  wingGrad.addColorStop(0, '#3a0810');
  wingGrad.addColorStop(1, '#1a0405');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, h * 0.40);
  ctx.bezierCurveTo(cx - w * 0.55, h * 0.20, cx - w * 0.55, h * 0.55, cx - w * 0.30, h * 0.60);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.20, h * 0.40);
  ctx.bezierCurveTo(cx + w * 0.55, h * 0.20, cx + w * 0.55, h * 0.55, cx + w * 0.30, h * 0.60);
  ctx.closePath();
  ctx.fill();

  // Body
  const bodyGrad = ctx.createLinearGradient(0, h * 0.40, 0, h * 0.92);
  bodyGrad.addColorStop(0, lighten(c.body, 15));
  bodyGrad.addColorStop(1, darken(c.body, 30));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.66, w * 0.30, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Head
  const headGrad = ctx.createRadialGradient(cx - w * 0.08, h * 0.18, w * 0.02, cx, h * 0.30, w * 0.40);
  headGrad.addColorStop(0, lighten(c.body, 25));
  headGrad.addColorStop(0.6, c.body);
  headGrad.addColorStop(1, darken(c.body, 25));
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.32, w * 0.26, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = c.accent;
  ctx.stroke();

  // Horns
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.20, h * 0.18);
  ctx.lineTo(cx - w * 0.30, h * 0.04);
  ctx.lineTo(cx - w * 0.14, h * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.20, h * 0.18);
  ctx.lineTo(cx + w * 0.30, h * 0.04);
  ctx.lineTo(cx + w * 0.14, h * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Glowing eyes
  ctx.shadowColor = '#ffff60';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff1a8';
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.10, h * 0.30, w * 0.05, h * 0.035, -0.2, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.10, h * 0.30, w * 0.05, h * 0.035, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Fanged grin
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, h * 0.42, w * 0.10, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // Fangs
  ctx.fillStyle = '#fff8e0';
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  for (const x of [-w * 0.06, -w * 0.02, w * 0.02, w * 0.06]) {
    ctx.beginPath();
    ctx.moveTo(cx + x - w * 0.012, h * 0.43);
    ctx.lineTo(cx + x + w * 0.012, h * 0.43);
    ctx.lineTo(cx + x, h * 0.47);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Player — knight in armor
// ────────────────────────────────────────────────────────────────────────────

export function drawKnight(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  dropShadow(ctx, w, h, 0.40, 0.5);

  // Body (cloth + breastplate)
  const bodyGrad = ctx.createLinearGradient(0, h * 0.40, 0, h * 0.95);
  bodyGrad.addColorStop(0, '#6ad0ff');
  bodyGrad.addColorStop(1, '#244a66');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.70, w * 0.30, h * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#163040';
  ctx.stroke();

  // Belt
  ctx.fillStyle = '#3a2820';
  ctx.fillRect(cx - w * 0.30, h * 0.78, w * 0.60, h * 0.05);

  // Helmet
  const helmGrad = ctx.createLinearGradient(0, h * 0.10, 0, h * 0.45);
  helmGrad.addColorStop(0, '#cfdfee');
  helmGrad.addColorStop(0.5, '#8ba0b8');
  helmGrad.addColorStop(1, '#3e4d62');
  ctx.fillStyle = helmGrad;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.26, h * 0.40);
  ctx.lineTo(cx - w * 0.26, h * 0.22);
  ctx.bezierCurveTo(cx - w * 0.26, h * 0.10, cx + w * 0.26, h * 0.10, cx + w * 0.26, h * 0.22);
  ctx.lineTo(cx + w * 0.26, h * 0.40);
  ctx.lineTo(cx + w * 0.18, h * 0.42);
  ctx.lineTo(cx - w * 0.18, h * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f2a38';
  ctx.stroke();

  // Visor slit
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(cx - w * 0.18, h * 0.27, w * 0.36, h * 0.05);
  // Visor glow
  ctx.shadowColor = '#6ad0ff';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#aef0ff';
  ctx.fillRect(cx - w * 0.16, h * 0.29, w * 0.06, h * 0.014);
  ctx.fillRect(cx + w * 0.10, h * 0.29, w * 0.06, h * 0.014);
  ctx.shadowBlur = 0;

  // Plume
  ctx.fillStyle = '#ff5d6c';
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.10);
  ctx.bezierCurveTo(cx + w * 0.06, h * 0.04, cx + w * 0.10, h * 0.02, cx + w * 0.04, h * 0.18);
  ctx.bezierCurveTo(cx + w * 0.02, h * 0.10, cx - w * 0.04, h * 0.10, cx, h * 0.10);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#6e1f2a';
  ctx.stroke();

  // Shoulder pauldrons
  for (const sx of [-1, 1]) {
    ctx.fillStyle = helmGrad;
    ctx.beginPath();
    ctx.ellipse(cx + sx * w * 0.30, h * 0.50, w * 0.10, h * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f2a38';
    ctx.stroke();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Item icons — sword, bow, staff, armor, ring
// ────────────────────────────────────────────────────────────────────────────

export function drawSwordIcon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Diagonal sword
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 4);

  // Blade
  const bladeGrad = ctx.createLinearGradient(-w * 0.05, -h * 0.45, w * 0.05, -h * 0.45);
  bladeGrad.addColorStop(0, '#cfdfee');
  bladeGrad.addColorStop(0.5, '#ffffff');
  bladeGrad.addColorStop(1, '#8ba0b8');
  ctx.fillStyle = bladeGrad;
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.45);
  ctx.lineTo(w * 0.05, -h * 0.05);
  ctx.lineTo(-w * 0.05, -h * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1f2a38';
  ctx.stroke();

  // Crossguard
  ctx.fillStyle = '#a07020';
  ctx.fillRect(-w * 0.18, -h * 0.10, w * 0.36, h * 0.05);
  ctx.strokeStyle = '#5a3a10';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w * 0.18, -h * 0.10, w * 0.36, h * 0.05);

  // Handle
  ctx.fillStyle = '#5a3020';
  ctx.fillRect(-w * 0.04, -h * 0.05, w * 0.08, h * 0.20);
  ctx.strokeStyle = '#2a1408';
  ctx.strokeRect(-w * 0.04, -h * 0.05, w * 0.08, h * 0.20);

  // Pommel
  ctx.fillStyle = '#f3c969';
  ctx.beginPath();
  ctx.arc(0, h * 0.18, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a08020';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawBowIcon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Bow
  ctx.save();
  ctx.strokeStyle = '#5a3020';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.30, h * 0.15);
  ctx.bezierCurveTo(w * 0.85, h * 0.30, w * 0.85, h * 0.70, w * 0.30, h * 0.85);
  ctx.stroke();

  // String
  ctx.strokeStyle = '#cfdfee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.17);
  ctx.lineTo(w * 0.55, h * 0.50);
  ctx.lineTo(w * 0.32, h * 0.83);
  ctx.stroke();

  // Arrow on bow
  ctx.strokeStyle = '#a07020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.50);
  ctx.lineTo(w * 0.78, h * 0.50);
  ctx.stroke();
  // Arrow head
  ctx.fillStyle = '#cfdfee';
  ctx.strokeStyle = '#1f2a38';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.78, h * 0.50);
  ctx.lineTo(w * 0.68, h * 0.42);
  ctx.lineTo(w * 0.68, h * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Fletching
  ctx.fillStyle = '#ff5d6c';
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.50);
  ctx.lineTo(w * 0.10, h * 0.40);
  ctx.lineTo(w * 0.18, h * 0.40);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.50);
  ctx.lineTo(w * 0.10, h * 0.60);
  ctx.lineTo(w * 0.18, h * 0.60);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawStaffIcon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  // Pole
  ctx.fillStyle = '#5a3020';
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 1.5;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillRect(-w * 0.04, -h * 0.30, w * 0.08, h * 0.65);
  ctx.strokeRect(-w * 0.04, -h * 0.30, w * 0.08, h * 0.65);

  // Orb glow
  ctx.shadowColor = '#aef0ff';
  ctx.shadowBlur = 18;
  const orbGrad = ctx.createRadialGradient(0, -h * 0.36, w * 0.02, 0, -h * 0.30, w * 0.18);
  orbGrad.addColorStop(0, '#ffffff');
  orbGrad.addColorStop(0.5, '#aef0ff');
  orbGrad.addColorStop(1, '#1f7fb0');
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(0, -h * 0.34, w * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f7fb0';
  ctx.stroke();

  ctx.restore();
}

export function drawArmorIcon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Breastplate
  const grad = ctx.createLinearGradient(0, h * 0.20, 0, h * 0.95);
  grad.addColorStop(0, '#cfdfee');
  grad.addColorStop(0.5, '#8ba0b8');
  grad.addColorStop(1, '#3e4d62');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(w * 0.20, h * 0.20);
  ctx.lineTo(w * 0.80, h * 0.20);
  ctx.lineTo(w * 0.85, h * 0.50);
  ctx.bezierCurveTo(w * 0.80, h * 0.85, w * 0.55, h * 0.95, w * 0.50, h * 0.95);
  ctx.bezierCurveTo(w * 0.45, h * 0.95, w * 0.20, h * 0.85, w * 0.15, h * 0.50);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1f2a38';
  ctx.stroke();

  // Center crest
  ctx.fillStyle = '#f3c969';
  ctx.strokeStyle = '#a08020';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(w * 0.50, h * 0.32);
  ctx.lineTo(w * 0.62, h * 0.50);
  ctx.lineTo(w * 0.50, h * 0.78);
  ctx.lineTo(w * 0.38, h * 0.50);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.30, h * 0.32, w * 0.08, h * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTrinketIcon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Ring
  const ringGrad = ctx.createRadialGradient(w * 0.50, h * 0.55, w * 0.05, w * 0.50, h * 0.55, w * 0.40);
  ringGrad.addColorStop(0, '#fff8e0');
  ringGrad.addColorStop(0.5, '#f3c969');
  ringGrad.addColorStop(1, '#a08020');
  ctx.fillStyle = ringGrad;
  ctx.beginPath();
  ctx.arc(w * 0.50, h * 0.55, w * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0d12';
  ctx.beginPath();
  ctx.arc(w * 0.50, h * 0.55, w * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Gem
  ctx.shadowColor = '#aef0ff';
  ctx.shadowBlur = 14;
  const gemGrad = ctx.createLinearGradient(w * 0.35, h * 0.10, w * 0.65, h * 0.40);
  gemGrad.addColorStop(0, '#ffffff');
  gemGrad.addColorStop(0.5, '#6ad0ff');
  gemGrad.addColorStop(1, '#1f7fb0');
  ctx.fillStyle = gemGrad;
  ctx.beginPath();
  ctx.moveTo(w * 0.50, h * 0.10);
  ctx.lineTo(w * 0.66, h * 0.25);
  ctx.lineTo(w * 0.50, h * 0.40);
  ctx.lineTo(w * 0.34, h * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#163040';
  ctx.stroke();
}

// ────────────────────────────────────────────────────────────────────────────
// Background tiles
// ────────────────────────────────────────────────────────────────────────────

export function drawDungeonTile(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Dark stone with subtle veins
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1a1f2c');
  grad.addColorStop(1, '#10141d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stone block edges
  ctx.strokeStyle = 'rgba(80,90,110,0.4)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Inner shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.strokeRect(2.5, 2.5, w - 5, h - 5);

  // Random veins/cracks
  ctx.strokeStyle = 'rgba(60,70,90,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(w * 0.20, h * 0.10);
  ctx.lineTo(w * 0.30, h * 0.40);
  ctx.lineTo(w * 0.25, h * 0.65);
  ctx.moveTo(w * 0.70, h * 0.30);
  ctx.lineTo(w * 0.80, h * 0.55);
  ctx.stroke();

  // Specks
  ctx.fillStyle = 'rgba(120,130,150,0.30)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(
      Math.random() * (w - 2),
      Math.random() * (h - 2),
      1, 1,
    );
  }
}

export function drawStarBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Vertical gradient: top deep blue, bottom near-black
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1f3a');
  grad.addColorStop(0.5, '#0f1320');
  grad.addColorStop(1, '#070912');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Stars
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6 + 0.3;
    const a = Math.random() * 0.7 + 0.2;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few bright stars with glow
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    ctx.shadowColor = '#aef0ff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Distant nebula wisp
  ctx.fillStyle = 'rgba(106,208,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(w * 0.30, h * 0.40, w * 0.45, h * 0.10, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(192,132,255,0.04)';
  ctx.beginPath();
  ctx.ellipse(w * 0.70, h * 0.65, w * 0.40, h * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

// ────────────────────────────────────────────────────────────────────────────
// Registration entry point
// ────────────────────────────────────────────────────────────────────────────

interface Spec {
  key: string;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

const MONSTER_PRESETS = [
  { key: 'slime',  body: '#7be07b', accent: '#2f6f3a', draw: drawSlime  },
  { key: 'goblin', body: '#8acb6b', accent: '#2c4d2a', draw: drawGoblin },
  { key: 'wolf',   body: '#9aa3b2', accent: '#40485a', draw: drawWolf   },
  { key: 'orc',    body: '#a3754d', accent: '#4b2f1d', draw: drawOrc    },
  { key: 'wraith', body: '#c084ff', accent: '#4d2c80', draw: drawWraith },
  { key: 'golem',  body: '#6ad0ff', accent: '#244a66', draw: drawGolem  },
  { key: 'demon',  body: '#ff5d6c', accent: '#6e1f2a', draw: drawDemon  },
];

const ENEMY_PRESETS = [
  { key: 'enemy_slime',  body: '#7be07b', accent: '#2f6f3a', draw: drawSlime  },
  { key: 'enemy_goblin', body: '#8acb6b', accent: '#2c4d2a', draw: drawGoblin },
  { key: 'enemy_archer', body: '#c084ff', accent: '#4d2c80', draw: drawWraith },
  { key: 'enemy_brute',  body: '#a3754d', accent: '#4b2f1d', draw: drawOrc    },
  { key: 'enemy_boss',   body: '#ff5d6c', accent: '#6e1f2a', draw: drawDemon  },
];

export function registerSprites(scene: Phaser.Scene) {
  // Monsters (clicker, large)
  for (const p of MONSTER_PRESETS) {
    const { canvas, ctx } = makeCanvas(192, 192);
    p.draw(ctx, 192, 192, { body: p.body, accent: p.accent });
    register(scene, p.key, canvas);
  }
  // Enemies (raid, small)
  for (const p of ENEMY_PRESETS) {
    const { canvas, ctx } = makeCanvas(96, 96);
    p.draw(ctx, 96, 96, { body: p.body, accent: p.accent });
    register(scene, p.key, canvas);
  }

  // Player
  {
    const { canvas, ctx } = makeCanvas(72, 72);
    drawKnight(ctx, 72, 72);
    register(scene, 'player', canvas);
  }

  // Item icons (in 64x64)
  const iconSpecs: Spec[] = [
    { key: 'icon_sword',   w: 64, h: 64, draw: drawSwordIcon },
    { key: 'icon_bow',     w: 64, h: 64, draw: drawBowIcon },
    { key: 'icon_staff',   w: 64, h: 64, draw: drawStaffIcon },
    { key: 'icon_armor',   w: 64, h: 64, draw: drawArmorIcon },
    { key: 'icon_trinket', w: 64, h: 64, draw: drawTrinketIcon },
  ];
  for (const s of iconSpecs) {
    const { canvas, ctx } = makeCanvas(s.w, s.h);
    s.draw(ctx, s.w, s.h);
    register(scene, s.key, canvas);
  }

  // Tiles & backgrounds
  {
    const { canvas, ctx } = makeCanvas(64, 64);
    drawDungeonTile(ctx, 64, 64);
    register(scene, 'dungeon_tile', canvas);
  }
  {
    const { canvas, ctx } = makeCanvas(540, 960);
    drawStarBg(ctx, 540, 960);
    register(scene, 'starfield_bg', canvas);
  }
}
