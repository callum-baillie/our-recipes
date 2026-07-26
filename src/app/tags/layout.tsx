import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Recipe tags',
  description: 'Manage shared recipe tags and keep the recipe library organized.',
};

export default function TagsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
