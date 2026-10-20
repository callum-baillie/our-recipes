'use client';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth/client';
import { accountRecoverySchema } from '@/lib/domain/auth';
import { PasswordInput } from './password-input';

export function safeCallbackUrl(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u001f]/u.test(value)
    ? value
    : '/';
}
function Feedback({ message, error = false }: { message: string | null; error?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && message) ref.current?.focus();
  }, [error, message]);
  return message ? (
    <p
      ref={ref}
      tabIndex={error ? -1 : undefined}
      className={error ? 'form-error auth-feedback' : 'auth-feedback'}
      role={error ? 'alert' : 'status'}
    >
      {message}
    </p>
  ) : null;
}
function Heading({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-card-heading">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 tabIndex={-1}>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function SignInForm({
  callbackUrl = '/',
  notice,
}: {
  callbackUrl?: string;
  notice?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [pending, setPending] = useState<'email' | 'passkey' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const destination = safeCallbackUrl(callbackUrl);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending('email');
    setError(null);
    try {
      const result = await authClient.signIn.email({
        email,
        password: passphrase,
        rememberMe,
        callbackURL: destination,
      });
      if (result.error)
        setError(
          result.error.message ??
            'Sign-in failed. Check your email, passphrase and verification status.',
        );
      // Better Auth owns the email callback navigation; do not race it with another redirect.
    } catch {
      setError('Unable to reach the sign-in service. Check your connection and try again.');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  async function signInWithPasskey() {
    if (lock.current) return;
    lock.current = true;
    setPending('passkey');
    setError(null);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        setError(
          ['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED'].includes(
            'code' in result.error ? result.error.code : '',
          )
            ? 'Passkey sign-in was not completed. Try again or use your email and passphrase.'
            : (result.error.message ??
                'The passkey could not be verified. You can use email sign-in instead.'),
        );
        return;
      }
      router.push(destination);
      router.refresh();
    } catch {
      setError('Passkey sign-in is unavailable. Try email sign-in, or check your connection.');
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <Heading icon={<ShieldCheck size={22} />} eyebrow="HOUSEHOLD SIGN-IN" title="Welcome back.">
        Use your account email and full passphrase.
      </Heading>
      <Feedback message={notice ?? null} />
      <fieldset className="auth-fields" disabled={pending !== null}>
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
        <PasswordInput
          label="Passphrase"
          required
          autoComplete="current-password"
          minLength={8}
          maxLength={128}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          disabled={pending !== null}
        />
        <label className="auth-inline-check">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Keep this trusted device signed in with email</span>
        </label>
      </fieldset>
      <Feedback message={error} error />
      <button className="primary-button" type="submit" disabled={pending !== null}>
        {pending === 'email' ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="auth-divider">
        <span>or</span>
      </div>
      <button
        className="secondary-button"
        type="button"
        onClick={() => void signInWithPasskey()}
        disabled={pending !== null}
      >
        <KeyRound size={17} aria-hidden="true" />
        {pending === 'passkey' ? 'Waiting for your passkey…' : 'Use a passkey'}
      </button>
      {pending === 'passkey' && <Feedback message="Complete the passkey prompt on this device." />}
      <div className="auth-card-links">
        <Link href="/forgot-password">Forgot your passphrase?</Link>
        <Link href="/verify-email">Request an email verification link</Link>
      </div>
    </form>
  );
}
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function request(address: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setAccepted(null);
    try {
      const result = await authClient.requestPasswordReset({
        email: address,
        redirectTo: '/reset-password',
      });
      if (result.error) {
        setError('The reset request could not be accepted. Please try again later.');
        return;
      }
      setAccepted(address);
    } catch {
      setError('Unable to reach the sign-in service. Check your connection and try again.');
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <form
      className="auth-card"
      onSubmit={(event) => {
        event.preventDefault();
        void request(email);
      }}
    >
      <Heading
        icon={<Mail size={22} />}
        eyebrow="ACCOUNT RECOVERY"
        title={accepted ? 'Request received.' : 'Request a reset link.'}
      >
        Use the email linked to your account.
      </Heading>
      {accepted ? (
        <>
          <Feedback message="Request received. If this email is linked to an account, check its inbox and spam folder for a reset link." />
          <p className="auth-address">Requested for {accepted}</p>
          <button
            type="button"
            className="primary-button"
            disabled={pending}
            onClick={() => void request(accepted)}
          >
            Request again
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setAccepted(null);
              setError(null);
              requestAnimationFrame(() =>
                document.querySelector<HTMLInputElement>('.auth-card input[type=email]')?.focus(),
              );
            }}
          >
            Change email
          </button>
        </>
      ) : (
        <>
          <fieldset className="auth-fields" disabled={pending}>
            <label>
              <span>Email</span>
              <input
                required
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
              />
            </label>
          </fieldset>
          <Feedback message={error} error />
          <button className="primary-button" type="submit" disabled={pending}>
            {pending ? 'Requesting…' : 'Request reset link'}
          </button>
        </>
      )}
      <div className="auth-card-links">
        <Link href="/reset-password">Use a saved recovery code</Link>
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </form>
  );
}
export function ResetPasswordForm({
  token,
  invalidLink = false,
}: {
  token?: string;
  invalidLink?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(invalidLink);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (invalid) document.querySelector<HTMLElement>('.auth-card h1')?.focus();
  }, [invalid]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || invalid) return;
    setError(null);
    setFieldErrors({});
    const local = accountRecoverySchema.safeParse({ email, recoveryCode, newPassphrase });
    if (!token && !local.success) {
      const errors = Object.fromEntries(
        local.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      );
      setFieldErrors(errors);
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLInputElement>(`[name="${String(local.error.issues[0]?.path[0])}"]`)
          ?.focus(),
      );
      return;
    }
    lock.current = true;
    setPending(true);
    try {
      const response = await fetch(
        token
          ? `/api/auth/reset-password?token=${encodeURIComponent(token)}`
          : '/api/v1/auth/recover',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            token ? { token, newPassword: newPassphrase } : local.success ? local.data : {},
          ),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        error?: { code?: string; message?: string };
        message?: string;
      } | null;
      if (!response.ok) {
        if (token && (body?.code === 'INVALID_TOKEN' || body?.error?.code === 'INVALID_TOKEN')) {
          setInvalid(true);
          setNewPassphrase('');
          return;
        }
        setError(
          body?.error?.message ??
            body?.message ??
            'The passphrase could not be reset. Check the credentials or try another recovery method.',
        );
        return;
      }
      setNewPassphrase('');
      setRecoveryCode('');
      router.push('/sign-in?reset=1');
      router.refresh();
    } catch {
      setError(
        'The reset response was not received. Try signing in with your new passphrase before retrying recovery.',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  if (invalid)
    return (
      <section className="auth-card">
        <Heading
          icon={<KeyRound size={22} />}
          eyebrow="EMAIL RESET"
          title="This reset link is unavailable."
        >
          The link is invalid, expired or already used. Request a new link to continue.
        </Heading>
        <Link className="primary-button" href="/forgot-password">
          Request a new reset link
        </Link>
        <div className="auth-card-links">
          <Link href="/reset-password">Use a saved recovery code</Link>
          <Link href="/sign-in">Back to sign in</Link>
        </div>
      </section>
    );
  return (
    <form ref={form} className="auth-card" onSubmit={submit}>
      <Heading
        icon={<KeyRound size={22} />}
        eyebrow={token ? 'EMAIL RESET' : 'SAVED-CODE RECOVERY'}
        title="Choose a new passphrase."
      >
        {token
          ? 'Use this one-time link to set a new passphrase, then sign in again.'
          : 'Use one unused saved recovery code for the account identified by your email. The code is used once; then sign in again.'}
      </Heading>
      <fieldset className="auth-fields" disabled={pending}>
        {!token && (
          <>
            <label>
              <span>Email</span>
              <input
                name="email"
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'recovery-email-error' : undefined}
              />
              {fieldErrors.email && (
                <small id="recovery-email-error" className="form-error">
                  {fieldErrors.email}
                </small>
              )}
            </label>
            <label>
              <span id="recovery-code-label">Saved recovery code</span>
              <input
                name="recoveryCode"
                aria-labelledby="recovery-code-label"
                required
                autoComplete="one-time-code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                aria-invalid={!!fieldErrors.recoveryCode}
                aria-describedby={`recovery-code-hint${fieldErrors.recoveryCode ? ' recovery-code-error' : ''}`}
              />
              <small id="recovery-code-hint">
                Format: BORD-XXXX-XXXX-XXXX, from your saved recovery codes.
              </small>
              {fieldErrors.recoveryCode && (
                <small id="recovery-code-error" className="form-error">
                  {fieldErrors.recoveryCode}
                </small>
              )}
            </label>
          </>
        )}
        <PasswordInput
          label="New passphrase"
          name="newPassphrase"
          required
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={newPassphrase}
          onChange={(event) => setNewPassphrase(event.target.value)}
          hint="Use 8–128 characters. Paste and password managers are supported."
          disabled={pending}
        />
      </fieldset>
      <Feedback message={error} error />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Resetting…' : 'Reset passphrase'}
      </button>
      <div className="auth-card-links">
        <Link href="/forgot-password">Request an email reset link</Link>
        {token && <Link href="/reset-password">Use a saved recovery code</Link>}
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </form>
  );
}

