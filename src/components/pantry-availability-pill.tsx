import type { PantryAvailabilityState } from '@/lib/domain/pantry-availability';

import styles from './pantry-availability-pill.module.css';

const LABELS: Record<PantryAvailabilityState, string> = {
  ready: 'Pantry ready',
  partial: 'Pantry short',
  unknown: 'Pantry unknown',
};

export function PantryAvailabilityPill({ state }: { state: PantryAvailabilityState }) {
  return <span className={`${styles.pill} ${styles[state]}`}>{LABELS[state]}</span>;
}
