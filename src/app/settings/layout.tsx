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
  description: 'Manage shared kitchen defaults, household access, API keys, and system recovery.',
};

export default async function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  if (!session || !isAdmin) notFound();

  return (
    <div className="settings-workspace">
      <aside className="settings-sidebar" aria-label="Settings navigation">
        <h2>Settings</h2>
        <SettingsNav />
        <div className="settings-security-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <strong>Shared kitchen settings</strong>
          <p>
            App-wide settings are managed by administrators. Your sign-in methods are in Account
            security.
          </p>
          <Link href="/account/security">My account security</Link>
        </div>
      </aside>
      <div className="settings-content">{children}</div>
    </div>
  );
}
