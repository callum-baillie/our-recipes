import { CircleCheck, Info, TriangleAlert, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './inline-alert.module.css';

export function InlineAlert({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error';
}) {
  const Icon = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert }[
    tone
  ];
  return (
    <div className={styles.alert} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
