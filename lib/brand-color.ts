/**
 * Returns true if value is exactly #RRGGBB format.
 * Used to prevent CSS injection from user-supplied brand colors.
 */
export function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

/**
 * Darkens a hex color by the given ratio (default 0.15 = 15% darker).
 * Returns a hex string.
 */
export function hexDarken(hex: string, ratio = 0.15): string {
  const safe = isValidHex(hex) ? hex : '#D4956A';
  const clampedRatio = Math.max(0, Math.min(1, ratio));

  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);

  const factor = 1 - clampedRatio;
  const dr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const dg = Math.max(0, Math.min(255, Math.round(g * factor)));
  const db = Math.max(0, Math.min(255, Math.round(b * factor)));

  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Takes a brand color hex string and returns a CSS string containing
 * the three custom property declarations for that color.
 * Falls back to Stren default #D4956A if hex is invalid.
 *
 * Usage: <style>{`:root { ${brandColorVars(gym.brand_color)} }`}</style>
 */
export function brandColorVars(hex: string, secondaryHex?: string | null): string {
  const safeHex = isValidHex(hex) ? hex.toUpperCase() : '#D4956A';
  const dark = hexDarken(safeHex);
  const safeSecondary = isValidHex(secondaryHex ?? '')
    ? (secondaryHex as string).toUpperCase()
    : hexDarken(safeHex, 0.35);
  const secondaryDark = hexDarken(safeSecondary);

  return [
    `--color-primary: ${safeHex};`,
    `--color-primary-dark: ${dark};`,
    `--color-primary-glow: ${safeHex}26;`,
    `--color-secondary: ${safeSecondary};`,
    `--color-secondary-dark: ${secondaryDark};`,
    `--color-secondary-glow: ${safeSecondary}29;`,
  ].join('\n');
}

import type { CSSProperties } from 'react';

/**
 * Converts the gym brand declarations into an inline style suitable for a scoped
 * public-page or preview wrapper. Keeping the variables on that wrapper avoids
 * depending on a global `:root` override and prevents one gym's palette from
 * affecting Stren chrome outside its public page.
 */
export function brandColorStyle(hex: string, secondaryHex?: string | null): CSSProperties {
  const style: Record<string, string> = {};
  for (const declaration of brandColorVars(hex, secondaryHex).split('\n')) {
    const separator = declaration.indexOf(':');
    if (separator === -1) continue;
    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).replace(/;$/, '').trim();
    if (property.startsWith('--')) style[property] = value;
  }
  return style as CSSProperties;
}

// ── Brand studio helpers (ImplementationPlan.md §7.7) ────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/**
 * Mix a color toward white (pct > 0) or black (pct < 0) by the given fraction.
 * Matches the studio prototype's `_shade`.
 */
function shade(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (pct >= 0) {
    return rgbToHex(r + (255 - r) * pct, g + (255 - g) * pct, b + (255 - b) * pct);
  }
  const f = 1 + pct;
  return rgbToHex(r * f, g * f, b * f);
}

function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * WCAG contrast ratio between two colors (1–21). Order-independent.
 * contrastRatio('#000000','#FFFFFF') === 21; ('#767676','#FFFFFF') ≈ 4.54.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Five-swatch ramp of a seed color: +34% white, +16% white, the seed itself,
 * +18% black, +36% black. Invalid seeds fall back to the Stren default.
 */
export function generatePalette(seedHex: string): [string, string, string, string, string] {
  const seed = isValidHex(seedHex) ? seedHex.toUpperCase() : '#D4956A';
  return [shade(seed, 0.34), shade(seed, 0.16), seed, shade(seed, -0.18), shade(seed, -0.36)];
}
