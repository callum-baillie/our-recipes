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
} from 'lucide-react';
import { useState } from 'react';

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
];
const actions: Array<{ id: ApiAction; label: string }> = [
  { id: 'read', label: 'Read' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Update' },
  { id: 'delete', label: 'Delete' },
];

function initialPermissions(): ApiPermissions {
  return Object.fromEntries(resources.map((resource) => [resource.id, ['read']])) as ApiPermissions;
}

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKeyDto[] }) {
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
        error?: { message?: string };
      } | null;
      if (!response.ok) {
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
    const result = await authClient.passkey.addPasskey({ name: passkeyName });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'The passkey could not be added.');
      return;
    }
    showToast('Passkey added to the signed-in account.', 'success');
  }

  return (
    <>
      {revealedSecret ? (
        <section className="settings-card api-key-secret" aria-labelledby="new-api-key-heading">
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
          <span aria-hidden="true"><KeyRound size={20} /></span>
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
          <span><strong>Start with least privilege.</strong> Grant only what this integration needs.</span>
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
                <strong><ResourceIcon size={15} aria-hidden="true" />{resource.label}</strong>
                {actions.map((action) => (
                  <label key={action.id}>
                    <span className="visually-hidden">
                      {action.label} {resource.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={(permissions[resource.id] ?? []).includes(action.id)}
                      onChange={() => togglePermission(resource.id, action.id)}
                    />
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
        <button className="primary-button" type="submit" disabled={pending}>
          <Plus size={16} aria-hidden="true" />
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      <section className="settings-card api-key-list" aria-labelledby="api-key-list-heading">
        <div className="settings-section-heading">
          <span aria-hidden="true"><ShieldCheck size={20} /></span>
          <div>
            <h2 id="api-key-list-heading">Active credentials</h2>
            <p>Rotate or revoke keys without exposing their stored secret.</p>
          </div>
        </div>
        {keys.length === 0 ? (
          <p>No integration keys have been created.</p>
        ) : (
          <div className="api-key-rows">
            {keys.map((apiKey) => (
              <article key={apiKey.id}>
                <div>
                  <h3>{apiKey.name}</h3>
                  <code>{apiKey.start}…</code>
                  <p>
                    {apiKey.enabled ? 'Active' : 'Revoked'} · expires{' '}
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
