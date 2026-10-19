'use client';

import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BrandIconPicker } from '@/components/brand-icon-picker';
import { LoadingIndicator } from '@/components/skeleton';
import {
  SettingsActionBar,
  SettingsPane,
  SettingsRow,
  SettingsField,
} from '@/components/settings-primitives';
import { useToast } from '@/components/toast-provider';
import { parseBrandIcon, type BrandIconId } from '@/lib/appearance';

export function AppSettingsForm({
  initialKitchenName,
  initialKitchenIcon,
}: {
  initialKitchenName: string;
  initialKitchenIcon: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [kitchenName, setKitchenName] = useState(initialKitchenName);
  const [kitchenIcon, setKitchenIcon] = useState<BrandIconId>(parseBrandIcon(initialKitchenIcon));
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kitchenName, kitchenIcon }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? 'The kitchen identity could not be saved.');
      }
      showToast('Kitchen identity saved.', 'success');
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'The kitchen identity could not be saved.',
        'error',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={save}>
      <SettingsPane
        eyebrow="KITCHEN IDENTITY"
        title="Kitchen identity"
        description="Shared branding for everyone who uses this installation."
      >
        <SettingsField
          title="Kitchen name"
          description="Appears in the app header. Bòrd remains visible in page titles and product information."
        >
          <input
            value={kitchenName}
            minLength={1}
            maxLength={80}
            onChange={(event) => setKitchenName(event.target.value)}
            required
          />
        </SettingsField>
        <SettingsRow
          title="Kitchen icon"
          description="Choose the mark used in the header and installed app icon."
          align="start"
        >
          <BrandIconPicker selected={kitchenIcon} onSelect={setKitchenIcon} />
        </SettingsRow>
        <SettingsActionBar>
          <button
            className="primary-button compact"
            type="submit"
            disabled={pending || !kitchenName.trim()}
          >
            {pending ? <LoadingIndicator label="Saving kitchen identity" /> : <Save size={16} />}
            {pending ? 'Saving…' : 'Save kitchen identity'}
          </button>
        </SettingsActionBar>
      </SettingsPane>
    </form>
  );
}
