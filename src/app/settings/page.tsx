import {
  Sparkles,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ListChecks,
  KeyRound,
  PackageOpen,
  Settings2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SettingsPageHeader } from '@/components/settings-page-header';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';

const categories = [
  {
    href: '/settings/ai',
    eyebrow: 'AI SETTINGS',
    title: 'AI models and access',
    description: 'Global AI defaults, batch processing, and account permissions.',
    icon: Sparkles,
  },
  {
    href: '/settings/automation',
    eyebrow: 'BACKGROUND TASKS',
    title: 'Queue and automation',
    description: 'Queue status, bulk processing, and scheduled meal-plan drafts.',
    icon: CalendarDays,
  },
  {
    href: '/settings/api',
    eyebrow: 'API & SECURITY',
    title: 'API keys',
    description: 'Create and revoke scoped keys for scripts and external apps.',
    icon: KeyRound,
  },
  {
    href: '/settings/system',
    eyebrow: 'SYSTEM SETTINGS',
    title: 'App identity and recovery',
    description: 'Rename the kitchen, choose its icon, manage backups, or reset this installation.',
    icon: Settings2,
  },
  {
    href: '/settings/profiles',
    eyebrow: 'PROFILE SETTINGS',
    title: 'Members, roles, and guardians',
    description: 'Manage household membership, account roles, and guardian assignments.',
    icon: Users,
  },
  {
    href: '/settings/recipes',
    eyebrow: 'RECIPE SETTINGS',
    title: 'Cookbook and recipe defaults',
    description: 'Set the initial library order and serving count for newly added recipes.',
    icon: ClipboardList,
  },
  {
    href: '/settings/meal-plan',
    eyebrow: 'MEAL PLAN SETTINGS',
    title: 'Weeks, planning range, and meals',
    description: 'Choose how a fresh meal-planning session is laid out.',
    icon: CalendarDays,
  },
  {
    href: '/settings/lists',
    eyebrow: 'LIST SETTINGS',
    title: 'Shopping behavior and supermarket routes',
    description: 'Control completed items, Pantry intake, wake lock, stores, and aisle order.',
    icon: ListChecks,
  },
  {
    href: '/settings/pantry',
    eyebrow: 'PANTRY SETTINGS',
    title: 'Stock views and organization',
    description: 'Choose the default Pantry filter, sort order, and grouping.',
    icon: PackageOpen,
  },
] as const;

export default function SettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  return (
    <main className="recipe-page settings-hub">
      <SettingsPageHeader
        eyebrow="SETTINGS"
        title="Household settings"
        description="Manage shared defaults, household access, and this installation. Personal preferences are in My profile."
      />
      <section className="settings-overview" aria-label="Settings categories">
        {categories.map(({ href, eyebrow, title, description, icon: Icon }) => (
          <Link className="settings-overview-card linked" href={href} key={href}>
            <span className="settings-overview-icon" aria-hidden="true">
              <Icon size={21} />
            </span>
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        ))}
      </section>
    </main>
  );
}
