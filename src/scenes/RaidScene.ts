import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import { store } from '../core/store';
import { Joystick } from '../raid/Joystick';
import { Player } from '../raid/Player';
import { Enemy } from '../raid/Enemy';
import { Projectile } from '../raid/Projectile';
import { pickEnemyForRoom } from '../data/enemies';
import { rollItem } from '../data/items';
import { rng } from '../core/rng';
import { floatingNumber, makeButton, shake } from '../ui/widgets';
import { sfx } from '../core/sfx';

const ROOMS_PER_RAID = 5;

export class RaidScene extends Phaser.Scene {
  private bounds!: Phaser.Geom.Rectangle;
  private floor!: Phaser.GameObjects.TileSprite;
  private wallsGfx!: Phaser.GameObjects.Graphics;
  private joystick!: Joystick;
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private currentRoom = 0;
  private rewardGold = 0;
  private rewardShards = 0;
  private rewardItems: ReturnType<typeof rollItem>[] = [];
  private exitButton!: Phaser.GameObjects.Container;
  private hpBar!: Phaser.GameObjects.Graphics;
  private roomText!: Phaser.GameObjects.Text;
  private nextRoomBtn!: Phaser.GameObjects.Container;
  private attackCd = 0;

  constructor() { super('RaidScene'); }

  create() {
    const { width, height } = this.scale;
    this.bounds = new Phaser.Geom.Rectangle(20, 90, width - 40, height - 240);

    // Dungeon stone floor
    this.floor = this.add.tileSprite(this.bounds.centerX, this.bounds.centerY, this.bounds.width, this.bounds.height, 'dungeon_tile').setDepth(-10);

    this.wallsGfx = this.add.graphics().setDepth(-5);
    this.drawWalls();

    this.add.rectangle(width / 2, 30, width - 24, 50, THEME.panel, 0.95).setStrokeStyle(2, THEME.border, 1);
    this.roomText = this.add.text(width / 2, 30, '', {
      fontFamily: THEME.font.body, fontSize: '16px', color: THEME.text, fontStyle: '800',
    }).setOrigin(0.5);
    this.exitButton = makeButton({
      scene: this, x: 60, y: 30, w: 90, h: 40, label: '⏏ Выйти',
      color: 0x6e1f2a,
      onTap: () => this.extract(false),
    });

    this.player = new Player(this, this.bounds.centerX, this.bounds.bottom - 80, store.raidPlayerStartHp());
    this.hpBar = this.add.graphics().setDepth(1000);
    this.joystick = new Joystick(this, 0, height - 220, width, 220);

    this.currentRoom = 0;
    this.startRoom(0);

    this.events.on('shutdown', () => this.cleanup());
  }

