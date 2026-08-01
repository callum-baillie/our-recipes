import { ShieldCheck } from 'lucide-react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AccountSecurityForm } from '@/components/account-security-form';
import { auth } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function AccountSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/sign-in');

  return (
    <main className="recipe-page account-security-page">
      <section className="settings-intro">
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>Protect your place at the table.</h1>
        <p>
          Update the sign-in methods for <strong>{session.user.email}</strong>. Household roles and
          admin-only settings are managed separately.
        </p>
        <div className="security-trust-line">
          <ShieldCheck size={16} aria-hidden="true" />
          Passphrases are hashed and passkeys stay bound to this account.
        </div>
      </section>
      <AccountSecurityForm />
    </main>
  );
}
