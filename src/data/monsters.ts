export interface MonsterTemplate {
  key: string;
  name: string;
  color: number;       // body
  accent: number;      // accent
  hpScale: number;     // multiplier on level HP curve
  goldScale: number;
  size: number;        // px radius
}

export const MONSTERS: MonsterTemplate[] = [
  { key: 'slime',  name: 'Слизень',     color: 0x7be07b, accent: 0x2f6f3a, hpScale: 1.0,  goldScale: 1.0,  size: 70 },
  { key: 'goblin', name: 'Гоблин',      color: 0x8acb6b, accent: 0x2c4d2a, hpScale: 1.15, goldScale: 1.1,  size: 64 },
  { key: 'wolf',   name: 'Волк',        color: 0x9aa3b2, accent: 0x40485a, hpScale: 1.3,  goldScale: 1.15, size: 72 },
  { key: 'orc',    name: 'Орк',         color: 0xa3754d, accent: 0x4b2f1d, hpScale: 1.6,  goldScale: 1.25, size: 84 },
  { key: 'wraith', name: 'Призрак',     color: 0xc084ff, accent: 0x4d2c80, hpScale: 1.8,  goldScale: 1.4,  size: 78 },
  { key: 'golem',  name: 'Голем',       color: 0x6ad0ff, accent: 0x244a66, hpScale: 2.4,  goldScale: 1.6,  size: 96 },
  { key: 'demon',  name: 'Демон',       color: 0xff5d6c, accent: 0x6e1f2a, hpScale: 3.0,  goldScale: 2.0,  size: 92 },
];

export function monsterForLevel(level: number): MonsterTemplate {
  const idx = Math.min(MONSTERS.length - 1, Math.floor((level - 1) / 4));
  return MONSTERS[idx];
}

export function monsterHp(level: number): number {
  const tpl = monsterForLevel(level);
  // Smooth curve: increases ~1.18x per level
  const base = 12 * Math.pow(1.18, level - 1);
  return Math.ceil(base * tpl.hpScale);
}

export function monsterGold(level: number): number {
  const tpl = monsterForLevel(level);
  const base = 2 + level * 1.4;
  return Math.ceil(base * tpl.goldScale * (0.85 + Math.random() * 0.3));
}
