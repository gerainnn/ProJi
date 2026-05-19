import type { Rarity } from '../ui/theme';
import { rng } from '../core/rng';

export type Slot = 'weapon' | 'armor' | 'trinket';

export type WeaponKind =
  | 'sword'    // balanced melee
  | 'dagger'   // fast, low damage, high crit
  | 'axe'      // slow, heavy damage
  | 'mace'     // slow, heavy
  | 'spear'    // medium, longer reach
  | 'bow'      // ranged, fast
  | 'staff'    // ranged magic, slow, heavy
  | 'wand';    // ranged fast, weak, high crit

export interface ItemBase {
  id: string;
  slot: Slot;
  name: string;
  rarity: Rarity;
  level: number;
  damage: number;
  defense: number;
  critChance: number;
  critMult: number;
  goldFind: number;
  attackSpeed: number;
}

export interface WeaponItem extends ItemBase {
  slot: 'weapon';
  kind: WeaponKind;
  range: number;
  projectileSpeed: number; // 0 = melee
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
  common: 1, uncommon: 1.35, rare: 1.8, epic: 2.5, legendary: 3.6,
};

interface WeaponSpec {
  damageMult: number;
  attackSpeedBonus: number;
  critChanceBonus: number;
  critMultBonus: number;
  range: number;
  projectileSpeed: number;
  names: string[];
}

const WEAPON_SPECS: Record<WeaponKind, WeaponSpec> = {
  sword:  { damageMult: 1.00, attackSpeedBonus:  0.00, critChanceBonus: 0.00, critMultBonus: 0.00, range: 64,  projectileSpeed: 0,   names: ['Клинок', 'Сабля', 'Меч', 'Гладиус', 'Цвайхандер'] },
  dagger: { damageMult: 0.65, attackSpeedBonus:  0.40, critChanceBonus: 0.10, critMultBonus: 0.20, range: 50,  projectileSpeed: 0,   names: ['Кинжал', 'Стилет', 'Тычок', 'Серп'] },
  axe:    { damageMult: 1.55, attackSpeedBonus: -0.20, critChanceBonus: 0.00, critMultBonus: 0.10, range: 60,  projectileSpeed: 0,   names: ['Топор', 'Алебарда', 'Секира'] },
  mace:   { damageMult: 1.40, attackSpeedBonus: -0.15, critChanceBonus: 0.00, critMultBonus: 0.05, range: 60,  projectileSpeed: 0,   names: ['Булава', 'Молот', 'Кистень', 'Дробитель'] },
  spear:  { damageMult: 1.10, attackSpeedBonus:  0.10, critChanceBonus: 0.00, critMultBonus: 0.00, range: 90,  projectileSpeed: 0,   names: ['Копьё', 'Пика', 'Трезубец', 'Острие'] },
  bow:    { damageMult: 0.95, attackSpeedBonus:  0.10, critChanceBonus: 0.05, critMultBonus: 0.00, range: 280, projectileSpeed: 540, names: ['Лук', 'Арбалет', 'Композит', 'Длиннолук'] },
  staff:  { damageMult: 1.30, attackSpeedBonus: -0.15, critChanceBonus: 0.00, critMultBonus: 0.10, range: 220, projectileSpeed: 380, names: ['Посох', 'Жезл', 'Скипетр', 'Кадуцей'] },
  wand:   { damageMult: 0.70, attackSpeedBonus:  0.30, critChanceBonus: 0.08, critMultBonus: 0.10, range: 240, projectileSpeed: 460, names: ['Жёзлик', 'Палочка', 'Прутик', 'Магострел'] },
};

const ARMOR_NAMES = ['Куртка', 'Кольчуга', 'Латы', 'Мантия', 'Плащ', 'Кираса', 'Доспех', 'Панцирь'];
const TRINKET_NAMES = ['Кольцо', 'Амулет', 'Талисман', 'Печать', 'Камень', 'Подвеска'];
const PREFIXES = ['Тёмный', 'Алый', 'Древний', 'Стальной', 'Лунный', 'Кровавый', 'Седой', 'Гремящий', 'Призрачный', 'Скверный', 'Огненный', 'Ледяной'];
const SUFFIXES = ['Бури', 'Огня', 'Мрака', 'Воина', 'Охотника', 'Льда', 'Ярости', 'Удачи', 'Эха', 'Бездны', 'Грозы', 'Тлена'];

let idSeq = 0;
function nextId(slot: Slot): string {
  idSeq += 1;
  return `${slot}_${Date.now().toString(36)}_${idSeq}`;
}

export interface RollOpts {
  level?: number;
  forceSlot?: Slot;
  forceRarity?: Rarity;
  forceWeaponKind?: WeaponKind;
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
    rarity, level,
    damage: 0, defense: 0,
    critChance: 0, critMult: 0,
    goldFind: 0, attackSpeed: 0,
  };

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
    const kinds: WeaponKind[] = ['sword', 'dagger', 'axe', 'mace', 'spear', 'bow', 'staff', 'wand'];
    const kind = opts.forceWeaponKind ?? rng.pick(kinds);
    const spec = WEAPON_SPECS[kind];
    const baseName = rng.pick(spec.names);
    const item: WeaponItem = {
      ...common,
      id: nextId('weapon'),
      slot: 'weapon',
      name: `${namePrefix}${baseName}${nameSuffix}`,
      kind,
      damage: Math.max(1, Math.round(baseDmg * spec.damageMult)),
      attackSpeed: spec.attackSpeedBonus,
      critChance: spec.critChanceBonus,
      critMult: spec.critMultBonus,
      range: spec.range,
      projectileSpeed: spec.projectileSpeed,
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
  const trinketSubs = Math.max(1, subStatCount);
  for (let i = 0; i < trinketSubs; i++) applySub(item);
  return item;
}

export function itemPower(item: Item): number {
  return item.damage * 1.2 + item.defense + item.critChance * 50 + item.critMult * 30 +
    item.goldFind * 25 + item.attackSpeed * 20;
}

export function itemSellValue(item: Item): number {
  const r = RARITY_MULT[item.rarity];
  return Math.max(1, Math.round((1 + item.level) * r * 1.25));
}

export const WEAPON_KIND_LABEL: Record<WeaponKind, string> = {
  sword: 'меч', dagger: 'кинжал', axe: 'топор', mace: 'булава',
  spear: 'копьё', bow: 'лук', staff: 'посох', wand: 'жезл',
};
