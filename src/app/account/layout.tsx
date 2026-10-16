import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/auth/server';
import { AccountNav } from '@/components/account-nav';
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');
  return (
    <div className="settings-workspace">
      <aside className="settings-sidebar" aria-label="Profile navigation">
        <h2>My profile</h2>
        <AccountNav />
        <div className="settings-security-note">
          <p>Personal preferences and connections. Record measurements in Nutrition.</p>
          <Link href="/nutrition">Open Nutrition</Link>
        </div>
      </aside>
      <div className="settings-content">{children}</div>
    </div>
  );
}
