'use client';

import { LoaderCircle, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast-provider';

export function AppSettingsForm({
  initialAppName,
  initialHouseholdName,
}: {
  initialAppName: string;
  initialHouseholdName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [appName, setAppName] = useState(initialAppName);
  const [householdName, setHouseholdName] = useState(initialHouseholdName);
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName, householdName }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(body?.error?.message ?? 'The app settings could not be saved.');
      showToast('App settings saved.', 'success');
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'The app settings could not be saved.',
        'error',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-card app-settings-form" onSubmit={save}>
      <div>
        <p className="eyebrow">APP DETAILS</p>
        <h2>Make the kitchen feel like yours.</h2>
        <p>These names appear in the shared header and welcome screen for everyone.</p>
      </div>
      <div className="field-grid two-columns">
        <label>
          <span>App name</span>
          <input
            value={appName}
            minLength={1}
            maxLength={80}
            onChange={(event) => setAppName(event.target.value)}
            required
          />
        </label>
        <label>
          <span>Household name</span>
          <input
            value={householdName}
            minLength={1}
            maxLength={80}
            onChange={(event) => setHouseholdName(event.target.value)}
            required
          />
        </label>
      </div>
      <button
        className="primary-button compact"
        type="submit"
        disabled={pending || !appName.trim() || !householdName.trim()}
      >
        {pending ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
        {pending ? 'Saving settings…' : 'Save app settings'}
      </button>
    </form>
  );
}
