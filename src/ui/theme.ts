export const THEME = {
  bg: 0x0b0d12,
  bgHex: '#0b0d12',
  panel: 0x141823,
  panelHex: '#141823',
  panelLight: 0x1c2230,
  border: 0x2a3142,
  text: '#e7e9ee',
  textDim: '#8b93a7',
  accent: '#6ad0ff',
  accentDark: '#1f7fb0',
  gold: '#f3c969',
  danger: '#ff5d6c',
  good: '#7be07b',
  rarity: {
    common: '#9aa3b2',
    uncommon: '#7be07b',
    rare: '#6ad0ff',
    epic: '#c084ff',
    legendary: '#f3c969',
  } as const,
  font: {
    body: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
};

export type Rarity = keyof typeof THEME.rarity;
