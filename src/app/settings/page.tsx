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
    href: '/settings/scanner',
    eyebrow: 'SCANNER SETTINGS',
    title: 'Scanner',
    description: 'Set up hardware scanners, camera preferences, and print a wall action sheet.',
    icon: PackageOpen,
  },
  {
    href: '/settings/profiles',
    eyebrow: 'PROFILE SETTINGS',
    title: 'Profiles & roles',
    description: 'Manage household membership, account roles, and guardian assignments.',
    icon: Users,
  },
  {
    href: '/settings/recipes',
    eyebrow: 'RECIPE SETTINGS',
    title: 'Recipes',
    description: 'Set the initial library order and serving count for newly added recipes.',
    icon: ClipboardList,
  },
  {
    href: '/settings/meal-plan',
    eyebrow: 'MEAL PLAN SETTINGS',
    title: 'Meal plans',
    description: 'Choose how a fresh meal-planning session is laid out.',
    icon: CalendarDays,
  },
  {
    href: '/settings/lists',
    eyebrow: 'LIST SETTINGS',
    title: 'Lists',
    description: 'Control completed items, Pantry intake, wake lock, stores, and aisle order.',
    icon: ListChecks,
  },
  {
    href: '/settings/pantry',
    eyebrow: 'PANTRY SETTINGS',
    title: 'Pantry',
    description: 'Choose the default Pantry filter, sort order, and grouping.',
    icon: PackageOpen,
  },
  {
    href: '/settings/ai',
    eyebrow: 'AI SETTINGS',
    title: 'AI settings',
    description: 'Global AI defaults, batch processing, and account permissions.',
    icon: Sparkles,
  },
  {
    href: '/settings/automation',
    eyebrow: 'BACKGROUND TASKS',
    title: 'Background processing',
    description: 'Shared processing configuration and links to personal tasks and schedules.',
    icon: CalendarDays,
  },
  {
    href: '/settings/system',
    eyebrow: 'SYSTEM SETTINGS',
    title: 'System',
    description: 'Rename the kitchen, choose its icon, manage backups, or reset this installation.',
    icon: Settings2,
  },
  {
    href: '/settings/api',
    eyebrow: 'API & SECURITY',
    title: 'API keys',
    description: 'Create, rotate or disable scoped keys for scripts and external apps.',
    icon: KeyRound,
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
        {categories.map(({ href, title, description, icon: Icon }) => (
          <Link className="settings-overview-card linked" href={href} key={href}>
            <span className="settings-overview-icon" aria-hidden="true">
              <Icon size={21} />
            </span>
            <div>
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
