import { z } from 'zod';

export const PALETTE_IDS = ['green', 'orange', 'blue', 'purple', 'grayscale'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export const COLOR_MODES = ['system', 'light', 'dark'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const paletteIdSchema = z.enum(PALETTE_IDS);
export const colorModeSchema = z.enum(COLOR_MODES);

export const APPEARANCE_STORAGE_KEYS = {
  palette: 'bord-palette',
  theme: 'bord-theme',
} as const;

export const LEGACY_APPEARANCE_STORAGE_KEYS = {
  palette: 'our-recipes-palette',
  theme: 'our-recipes-theme',
} as const;

export const APPEARANCE_COOKIE_KEYS = {
  palette: 'bord-palette',
  mode: 'bord-mode',
} as const;

export const PALETTES = {
  green: {
    label: 'Green',
    brandBackground: '#4a6b3c',
    brandAccent: '#a85032',
    light: { primary: '#4a6b3c', secondary: '#98ad8f', accent: '#a85032', page: '#f7f8f5' },
    dark: { primary: '#a8c98b', secondary: '#8da37a', accent: '#e8956f', page: '#191c15' },
  },
  orange: {
    label: 'Orange',
    brandBackground: '#a24f2b',
    brandAccent: '#3f6f77',
    light: { primary: '#a24f2b', secondary: '#bd927f', accent: '#3f6f77', page: '#f8f6f5' },
    dark: { primary: '#eaa684', secondary: '#b78267', accent: '#86bcc0', page: '#1d1914' },
  },
  blue: {
    label: 'Blue',
    brandBackground: '#35606e',
    brandAccent: '#a85032',
    light: { primary: '#35606e', secondary: '#8ba8b1', accent: '#a85032', page: '#f5f7f7' },
    dark: { primary: '#8dbac6', secondary: '#7c9aa2', accent: '#e5a283', page: '#151a1c' },
  },
  purple: {
    label: 'Purple',
    brandBackground: '#64497a',
    brandAccent: '#9a5a26',
    light: { primary: '#64497a', secondary: '#9f91ab', accent: '#9a5a26', page: '#f7f5f7' },
    dark: { primary: '#c5acd6', secondary: '#927ca2', accent: '#e1a96a', page: '#1a151c' },
  },
  grayscale: {
    label: 'Greyscale',
    brandBackground: '#4d5250',
    brandAccent: '#9b5c47',
    light: { primary: '#4d5250', secondary: '#9ca09e', accent: '#9b5c47', page: '#f6f7f6' },
    dark: { primary: '#c5cac7', secondary: '#8c918e', accent: '#d49a82', page: '#181918' },
  },
} as const satisfies Record<
  PaletteId,
  {
    label: string;
    brandBackground: string;
    brandAccent: string;
    light: { primary: string; secondary: string; accent: string; page: string };
    dark: { primary: string; secondary: string; accent: string; page: string };
  }
>;

export const BRAND_ICON_CATEGORIES = [
  {
    id: 'kitchen',
    label: 'Kitchen tools',
    icons: [
      'table',
      'chef-hat',
      'cooking-pot',
      'utensils',
      'utensils-crossed',
      'hand-platter',
      'concierge-bell',
      'refrigerator',
      'microwave',
      'blender',
      'flame',
    ],
  },
  {
    id: 'food',
    label: 'Food and ingredients',
    icons: [
      'soup',
      'salad',
      'vegan',
      'sprout',
      'wheat',
      'apple',
      'banana',
      'cherry',
      'citrus',
      'grape',
      'carrot',
      'beef',
      'drumstick',
      'ham',
      'fish',
      'fish-symbol',
      'egg',
      'egg-fried',
      'milk',
      'sandwich',
      'pizza',
      'nut',
      'bean',
      'shell',
      'shrimp',
    ],
  },
  {
    id: 'baking',
    label: 'Baking and sweets',
    icons: [
      'cookie',
      'croissant',
      'donut',
      'dessert',
      'cake',
      'cake-slice',
      'candy',
      'candy-cane',
      'ice-cream',
      'ice-cream-bowl',
      'ice-cream-cone',
      'lollipop',
      'popcorn',
    ],
  },
  {
    id: 'drinks',
    label: 'Drinks',
    icons: [
      'coffee',
      'cup-soda',
      'glass-water',
      'martini',
      'wine',
      'beer',
      'bottle-wine',
      'amphora',
    ],
  },
  {
    id: 'dietary',
    label: 'Dietary variants',
    icons: ['wheat-off', 'milk-off', 'beer-off'],
  },
] as const;

export const BRAND_ICON_IDS = BRAND_ICON_CATEGORIES.flatMap((category) => category.icons);
export type BrandIconId = (typeof BRAND_ICON_IDS)[number];
export const DEFAULT_BRAND_ICON: BrandIconId = 'table';

export const brandIconIdSchema = z.enum(BRAND_ICON_IDS as [BrandIconId, ...BrandIconId[]]);

export function parsePalette(value: unknown): PaletteId {
  const parsed = paletteIdSchema.safeParse(value);
  return parsed.success ? parsed.data : 'green';
}

export function parseColorMode(value: unknown): ColorMode {
  const parsed = colorModeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'system';
}

export function parseBrandIcon(value: unknown): BrandIconId {
  const parsed = brandIconIdSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BRAND_ICON;
}

export function brandIconLabel(icon: BrandIconId): string {
  return icon
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
