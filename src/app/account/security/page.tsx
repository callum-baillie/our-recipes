import { PageHeader } from '@/components/page-header';
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
      <PageHeader
        title="Account security"
        eyebrow="ACCOUNT SECURITY"
        description={
          <>
            Update the sign-in methods for <strong>{session.user.email}</strong>. Household roles
            and admin-only settings are managed separately.
          </>
        }
        meta={
          <span className="security-trust-line">
            <ShieldCheck size={16} aria-hidden="true" />
            Passphrases are hashed and passkeys stay bound to this account.
          </span>
        }
      />

      <AccountSecurityForm />
    </main>
  );
}
