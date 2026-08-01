import { BordLockup } from '@/components/bord-brand';
import { SignInForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

type SearchParams = {
  callbackUrl?: string;
  reset?: string;
  setup?: string;
  upgrade?: string;
  verified?: string;
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const notice = params.verified
    ? 'Email verified. You can sign in now.'
    : params.reset
      ? 'Passphrase updated. Sign in with the new passphrase.'
      : params.setup || params.upgrade
        ? 'Security setup is complete. Sign in with a profile email and passphrase.'
        : undefined;
  return (
    <main className="auth-page">
      <BordLockup className="auth-brand-lockup" />
      <SignInForm callbackUrl={params.callbackUrl} notice={notice} />
    </main>
  );
}
