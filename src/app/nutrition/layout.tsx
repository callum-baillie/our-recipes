import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nutrition',
  description: 'Review confirmed food, planned portions, goals, and household nutrition trends.',
};

export default function NutritionLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
