import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import { store } from '../core/store';
import { monsterForLevel, monsterHp, monsterGold, type MonsterTemplate } from '../data/monsters';
import { floatingNumber, makeButton, shake } from '../ui/widgets';
import { formatNum } from './HudScene';
import { sfx } from '../core/sfx';
import { registerSprites } from '../art/sprites';

export class ClickerScene extends Phaser.Scene {
  private monsterTpl!: MonsterTemplate;
  private monsterContainer!: Phaser.GameObjects.Container;
  private monsterSprite!: Phaser.GameObjects.Image;
  private monsterShadow!: Phaser.GameObjects.Ellipse;
  private monsterHitbox!: Phaser.GameObjects.Zone;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private monsterNameText!: Phaser.GameObjects.Text;
  private bgImage!: Phaser.GameObjects.Image;

  private hpMax = 0;
  private hp = 0;
  private autoAccumulator = 0;
  private idleTime = 0;

  constructor() { super('ClickerScene'); }

  create() {
    const { width, height } = this.scale;

    // Defensive: ensure all sprite textures exist (in case Boot was skipped after a hot reload)
    if (!this.game.textures.exists('slime') || !this.game.textures.exists('starfield_bg')) {
      registerSprites(this);
    }

    // Starfield background
    this.bgImage = this.add.image(width / 2, height / 2, 'starfield_bg').setDisplaySize(width, height).setDepth(-100);

    // Title at top under HUD
    this.levelText = this.add.text(width / 2, 76, '', {
      fontFamily: THEME.font.body, fontSize: '14px', color: THEME.textDim, fontStyle: '700',
    }).setOrigin(0.5);

    this.monsterNameText = this.add.text(width / 2, 100, '', {
      fontFamily: THEME.font.body, fontSize: '24px', color: THEME.text, fontStyle: '800',
    }).setOrigin(0.5);

    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(width / 2, 138, '', {
      fontFamily: THEME.font.body, fontSize: '14px', color: THEME.text, fontStyle: '700',
    }).setOrigin(0.5);

    // Monster container
    const cx = width / 2, cy = height / 2 - 30;
    this.monsterShadow = this.add.ellipse(cx, cy + 110, 200, 30, 0x000000, 0.5);
    this.monsterContainer = this.add.container(cx, cy);
    this.monsterSprite = this.add.image(0, 0, 'slime').setDisplaySize(220, 220);
    this.monsterContainer.add([this.monsterSprite]);

    // Big invisible hitbox over the central area for reliable mobile tapping
    const hbW = Math.min(width - 40, 360);
    const hbH = 320;
    this.monsterHitbox = this.add.zone(cx, cy, hbW, hbH).setOrigin(0.5);
    this.monsterHitbox.setInteractive({ useHandCursor: true });
    this.monsterHitbox.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));

    // Idle bob
    this.tweens.add({
      targets: this.monsterContainer, y: cy - 6, duration: 1500, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Bottom buttons
    const btnY = height - 80;
    makeButton({
      scene: this, x: width * 0.18, y: btnY, w: width * 0.28, h: 64,
      label: '🎒 Сумка', onTap: () => this.openInventory(),
    });
    makeButton({
      scene: this, x: width * 0.5, y: btnY, w: width * 0.28, h: 64,
      label: '⚒ Прокачка', onTap: () => this.openUpgrades(),
    });
    makeButton({
      scene: this, x: width * 0.82, y: btnY, w: width * 0.28, h: 64,
      label: '⚔ В рейд', color: 0x1f7fb0, onTap: () => this.startRaid(),
    });

    this.events.on('shutdown', () => this.cleanup());
    this.events.on('destroy', () => this.cleanup());
    this.events.on('wake', () => this.refreshHud());

    this.spawnMonster(store.data.monsterLevel);
    this.refreshHud();
  }

  update(_time: number, deltaMs: number) {
    const dt = deltaMs / 1000;
    this.idleTime += dt;
    const aps = store.effects.autoClickPerSec;
    if (aps > 0) {
      this.autoAccumulator += aps * dt;
      while (this.autoAccumulator >= 1) {
        this.autoAccumulator -= 1;
        this.applyTap(this.scale.width / 2, this.scale.height / 2 - 30, true);
      }
    }
    if (this.idleTime > 5) {
      this.idleTime = 0;
      store.save();
    }
  }

  private cleanup() {
    // No-op
  }

  private spawnMonster(level: number) {
    this.monsterTpl = monsterForLevel(level);
    this.hpMax = monsterHp(level);
    if (store.data.monsterHpRemaining > 0 && store.data.monsterLevel === level) {
      this.hp = Math.min(this.hpMax, store.data.monsterHpRemaining);
    } else {
      this.hp = this.hpMax;
    }
    const sz = this.monsterTpl.size;
    this.monsterSprite.setTexture(this.monsterTpl.spriteKey).setDisplaySize(sz, sz);
    this.monsterShadow.setSize(sz * 1.05, sz * 0.16);
    this.monsterContainer.setScale(0.4);
    this.tweens.add({
      targets: this.monsterContainer, scale: 1, duration: 280, ease: 'Back.easeOut',
    });
    this.levelText.setText(`УРОВЕНЬ ${level}`);
    this.monsterNameText.setText(this.monsterTpl.name);
    this.drawHp();
  }

  private drawHp() {
    const { width } = this.scale;
    const w = width - 60, h = 18;
    const x = 30, y = 152;
    this.hpBar.clear();
    this.hpBar.fillStyle(THEME.panelLight, 1);
    this.hpBar.fillRoundedRect(x, y, w, h, 9);
    const pct = Math.max(0, this.hp / this.hpMax);
    const barColor = pct > 0.5 ? 0x7be07b : pct > 0.25 ? 0xf3c969 : 0xff5d6c;
    this.hpBar.fillStyle(barColor, 1);
    this.hpBar.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * pct), h - 4, 7);
    this.hpBar.lineStyle(2, THEME.border, 1);
    this.hpBar.strokeRoundedRect(x, y, w, h, 9);
    this.hpText.setText(`${formatNum(Math.ceil(this.hp))} / ${formatNum(this.hpMax)}`);
    this.hpText.setPosition(this.scale.width / 2, y + h / 2);
  }

  private onTap(px: number, py: number) {
    this.applyTap(px, py, false);
  }

  private applyTap(px: number, py: number, isAuto: boolean) {
    const { dmg, isCrit } = store.computeClickDamage();
    this.hp -= dmg;
    store.data.monsterHpRemaining = this.hp;
    floatingNumber(this, px, py - 20, `-${formatNum(dmg)}`, isCrit ? THEME.gold : '#ffffff', isCrit);
    if (!isAuto) {
      this.tweens.add({ targets: this.monsterContainer, scale: 0.92, duration: 60, yoyo: true });
      sfx.click();
      // Hit flash on sprite (guarded)
      try {
        (this.monsterSprite as any).setTintFill?.(0xffffff);
        this.time.delayedCall(60, () => this.monsterSprite.clearTint());
      } catch { /* ignore tint errors */ }
    }
    if (isCrit) { shake(this, 0.012, 140); sfx.crit(); }

    if (this.hp <= 0) this.killMonster(px, py);
    else this.drawHp();
  }

  private killMonster(px: number, py: number) {
    const level = store.data.monsterLevel;
    const baseGold = monsterGold(level);
    store.killMonsterReward(level, baseGold);
    floatingNumber(this, px, py, `+${formatNum(Math.round(baseGold * store.goldFindMult()))} ◈`, THEME.gold, true);

    // Death animation: scatter colored particles using monster's body color
    const cx = this.monsterContainer.x;
    const cy = this.monsterContainer.y;
    for (let i = 0; i < 16; i++) {
      const p = this.add.circle(cx, cy, Phaser.Math.Between(4, 9), this.monsterTpl.color, 1).setDepth(50);
      const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const speed = Phaser.Math.Between(160, 260);
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(ang) * speed,
        y: cy + Math.sin(ang) * speed,
        alpha: 0, scale: 0.2,
        duration: 500, ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
    shake(this, 0.02, 220);
    sfx.death();
    this.monsterContainer.setVisible(false);
    store.data.monsterHpRemaining = -1;
    store.save();
    this.time.delayedCall(280, () => {
      this.monsterContainer.setVisible(true);
      this.spawnMonster(store.data.monsterLevel);
    });
  }

  private refreshHud() { /* HUD handles gold/shards */ }

  private openInventory() {
    this.scene.pause();
    this.scene.launch('InventoryScene');
  }
  private openUpgrades() {
    this.scene.pause();
    this.scene.launch('UpgradeScene');
  }
  private startRaid() {
    this.scene.stop('HudScene');
    store.save();
    this.scene.start('RaidScene', { tier: 1 });
  }
}
