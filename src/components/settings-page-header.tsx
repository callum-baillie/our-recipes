import type { ReactNode } from 'react';

export function SettingsPageHeader({
  eyebrow,
  title,
  description,
  icon,
  aside,
  meta,
}: {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className={aside ? 'settings-page-intro has-aside' : 'settings-page-intro'}>
      <div>
        <p className="eyebrow">
          {icon}
          {eyebrow}
        </p>
        <h1>{title}</h1>
        <p className="settings-page-description">{description}</p>
        {meta ? <div className="settings-page-meta">{meta}</div> : null}
      </div>
      {aside ? <div className="settings-page-aside">{aside}</div> : null}
    </section>
  );
}
