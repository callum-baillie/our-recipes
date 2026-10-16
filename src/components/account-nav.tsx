'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound, HeartPulse, Sparkles, Plug, Workflow, ShieldCheck } from 'lucide-react';
const links = [
  { href: '/account', label: 'My profile', icon: UserRound },
  { href: '/account/nutrition', label: 'Nutrition preferences', icon: HeartPulse },
  { href: '/account/ai', label: 'AI preferences & privacy', icon: Sparkles },
  { href: '/account/integrations', label: 'Connected apps', icon: Plug },
  { href: '/account/automation', label: 'Schedules & tasks', icon: Workflow },
  { href: '/account/security', label: 'Account security', icon: ShieldCheck },
];
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav>
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
          <Icon size={16} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
