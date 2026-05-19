import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import type { Item } from '../data/items';
import { makeButton } from '../ui/widgets';
import { formatNum } from './HudScene';

interface ResultData {
  won: boolean;
  gold: number;
  shards: number;
  items: Item[];
}

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() { super('ResultScene'); }

  init(data: ResultData) {
    this.result = data;
  }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, THEME.bg, 1);

    const title = this.add.text(width / 2, 110, this.result.won ? 'РЕЙД ПРОЙДЕН' : 'ВЫ ПОВЕРЖЕНЫ', {
      fontFamily: THEME.font.body, fontSize: '28px',
      color: this.result.won ? THEME.good : THEME.danger, fontStyle: '900',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: title, scale: { from: 0.6, to: 1 }, duration: 360, ease: 'Back.easeOut',
    });

    const subtitle = this.add.text(width / 2, 150, this.result.won ? 'Боссы трепещут.' : 'Половина награды утеряна.', {
      fontFamily: THEME.font.body, fontSize: '14px', color: THEME.textDim, fontStyle: '700',
    }).setOrigin(0.5);

    const card = this.add.rectangle(width / 2, height / 2 - 20, width - 40, 380, THEME.panel, 1)
      .setStrokeStyle(2, THEME.border, 1);

    const goldRow = this.add.text(40, height / 2 - 180, `◈ Золото:  +${formatNum(this.result.gold)}`, {
      fontFamily: THEME.font.body, fontSize: '20px', color: THEME.gold, fontStyle: '800',
    });
    const shardsRow = this.add.text(40, height / 2 - 145, `✦ Осколки:  +${formatNum(this.result.shards)}`, {
      fontFamily: THEME.font.body, fontSize: '20px', color: THEME.accent, fontStyle: '800',
    });

    this.add.text(40, height / 2 - 100, this.result.items.length ? `Лут (${this.result.items.length}):` : 'Без лута', {
      fontFamily: THEME.font.body, fontSize: '14px', color: THEME.textDim, fontStyle: '700',
    });

    let y = height / 2 - 76;
    for (const it of this.result.items.slice(0, 6)) {
      const color = THEME.rarity[it.rarity];
      const slot = it.slot === 'weapon' ? '⚔' : it.slot === 'armor' ? '🛡' : '💎';
      this.add.text(40, y, `${slot} ${it.name}`, {
        fontFamily: THEME.font.body, fontSize: '14px', color, fontStyle: '700',
      });
      y += 22;
    }
    if (this.result.items.length > 6) {
      this.add.text(40, y, `…и ещё ${this.result.items.length - 6}`, {
        fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim,
      });
    }

    makeButton({
      scene: this, x: width / 2, y: height - 110, w: width - 60, h: 70,
      label: 'Обратно к кликеру', color: 0x1f7fb0,
      onTap: () => {
        this.scene.start('ClickerScene');
        this.scene.launch('HudScene');
      },
    });
  }
}
