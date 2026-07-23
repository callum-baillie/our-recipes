'use client';

import { ChevronDown, Menu, Plus, Settings, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { AddRecipeDialog } from '@/components/add-recipe-dialog';
import { AiAssistantDrawer } from '@/components/ai-assistant-drawer';
import { BordHeaderLockup } from '@/components/bord-brand';
import { BrandIcon } from '@/components/brand-icon';
import { DismissibleDetails } from '@/components/dismissible-details';
import { ProfileSwitcher } from '@/components/profile-switcher';
import type { ProfileRecord } from '@/lib/services/household-service';
import { parseBrandIcon } from '@/lib/appearance';
import { hasCustomKitchenIdentity, PRODUCT_NAME } from '@/lib/brand';

import styles from './app-header.module.css';

type AppHeaderProps = {
  kitchenName: string;
  activeProfileId: string | null;
  profiles: ProfileRecord[];
  kitchenIcon: string;
};

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const primaryLinks = [
  { href: '/recipes', label: 'Recipebook' },
  { href: '/pantry', label: 'Pantry' },
  { href: '/nutrition', label: 'Nutrition' },
  { href: '/planner', label: 'Planner' },
  { href: '/lists', label: 'Lists' },
] as const;

export function AppHeader({ kitchenName, activeProfileId, profiles, kitchenIcon }: AppHeaderProps) {
  const pathname = usePathname();
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const resolvedKitchenIcon = parseBrandIcon(kitchenIcon);
  const showCustomKitchenIdentity = hasCustomKitchenIdentity(kitchenName, resolvedKitchenIcon);

  return (
    <>
      <div className={`app-header-shell ${styles.shell}`}>
        <header className={`app-header ${styles.header}`}>
          <Link
            className={`${styles.wordmark} wordmark ${showCustomKitchenIdentity ? 'custom-kitchen-wordmark' : 'product-wordmark'}`}
            href="/"
            aria-label={`${showCustomKitchenIdentity ? kitchenName : PRODUCT_NAME} home`}
          >
            {showCustomKitchenIdentity ? (
              <>
                <span className="wordmark-mark custom" aria-hidden="true">
                  <BrandIcon icon={resolvedKitchenIcon} size={21} strokeWidth={2.25} />
                </span>
                <span>{kitchenName}</span>
              </>
            ) : (
              <BordHeaderLockup />
            )}
          </Link>
          <nav
            className={`${styles.desktopNavigation} desktop-navigation`}
            aria-label="Primary navigation"
          >
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
          <div className={`${styles.controls} app-header-controls`}>
            <DismissibleDetails
              className={`${styles.createMenu} create-menu`}
              summary={
                <>
                  <Plus size={21} strokeWidth={1.9} aria-hidden="true" />
                  <span className={styles.createMenuLabel}>Create</span>
                  <ChevronDown className={styles.createMenuChevron} size={17} aria-hidden="true" />
                </>
              }
              summaryAriaLabel="Create"
            >
              <div
                className={`${styles.createMenuPanel} create-menu-panel`}
                role="menu"
                aria-label="Create"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-menu-close
                  onClick={() => setAddRecipeOpen(true)}
                >
                  Recipe
                </button>
                <Link href="/planner#meal-plan-setup-title" role="menuitem" data-menu-close>
                  Meal Plan
                </Link>
                <Link href="/nutrition?view=diary" role="menuitem" data-menu-close>
                  Nutrition Entry
                </Link>
                <Link href="/lists#new-shopping-list" role="menuitem" data-menu-close>
                  Shopping List
                </Link>
              </div>
            </DismissibleDetails>
            <Link
              className={`${styles.utilityButton} settings-button`}
              href="#ai-assistant"
              aria-label="Open AI assistant"
              aria-controls="ai-assistant-drawer"
              aria-expanded={assistantOpen}
              title="AI assistant"
              onClick={(event) => {
                event.preventDefault();
                setAssistantOpen(true);
              }}
            >
              <Sparkles size={19} aria-hidden="true" />
            </Link>
            <Link
              className={`${styles.utilityButton} ${styles.settingsUtility} settings-button${pathname.startsWith('/settings') ? ' active' : ''}`}
              href="/settings"
              aria-label="App settings"
              title="Settings"
            >
              <Settings size={19} aria-hidden="true" />
            </Link>
            <span className={styles.controlDivider} aria-hidden="true" />
            <ProfileSwitcher activeProfileId={activeProfileId} profiles={profiles} />
            <DismissibleDetails
              className={`${styles.mobileNavigation} mobile-navigation`}
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
                <Link
                  className={`${styles.mobileSettingsLink}${pathname.startsWith('/settings') ? ' active' : ''}`}
                  href="/settings"
                >
                  Settings
                </Link>
              </nav>
            </DismissibleDetails>
          </div>
        </header>
      </div>
      <AddRecipeDialog open={addRecipeOpen} onClose={() => setAddRecipeOpen(false)} />
      <div id="ai-assistant-drawer">
        <AiAssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />
      </div>
    </>
  );
}
