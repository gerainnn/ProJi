import Phaser from 'phaser';
import { THEME } from '../ui/theme';
import { store } from '../core/store';
import { itemPower, itemSellValue, type Item, type Slot } from '../data/items';
import { makeButton } from '../ui/widgets';

const SLOT_LABELS: Record<Slot, string> = { weapon: 'Оружие', armor: 'Броня', trinket: 'Талисман' };
const SLOT_TEXTURE: Record<Slot, string> = { weapon: 'icon_sword', armor: 'icon_armor', trinket: 'icon_trinket' };

function iconTextureForItem(item: Item): string {
  if (item.slot === 'weapon') {
    const w = item as any;
    if (w.kind === 'bow') return 'icon_bow';
    if (w.kind === 'staff') return 'icon_staff';
    return 'icon_sword';
  }
  return SLOT_TEXTURE[item.slot];
}

export class InventoryScene extends Phaser.Scene {
  private contentLayer!: Phaser.GameObjects.Container;
  private detail!: Phaser.GameObjects.Container;
  private selected: string | null = null;
  private gridLayer!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private gridMaskRect!: Phaser.GameObjects.Rectangle;
  private gridTopY = 0;
  private gridViewH = 0;
  private gridViewW = 0;
  private gridViewX = 0;

  constructor() { super('InventoryScene'); }

  create() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();

    const panelW = width - 20;
    const panelH = height - 40;
    this.add.rectangle(width / 2, height / 2, panelW, panelH, THEME.panel, 1)
      .setStrokeStyle(2, THEME.border, 1);

    this.add.text(width / 2, 50, 'Сумка', {
      fontFamily: THEME.font.body, fontSize: '24px', color: THEME.text, fontStyle: '800',
    }).setOrigin(0.5);

    makeButton({
      scene: this, x: width - 50, y: 50, w: 60, h: 44,
      label: '✕', onTap: () => this.close(),
    });

    this.contentLayer = this.add.container(0, 0);
    this.gridLayer = this.add.container(0, 0);

