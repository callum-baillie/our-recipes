import {
  Activity,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ListChecks,
  PackageOpen,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getAiReadiness } from '@/lib/services/ai-readiness-service';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';

const categories = [
  {
    href: '/settings/system',
    eyebrow: 'SYSTEM SETTINGS',
    title: 'App identity, appearance, and recovery',
    description: 'Rename the app, choose its icon and colors, manage backups, or start over.',
    icon: Settings2,
  },
  {
    href: '/settings/ai',
    eyebrow: 'AI SETTINGS',
    title: 'Models, privacy, and summaries',
    description: 'Choose models by task and control exactly which profile data AI may use.',
    icon: Sparkles,
  },
  {
    href: '/settings/profiles',
    eyebrow: 'PROFILE SETTINGS',
    title: 'People, units, and regional defaults',
    description: 'Manage household profiles, avatars, colors, units, locale, and time zone.',
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
    eyebrow: 'MEALPLAN SETTINGS',
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
  {
    href: '/settings/nutrition',
    eyebrow: 'NUTRITION SETTINGS',
    title: 'Goals, tracking, and visibility',
    description: 'Manage profile goals, diary behavior, nutrients, trends, and planner display.',
    icon: Activity,
  },
] as const;

export default function SettingsPage() {
  const state = getHouseholdState();
  if (!state.household) notFound();
  const ai = getAiReadiness();
  return (
    <main className="recipe-page settings-hub">
      <section className="settings-intro settings-hub-intro">
        <p className="eyebrow">SETTINGS</p>
        <h1>Your kitchen, your way.</h1>
        <p>Choose a category to manage shared app behavior or profile-specific preferences.</p>
      </section>
      <section className="settings-overview" aria-label="Settings categories">
        {categories.map(({ href, eyebrow, title, description, icon: Icon }) => (
          <Link className="settings-overview-card linked" href={href} key={href}>
            <span className="settings-overview-icon" aria-hidden="true">
              <Icon size={21} />
            </span>
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2>{title}</h2>
              <p>{href === '/settings/ai' ? `${ai.message} ${description}` : description}</p>
            </div>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        ))}
      </section>
    </main>
  );
}
