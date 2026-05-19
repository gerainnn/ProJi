export interface Upgrade {
  id: string;
  name: string;
  desc: (level: number) => string;
  baseCost: number;          // shards
  costGrowth: number;        // multiplicative
  maxLevel: number;
  effect: (level: number) => Partial<UpgradeEffects>;
}

export interface UpgradeEffects {
  clickDamageMult: number;     // multiplicative
  clickDamageFlat: number;     // additive
  goldMult: number;            // multiplicative
  critChance: number;          // additive 0..1
  critMult: number;            // additive
  doubleLootChance: number;    // additive 0..1
  autoClickPerSec: number;     // additive
  raidStartHp: number;         // additive % to base HP
  raidDamageMult: number;      // multiplicative
}

export const ZERO_EFFECTS: UpgradeEffects = {
  clickDamageMult: 1,
  clickDamageFlat: 0,
  goldMult: 1,
  critChance: 0,
  critMult: 0,
  doubleLootChance: 0,
  autoClickPerSec: 0,
  raidStartHp: 0,
  raidDamageMult: 1,
};

export const UPGRADES: Upgrade[] = [
  {
    id: 'sharp_taps',
    name: 'Острые пальцы',
    desc: (l) => `Урон тапа +${l * 25}%`,
    baseCost: 5,
    costGrowth: 1.55,
    maxLevel: 50,
    effect: (l) => ({ clickDamageMult: 1 + l * 0.25 }),
  },
  {
    id: 'gold_rush',
    name: 'Золотая лихорадка',
    desc: (l) => `Золото +${l * 15}%`,
    baseCost: 8,
    costGrowth: 1.65,
    maxLevel: 30,
    effect: (l) => ({ goldMult: 1 + l * 0.15 }),
  },
  {
    id: 'crit_eye',
    name: 'Глаз критика',
    desc: (l) => `Шанс крита +${(l * 3).toFixed(0)}%`,
    baseCost: 12,
    costGrowth: 1.7,
    maxLevel: 20,
    effect: (l) => ({ critChance: l * 0.03 }),
  },
  {
    id: 'crit_bite',
    name: 'Кусачий крит',
    desc: (l) => `Множитель крита +${(l * 0.25).toFixed(2)}x`,
    baseCost: 25,
    costGrowth: 1.8,
    maxLevel: 15,
    effect: (l) => ({ critMult: l * 0.25 }),
  },
  {
    id: 'lucky_drop',
    name: 'Двойной дроп',
    desc: (l) => `Шанс x2 лута +${(l * 5).toFixed(0)}%`,
    baseCost: 30,
    costGrowth: 1.85,
    maxLevel: 12,
    effect: (l) => ({ doubleLootChance: l * 0.05 }),
  },
  {
    id: 'auto_clicker',
    name: 'Автоклик',
    desc: (l) => `+${l} тап/сек`,
    baseCost: 50,
    costGrowth: 2.0,
    maxLevel: 20,
    effect: (l) => ({ autoClickPerSec: l }),
  },
  {
    id: 'raid_might',
    name: 'Боевая ярость',
    desc: (l) => `Урон в рейде +${l * 12}%`,
    baseCost: 18,
    costGrowth: 1.7,
    maxLevel: 25,
    effect: (l) => ({ raidDamageMult: 1 + l * 0.12 }),
  },
  {
    id: 'raid_vigor',
    name: 'Закалка',
    desc: (l) => `HP в рейде +${l * 15}%`,
    baseCost: 18,
    costGrowth: 1.7,
    maxLevel: 25,
    effect: (l) => ({ raidStartHp: l * 0.15 }),
  },
];

export function upgradeCost(u: Upgrade, level: number): number {
  return Math.ceil(u.baseCost * Math.pow(u.costGrowth, level));
}

export function aggregateEffects(levels: Record<string, number>): UpgradeEffects {
  const out: UpgradeEffects = { ...ZERO_EFFECTS };
  for (const u of UPGRADES) {
    const l = levels[u.id] ?? 0;
    if (l <= 0) continue;
    const eff = u.effect(l);
    for (const k of Object.keys(eff) as (keyof UpgradeEffects)[]) {
      const v = eff[k]!;
      if (k === 'clickDamageMult' || k === 'goldMult' || k === 'raidDamageMult') {
        out[k] *= v as number;
      } else {
        (out[k] as number) += v as number;
      }
    }
  }
  return out;
}
