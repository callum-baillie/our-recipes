import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Recipebook',
  description: 'Browse, create, cook, and organize the household recipe library.',
};

export default function RecipesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
