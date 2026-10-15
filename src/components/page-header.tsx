import type { ReactNode } from 'react';
import styles from './page-header.module.css';

/** Shared workspace header. Slots accept existing controls without changing their behavior.
 * Keep primary actions in actions; navigation/filters in toolbarLeft; secondary tools in toolbarRight.
 * Use children for a full-width search/filter row, and meta for quiet status information.
 */
export function PageHeader({
  title,
  titleId,
  eyebrow,
  description,
  leading,
  actions,
  options,
  meta,
  toolbarLeft,
  toolbarRight,
  children,
  className,
  density = 'standard',
}: {
  title: ReactNode;
  titleId?: string;
  eyebrow?: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  options?: ReactNode;
  meta?: ReactNode;
  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  children?: ReactNode;
  className?: string;
  density?: 'standard' | 'compact';
}) {
  return (
    <header
      className={`${styles.header}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
      data-density={density}
    >
      {leading && <div className={styles.leading}>{leading}</div>}
      <div className={styles.headingRow}>
        <div className={styles.copy}>
          {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
          <h1 className={styles.title} id={titleId}>
            {title}
          </h1>
          {description && <div className={styles.description}>{description}</div>}
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>
        {(actions || options) && (
          <div className={styles.controls}>
            {actions && <div className={styles.actions}>{actions}</div>}
            {options && <div className={styles.options}>{options}</div>}
          </div>
        )}
      </div>
      {(toolbarLeft || toolbarRight || children) && (
        <div className={styles.workspaceTools}>
          {(toolbarLeft || toolbarRight) && (
            <div className={styles.toolbarRow}>
              {toolbarLeft && <div className={styles.toolbarLeft}>{toolbarLeft}</div>}
              {toolbarRight && <div className={styles.toolbarRight}>{toolbarRight}</div>}
            </div>
          )}
          {children && <div className={styles.filters}>{children}</div>}
        </div>
      )}
    </header>
  );
}
