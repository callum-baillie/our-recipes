import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Shopping lists',
  description: 'Create and use household grocery lists from meal plans or manual entries.',
};

export default function ListsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