export function VerificationLinkForm({ invalid = false }: { invalid?: boolean }) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function request(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    setSubmitted(null);
    const address = email.trim();
    try {
      const response = await authClient.sendVerificationEmail({
        email: address,
        callbackURL: '/sign-in?verified=1',
      });
      if (response.error)
        throw new Error(response.error.message ?? 'Could not request a verification link.');
      setSubmitted(address);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to reach the sign-in service. Try again.',
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <form className="auth-card" onSubmit={(event) => void request(event)}>
      <Heading icon={<Mail />} eyebrow="ACCOUNT VERIFICATION" title="Request a verification link">
        Use the email linked to your account. Existing verified accounts can sign in directly.
      </Heading>
      {invalid && !submitted && (
        <Feedback message="That verification link is no longer valid. Request a new link below." />
      )}
      <fieldset className="auth-fields" disabled={pending}>
        <label>
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              setSubmitted(null);
              setError(null);
            }}
          />
        </label>
      </fieldset>
      <Feedback message={error} error />
      <Feedback
        message={
          submitted
            ? `Request received for ${submitted}. If this account needs verification, check its inbox and spam folder for a new link.`
            : null
        }
      />
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? 'Requesting link…' : submitted ? 'Request again' : 'Request verification link'}
      </button>
      <div className="auth-card-links">
        <Link href="/sign-in">Back to sign in</Link>
      </div>
    </form>
  );
}
