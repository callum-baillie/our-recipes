import { DialogSkeleton, Skeleton } from './skeleton';
import styles from './app-header.module.css';

export function AssistantLoadingSurface() {
  return (
    <div className={styles.lazyDrawerBackdrop}>
      <section className={styles.lazyDrawer} aria-label="Opening AI assistant">
        <div className={styles.lazySurfaceHeader}>
          <Skeleton width="52%" height="1.4rem" />
          <Skeleton className={styles.lazyClose} />
        </div>
        <DialogSkeleton label="Opening AI assistant" variant="assistant" />
      </section>
    </div>
  );
}
