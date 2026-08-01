import { ResetPasswordForm } from '@/components/auth-forms';
import { BordLockup } from '@/components/bord-brand';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="auth-page">
      <BordLockup className="auth-brand-lockup" />
      <ResetPasswordForm token={token} />
    </main>
  );
}
