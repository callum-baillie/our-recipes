'use client';

import {
  Sparkles,
  ChefHat,
  Workflow,
  ClipboardList,
  KeyRound,
  ListChecks,
  PackageOpen,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { SettingsSectionNav } from './settings-section-nav';

const links = [
  { href: '/my-kitchen', label: 'My Kitchen', icon: ChefHat },
  { href: '/settings', label: 'All settings', icon: Settings2 },
  { href: '/settings/profiles', label: 'Profiles & roles', icon: Users },
  { href: '/settings/recipes', label: 'Recipes', icon: ClipboardList },
  { href: '/settings/meal-plan', label: 'Meal plans', icon: ChefHat },
  { href: '/settings/lists', label: 'Lists', icon: ListChecks },
  { href: '/settings/pantry', label: 'Pantry', icon: PackageOpen },
  { href: '/settings/ai', label: 'AI settings', icon: Sparkles },
  { href: '/settings/automation', label: 'Background processing', icon: Workflow },
  { href: '/settings/system', label: 'System', icon: ShieldCheck },
  { href: '/settings/api', label: 'API keys', icon: KeyRound },
] as const;

export function SettingsNav() {
  return <SettingsSectionNav scope="Household" links={links} />;
}
