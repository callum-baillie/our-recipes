'use client';
import {
  SettingsField,
  SettingsPane,
  SettingsRow,
  SettingsSubsection,
  SettingsActionBar,
} from './settings-primitives';

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
import { ButtonSpinner } from '@/components/skeleton';

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
  const [pendingAction, setPendingAction] = useState<
    { type: 'create' } | { type: 'rotate' | 'revoke' | 'enable'; apiKeyId: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
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
    action: Exclude<typeof pendingAction, null>,
  ): Promise<Record<string, unknown> | null> {
    setPending(true);
    setPendingAction(action);
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
      setPendingAction(null);
    }
  }

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = await apiRequest(
      '/api/v1/admin/api-keys',
      {
        method: 'POST',
        body: JSON.stringify({ name, expiresInDays, permissions }),
      },
      { type: 'create' },
    );
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
    const body = await apiRequest(
      `/api/v1/admin/api-keys/${apiKey.id}`,
      {
        method: enabled ? 'PATCH' : 'DELETE',
        body: enabled ? JSON.stringify({ enabled: true }) : undefined,
      },
      { type: enabled ? 'enable' : 'revoke', apiKeyId: apiKey.id },
    );
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
    const body = await apiRequest(
      `/api/v1/admin/api-keys/${apiKey.id}/rotate`,
      {
        method: 'POST',
        body: '{}',
      },
      { type: 'rotate', apiKeyId: apiKey.id },
    );
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

      <form className="settings-form" onSubmit={createKey}>
        <SettingsPane
          title="Create API key"
          description="Choose a name, expiry, and the permissions this integration needs."
          icon={<KeyRound size={20} />}
        >
          <div className="settings-fields">
            <SettingsField
              description="Use a name that identifies the script or app using this key."
              title="Name"
            >
              <input
                required
                maxLength={64}
                placeholder="Kitchen dashboard"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </SettingsField>
            <SettingsField
              description="The key stops working after this period."
              title="Expires after"
            >
              <select
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </SettingsField>
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
          <SettingsActionBar>
            {' '}
            <button
              className="primary-button"
              type="submit"
              disabled={pending || needsConfirmation || Boolean(revealedSecret)}
              aria-busy={pendingAction?.type === 'create'}
            >
              {pendingAction?.type === 'create' ? (
                <ButtonSpinner />
              ) : (
                <Plus size={16} aria-hidden="true" />
              )}{' '}
              {pendingAction?.type === 'create' ? 'Creating…' : 'Create key'}
            </button>
          </SettingsActionBar>
        </SettingsPane>
      </form>

      <SettingsPane
        title="Existing API keys"
        description="Review access and rotate or revoke keys without revealing their stored secrets."
      >
        <SettingsSubsection title="Issued keys">
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
                          aria-busy={
                            pendingAction?.type === 'rotate' && pendingAction.apiKeyId === apiKey.id
                          }
                          onClick={() => rotateKey(apiKey)}
                        >
                          {pendingAction?.type === 'rotate' &&
                          pendingAction.apiKeyId === apiKey.id ? (
                            <ButtonSpinner />
                          ) : (
                            <RefreshCw size={15} aria-hidden="true" />
                          )}{' '}
                          {pendingAction?.type === 'rotate' && pendingAction.apiKeyId === apiKey.id
                            ? 'Rotating…'
                            : 'Rotate'}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={pending}
                          aria-busy={
                            pendingAction?.type === 'revoke' && pendingAction.apiKeyId === apiKey.id
                          }
                          onClick={() => setEnabled(apiKey, false)}
                        >
                          {pendingAction?.type === 'revoke' &&
                          pendingAction.apiKeyId === apiKey.id ? (
                            <ButtonSpinner />
                          ) : (
                            <ShieldOff size={15} aria-hidden="true" />
                          )}{' '}
                          {pendingAction?.type === 'revoke' && pendingAction.apiKeyId === apiKey.id
                            ? 'Revoking…'
                            : 'Revoke'}
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={pending}
                        aria-busy={
                          pendingAction?.type === 'enable' && pendingAction.apiKeyId === apiKey.id
                        }
                        onClick={() => setEnabled(apiKey, true)}
                      >
                        {pendingAction?.type === 'enable' &&
                        pendingAction.apiKeyId === apiKey.id ? (
                          <ButtonSpinner />
                        ) : null}
                        {pendingAction?.type === 'enable' && pendingAction.apiKeyId === apiKey.id
                          ? 'Enabling…'
                          : 'Re-enable'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </SettingsSubsection>
      </SettingsPane>

      <SettingsPane
        title="Account sign-in"
        description="Passkeys and passwords belong to your personal account."
      >
        <SettingsRow
          title="Sign-in methods"
          description="Manage saved passkeys and change your password from Account security."
        >
          <Link className="text-button" href="/account/security">
            Account security
          </Link>
        </SettingsRow>
      </SettingsPane>
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
      <SettingsField description="The account whose identity is being confirmed." title="Account">
        <input type="email" value={email} readOnly autoComplete="username" />
      </SettingsField>
      <SettingsField
        description="Confirm your identity before creating a key with access to the app."
        title="Current passphrase"
      >
        <input
          ref={input}
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </SettingsField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-inline-actions">
        <button type="submit" className="primary-button" disabled={pending} aria-busy={pending}>
          {pending ? <ButtonSpinner /> : null}
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
