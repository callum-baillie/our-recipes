import { redirect } from 'next/navigation';

import { BordLockup } from '@/components/bord-brand';
import { SecurityUpgradeForm } from '@/components/security-upgrade-form';
import { authenticationEnrollmentStatus } from '@/lib/services/auth-service';
import { getHouseholdState } from '@/lib/services/household-service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function SecurityUpgradePage() {
  const household = getHouseholdState().household;
  if (!household) redirect('/');
  const status = authenticationEnrollmentStatus();
  if (status.configured) redirect('/sign-in');
  return (
    <main className="setup-page onboarding-page">
      <section className="setup-intro bord-intro" aria-labelledby="security-upgrade-title">
        <BordLockup className="onboarding-brand-lockup" />
        <h1 id="security-upgrade-title">Secure {household.kitchenName}</h1>
        <p>
          Your existing recipes and household data are intact. This required upgrade adds real
          sessions, recovery, profile PINs, and admin-owned API keys.
        </p>
      </section>
      <SecurityUpgradeForm profiles={status.profiles} />
    </main>
  );
}
