'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [
  ['/account', 'My profile'],
  ['/account/nutrition', 'Nutrition preferences'],
  ['/account/ai', 'AI preferences & privacy'],
  ['/account/integrations', 'Connected apps'],
  ['/account/security', 'Account security'],
] as const;
export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav>
      {links.map(([href, label]) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
