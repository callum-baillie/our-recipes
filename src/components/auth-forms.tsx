'use client';

import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth/client';
import { useToast } from '@/components/toast-provider';

function safeCallbackUrl(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export function SignInForm({
  callbackUrl = '/',
  notice,
}: {
  callbackUrl?: string;
  notice?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const destination = safeCallbackUrl(callbackUrl);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn.email({
      email,
      password: passphrase,
      rememberMe,
      callbackURL: destination,
    });
    setPending(false);
    if (result.error) {
      const message =
        result.error.message ??
        'Sign-in failed. Check the email, passphrase, and email verification status.';
      setError(message);
      showToast(message, 'error');
      return;
    }
    showToast('Signed in securely.', 'success');
    router.push(destination);
    router.refresh();
  }

  async function signInWithPasskey() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.passkey();
    setPending(false);
    if (result.error) {
      const message = result.error.message ?? 'The passkey could not be verified.';
      setError(message);
      return;
    }
    router.push(destination);
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-heading">
        <span aria-hidden="true">
          <ShieldCheck size={22} />
        </span>
        <div>
          <p className="eyebrow">HOUSEHOLD SIGN-IN</p>
          <h2>Welcome back.</h2>
          <p>Use your profile email and full passphrase.</p>
        </div>
      </div>
      {notice ? (
        <div className="setup-note" role="status">
          <span aria-hidden="true">✦</span>
          <p>{notice}</p>
        </div>
      ) : null}
      <label>
        <span>Email</span>
        <input
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        <span>Passphrase</span>
        <input
          required
          type="password"
          autoComplete="current-password"
          minLength={15}
          maxLength={128}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </label>
      <label className="auth-inline-check">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
        />
        <span>Keep this trusted device signed in</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <button
        className="secondary-button"
        type="button"
        onClick={signInWithPasskey}
        disabled={pending}
      >
        <KeyRound size={17} aria-hidden="true" />
        Use a passkey
      </button>
      <div className="auth-card-links">
        <Link href="/forgot-password">Forgot your passphrase?</Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password',
    });
    setPending(false);
    setSent(true);
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-heading">
        <span aria-hidden="true">
          <Mail size={22} />
        </span>
        <div>
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h2>Reset your passphrase.</h2>
          <p>We will send a one-time reset link if the email belongs to a profile.</p>
        </div>
      </div>
      {sent ? (
        <div className="setup-note" role="status">
          <span aria-hidden="true">✦</span>
          <p>Check your email. The response is the same whether or not the account exists.</p>
        </div>
      ) : null}
      <label>
        <span>Email</span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Requesting…' : 'Send reset link'}
      </button>
      <div className="auth-card-links">
        <Link href="/reset-password">Use a local recovery code</Link>
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = token
      ? await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword: newPassphrase }),
        })
      : await fetch('/api/v1/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, recoveryCode, newPassphrase }),
        });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      message?: string;
    } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error?.message ?? body?.message ?? 'The passphrase could not be reset.');
      return;
    }
    router.push('/sign-in?reset=1');
    router.refresh();
  }

  return (
    <form className="auth-card" onSubmit={submit}>
      <div className="auth-card-heading">
        <span aria-hidden="true">
          <KeyRound size={22} />
        </span>
        <div>
          <p className="eyebrow">{token ? 'EMAIL RESET' : 'LOCAL RECOVERY'}</p>
          <h2>Choose a new passphrase.</h2>
          <p>
            {token
              ? 'The link is one-time use and expires automatically.'
              : 'Enter one unused recovery code for this profile.'}
          </p>
        </div>
      </div>
      {!token ? (
        <>
          <label>
            <span>Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Recovery code</span>
            <input
              required
              autoComplete="one-time-code"
              placeholder="BORD-XXXX-XXXX-XXXX"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
            />
          </label>
        </>
      ) : null}
      <label>
        <span>New passphrase</span>
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          value={newPassphrase}
          onChange={(event) => setNewPassphrase(event.target.value)}
        />
        <small>Use at least 15 characters.</small>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Resetting…' : 'Reset passphrase'}
      </button>
      <div className="auth-card-links">
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </form>
  );
}
