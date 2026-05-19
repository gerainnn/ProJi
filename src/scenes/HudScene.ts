import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import { store } from '../core/store';
import { bus } from '../core/eventBus';
import { showToast } from '../ui/widgets';
import { sfx } from '../core/sfx';

/**
 * Persistent HUD that shows gold + shards at the top.
 * Listens to store events and updates in place.
 */
export class HudScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private shardsText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'HudScene', active: false }); }

  create() {
    const { width } = this.scale;
    const bar = this.add.rectangle(width / 2, 30, width - 24, 50, THEME.panel, 0.95)
      .setStrokeStyle(2, THEME.border, 1)
      .setOrigin(0.5);
    bar.setDepth(0);

    this.goldText = this.add.text(24, 30, '', {
      fontFamily: THEME.font.body,
      fontSize: '20px',
      color: THEME.gold,
      fontStyle: '800',
    }).setOrigin(0, 0.5);

    this.shardsText = this.add.text(width - 24, 30, '', {
      fontFamily: THEME.font.body,
      fontSize: '20px',
      color: THEME.accent,
      fontStyle: '800',
    }).setOrigin(1, 0.5);

    // Mute toggle (top-right of viewport, below the bar)
    const muteBtn = this.add.text(width - 30, 64, '🔊', {
      fontFamily: THEME.font.body, fontSize: '18px', color: THEME.textDim,
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    muteBtn.on('pointerdown', () => {
      const muted = sfx.toggleMuted();
      muteBtn.setText(muted ? '🔇' : '🔊');
    });

    this.refresh();

    bus.on('gold:changed', () => this.refresh());
    bus.on('shards:changed', () => this.refresh());
    bus.on('toast', (p) => showToast(this, p.text, p.color));
  }

  private refresh() {
    this.goldText.setText(`◈ ${formatNum(store.data.gold)}`);
    this.shardsText.setText(`✦ ${formatNum(store.data.shards)}`);
  }
}

export function formatNum(n: number): string {
  if (n < 1000) return Math.floor(n).toString();
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0) + 'M';
  return (n / 1_000_000_000).toFixed(2) + 'B';
}
