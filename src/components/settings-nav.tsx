'use client';

import {
  Activity,
  Brain,
  ChefHat,
  ClipboardList,
  KeyRound,
  ListChecks,
  PackageOpen,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/settings', label: 'All settings', icon: Settings2 },
  { href: '/settings/profiles', label: 'Profiles & roles', icon: Users },
  { href: '/settings/recipes', label: 'Recipes', icon: ClipboardList },
  { href: '/settings/meal-plan', label: 'Meal plans', icon: ChefHat },
  { href: '/settings/lists', label: 'Lists', icon: ListChecks },
  { href: '/settings/pantry', label: 'Pantry', icon: PackageOpen },
  { href: '/settings/nutrition', label: 'Nutrition', icon: Activity },
  { href: '/settings/ai', label: 'AI', icon: Brain },
  { href: '/settings/system', label: 'System', icon: ShieldCheck },
  { href: '/settings/api', label: 'API & Security', icon: KeyRound },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav>
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === '/settings' ? pathname === href : pathname.startsWith(href);
        return (
          <Link href={href} key={href} aria-current={active ? 'page' : undefined}>
            <Icon size={16} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
