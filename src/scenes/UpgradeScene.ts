import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import { store } from '../core/store';
import { UPGRADES, upgradeCost, type Upgrade } from '../data/upgrades';
import { makeButton, showToast } from '../ui/widgets';
import { formatNum } from './HudScene';

export class UpgradeScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;

  constructor() { super('UpgradeScene'); }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();

    const panelW = width - 20;
    const panelH = height - 40;
    this.add.rectangle(width / 2, height / 2, panelW, panelH, THEME.panel, 1)
      .setStrokeStyle(2, THEME.border, 1);

    this.add.text(width / 2, 50, 'Прокачка', {
      fontFamily: THEME.font.body, fontSize: '24px', color: THEME.text, fontStyle: '800',
    }).setOrigin(0.5);

    this.add.text(width / 2, 80, 'Тратишь ✦ осколки из рейдов', {
      fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim, fontStyle: '700',
    }).setOrigin(0.5);

    makeButton({
      scene: this, x: width - 50, y: 50, w: 60, h: 44,
      label: '✕', onTap: () => this.close(),
    });

    this.layer = this.add.container(0, 0);
    this.renderList();

    // Scrolling
    const viewport = this.add.rectangle(width / 2, 110 + (height - 130) / 2, width, height - 130, 0x000000, 0).setInteractive();
    let dragStartY = 0;
    let originScroll = 0;
    viewport.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      originScroll = this.scrollY;
    });
    viewport.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const next = Phaser.Math.Clamp(originScroll - (p.y - dragStartY), 0, this.maxScroll);
      this.scrollY = next;
      this.layer.y = -next;
    });
  }

  private close() {
    this.scene.stop();
    this.scene.resume('ClickerScene');
  }

  private renderList() {
    this.layer.removeAll(true);
    const { width } = this.scale;
    const startY = 120;
    const cardW = width - 32;
    const cardH = 96;
    const gap = 10;
    UPGRADES.forEach((u, idx) => {
      const y = startY + cardH / 2 + idx * (cardH + gap);
      const x = width / 2;
      const card = this.add.container(x, y);
      const lvl = store.upgradeLevel(u.id);
      const maxed = lvl >= u.maxLevel;
      const cost = upgradeCost(u, lvl);
      const canAfford = store.data.shards >= cost;
      const borderColor = maxed ? Phaser.Display.Color.HexStringToColor(THEME.gold).color
        : canAfford ? Phaser.Display.Color.HexStringToColor(THEME.accent).color
        : THEME.border;
      const bg = this.add.rectangle(0, 0, cardW, cardH, THEME.panelLight, 1).setStrokeStyle(2, borderColor, 1);
      const name = this.add.text(-cardW / 2 + 14, -cardH / 2 + 10, u.name, {
        fontFamily: THEME.font.body, fontSize: '16px', color: THEME.text, fontStyle: '800',
      }).setOrigin(0, 0);
      const lvlText = this.add.text(cardW / 2 - 14, -cardH / 2 + 10, `Ур. ${lvl}/${u.maxLevel}`, {
        fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim, fontStyle: '700',
      }).setOrigin(1, 0);
      const desc = this.add.text(-cardW / 2 + 14, -cardH / 2 + 36, lvl > 0 ? u.desc(lvl) : 'не куплено', {
        fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim, fontStyle: '600',
        wordWrap: { width: cardW - 28 },
      }).setOrigin(0, 0);
      const next = lvl < u.maxLevel ? `→ ${u.desc(lvl + 1)}` : 'максимум';
      const nextText = this.add.text(-cardW / 2 + 14, -cardH / 2 + 52, next, {
        fontFamily: THEME.font.body, fontSize: '12px', color: lvl < u.maxLevel ? THEME.good : THEME.gold, fontStyle: '700',
        wordWrap: { width: cardW - 28 },
      }).setOrigin(0, 0);

      card.add([bg, name, lvlText, desc, nextText]);

      if (!maxed) {
        const btn = makeButton({
          scene: this, x: cardW / 2 - 70, y: cardH / 2 - 22, w: 130, h: 40,
          label: `${formatNum(cost)} ✦`,
          color: canAfford ? 0x1f7fb0 : 0x2a3142,
          onTap: () => this.tryBuy(u),
        });
        card.add(btn);
      }

      this.layer.add(card);
    });

    const totalH = UPGRADES.length * (96 + 10);
    this.maxScroll = Math.max(0, totalH - (this.scale.height - 200));
  }

  private tryBuy(u: Upgrade) {
    const ok = store.buyUpgrade(u.id);
    if (!ok) {
      showToast(this, 'Недостаточно ✦', THEME.danger);
      return;
    }
    showToast(this, `${u.name}+`, THEME.good);
    this.renderList();
    this.layer.y = -this.scrollY;
  }
}
