import { PageHeader } from '@/components/page-header';
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
    <PageHeader
      eyebrow={
        <>
          {icon}
          {eyebrow}
        </>
      }
      title={title}
      description={description}
      meta={meta}
      actions={aside ? <div className="settings-page-aside">{aside}</div> : undefined}
    />
  );
}
