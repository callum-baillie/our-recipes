import type { HTMLAttributes, LabelHTMLAttributes, FieldsetHTMLAttributes, ReactNode } from 'react';

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
          {eyebrow &&
          (typeof title !== 'string' || title.toLowerCase() !== eyebrow.toLowerCase()) ? (
            <p className="eyebrow">{eyebrow}</p>
          ) : null}
          <h2 id={props['aria-labelledby']?.split(' ')[0]}>{title}</h2>
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

/** One labelled preference. Native controls retain keyboard, form and label behavior. */
export function SettingsField({
  title,
  description,
  children,
  className,
  compact = false,
  ...props
}: Omit<LabelHTMLAttributes<HTMLLabelElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  compact?: boolean;
}) {
  return (
    <label
      {...props}
      className={classes('settings-field', compact && 'settings-field-compact', className)}
    >
      <span className="settings-row-copy">
        <span className="settings-field-title">{title}</span>
        {description ? <span className="settings-field-description">{description}</span> : null}
      </span>
      <span className="settings-field-control">{children}</span>
    </label>
  );
}

/** Full-width content within a settings pane, such as saved devices or recovery bundles. */
export function SettingsSubsection({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section {...props} className={classes('settings-subsection', className)}>
      <header>
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="settings-inline-actions">{actions}</div> : null}
      </header>
      <div className="settings-subsection-content">{children}</div>
    </section>
  );
}

export function SettingsItem({
  title,
  description,
  children,
  actions,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article {...props} className={classes('settings-item', className)}>
      <div className="settings-item-copy">
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="settings-inline-actions">{actions}</div> : null}
    </article>
  );
}

export function SettingsEmpty({ children }: { children: ReactNode }) {
  return <p className="settings-empty">{children}</p>;
}

export function SettingsGroup({
  title,
  description,
  children,
  className,
  ...props
}: Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <fieldset {...props} className={classes('settings-group', className)}>
      <legend>{title}</legend>
      {description ? <p className="settings-group-description">{description}</p> : null}
      {children}
    </fieldset>
  );
}
