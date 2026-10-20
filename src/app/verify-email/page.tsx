import { BordLockup } from '@/components/bord-brand';
import { VerificationLinkForm } from '@/components/auth-forms';
export const metadata = { title: 'Request an email verification link' };
export const dynamic = 'force-dynamic';
export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="auth-page">
      <BordLockup className="auth-brand-lockup" />
      <VerificationLinkForm invalid={params.invalid === '1'} />
    </main>
  );
}