  private cleanup() {
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];
    this.projectiles.forEach((p) => p.destroy());
    this.projectiles = [];
    this.joystick?.destroy();
  }

  private drawWalls() {
    this.wallsGfx.clear();
    const b = this.bounds;
    const wT = 14;

    // Outer dark frame
    this.wallsGfx.fillStyle(0x05070b, 1);
    this.wallsGfx.fillRect(b.left - wT, b.top - wT, b.width + 2 * wT, wT);
    this.wallsGfx.fillRect(b.left - wT, b.bottom, b.width + 2 * wT, wT);
    this.wallsGfx.fillRect(b.left - wT, b.top, wT, b.height);
    this.wallsGfx.fillRect(b.right, b.top, wT, b.height);

    // Stone wall layer
    this.wallsGfx.fillStyle(0x252b3a, 1);
    this.wallsGfx.fillRect(b.left - wT + 3, b.top - wT + 3, b.width + 2 * wT - 6, wT - 3);
    this.wallsGfx.fillRect(b.left - wT + 3, b.bottom, b.width + 2 * wT - 6, wT - 3);
    this.wallsGfx.fillRect(b.left - wT + 3, b.top, wT - 3, b.height);
    this.wallsGfx.fillRect(b.right + 3, b.top, wT - 3, b.height);

    // Inner accent line
    this.wallsGfx.lineStyle(2, 0x4a5468, 0.85);
    this.wallsGfx.strokeRect(b.left, b.top, b.width, b.height);

    // Faint glow inside
    this.wallsGfx.lineStyle(2, 0x6ad0ff, 0.15);
    this.wallsGfx.strokeRect(b.left + 4, b.top + 4, b.width - 8, b.height - 8);
  }

  private startRoom(idx: number) {
    this.currentRoom = idx;
    this.roomText.setText(idx === ROOMS_PER_RAID - 1 ? `БОСС  •  комната ${idx + 1}/${ROOMS_PER_RAID}` : `комната ${idx + 1}/${ROOMS_PER_RAID}`);
    if (this.nextRoomBtn) this.nextRoomBtn.destroy();
    const isBoss = idx === ROOMS_PER_RAID - 1;
    const templates = pickEnemyForRoom(idx, isBoss);
    const count = isBoss ? 1 : Math.min(6, 2 + idx);
    const hpScale = 1 + idx * 0.2 + Math.max(0, store.data.bestRaidTier) * 0.05;
    for (let i = 0; i < count; i++) {
      const tpl = templates[i % templates.length];
      const ex = Phaser.Math.Between(this.bounds.left + 40, this.bounds.right - 40);
      const ey = Phaser.Math.Between(this.bounds.top + 40, this.bounds.top + 200);
      const e = new Enemy(this, ex, ey, tpl, hpScale);
      this.enemies.push(e);
      e.setScale(0);
      this.tweens.add({ targets: e, scale: 1, duration: 280, ease: 'Back.easeOut', delay: i * 60 });
    }
    this.player.x = this.bounds.centerX;
    this.player.y = this.bounds.bottom - 80;
    this.player.invuln = 1.0;
  }

  private fireProjectile(x: number, y: number, ang: number, speed: number, dmg: number, team: 'player' | 'enemy') {
    this.projectiles.push(new Projectile(this, x, y, ang, speed, dmg, team));
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.BetweenPoints(this.player, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private playerAttack(dt: number) {
    this.attackCd -= dt;
    if (this.attackCd > 0) return;
    if (this.enemies.length === 0) return;
    const w = store.equippedWeapon();
    const target = this.nearestEnemy();
    if (!target) return;
    const dist = Phaser.Math.Distance.BetweenPoints(this.player, target);
    this.player.setFacing(target.x - this.player.x, target.y - this.player.y);

    const baseDmg = (1 + (w?.damage ?? 0)) * store.raidDamageMult();
    const cc = (w?.critChance ?? 0) + store.effects.critChance;
    const cm = 2 + (w?.critMult ?? 0) + store.effects.critMult;
    const isCrit = rng.chance(Math.min(0.95, cc));
    const dmg = Math.max(1, Math.round(baseDmg * (isCrit ? cm : 1)));

    if (!w || w.projectileSpeed === 0) {
      const range = w?.range ?? 56;
      if (dist > range) return;
      this.attackCd = 0.45 / (1 + (w?.attackSpeed ?? 0));
      const swing = this.player.meleeSwing(this, range);
      for (const e of [...this.enemies]) {
        const ddx = e.x - this.player.x;
        const ddy = e.y - this.player.y;
        const ed = Math.hypot(ddx, ddy);
        if (ed > range) continue;
        const ea = Math.atan2(ddy, ddx);
        const diff = Math.atan2(Math.sin(ea - swing.ang), Math.cos(ea - swing.ang));
        if (Math.abs(diff) > swing.arc / 2) continue;
        const dead = e.takeDamage(dmg, ddx / ed * 200, ddy / ed * 200);
        floatingNumber(this, e.x, e.y - 12, `${dmg}`, isCrit ? THEME.gold : '#ffffff', isCrit);
        if (dead) this.killEnemy(e);
      }
      shake(this, 0.008, 80);
      sfx.hit();
    } else {
      const range = w.range;
      if (dist > range) return;
      this.attackCd = 0.5 / (1 + w.attackSpeed);
      const ang = Math.atan2(target.y - this.player.y, target.x - this.player.x);
      this.fireProjectile(this.player.x, this.player.y, ang, w.projectileSpeed, dmg, 'player');
      sfx.shoot();
      this.tweens.add({ targets: this.player, scale: 0.92, duration: 60, yoyo: true });
    }
  }

  private killEnemy(e: Enemy) {
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    for (let i = 0; i < 12; i++) {
      const ang = (Math.PI * 2 * i) / 12 + Math.random();
      const p = this.add.circle(e.x, e.y, 4, e.tpl.body, 1).setDepth(50);
      this.tweens.add({
        targets: p,
        x: e.x + Math.cos(ang) * 60,
        y: e.y + Math.sin(ang) * 60,
        alpha: 0, scale: 0.2, duration: 380,
        onComplete: () => p.destroy(),
      });
    }
    const isBossKill = e.tpl.key === 'boss';
    const sh = isBossKill ? Phaser.Math.Between(8, 14) : Phaser.Math.Between(1, 3);
    this.rewardShards += sh;
    if (isBossKill) {
      const tier = Math.max(1, this.currentRoom + 1);
      const drop = rollItem({ level: store.data.monsterLevel + tier });
      this.rewardItems.push(drop);
      floatingNumber(this, e.x, e.y, `+${drop.rarity.toUpperCase()}!`, THEME.rarity[drop.rarity], true);
    } else if (rng.chance(0.18)) {
      const drop = rollItem({ level: store.data.monsterLevel + this.currentRoom });
      this.rewardItems.push(drop);
    }
    e.destroy();
    if (this.enemies.length === 0) this.onRoomCleared();
    sfx.death();
  }

  private onRoomCleared() {
    const isBossRoom = this.currentRoom === ROOMS_PER_RAID - 1;
    const gold = 8 + this.currentRoom * 6 + (isBossRoom ? 30 : 0);
    this.rewardGold += gold;
    floatingNumber(this, this.bounds.centerX, this.bounds.centerY, isBossRoom ? 'РЕЙД ЗАВЕРШЁН' : 'комната очищена', THEME.good, true);
    if (isBossRoom) {
      sfx.victory();
      this.time.delayedCall(800, () => this.extract(true));
      return;
    }
    const { width } = this.scale;
    this.nextRoomBtn = makeButton({
      scene: this, x: width / 2, y: this.bounds.centerY + 40, w: 220, h: 60,
      label: 'дальше →', color: 0x1f7fb0, onTap: () => this.startRoom(this.currentRoom + 1),
    });
  }

  private extract(won: boolean) {
    store.addGold(this.rewardGold);
    store.addShards(this.rewardShards);
    for (const it of this.rewardItems) store.addItem(it);
    store.data.totalRaids += 1;
    if (won) store.data.bestRaidTier = Math.max(store.data.bestRaidTier, 1);
    store.save();

    this.scene.start('ResultScene', {
      won,
      gold: this.rewardGold,
      shards: this.rewardShards,
      items: this.rewardItems,
    });
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    const j = this.joystick.vec;
    const vx = j.x * this.player.speed;
    const vy = j.y * this.player.speed;
    if (Math.hypot(vx, vy) > 1) {
      this.player.setFacing(vx, vy);
    }
    this.player.step(dt, vx, vy, this.bounds);
    this.floor.tilePositionX += vx * dt * 0.05;
    this.floor.tilePositionY += vy * dt * 0.05;

    for (const e of [...this.enemies]) {
      const r = e.step(dt, this.player, this.bounds);
      if (r.fire) {
        this.fireProjectile(r.fire.x, r.fire.y, r.fire.angle, r.fire.speed, r.fire.dmg, 'enemy');
      }
      const d = Phaser.Math.Distance.BetweenPoints(this.player, e);
      if (d < 18 + e.tpl.size && this.player.invuln <= 0) {
        const armor = store.equippedItem('armor');
        const dealt = this.player.takeDamage(e.tpl.contactDmg, armor?.defense ?? 0);
        if (dealt > 0) {
          floatingNumber(this, this.player.x, this.player.y - 18, `-${dealt}`, '#ff5d6c');
          shake(this, 0.012, 120);
          if (this.player.hp <= 0) { this.gameOver(); return; }
        }
      }
    }

    for (const p of [...this.projectiles]) {
      const alive = p.step(dt, this.bounds);
      if (!alive) { this.killProjectile(p); continue; }
      if (p.team === 'player') {
        for (const e of [...this.enemies]) {
          const d = Phaser.Math.Distance.BetweenPoints(p, e);
          if (d < 4 + e.tpl.size) {
            const dx = e.x - p.x, dy = e.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const dead = e.takeDamage(p.damage, dx / len * 180, dy / len * 180);
            floatingNumber(this, e.x, e.y - 12, `${p.damage}`, '#ffffff');
            this.killProjectile(p);
            if (dead) this.killEnemy(e);
            break;
          }
        }
      } else {
        const d = Phaser.Math.Distance.BetweenPoints(p, this.player);
        if (d < 18 && this.player.invuln <= 0) {
          const armor = store.equippedItem('armor');
          const dealt = this.player.takeDamage(p.damage, armor?.defense ?? 0);
          if (dealt > 0) {
            floatingNumber(this, this.player.x, this.player.y - 18, `-${dealt}`, '#ff5d6c');
            shake(this, 0.01, 100);
          }
          this.killProjectile(p);
          if (this.player.hp <= 0) { this.gameOver(); return; }
        }
      }
    }

    this.playerAttack(dt);
    this.drawPlayerHp();
  }

  private killProjectile(p: Projectile) {
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
    p.destroy();
  }

  private drawPlayerHp() {
    const { width, height } = this.scale;
    const w = width - 200, h = 14;
    const x = 100, y = height - 240 + 8;
    this.hpBar.clear();
    this.hpBar.fillStyle(THEME.panel, 0.9);
    this.hpBar.fillRoundedRect(x, y, w, h, 7);
    const pct = Math.max(0, this.player.hp / this.player.hpMax);
    const color = pct > 0.5 ? 0x7be07b : pct > 0.25 ? 0xf3c969 : 0xff5d6c;
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * pct), h - 4, 6);
    this.hpBar.lineStyle(2, THEME.border, 1);
    this.hpBar.strokeRoundedRect(x, y, w, h, 7);
  }

  private gameOver() {
    this.rewardGold = Math.floor(this.rewardGold / 2);
    this.rewardShards = Math.floor(this.rewardShards / 2);
    this.rewardItems = this.rewardItems.slice(0, Math.floor(this.rewardItems.length / 2));
    shake(this, 0.04, 400);
    this.cameras.main.flash(220, 255, 80, 80);
    this.time.delayedCall(420, () => this.extract(false));
  }
}
