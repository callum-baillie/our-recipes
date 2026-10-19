'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, type ComponentType } from 'react';

export function SettingsSectionNav({
  scope,
  links,
}: {
  scope: string;
  links: ReadonlyArray<{
    href: string;
    label: string;
    icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  }>;
}) {
  const pathname = usePathname();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const active = (href: string) =>
    pathname === href ||
    (href !== '/account' && href !== '/settings' && pathname.startsWith(`${href}/`));
  const current = links.find(({ href }) => active(href));
  function destinations() {
    return links.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={active(href) ? 'page' : undefined}
        onClick={() => {
          if (disclosure.current?.open) {
            disclosure.current.open = false;
            disclosure.current.querySelector('summary')?.focus();
          }
        }}
      >
        <Icon size={16} aria-hidden="true" />
        {label}
      </Link>
    ));
  }
  return (
    <div className="settings-section-nav">
      <nav className="settings-desktop-nav" aria-label={`${scope} sections`}>
        {destinations()}
      </nav>
      <details
        ref={disclosure}
        className="settings-mobile-nav"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && disclosure.current?.open) {
            event.preventDefault();
            disclosure.current.open = false;
            disclosure.current.querySelector('summary')?.focus();
          }
        }}
      >
        <summary>
          <span>{scope}</span>
          <strong>{current?.label ?? 'Choose a section'}</strong>
        </summary>
        <nav aria-label={`${scope} sections`}>{destinations()}</nav>
      </details>
    </div>
  );
}
