export const metadata = { title: 'Reset your passphrase' };
import { ResetPasswordForm } from '@/components/auth-forms';
import { BordLockup } from '@/components/bord-brand';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <main className="auth-page">
      <BordLockup className="auth-brand-lockup" />
      <ResetPasswordForm
        key={token ?? error ?? 'local-recovery'}
        token={token}
        invalidLink={error === 'INVALID_TOKEN' || (token !== undefined && !token.trim())}
      />
    </main>
  );
}