    this.renderEquipped();
    this.renderInventory();
    this.renderDetail();
  }

  private close() {
    this.scene.stop();
    this.scene.resume('ClickerScene');
  }

  private renderEquipped() {
    const { width } = this.scale;
    const startY = 100;
    const slots: Slot[] = ['weapon', 'armor', 'trinket'];
    const slotW = (width - 60) / 3;
    slots.forEach((slot, i) => {
      const x = 30 + slotW / 2 + i * slotW;
      const y = startY + 50;
      const item = store.equippedItem(slot);
      const c = this.add.container(x, y);
      const bg = this.add.rectangle(0, 0, slotW - 12, 110, THEME.panelLight, 1).setStrokeStyle(2,
        item ? Phaser.Display.Color.HexStringToColor(THEME.rarity[item.rarity]).color : THEME.border, 1);
      const tex = item ? iconTextureForItem(item) : SLOT_TEXTURE[slot];
      const icon = this.add.image(0, -22, tex).setDisplaySize(48, 48).setAlpha(item ? 1 : 0.4);
      const label = this.add.text(0, 14, SLOT_LABELS[slot], {
        fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim, fontStyle: '700',
      }).setOrigin(0.5);
      const name = this.add.text(0, 36, item ? this.shortName(item.name) : 'пусто', {
        fontFamily: THEME.font.body, fontSize: '11px',
        color: item ? THEME.rarity[item.rarity] : THEME.textDim, fontStyle: '700',
      }).setOrigin(0.5);
      c.add([bg, icon, label, name]);
      c.setSize(slotW - 12, 110);
      c.setInteractive(new Phaser.Geom.Rectangle(-(slotW - 12) / 2, -55, slotW - 12, 110), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', () => {
        if (item) {
          this.selected = item.id;
          this.renderDetail();
        }
      });
      this.contentLayer.add(c);
    });
  }

  private shortName(s: string): string {
    return s.length > 14 ? s.slice(0, 13) + '…' : s;
  }

  private renderInventory() {
    const { width, height } = this.scale;
    const startY = 240;
    this.add.text(20, startY, `Предметы (${store.data.inventory.length})`, {
      fontFamily: THEME.font.body, fontSize: '14px', color: THEME.textDim, fontStyle: '700',
    });

    const items = [...store.data.inventory].sort((a, b) => itemPower(b) - itemPower(a));
    const cellW = (width - 60) / 4;
    const cellH = 78;
    const detailH = 200;
    const viewportTop = startY + 24;
    const viewportH = height - viewportTop - 60 - detailH;
    this.gridTopY = viewportTop;
    this.gridViewH = viewportH;
    this.gridViewW = width - 24;
    this.gridViewX = 12;

    items.forEach((item, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = 30 + cellW / 2 + col * cellW;
      const y = viewportTop + cellH / 2 + row * (cellH + 6);
      const cell = this.add.container(x, y);
      const color = Phaser.Display.Color.HexStringToColor(THEME.rarity[item.rarity]).color;
      const bg = this.add.rectangle(0, 0, cellW - 8, cellH, THEME.panelLight, 1).setStrokeStyle(2, color, 1);
      const isEquipped = store.data.equipped[item.slot] === item.id;
      if (isEquipped) {
        const tag = this.add.rectangle(0, -cellH / 2 + 6, 18, 4, color, 1);
        cell.add(tag);
      }
      const tex = iconTextureForItem(item);
      const icon = this.add.image(0, -10, tex).setDisplaySize(40, 40);
      const dmgDef = item.slot === 'weapon' ? `⚔${item.damage}` : item.slot === 'armor' ? `🛡${item.defense}` : `+${item.damage}`;
      const stats = this.add.text(0, 18, dmgDef, {
        fontFamily: THEME.font.body, fontSize: '12px', color: THEME.text, fontStyle: '800',
      }).setOrigin(0.5);
      const name = this.add.text(0, 32, this.shortName(item.name), {
        fontFamily: THEME.font.body, fontSize: '9px', color: THEME.rarity[item.rarity], fontStyle: '700',
      }).setOrigin(0.5);
      cell.add([bg, icon, stats, name]);
      cell.setSize(cellW - 8, cellH);
      cell.setInteractive(new Phaser.Geom.Rectangle(-(cellW - 8) / 2, -cellH / 2, cellW - 8, cellH), Phaser.Geom.Rectangle.Contains);
      cell.on('pointerdown', () => {
        this.selected = item.id;
        this.renderDetail();
      });
      this.gridLayer.add(cell);
    });

    const rows = Math.ceil(items.length / 4);
    const totalH = rows * (cellH + 6);
    this.maxScroll = Math.max(0, totalH - viewportH);
    this.scrollY = 0;
    this.gridLayer.y = 0;

    const mask = this.add.graphics();
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(this.gridViewX, this.gridTopY, this.gridViewW, viewportH);
    const m = mask.createGeometryMask();
    this.gridLayer.setMask(m);
    mask.setVisible(false);
    this.gridMaskRect = this.add.rectangle(width / 2, viewportTop + viewportH / 2, this.gridViewW, viewportH, 0x000000, 0)
      .setInteractive();
    let dragStartY = 0;
    let dragOriginScroll = 0;
    this.gridMaskRect.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragOriginScroll = this.scrollY;
    });
    this.gridMaskRect.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const next = Phaser.Math.Clamp(dragOriginScroll - (p.y - dragStartY), 0, this.maxScroll);
      this.scrollY = next;
      this.gridLayer.y = -next;
    });
  }

  private renderDetail() {
    if (this.detail) this.detail.destroy();
    const { width, height } = this.scale;
    const detailH = 190;
    const detailY = height - detailH / 2 - 40;
    this.detail = this.add.container(width / 2, detailY);

    const bg = this.add.rectangle(0, 0, width - 24, detailH, THEME.panelLight, 1).setStrokeStyle(2, THEME.border, 1);
    this.detail.add(bg);

    const item = this.selected ? store.itemById(this.selected) : null;
    if (!item) {
      const t = this.add.text(0, 0, 'Выбери предмет', {
        fontFamily: THEME.font.body, fontSize: '14px', color: THEME.textDim,
      }).setOrigin(0.5);
      this.detail.add(t);
      return;
    }

    const color = THEME.rarity[item.rarity];
    const icon = this.add.image(-(width / 2 - 50), -detailH / 2 + 50, iconTextureForItem(item)).setDisplaySize(56, 56);
    const name = this.add.text(-(width / 2 - 90), -detailH / 2 + 14, item.name, {
      fontFamily: THEME.font.body, fontSize: '18px', color, fontStyle: '800',
    }).setOrigin(0, 0);
    const sub = this.add.text(-(width / 2 - 90), -detailH / 2 + 38, `${SLOT_LABELS[item.slot]} • ур. ${item.level} • ${item.rarity}`, {
      fontFamily: THEME.font.body, fontSize: '12px', color: THEME.textDim, fontStyle: '700',
    }).setOrigin(0, 0);

    const lines: string[] = [];
    if (item.slot === 'weapon') {
      lines.push(`⚔ Урон: ${item.damage}`);
      const w = item as any;
      if (w.kind) lines.push(`Тип: ${w.kind === 'sword' ? 'меч' : w.kind === 'bow' ? 'лук' : 'посох'}`);
    }
    if (item.slot === 'armor') lines.push(`🛡 Защита: ${item.defense}`);
    if (item.slot === 'trinket') {
      if (item.damage) lines.push(`+${item.damage} к урону`);
      if (item.defense) lines.push(`+${item.defense} к защите`);
    }
    if (item.critChance > 0) lines.push(`⚡ Крит: +${(item.critChance * 100).toFixed(0)}%`);
    if (item.critMult > 0) lines.push(`× Сила крита: +${item.critMult.toFixed(2)}x`);
    if (item.goldFind > 0) lines.push(`◈ Золото: +${(item.goldFind * 100).toFixed(0)}%`);
    if (item.attackSpeed > 0) lines.push(`⏱ Скорость: +${(item.attackSpeed * 100).toFixed(0)}%`);

    const stats = this.add.text(-(width / 2 - 90), -detailH / 2 + 62, lines.join('   '), {
      fontFamily: THEME.font.body, fontSize: '13px', color: THEME.text, fontStyle: '600',
      wordWrap: { width: width - 110 },
    }).setOrigin(0, 0);

    this.detail.add([icon, name, sub, stats]);

    const equipped = store.data.equipped[item.slot] === item.id;
    const equipBtn = makeButton({
      scene: this, x: 0, y: detailH / 2 - 32, w: 200, h: 48,
      label: equipped ? 'Снять' : 'Надеть',
      color: equipped ? 0x2a3142 : 0x1f7fb0,
      onTap: () => {
        if (equipped) store.unequip(item.slot);
        else store.equip(item.id);
        store.save();
        this.refreshAll();
      },
    });
    const sellBtn = makeButton({
      scene: this, x: width / 2 - 80, y: detailH / 2 - 32, w: 130, h: 48,
      label: `Продать ${itemSellValue(item)}◈`,
      color: 0x6e1f2a,
      onTap: () => {
        store.sellItem(item.id);
        this.selected = null;
        store.save();
        this.refreshAll();
      },
    });
    this.detail.add([equipBtn, sellBtn]);
  }

  private refreshAll() {
    this.contentLayer.removeAll(true);
    this.gridLayer.removeAll(true);
    this.renderEquipped();
    this.renderInventory();
    this.renderDetail();
  }
}
