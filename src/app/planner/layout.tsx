import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import styles from './layout.module.css';

export const metadata: Metadata = {
  title: 'Meal planner',
  description: 'Build household meal plans, review Pantry coverage, and create grocery lists.',
};

export default function PlannerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={`${styles.workspaceShell} planner-workspace-shell`}>{children}</div>;
}
