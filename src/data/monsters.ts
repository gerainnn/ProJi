export interface MonsterTemplate {
  key: string;
  name: string;
  spriteKey: string;
  color: number;       // legacy: used for particles
  accent: number;      // legacy
  hpScale: number;
  goldScale: number;
  size: number;        // sprite display size in px (square)
}

export const MONSTERS: MonsterTemplate[] = [
  { key: 'slime',  name: 'Слизень', spriteKey: 'slime',  color: 0x7be07b, accent: 0x2f6f3a, hpScale: 1.0,  goldScale: 1.0,  size: 200 },
  { key: 'goblin', name: 'Гоблин',  spriteKey: 'goblin', color: 0x8acb6b, accent: 0x2c4d2a, hpScale: 1.15, goldScale: 1.1,  size: 200 },
  { key: 'wolf',   name: 'Волк',    spriteKey: 'wolf',   color: 0x9aa3b2, accent: 0x40485a, hpScale: 1.3,  goldScale: 1.15, size: 220 },
  { key: 'orc',    name: 'Орк',     spriteKey: 'orc',    color: 0xa3754d, accent: 0x4b2f1d, hpScale: 1.6,  goldScale: 1.25, size: 220 },
  { key: 'wraith', name: 'Призрак', spriteKey: 'wraith', color: 0xc084ff, accent: 0x4d2c80, hpScale: 1.8,  goldScale: 1.4,  size: 210 },
  { key: 'golem',  name: 'Голем',   spriteKey: 'golem',  color: 0x6ad0ff, accent: 0x244a66, hpScale: 2.4,  goldScale: 1.6,  size: 240 },
  { key: 'demon',  name: 'Демон',   spriteKey: 'demon',  color: 0xff5d6c, accent: 0x6e1f2a, hpScale: 3.0,  goldScale: 2.0,  size: 230 },
];

export function monsterForLevel(level: number): MonsterTemplate {
  const idx = Math.min(MONSTERS.length - 1, Math.floor((level - 1) / 4));
  return MONSTERS[idx];
}

export function monsterHp(level: number): number {
  const tpl = monsterForLevel(level);
  const base = 12 * Math.pow(1.18, level - 1);
  return Math.ceil(base * tpl.hpScale);
}

export function monsterGold(level: number): number {
  const tpl = monsterForLevel(level);
  const base = 2 + level * 1.4;
  return Math.ceil(base * tpl.goldScale * (0.85 + Math.random() * 0.3));
}
