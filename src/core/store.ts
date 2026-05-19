import { bus } from './eventBus';
import { loadRaw, saveRaw } from './save';
import type { Item, Slot, WeaponItem } from '../data/items';
import { rollItem, itemPower, itemSellValue } from '../data/items';
import { aggregateEffects, type UpgradeEffects, ZERO_EFFECTS, UPGRADES, upgradeCost } from '../data/upgrades';
import { rng } from './rng';

interface SaveData {
  v: 1;
  gold: number;
  shards: number;       // raid currency for upgrades
  monsterLevel: number;
  monsterHpRemaining: number;
  inventory: Item[];
  equipped: { weapon: string | null; armor: string | null; trinket: string | null };
  upgrades: Record<string, number>;
  totalKills: number;
  totalRaids: number;
  bestRaidTier: number;
}

const DEFAULT: SaveData = {
  v: 1,
  gold: 0,
  shards: 0,
  monsterLevel: 1,
  monsterHpRemaining: -1,
  inventory: [],
  equipped: { weapon: null, armor: null, trinket: null },
  upgrades: {},
  totalKills: 0,
  totalRaids: 0,
  bestRaidTier: 0,
};

class Store {
  data: SaveData = structuredClone(DEFAULT);
  effects: UpgradeEffects = { ...ZERO_EFFECTS };

  load() {
    const raw = loadRaw() as Partial<SaveData> | null;
    if (raw && raw.v === 1) {
      this.data = { ...DEFAULT, ...raw } as SaveData;
      // hydrate sub-objects to defaults if missing
      this.data.equipped = { weapon: null, armor: null, trinket: null, ...(raw.equipped ?? {}) };
      this.data.upgrades = { ...(raw.upgrades ?? {}) };
      this.data.inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
    }
    this.recomputeEffects();
  }

  save() {
    saveRaw(this.data);
    bus.emit('state:saved', undefined);
  }

  reset() {
    this.data = structuredClone(DEFAULT);
    this.recomputeEffects();
    this.save();
  }

  recomputeEffects() {
    this.effects = aggregateEffects(this.data.upgrades);
  }

  // --- gold / shards ---
  addGold(amount: number) {
    if (amount === 0) return;
    this.data.gold = Math.max(0, this.data.gold + amount);
    bus.emit('gold:changed', { gold: this.data.gold, delta: amount });
  }
  addShards(amount: number) {
    if (amount === 0) return;
    this.data.shards = Math.max(0, this.data.shards + amount);
    bus.emit('shards:changed', { shards: this.data.shards, delta: amount });
  }
  spendGold(amount: number): boolean {
    if (this.data.gold < amount) return false;
    this.addGold(-amount);
    return true;
  }
  spendShards(amount: number): boolean {
    if (this.data.shards < amount) return false;
    this.addShards(-amount);
    return true;
  }

  // --- inventory ---
  itemById(id: string | null): Item | null {
    if (!id) return null;
    return this.data.inventory.find((i) => i.id === id) ?? null;
  }
  equippedItem(slot: Slot): Item | null {
    return this.itemById(this.data.equipped[slot]);
  }
  equippedWeapon(): WeaponItem | null {
    const w = this.equippedItem('weapon');
    return w && w.slot === 'weapon' ? w : null;
  }

  addItem(item: Item) {
    this.data.inventory.push(item);
    bus.emit('item:looted', { itemId: item.id });
    // Auto-equip if better and slot is empty / weaker
    const cur = this.equippedItem(item.slot);
    if (!cur || itemPower(item) > itemPower(cur) * 1.05) {
      this.equip(item.id);
    }
  }

  equip(id: string) {
    const item = this.itemById(id);
    if (!item) return;
    this.data.equipped[item.slot] = item.id;
    bus.emit('item:equipped', { slot: item.slot, itemId: item.id });
  }

  unequip(slot: Slot) {
    this.data.equipped[slot] = null;
    bus.emit('item:equipped', { slot, itemId: null });
  }

  sellItem(id: string): boolean {
    const idx = this.data.inventory.findIndex((i) => i.id === id);
    if (idx < 0) return false;
    const item = this.data.inventory[idx];
    if (this.data.equipped[item.slot] === item.id) this.unequip(item.slot);
    this.data.inventory.splice(idx, 1);
    this.addGold(itemSellValue(item));
    return true;
  }

  // --- combat stats derived from equipped + upgrades ---
  computeClickDamage(): { dmg: number; isCrit: boolean } {
    const w = this.equippedWeapon();
    const a = this.equippedItem('armor');
    const t = this.equippedItem('trinket');
    let base = 1 + (w?.damage ?? 0) + (a?.damage ?? 0) * 0.4 + (t?.damage ?? 0);
    base += this.effects.clickDamageFlat;
    let dmg = base * this.effects.clickDamageMult;
    const cc = (w?.critChance ?? 0) + (a?.critChance ?? 0) + (t?.critChance ?? 0) + this.effects.critChance;
    const cm = 2 + (w?.critMult ?? 0) + (a?.critMult ?? 0) + (t?.critMult ?? 0) + this.effects.critMult;
    const isCrit = rng.chance(Math.min(0.95, cc));
    if (isCrit) dmg *= cm;
    return { dmg: Math.max(1, Math.round(dmg)), isCrit };
  }

  goldFindMult(): number {
    const w = this.equippedWeapon();
    const a = this.equippedItem('armor');
    const t = this.equippedItem('trinket');
    const fromGear = (w?.goldFind ?? 0) + (a?.goldFind ?? 0) + (t?.goldFind ?? 0);
    return this.effects.goldMult * (1 + fromGear);
  }

  doubleLootChance(): number {
    return Math.min(0.95, this.effects.doubleLootChance);
  }

  // --- monster ---
  killMonsterReward(level: number, baseGold: number) {
    const goldMul = this.goldFindMult();
    const gold = Math.max(1, Math.round(baseGold * goldMul));
    this.addGold(gold);
    this.data.totalKills += 1;
    bus.emit('monster:slain', { gold, xp: 0 });
    // Loot: 35% base + (level / 6) capped 0.85, doubled on doubleLoot proc
    const dropChance = Math.min(0.85, 0.35 + level * 0.02);
    const drops: Item[] = [];
    if (rng.chance(dropChance)) drops.push(rollItem({ level }));
    if (drops.length && rng.chance(this.doubleLootChance())) drops.push(rollItem({ level }));
    for (const d of drops) this.addItem(d);
    this.data.monsterLevel = level + 1;
  }

  // --- upgrades ---
  upgradeLevel(id: string): number { return this.data.upgrades[id] ?? 0; }
  buyUpgrade(id: string): boolean {
    const u = UPGRADES.find((u) => u.id === id);
    if (!u) return false;
    const cur = this.upgradeLevel(id);
    if (cur >= u.maxLevel) return false;
    const cost = upgradeCost(u, cur);
    if (!this.spendShards(cost)) return false;
    this.data.upgrades[id] = cur + 1;
    this.recomputeEffects();
    bus.emit('upgrade:purchased', { id });
    this.save();
    return true;
  }

  // --- raid bookkeeping ---
  raidPlayerStartHp(): number {
    const a = this.equippedItem('armor');
    const baseDef = a?.defense ?? 0;
    const base = 80 + baseDef * 4;
    return Math.round(base * (1 + this.effects.raidStartHp));
  }
  raidDamageMult(): number {
    return this.effects.raidDamageMult;
  }
}

export const store = new Store();
