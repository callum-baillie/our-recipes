'use client';

import {
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  Folder,
  KeyRound,
  ListChecks,
  PackageOpen,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Settings2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth/client';
import type { ApiKeyDto } from '@/lib/services/api-key-service';
import type { ApiAction, ApiPermissions, ApiResource } from '@/lib/domain/auth';
import { useToast } from '@/components/toast-provider';

const resources: Array<{ id: ApiResource; label: string; icon: typeof BookOpen }> = [
  { id: 'recipes', label: 'Recipes', icon: BookOpen },
  { id: 'mealPlans', label: 'Meal plans', icon: CalendarDays },
  { id: 'shoppingLists', label: 'Grocery lists', icon: ListChecks },
  { id: 'collections', label: 'Collections', icon: Folder },
  { id: 'pantry', label: 'Pantry', icon: PackageOpen },
  { id: 'settings', label: 'Workflow settings', icon: Settings2 },
];
const actions: Array<{ id: ApiAction; label: string }> = [
  { id: 'read', label: 'Read' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'delete', label: 'Delete' },
];

function initialPermissions(): ApiPermissions {
  return Object.fromEntries(
    resources
      .filter((resource) => resource.id !== 'settings')
      .map((resource) => [resource.id, ['read']]),
  ) as ApiPermissions;
}

export function ApiKeyManager({
  initialKeys,
  accountEmail,
}: {
  initialKeys: ApiKeyDto[];
  accountEmail: string;
}) {
  const { showToast } = useToast();
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [permissions, setPermissions] = useState<ApiPermissions>(initialPermissions);
  const [revealedSecret, setRevealedSecret] = useState<{
    name: string;
    value: string;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyName, setPasskeyName] = useState('This device');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const secretPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (revealedSecret) {
      secretPanel.current?.focus();
      secretPanel.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [revealedSecret]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function togglePermission(resource: ApiResource, action: ApiAction) {
    setPermissions((current) => {
      const selected = new Set(current[resource] ?? []);
      if (selected.has(action)) selected.delete(action);
      else selected.add(action);
      return { ...current, [resource]: [...selected] };
    });
  }

  async function apiRequest(
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
      const body = (await response.json().catch(() => null)) as {
        apiKey?: ApiKeyDto;
        secret?: string;
        error?: { code?: string; message?: string };
      } | null;
      if (!response.ok) {
        if (body?.error?.code === 'fresh_admin_session_required') setNeedsConfirmation(true);
        if (body?.error?.code === 'authentication_required') setNeedsSignIn(true);
        throw new Error(body?.error?.message ?? 'The API key change failed.');
      }
      return body as Record<string, unknown>;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The API key change failed.';
      setError(message);
      showToast(message, 'error');
      return null;
    } finally {
      setPending(false);
    }
  }

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = await apiRequest('/api/v1/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, expiresInDays, permissions }),
    });
    const apiKey = body?.apiKey as ApiKeyDto | undefined;
    const secret = body?.secret as string | undefined;
    if (!apiKey || !secret) return;
    setKeys((current) => [apiKey, ...current]);
    setRevealedSecret({ name: apiKey.name, value: secret });
    setName('');
    showToast('API key created. Copy it now.', 'success');
  }

  async function setEnabled(apiKey: ApiKeyDto, enabled: boolean) {
    if (
      !enabled &&
      !window.confirm(`Revoke “${apiKey.name}”? Existing clients will stop working.`)
    ) {
      return;
    }
    const body = await apiRequest(`/api/v1/admin/api-keys/${apiKey.id}`, {
      method: enabled ? 'PATCH' : 'DELETE',
      body: enabled ? JSON.stringify({ enabled: true }) : undefined,
    });
    const updated = body?.apiKey as ApiKeyDto | undefined;
    if (!updated) return;
    setKeys((current) =>
      current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );
  }

  async function rotateKey(apiKey: ApiKeyDto) {
    if (
      !window.confirm(
        `Rotate “${apiKey.name}”? The current secret will be revoked as soon as the replacement is created.`,
      )
    ) {
      return;
    }
    const body = await apiRequest(`/api/v1/admin/api-keys/${apiKey.id}/rotate`, {
      method: 'POST',
      body: '{}',
    });
    const replacement = body?.apiKey as ApiKeyDto | undefined;
    const secret = body?.secret as string | undefined;
    if (!replacement || !secret) return;
    setKeys((current) => [
      replacement,
      ...current.map((candidate) =>
        candidate.id === apiKey.id ? { ...candidate, enabled: false } : candidate,
      ),
    ]);
    setRevealedSecret({ name: replacement.name, value: secret });
  }

  async function copySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret.value);
      showToast('API key copied.', 'success');
    } catch {
      showToast('Copy was unavailable. Select the key manually.', 'error');
    }
  }

  async function addPasskey() {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.passkey.addPasskey({ name: passkeyName });
      if (result.error) throw new Error(result.error.message ?? 'The passkey could not be added.');
      showToast('Passkey added to the signed-in account.', 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The passkey could not be added.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {needsConfirmation ? (
        <ApiKeyConfirmation
          email={accountEmail}
          onConfirmed={() => {
            setNeedsConfirmation(false);
            setError(null);
            showToast('Identity confirmed. You can now retry your key change.', 'success');
          }}
          onCancel={() => setNeedsConfirmation(false)}
        />
      ) : null}
      {needsSignIn ? (
        <p className="setup-note" role="alert">
          Your session has ended.{' '}
          <Link href="/sign-in?reauth=1&callbackUrl=%2Fsettings%2Fapi">Sign in to continue</Link>.
        </p>
      ) : null}
      {revealedSecret ? (
        <section
          ref={secretPanel}
          tabIndex={-1}
          className="settings-card api-key-secret"
          aria-labelledby="new-api-key-heading"
        >
          <p className="eyebrow">COPY NOW</p>
          <h2 id="new-api-key-heading">{revealedSecret.name}</h2>
          <p>This secret is shown once. Store it in the integration&apos;s server environment.</p>
          <code>{revealedSecret.value}</code>
          <div className="settings-inline-actions">
            <button className="primary-button" type="button" onClick={copySecret}>
              <Copy size={16} aria-hidden="true" />
              Copy key
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setRevealedSecret(null)}
            >
              <Check size={16} aria-hidden="true" />I saved it
            </button>
          </div>
        </section>
      ) : null}

      <form className="settings-card api-key-create" onSubmit={createKey}>
        <div className="settings-section-heading">
          <span aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <div>
            <h2>Create API key</h2>
            <p>Define a name, expiry, and the exact permissions for this key.</p>
          </div>
        </div>
        <div className="field-grid two-columns">
          <label>
            <span>Name</span>
            <input
              required
              maxLength={64}
              placeholder="Kitchen dashboard"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>Expires after</span>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
          </label>
        </div>
        <aside className="api-least-privilege">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <strong>Start with least privilege.</strong> Grant only what this integration needs.
          </span>
        </aside>
        <fieldset className="api-scope-grid">
          <legend>Permissions</legend>
          <div className="api-scope-header" aria-hidden="true">
            <span>Resource</span>
            {actions.map((action) => (
              <span key={action.id}>{action.label}</span>
            ))}
          </div>
          {resources.map((resource) => {
            const ResourceIcon = resource.icon;
            return (
              <div className="api-scope-row" key={resource.id}>
                <strong>
                  <ResourceIcon size={15} aria-hidden="true" />
                  {resource.label}
                </strong>
                {actions.map((action) => (
                  <label key={action.id}>
                    <span className="api-permission-label">{action.label}</span>
                    {resource.id === 'settings' &&
                    (action.id === 'create' || action.id === 'delete') ? (
                      <span aria-label={`${action.label} is not available for workflow settings`}>
                        —
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`${action.label} ${resource.label}`}
                        checked={(permissions[resource.id] ?? []).includes(action.id)}
                        onChange={() => togglePermission(resource.id, action.id)}
                      />
                    )}
                  </label>
                ))}
              </div>
            );
          })}
        </fieldset>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="primary-button"
          type="submit"
          disabled={pending || needsConfirmation || Boolean(revealedSecret)}
        >
          <Plus size={16} aria-hidden="true" />
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      <section className="settings-card api-key-list" aria-labelledby="api-key-list-heading">
        <div className="settings-section-heading">
          <span aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 id="api-key-list-heading">Your API keys</h2>
            <p>Rotate or revoke keys without exposing their stored secret.</p>
          </div>
        </div>
        {keys.length === 0 ? (
          <div className="api-key-empty">
            <KeyRound size={24} aria-hidden="true" />
            <p>No API keys yet.</p>
            <small>Create a key above to connect a dashboard, script, or another app.</small>
          </div>
        ) : (
          <div className="api-key-rows">
            {keys.map((apiKey) => (
              <article key={apiKey.id}>
                <div>
                  <h3>{apiKey.name}</h3>
                  <code>{apiKey.start}…</code>
                  <p>
                    {!apiKey.enabled
                      ? 'Revoked'
                      : apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= now
                        ? 'Expired'
                        : 'Active'}{' '}
                    · expires{' '}
                    {apiKey.expiresAt
                      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                          new Date(apiKey.expiresAt),
                        )
                      : 'never'}
                  </p>
                  <small>
                    {Object.entries(apiKey.permissions)
                      .map(([resource, granted]) => `${resource}: ${granted.join(', ')}`)
                      .join(' · ') || 'No permissions'}
                  </small>
                </div>
                <div className="settings-inline-actions">
                  {apiKey.enabled ? (
                    <>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={pending}
                        onClick={() => rotateKey(apiKey)}
                      >
                        <RefreshCw size={15} aria-hidden="true" />
                        Rotate
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={pending}
                        onClick={() => setEnabled(apiKey, false)}
                      >
                        <ShieldOff size={15} aria-hidden="true" />
                        Revoke
                      </button>
                    </>
                  ) : (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={pending}
                      onClick={() => setEnabled(apiKey, true)}
                    >
                      Re-enable
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card" aria-labelledby="passkey-heading">
        <p className="eyebrow">PASSWORDLESS SIGN-IN</p>
        <h2 id="passkey-heading">Add a passkey</h2>
        <p>Passkeys are optional and belong to the currently signed-in account.</p>
        <div className="field-grid two-columns">
          <label>
            <span>Passkey name</span>
            <input
              value={passkeyName}
              maxLength={64}
              onChange={(event) => setPasskeyName(event.target.value)}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={pending}
            onClick={addPasskey}
          >
            <KeyRound size={16} aria-hidden="true" />
            Add passkey
          </button>
        </div>
      </section>
    </>
  );
}

function ApiKeyConfirmation({
  email,
  onConfirmed,
  onCancel,
}: {
  email: string;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email, password: passphrase });
      if (result.error)
        throw new Error(result.error.message ?? 'Your identity could not be confirmed.');
      setPassphrase('');
      onConfirmed();
    } catch (caught) {
      setPassphrase('');
      setError(caught instanceof Error ? caught.message : 'Unable to connect. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="settings-card api-key-confirmation"
      onSubmit={confirm}
      aria-labelledby="confirm-api-identity"
    >
      <div className="settings-section-heading">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2 id="confirm-api-identity">Confirm it’s you</h2>
          <p>
            For your security, key changes require a recent sign-in. Your key details are saved on
            this page.
          </p>
        </div>
      </div>
      <label>
        <span>Account</span>
        <input type="email" value={email} readOnly autoComplete="username" />
      </label>
      <label>
        <span>Current passphrase</span>
        <input
          ref={input}
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-inline-actions">
        <button type="submit" className="primary-button" disabled={pending}>
          {pending ? 'Confirming…' : 'Confirm identity'}
        </button>
        <button type="button" className="secondary-button" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <Link href="/sign-in?reauth=1&callbackUrl=%2Fsettings%2Fapi">Use a passkey instead</Link>
    </form>
  );
}
