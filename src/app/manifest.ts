import type { MetadataRoute } from 'next';
import { cookies } from 'next/headers';

import { APPEARANCE_COOKIE_KEYS, PALETTES, parseBrandIcon, parsePalette } from '@/lib/appearance';
import { getHouseholdState } from '@/lib/services/household-service';
import { DEFAULT_KITCHEN_NAME, PRODUCT_NAME } from '@/lib/brand';

export const dynamic = 'force-dynamic';

function iconUrl(palette: string, icon: string, size: number) {
  return `/api/v1/branding/icons/v1/${palette}/${icon}/${size}`;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookieStore = await cookies();
  const palette = parsePalette(cookieStore.get(APPEARANCE_COOKIE_KEYS.palette)?.value);
  const household = getHouseholdState().household;
  const kitchenIcon = parseBrandIcon(household?.kitchenIcon);
  const kitchenName = household?.kitchenName ?? DEFAULT_KITCHEN_NAME;
  const colors = PALETTES[palette];

  return {
    id: '/',
    name: kitchenName,
    short_name: kitchenName,
    description: `${kitchenName} is powered by ${PRODUCT_NAME}, your shared kitchen helper.`,
    start_url: '/',
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    display: 'standalone',
    orientation: 'any',
    background_color: colors.brandBackground,
    theme_color: colors.brandBackground,
    categories: ['food', 'lifestyle', 'utilities'],
    shortcuts: [
      {
        name: 'Recipebook',
        short_name: 'Recipes',
        description: 'Browse the household recipe library.',
        url: '/recipes',
      },
      {
        name: 'Meal planner',
        short_name: 'Planner',
        description: 'Plan meals for the household.',
        url: '/planner',
      },
      {
        name: 'Pantry',
        short_name: 'Pantry',
        description: 'Review food on hand.',
        url: '/pantry',
      },
      {
        name: 'Shopping lists',
        short_name: 'Lists',
        description: 'Shop from household grocery lists.',
        url: '/lists',
      },
    ],
    icons: [
      {
        src: iconUrl(palette, kitchenIcon, 192),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: iconUrl(palette, kitchenIcon, 512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: iconUrl(palette, kitchenIcon, 512),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: iconUrl(palette, kitchenIcon, 1024),
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
