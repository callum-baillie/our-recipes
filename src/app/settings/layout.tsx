import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Manage household, profile, recipe, Pantry, Nutrition, list, AI, and system settings.',
};

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
