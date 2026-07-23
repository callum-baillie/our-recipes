import type { ReactNode } from 'react';

import styles from './layout.module.css';

export default function PlannerLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={`${styles.workspaceShell} planner-workspace-shell`}>{children}</div>;
}
