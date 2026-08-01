import type { HTMLAttributes, ReactNode } from 'react';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function SettingsPane({
  eyebrow,
  title,
  description,
  icon,
  actions,
  children,
  className,
  tone = 'default',
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <section
      className={classes('settings-pane', tone === 'danger' && 'settings-pane-danger', className)}
      {...props}
    >
      <header className={classes('settings-pane-header', Boolean(icon) && 'has-icon')}>
        {icon ? <span className="settings-pane-icon">{icon}</span> : null}
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="settings-pane-actions">{actions}</div> : null}
      </header>
      <div className="settings-pane-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  className,
  align = 'center',
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  align?: 'center' | 'start';
}) {
  return (
    <div
      className={classes('settings-row', align === 'start' && 'settings-row-start', className)}
      {...props}
    >
      <div className="settings-row-copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsControlGroup({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classes('settings-control-group', className)} {...props}>
      {children}
    </div>
  );
}

export function SettingsActionBar({
  children,
  status,
}: {
  children: ReactNode;
  status?: ReactNode;
}) {
  return (
    <footer className="settings-action-bar">
      <div role="status">{status}</div>
      <div>{children}</div>
    </footer>
  );
}
