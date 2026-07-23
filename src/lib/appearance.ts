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
    brandBackground: '#536938',
    brandAccent: '#a85032',
    light: { primary: '#536938', secondary: '#91a379', accent: '#a85032', page: '#faf7f0' },
    dark: { primary: '#b8d38d', secondary: '#8fa96d', accent: '#a85032', page: '#202920' },
  },
  orange: {
    label: 'Orange',
    brandBackground: '#9a4f2f',
    brandAccent: '#466f75',
    light: { primary: '#9a4f2f', secondary: '#bf7b4e', accent: '#466f75', page: '#faf7f0' },
    dark: { primary: '#e2a07d', secondary: '#b97f5a', accent: '#82b6b8', page: '#28201c' },
  },
  blue: {
    label: 'Blue',
    brandBackground: '#3f6571',
    brandAccent: '#a85032',
    light: { primary: '#3f6571', secondary: '#7f9ca3', accent: '#a85032', page: '#f7f8f5' },
    dark: { primary: '#8eb8c1', secondary: '#7899a1', accent: '#dfa07e', page: '#1e272a' },
  },
  purple: {
    label: 'Purple',
    brandBackground: '#695174',
    brandAccent: '#9d5d29',
    light: { primary: '#695174', secondary: '#927c9b', accent: '#9d5d29', page: '#faf7f8' },
    dark: { primary: '#bca5c5', secondary: '#957f9e', accent: '#dda566', page: '#272129' },
  },
  grayscale: {
    label: 'Greyscale',
    brandBackground: '#515654',
    brandAccent: '#9b5c47',
    light: { primary: '#515654', secondary: '#858b87', accent: '#9b5c47', page: '#f8f7f3' },
    dark: { primary: '#c3c9c5', secondary: '#909793', accent: '#cf947b', page: '#222423' },
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
