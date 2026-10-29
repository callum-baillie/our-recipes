import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { brandedKitchenTitle, DEFAULT_KITCHEN_NAME } from '@/lib/brand';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';

// Pantry's own title already consumed the site template, so this one is spelled out in full.
export async function generateMetadata(): Promise<Metadata> {
  const kitchenName = getHouseholdState().household?.kitchenName ?? DEFAULT_KITCHEN_NAME;
  return {
    title: { absolute: `Add to pantry · ${brandedKitchenTitle(kitchenName)}` },
    description: 'Scan, search or enter items to add to your pantry.',
  };
}

export default function AddToPantryLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
