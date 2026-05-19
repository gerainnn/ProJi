/**
 * Color helpers for canvas drawing. Operates on hex strings or numbers.
 */

export function toHex(c: string | number): string {
  if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
  return c.startsWith('#') ? c : '#' + c;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function lighten(color: string | number, amount = 30): string {
  const [r, g, b] = hexToRgb(toHex(color));
  return rgbToHex(r + amount, g + amount, b + amount);
}

export function darken(color: string | number, amount = 30): string {
  return lighten(color, -amount);
}

export function alpha(color: string | number, a: number): string {
  const [r, g, b] = hexToRgb(toHex(color));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function mix(c1: string | number, c2: string | number, t: number): string {
  const [r1, g1, b1] = hexToRgb(toHex(c1));
  const [r2, g2, b2] = hexToRgb(toHex(c2));
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
