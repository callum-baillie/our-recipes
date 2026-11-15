import { Sparkles } from 'lucide-react';
import { Skeleton } from '../skeleton';
import cards from './cards.module.css';
import styles from './chat-states.module.css';

/** Waiting states for the conversation: the first-token wait and a draft being composed. */
export function ThinkingRow({ label }: { label: string }) {
  return (
    <div className={styles.thinking} role="status" aria-label={label || 'Thinking'}>
      <span className={styles.orb} aria-hidden="true">
        <Sparkles />
      </span>
      <span className={styles.thinkingLabel}>{label || 'Thinking…'}</span>
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

/** Placeholder with the shape of a draft card, shown while a recipe or meal plan is generated. */
export function DraftSkeleton({ label }: { label: string }) {
  return (
    <div
      className={`${cards.card} ${styles.draft}`}
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <div className={styles.draftHead}>
        <Skeleton className={styles.draftChip} />
        <div className={styles.draftCopy}>
          <Skeleton width="34%" height="0.6rem" />
          <Skeleton width="68%" height="1.1rem" />
        </div>
      </div>
      <div className={styles.draftRows}>
        {[78, 64, 71].map((width, index) => (
          <div className={styles.draftRow} key={index}>
            <Skeleton className={styles.draftTag} />
            <div className={styles.draftCopy}>
              <Skeleton width={`${width}%`} />
              <Skeleton width={`${width - 28}%`} height="0.65rem" />
            </div>
          </div>
        ))}
      </div>
      <p className={styles.draftLabel}>{label}</p>
    </div>
  );
}
