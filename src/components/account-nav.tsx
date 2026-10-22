'use client';
import { SettingsSectionNav } from './settings-section-nav';
import { UserRound, HeartPulse, Sparkles, Plug, Workflow, ShieldCheck } from 'lucide-react';
const links = [
  { href: '/my-kitchen', label: 'My Kitchen', icon: UserRound },
  { href: '/account', label: 'My profile', icon: UserRound },
  { href: '/account/nutrition', label: 'Nutrition preferences', icon: HeartPulse },
  { href: '/account/ai', label: 'AI preferences & privacy', icon: Sparkles },
  { href: '/account/integrations', label: 'Connected apps', icon: Plug },
  { href: '/account/automation', label: 'Schedules & tasks', icon: Workflow },
  { href: '/account/security', label: 'Account security', icon: ShieldCheck },
];
export function AccountNav() {
  return <SettingsSectionNav scope="Account" links={links} />;
}
