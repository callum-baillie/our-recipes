import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Pantry',
  description: 'Track household ingredients, quantities, locations, and expiry dates.',
};

export default function PantryLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
