import { ForgotPasswordForm } from '@/components/auth-forms';
import { BordLockup } from '@/components/bord-brand';

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <BordLockup className="auth-brand-lockup" />
      <ForgotPasswordForm />
    </main>
  );
}
