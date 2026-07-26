import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Import recipe',
  description: 'Import and review recipes from supported files and structured data.',
};

export default function ImportLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
