import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { SettingsNav } from '@/components/settings-nav';
import { auth } from '@/lib/auth/server';

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Manage household, profile, recipe, Pantry, Nutrition, list, AI, and system settings.',
};

export default async function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as { role?: string }).role !== 'admin') notFound();

  return (
    <div className="settings-workspace">
      <aside className="settings-sidebar" aria-label="Settings navigation">
        <h2>Settings</h2>
        <SettingsNav />
        <div className="settings-security-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <strong>Security at Bòrd</strong>
          <p>Roles, keys, and passphrases are enforced on the server.</p>
          <Link href="/account/security">My account security</Link>
        </div>
      </aside>
      <div className="settings-content">{children}</div>
    </div>
  );
}
