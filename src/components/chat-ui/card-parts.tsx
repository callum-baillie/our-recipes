import { AlertTriangle, Check, Info, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ButtonSpinner } from '../skeleton';
import styles from './cards.module.css';

/** Shared vocabulary for every card the assistant puts in the conversation. */

export type CardStatus = 'draft' | 'saved' | 'working' | 'attention' | 'closed';

const statusLabel: Record<string, { tone: CardStatus; label: string }> = {
  pending: { tone: 'draft', label: 'Draft' },
  confirmed: { tone: 'saved', label: 'Saved' },
  applied: { tone: 'saved', label: 'Saved' },
  completed: { tone: 'saved', label: 'Complete' },
  queued: { tone: 'working', label: 'Queued' },
  running: { tone: 'working', label: 'Working' },
  submitted: { tone: 'working', label: 'Working' },
  partial: { tone: 'attention', label: 'Needs attention' },
  failed: { tone: 'attention', label: 'Needs attention' },
  cancelled: { tone: 'closed', label: 'Cancelled' },
  dismissed: { tone: 'closed', label: 'Dismissed' },
  superseded: { tone: 'closed', label: 'Replaced' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const known = statusLabel[status] ?? { tone: 'closed' as const, label: status };
  return (
    <span className={styles.badge} data-tone={known.tone}>
      {known.tone === 'working' ? <span className={styles.dot} aria-hidden="true" /> : null}
      {known.tone === 'saved' ? <Check aria-hidden="true" /> : null}
      {label ?? known.label}
    </span>
  );
}

export function CardHead({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  status,
  statusLabel: badgeLabel,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: string;
  statusLabel?: string;
}) {
  return (
    <header className={styles.head}>
      <span className={styles.chip} aria-hidden="true">
        <Icon />
      </span>
      <div className={styles.headCopy}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h3 className={styles.title}>{title}</h3>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {status ? <StatusBadge status={status} label={badgeLabel} /> : null}
    </header>
  );
}

export function CardFooter({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <footer className={styles.footer}>
      {note ? <p className={styles.footnote}>{note}</p> : null}
      <div className={styles.footerActions}>{children}</div>
    </footer>
  );
}

export function ActionButton({
  tone = 'secondary',
  pending = false,
  icon: Icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'quiet';
  pending?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`${styles.button} ${styles[tone]} ${className}`.trim()}
      aria-busy={pending || undefined}
    >
      {pending ? <ButtonSpinner /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Callout({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'error';
  children: ReactNode;
}) {
  const Icon =
    tone === 'warning' || tone === 'error' ? AlertTriangle : tone === 'success' ? Check : Info;
  return (
    <div
      className={styles.callout}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : tone === 'info' ? 'status' : undefined}
    >
      <Icon aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Disclosure({
  summary,
  count,
  defaultOpen = false,
  children,
}: {
  summary: ReactNode;
  count?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={styles.disclosure} open={defaultOpen || undefined}>
      <summary>
        <span>{summary}</span>
        {count !== undefined ? <small>{count}</small> : null}
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}
