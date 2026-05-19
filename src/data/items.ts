import type { Rarity } from '../ui/theme';
import { rng } from '../core/rng';

export type Slot = 'weapon' | 'armor' | 'trinket';

export type WeaponKind = 'sword' | 'bow' | 'staff';

export interface ItemBase {
  id: string;
  slot: Slot;
  name: string;
  rarity: Rarity;
  level: number;
  // Stats:
  damage: number;       // weapon: base damage; armor/trinket: bonus damage
  defense: number;      // armor: base defense; others: small bonus
  critChance: number;   // additive % chance (0..1)
  critMult: number;     // additive multiplier on crit (0 means default)
  goldFind: number;     // additive % gold (0..1)
  attackSpeed: number;  // weapon only: attacks/sec multiplier (1 = base)
}

export interface WeaponItem extends ItemBase {
  slot: 'weapon';
  kind: WeaponKind;
  range: number;       // px in raid scene
  projectileSpeed: number; // 0 means melee
}

export interface ArmorItem extends ItemBase { slot: 'armor' }
export interface TrinketItem extends ItemBase { slot: 'trinket' }

export type Item = WeaponItem | ArmorItem | TrinketItem;

const RARITY_TABLE: ReadonlyArray<readonly [Rarity, number]> = [
  ['common', 60],
  ['uncommon', 25],
  ['rare', 10],
  ['epic', 4],
  ['legendary', 1],
];

const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.35,
  rare: 1.8,
  epic: 2.5,
  legendary: 3.6,
};

const WEAPON_NAMES: Record<WeaponKind, string[]> = {
  sword: ['Клинок', 'Сабля', 'Меч', 'Кинжал', 'Гладиус', 'Цвайхандер'],
  bow: ['Лук', 'Арбалет', 'Композит', 'Длиннолук', 'Самострел'],
  staff: ['Посох', 'Жезл', 'Скипетр', 'Кадуцей', 'Дубец'],
};
const ARMOR_NAMES = ['Куртка', 'Кольчуга', 'Латы', 'Мантия', 'Плащ', 'Кираса', 'Доспех'];
const TRINKET_NAMES = ['Кольцо', 'Амулет', 'Талисман', 'Печать', 'Камень'];
const PREFIXES = ['Тёмный', 'Алый', 'Древний', 'Стальной', 'Лунный', 'Кровавый', 'Седой', 'Гремящий', 'Призрачный', 'Скверный'];
const SUFFIXES = ['Бури', 'Огня', 'Мрака', 'Воина', 'Охотника', 'Льда', 'Ярости', 'Удачи', 'Эха', 'Бездны'];

let idSeq = 0;
function nextId(slot: Slot): string {
  idSeq += 1;
  return `${slot}_${Date.now().toString(36)}_${idSeq}`;
}

export interface RollOpts {
  level?: number;     // monster level / raid tier
  forceSlot?: Slot;
  forceRarity?: Rarity;
}

export function rollItem(opts: RollOpts = {}): Item {
  const level = Math.max(1, opts.level ?? 1);
  const slot: Slot = opts.forceSlot ?? rng.weighted([
    ['weapon', 45], ['armor', 40], ['trinket', 15],
  ] as const);
  const rarity: Rarity = opts.forceRarity ?? rng.weighted(RARITY_TABLE);
  const mult = RARITY_MULT[rarity];

  const baseDmg = Math.round((1 + level * 0.6) * mult * (0.85 + rng.next() * 0.3));
  const baseDef = Math.round((1 + level * 0.5) * mult * (0.85 + rng.next() * 0.3));

  const common: Omit<ItemBase, 'id' | 'slot' | 'name'> = {
    rarity,
    level,
    damage: 0,
    defense: 0,
    critChance: 0,
    critMult: 0,
    goldFind: 0,
    attackSpeed: 0,
  };

  // Sub-stats: number based on rarity
  const subStatCount = ({ common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const)[rarity];

  function applySub(target: ItemBase) {
    for (let i = 0; i < subStatCount; i++) {
      const which = rng.int(0, 3);
      if (which === 0) target.critChance += 0.02 + rng.next() * 0.04 * mult;
      else if (which === 1) target.critMult += 0.1 + rng.next() * 0.2 * mult;
      else if (which === 2) target.goldFind += 0.05 + rng.next() * 0.1 * mult;
      else target.attackSpeed += 0.05 + rng.next() * 0.1 * mult;
    }
  }

  const namePrefix = rng.chance(rarity === 'legendary' ? 1 : 0.4) ? rng.pick(PREFIXES) + ' ' : '';
  const nameSuffix = rng.chance(rarity === 'common' ? 0 : 0.4) ? ' ' + rng.pick(SUFFIXES) : '';

  if (slot === 'weapon') {
    const kind = rng.pick<WeaponKind>(['sword', 'bow', 'staff']);
    const baseName = rng.pick(WEAPON_NAMES[kind]);
    const item: WeaponItem = {
      ...common,
      id: nextId('weapon'),
      slot: 'weapon',
      name: `${namePrefix}${baseName}${nameSuffix}`,
      kind,
      damage: baseDmg,
      attackSpeed: kind === 'bow' ? 1.1 : kind === 'sword' ? 1 : 0.85,
      range: kind === 'sword' ? 64 : kind === 'bow' ? 280 : 200,
      projectileSpeed: kind === 'sword' ? 0 : kind === 'bow' ? 540 : 380,
    };
    applySub(item);
    return item;
  }

  if (slot === 'armor') {
    const baseName = rng.pick(ARMOR_NAMES);
    const item: ArmorItem = {
      ...common,
      id: nextId('armor'),
      slot: 'armor',
      name: `${namePrefix}${baseName}${nameSuffix}`,
      defense: baseDef,
    };
    applySub(item);
    return item;
  }

  const baseName = rng.pick(TRINKET_NAMES);
  const item: TrinketItem = {
    ...common,
    id: nextId('trinket'),
    slot: 'trinket',
    name: `${namePrefix}${baseName}${nameSuffix}`,
    damage: Math.round(baseDmg * 0.35),
    defense: Math.round(baseDef * 0.25),
  };
  // Trinkets always have at least 1 sub-stat for flavor
  const trinketSubs = Math.max(1, subStatCount);
  for (let i = 0; i < trinketSubs; i++) applySub(item);
  return item;
}

export function itemPower(item: Item): number {
  // Rough comparator for "is this better than that"
  return item.damage * 1.2 + item.defense + item.critChance * 50 + item.critMult * 30 +
    item.goldFind * 25 + item.attackSpeed * 20;
}

export function itemSellValue(item: Item): number {
  const r = RARITY_MULT[item.rarity];
  return Math.max(1, Math.round((1 + item.level) * r * 1.25));
}
