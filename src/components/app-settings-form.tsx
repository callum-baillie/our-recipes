'use client';

import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSettingsSave } from './use-settings-save';

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
  const { values, setValues, pending, dirty, status, save } = useSettingsSave({
    kitchenName: initialKitchenName,
    kitchenIcon: parseBrandIcon(initialKitchenIcon),
  });
  const { kitchenName, kitchenIcon } = values;
  const setKitchenName = (kitchenName: string) =>
    setValues((current) => ({ ...current, kitchenName }));
  const setKitchenIcon = (kitchenIcon: BrandIconId) =>
    setValues((current) => ({ ...current, kitchenIcon }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(async (snapshot) => {
      const response = await fetch('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? 'Kitchen identity could not be saved.');
      showToast('Kitchen identity saved.', 'success');
      router.refresh();
      return {
        kitchenName: body.household.kitchenName,
        kitchenIcon: parseBrandIcon(body.household.kitchenIcon),
      };
    }, 'Kitchen identity saved.');
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <fieldset className="settings-form-fields" disabled={pending}>
        <SettingsPane
          id="kitchen-identity"
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
            title="Selected kitchen mark"
            description="Choose the mark used in the header and installed app icon."
            align="start"
          >
            <BrandIconPicker selected={kitchenIcon} onSelect={setKitchenIcon} />
          </SettingsRow>
          <SettingsActionBar status={status}>
            <button
              className="primary-button compact"
              type="submit"
              disabled={pending || !dirty || !kitchenName.trim()}
            >
              {pending ? <LoadingIndicator label="Saving kitchen identity" /> : <Save size={16} />}
              {pending ? 'Saving…' : 'Save kitchen identity'}
            </button>
          </SettingsActionBar>
        </SettingsPane>
      </fieldset>
    </form>
  );
}
