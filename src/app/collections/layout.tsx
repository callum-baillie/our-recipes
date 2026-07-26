import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Collections',
  description: 'Organize household recipes into useful collections.',
};

export default function CollectionsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
