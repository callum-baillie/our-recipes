import type { CSSProperties, ReactNode } from 'react';

import styles from './skeleton.module.css';

type SkeletonProps = {
  className?: string;
  height?: CSSProperties['height'];
  width?: CSSProperties['width'];
};

export function Skeleton({ className = '', height, width }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${className}`.trim()}
      style={{ height, width }}
    />
  );
}

export function SkeletonStatus({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={`${styles.status} ${className}`.trim()}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {children}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
}

export function InlineSkeleton({
  label = 'Loading',
  width = '4.5rem',
}: {
  label?: string;
  width?: string;
}) {
  return (
    <span className={styles.inlineStatus} role="status" aria-label={label}>
      <Skeleton className={styles.inline} width={width} />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}

export function AsyncSkeleton({
  className = '',
  label,
  variant = 'panel',
}: {
  className?: string;
  label: string;
  variant?: 'image' | 'message' | 'panel' | 'rows';
}) {
  return (
    <SkeletonStatus className={`${styles.async} ${styles[variant]} ${className}`} label={label}>
      {variant === 'image' ? <Skeleton className={styles.imageBlock} /> : null}
      {variant === 'message' ? (
        <>
          <Skeleton className={styles.avatar} />
          <span className={styles.messageCopy}>
            <Skeleton width="72%" />
            <Skeleton width="48%" />
          </span>
        </>
      ) : null}
      {variant === 'panel' ? (
        <>
          <Skeleton height="1.3rem" width="38%" />
          <Skeleton width="88%" />
          <Skeleton width="64%" />
          <Skeleton className={styles.panelControl} />
        </>
      ) : null}
      {variant === 'rows' ? (
        <>
          {Array.from({ length: 3 }, (_, index) => (
            <span className={styles.asyncRow} key={index}>
              <Skeleton className={styles.rowIcon} />
              <span className={styles.rowCopy}>
                <Skeleton width={`${72 - index * 8}%`} />
                <Skeleton width={`${42 + index * 7}%`} />
              </span>
            </span>
          ))}
        </>
      ) : null}
    </SkeletonStatus>
  );
}

export type PageSkeletonVariant =
  | 'collection'
  | 'cook'
  | 'dashboard'
  | 'detail'
  | 'editor'
  | 'home'
  | 'library'
  | 'list'
  | 'offline'
  | 'planner'
  | 'settings'
  | 'workspace';

function HeadingSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.heading}>
      <Skeleton className={styles.eyebrow} />
      <Skeleton className={compact ? styles.titleCompact : styles.title} />
      <Skeleton className={styles.subtitle} />
    </div>
  );
}

function CardGrid({ count = 3 }: { count?: number }) {
  return (
    <div className={styles.cardGrid}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.card} key={index}>
          <Skeleton className={styles.cardMedia} />
          <div className={styles.cardCopy}>
            <Skeleton height="1.35rem" width={`${72 + (index % 2) * 12}%`} />
            <Skeleton width="94%" />
            <Skeleton width="66%" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className={styles.formGrid}>
      {Array.from({ length: 6 }, (_, index) => (
        <div className={index === 4 ? styles.formWide : styles.formField} key={index}>
          <Skeleton height="0.75rem" width={`${32 + (index % 3) * 10}%`} />
          <Skeleton className={index === 4 ? styles.textarea : styles.input} />
        </div>
      ))}
    </div>
  );
}

function RowList({ count = 5 }: { count?: number }) {
  return (
    <div className={styles.rowList}>
      {Array.from({ length: count }, (_, index) => (
        <div className={styles.row} key={index}>
          <Skeleton className={styles.rowIcon} />
          <div className={styles.rowCopy}>
            <Skeleton height="1rem" width={`${54 + (index % 3) * 12}%`} />
            <Skeleton width={`${36 + (index % 2) * 18}%`} />
          </div>
          <Skeleton className={styles.rowAction} />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({
  as: Tag = 'main',
  variant,
}: {
  as?: 'div' | 'main';
  variant: PageSkeletonVariant;
}) {
  let body: ReactNode;

  if (variant === 'home') {
    body = (
      <>
        <div className={styles.homeHero}>
          <HeadingSkeleton />
          <Skeleton className={styles.heroMedia} />
        </div>
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.button} />
        </div>
        <CardGrid />
      </>
    );
  } else if (variant === 'planner') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.plannerGrid}>
          <div className={styles.setupPanel}>
            <Skeleton height="1.8rem" width="72%" />
            <FormSkeleton />
          </div>
          <div className={styles.calendarPanel}>
            <div className={styles.calendarHeader}>
              <Skeleton height="2rem" width="38%" />
              <Skeleton className={styles.buttonWide} />
            </div>
            <div className={styles.calendarGrid}>
              {Array.from({ length: 21 }, (_, index) => (
                <Skeleton className={styles.calendarCell} key={index} />
              ))}
            </div>
          </div>
        </div>
      </>
    );
  } else if (variant === 'dashboard') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.tabs}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className={styles.tab} key={index} />
          ))}
        </div>
        <div className={styles.metricGrid}>
          {Array.from({ length: 4 }, (_, index) => (
            <div className={styles.metric} key={index}>
              <Skeleton className={styles.metricIcon} />
              <Skeleton height="2rem" width="48%" />
              <Skeleton width="72%" />
            </div>
          ))}
        </div>
        <div className={styles.chartGrid}>
          <Skeleton className={styles.chart} />
          <Skeleton className={styles.chart} />
        </div>
      </>
    );
  } else if (variant === 'detail') {
    body = (
      <>
        <div className={styles.detailHero}>
          <Skeleton className={styles.detailMedia} />
          <HeadingSkeleton />
        </div>
        <div className={styles.detailGrid}>
          <div className={styles.panel}>
            <RowList count={5} />
          </div>
          <div className={styles.panel}>
            <RowList count={4} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'editor') {
    body = (
      <>
        <HeadingSkeleton compact />
        <div className={styles.editorGrid}>
          <div className={styles.panel}>
            <FormSkeleton />
          </div>
          <div className={styles.panel}>
            <Skeleton className={styles.editorMedia} />
            <RowList count={3} />
          </div>
        </div>
      </>
    );
  } else if (variant === 'settings') {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.settingsStack}>
          {Array.from({ length: 3 }, (_, index) => (
            <div className={styles.settingsPanel} key={index}>
              <div>
                <Skeleton height="1.35rem" width="48%" />
                <Skeleton width="82%" />
                <Skeleton width="64%" />
              </div>
              <FormSkeleton />
            </div>
          ))}
        </div>
      </>
    );
  } else if (variant === 'workspace') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.workspaceGrid}>
          <aside className={styles.panel}>
            <RowList count={6} />
          </aside>
          <section className={styles.panel}>
            <FormSkeleton />
            <RowList count={5} />
          </section>
        </div>
      </>
    );
  } else if (variant === 'cook') {
    body = (
      <div className={styles.cookGrid}>
        <HeadingSkeleton />
        <Skeleton className={styles.stepMedia} />
        <div className={styles.panel}>
          <RowList count={4} />
        </div>
      </div>
    );
  } else if (variant === 'offline') {
    body = (
      <div className={styles.offlineCard}>
        <Skeleton className={styles.metricIcon} />
        <HeadingSkeleton compact />
        <Skeleton className={styles.buttonWide} />
      </div>
    );
  } else if (variant === 'list' || variant === 'collection') {
    body = (
      <>
        <div className={styles.headingAction}>
          <HeadingSkeleton />
          <Skeleton className={styles.buttonWide} />
        </div>
        <div className={styles.panel}>
          <RowList count={variant === 'list' ? 7 : 5} />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <HeadingSkeleton />
        <div className={styles.toolbar}>
          <Skeleton className={styles.search} />
          <Skeleton className={styles.buttonWide} />
        </div>
        <CardGrid count={variant === 'library' ? 6 : 3} />
      </>
    );
  }

  return (
    <Tag className={styles.page} data-skeleton-page={variant}>
      <SkeletonStatus className={styles.pageInner} label="Loading page">
        {body}
      </SkeletonStatus>
    </Tag>
  );
}
