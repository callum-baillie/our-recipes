'use client';

import { ChevronDown, Menu, Plus, Settings, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';

import { BordHeaderLockup } from '@/components/bord-brand';
import { BrandIcon } from '@/components/brand-icon';
import { DismissibleDetails } from '@/components/dismissible-details';
import { ProfileSwitcher, type HeaderProfile } from '@/components/profile-switcher';
import { parseBrandIcon } from '@/lib/appearance';
import { hasCustomKitchenIdentity, PRODUCT_NAME } from '@/lib/brand';
import type { AppRole } from '@/lib/domain/permissions';

import styles from './app-header.module.css';

const AddRecipeDialog = dynamic(() =>
  import('@/components/add-recipe-dialog').then((module) => module.AddRecipeDialog),
);
const AiAssistantDrawer = dynamic(() =>
  import('@/components/ai-assistant-drawer').then((module) => module.AiAssistantDrawer),
);

type AppHeaderProps = {
  kitchenName: string;
  role: AppRole;
  activeProfileId: string | null;
  profiles: HeaderProfile[];
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

export function AppHeader({
  kitchenName,
  role,
  activeProfileId,
  profiles,
  kitchenIcon,
}: AppHeaderProps) {
  const pathname = usePathname();
  const [addRecipeOpen, setAddRecipeOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const addRecipeReturnFocusRef = useRef<HTMLElement | null>(null);
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const createMenuTriggerRef = useRef<HTMLElement>(null);
  const mobileNavigationTriggerRef = useRef<HTMLElement>(null);
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
                aria-current={matchesPath(pathname, link.href) ? 'page' : undefined}
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
              summaryRef={createMenuTriggerRef}
            >
              <div className={`${styles.createMenuPanel} create-menu-panel`} aria-label="Create">
                <button
                  hidden={role === 'child'}
                  type="button"
                  data-menu-close
                  onClick={() => {
                    addRecipeReturnFocusRef.current = createMenuTriggerRef.current;
                    setAddRecipeOpen(true);
                  }}
                >
                  Recipe
                </button>
                <Link hidden={role === 'child'} href="/planner#meal-plan-setup-title" data-menu-close>
                  Meal Plan
                </Link>
                <Link href="/nutrition?view=diary" data-menu-close>
                  Nutrition Entry
                </Link>
                <Link hidden={role === 'child'} href="/lists#new-shopping-list" data-menu-close>
                  Shopping List
                </Link>
              </div>
            </DismissibleDetails>
            {role !== 'child' ? <button
              ref={assistantTriggerRef}
              type="button"
              className={`${styles.utilityButton} settings-button`}
              aria-label="Open AI assistant"
              aria-controls="ai-assistant-drawer"
              aria-expanded={assistantOpen}
              title="AI assistant"
              onClick={() => {
                setAssistantMounted(true);
                setAssistantOpen(true);
              }}
            >
              <Sparkles size={19} aria-hidden="true" />
            </button> : null}
            {role === 'admin' ? <Link
              className={`${styles.utilityButton} ${styles.settingsUtility} settings-button${pathname.startsWith('/settings') ? ' active' : ''}`}
              href="/settings"
              aria-label="App settings"
              aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
              title="Settings"
            >
              <Settings size={19} aria-hidden="true" />
            </Link> : null}
            <span className={styles.controlDivider} aria-hidden="true" />
            <ProfileSwitcher
              activeProfileId={activeProfileId}
              profiles={profiles}
              canManageProfiles={role === 'admin'}
            />
            <DismissibleDetails
              className={`${styles.mobileNavigation} mobile-navigation`}
              summary={<Menu size={21} aria-hidden="true" />}
              summaryAriaLabel="Open navigation"
              summaryRef={mobileNavigationTriggerRef}
            >
              <nav aria-label="Mobile navigation">
                {primaryLinks.map((link) => (
                  <Link
                    className={matchesPath(pathname, link.href) ? 'active' : undefined}
                    href={link.href}
                    key={link.href}
                    aria-current={matchesPath(pathname, link.href) ? 'page' : undefined}
                  >
                    {link.label}
                  </Link>
                ))}
                {role === 'admin' ? <Link
                  className={`${styles.mobileSettingsLink}${pathname.startsWith('/settings') ? ' active' : ''}`}
                  href="/settings"
                  aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
                >
                  Settings
                </Link> : null}
                <div className={styles.mobileCreateGroup} aria-label="Create">
                  <span>Create</span>
                  <button
                    hidden={role === 'child'}
                    type="button"
                    data-menu-close
                    onClick={() => {
                      addRecipeReturnFocusRef.current = mobileNavigationTriggerRef.current;
                      setAddRecipeOpen(true);
                    }}
                  >
                    Recipe
                  </button>
                  <Link
                    hidden={role === 'child'}
                    href="/planner#meal-plan-setup-title"
                    data-menu-close
                  >
                    Meal Plan
                  </Link>
                  <Link href="/nutrition?view=diary" data-menu-close>
                    Nutrition Entry
                  </Link>
                  <Link hidden={role === 'child'} href="/lists#new-shopping-list" data-menu-close>
                    Shopping List
                  </Link>
                </div>
              </nav>
            </DismissibleDetails>
          </div>
        </header>
      </div>
      {addRecipeOpen ? (
        <AddRecipeDialog
          open
          onClose={() => setAddRecipeOpen(false)}
          returnFocusRef={addRecipeReturnFocusRef}
        />
      ) : null}
      {assistantMounted ? (
        <div id="ai-assistant-drawer">
          <AiAssistantDrawer
            open={assistantOpen}
            onClose={() => setAssistantOpen(false)}
            returnFocusRef={assistantTriggerRef}
          />
        </div>
      ) : null}
    </>
  );
}
