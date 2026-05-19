export interface EnemyTemplate {
  key: string;
  name: string;
  spriteKey: string;
  hp: number;
  speed: number;
  contactDmg: number;
  body: number;       // for particles / hp bar tint
  accent: number;
  size: number;       // collision radius
  spriteSize: number; // display size of sprite (square)
  ranged?: { range: number; cooldown: number; speed: number; dmg: number };
}

export const ENEMIES: Record<string, EnemyTemplate> = {
  slime: {
    key: 'slime', name: 'Слизень', spriteKey: 'enemy_slime',
    hp: 14, speed: 70, contactDmg: 8,
    body: 0x7be07b, accent: 0x2f6f3a, size: 18, spriteSize: 56,
  },
  goblin: {
    key: 'goblin', name: 'Гоблин', spriteKey: 'enemy_goblin',
    hp: 22, speed: 110, contactDmg: 10,
    body: 0x8acb6b, accent: 0x2c4d2a, size: 18, spriteSize: 60,
  },
  archer: {
    key: 'archer', name: 'Лучник', spriteKey: 'enemy_archer',
    hp: 18, speed: 80, contactDmg: 6,
    body: 0xc084ff, accent: 0x4d2c80, size: 18, spriteSize: 64,
    ranged: { range: 240, cooldown: 1500, speed: 320, dmg: 10 },
  },
  brute: {
    key: 'brute', name: 'Громила', spriteKey: 'enemy_brute',
    hp: 60, speed: 60, contactDmg: 18,
    body: 0xa3754d, accent: 0x4b2f1d, size: 26, spriteSize: 80,
  },
  boss: {
    key: 'boss', name: 'Босс', spriteKey: 'enemy_boss',
    hp: 280, speed: 75, contactDmg: 22,
    body: 0xff5d6c, accent: 0x6e1f2a, size: 36, spriteSize: 120,
    ranged: { range: 280, cooldown: 1100, speed: 280, dmg: 14 },
  },
};

export function pickEnemyForRoom(roomIndex: number, isBoss: boolean): EnemyTemplate[] {
  if (isBoss) return [ENEMIES.boss];
  const pool: EnemyTemplate[][] = [
    [ENEMIES.slime, ENEMIES.slime],
    [ENEMIES.slime, ENEMIES.goblin],
    [ENEMIES.goblin, ENEMIES.archer],
    [ENEMIES.archer, ENEMIES.brute],
    [ENEMIES.brute, ENEMIES.archer, ENEMIES.goblin],
  ];
  return pool[Math.min(pool.length - 1, roomIndex)];
}
