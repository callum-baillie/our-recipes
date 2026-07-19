'use client';

import { Menu, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { AddRecipeDialog } from '@/components/add-recipe-dialog';
import { DismissibleDetails } from '@/components/dismissible-details';
import { ProfileSwitcher } from '@/components/profile-switcher';
import type { ProfileRecord } from '@/lib/services/household-service';

type AppHeaderProps = {
  appName: string;
  activeProfileId: string | null;
  profiles: ProfileRecord[];
};

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const primaryLinks = [
  { href: '/recipes', label: 'Recipebook' },
  { href: '/planner', label: 'Planner' },
  { href: '/lists', label: 'Lists' },
  { href: '/collections', label: 'Collections' },
] as const;

export function AppHeader({ appName, activeProfileId, profiles }: AppHeaderProps) {
  const pathname = usePathname();
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);

  return (
    <>
      <div className="app-header-shell">
        <header className="app-header">
          <Link className="wordmark" href="/" aria-label={`${appName} home`}>
            <span className="wordmark-mark" aria-hidden="true" />
            <span>{appName}</span>
          </Link>
          <nav className="desktop-navigation" aria-label="Primary navigation">
            {primaryLinks.map((link) => (
              <Link
                className={matchesPath(pathname, link.href) ? 'active' : undefined}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="app-header-controls">
            <button
              className="settings-button add-recipe-header-button"
              type="button"
              aria-label="Add a recipe"
              aria-controls="add-recipe-dialog"
              aria-expanded={addRecipeOpen}
              aria-haspopup="dialog"
              title="Add a recipe"
              onClick={() => setAddRecipeOpen(true)}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
            <Link
              className={`settings-button${pathname.startsWith('/settings') ? ' active' : ''}`}
              href="/settings"
              aria-label="App settings"
              title="Settings"
            >
              <Settings size={19} aria-hidden="true" />
            </Link>
            <ProfileSwitcher activeProfileId={activeProfileId} profiles={profiles} />
            <DismissibleDetails
              className="mobile-navigation"
              summary={<Menu size={21} aria-hidden="true" />}
              summaryAriaLabel="Open navigation"
            >
              <nav aria-label="Mobile navigation">
                {primaryLinks.map((link) => (
                  <Link
                    className={matchesPath(pathname, link.href) ? 'active' : undefined}
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </DismissibleDetails>
          </div>
        </header>
      </div>
      <AddRecipeDialog open={addRecipeOpen} onClose={() => setAddRecipeOpen(false)} />
    </>
  );
}
