'use client';
import { Save } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  SettingsActionBar,
  SettingsField,
  SettingsPane,
  SettingsRow,
} from '@/components/settings-primitives';
import {
  CAMERA_SCANNER_KEY,
  defaultCameraPreferences,
  readCameraPreferences,
} from '@/lib/client/camera-scanner-preferences';
import { useToast } from './toast-provider';
export function CameraScannerSettings() {
  const [value, setValue] = useState(defaultCameraPreferences);
  const { showToast } = useToast();
  useEffect(() => {
    const timer = setTimeout(() => setValue(readCameraPreferences()), 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            localStorage.setItem(CAMERA_SCANNER_KEY, JSON.stringify(value));
            showToast('Camera preferences saved.', 'success');
          } catch {
            showToast('This browser could not save preferences.', 'error');
          }
        }}
      >
        <SettingsPane
          title="Device camera"
          description="Preferences apply to barcode scanning on this browser, including Pantry."
        >
          <SettingsField title="Camera" description="Which camera to open when scanning.">
            <select
              value={value.facingMode}
              onChange={(e) => setValue({ ...value, facingMode: e.target.value })}
            >
              <option value="environment">Rear camera</option>
              <option value="user">Front camera</option>
            </select>
          </SettingsField>
          <SettingsField
            title="Delay between scans"
            description="A short pause stops one barcode being read twice."
          >
            <select
              value={value.cooldownMs}
              onChange={(e) => setValue({ ...value, cooldownMs: Number(e.target.value) })}
            >
              <option value={1000}>1 second</option>
              <option value={1500}>1.5 seconds</option>
              <option value={2500}>2.5 seconds</option>
            </select>
          </SettingsField>
          <SettingsField
            title="Vibrate after a scan"
            description="Buzz the device when a barcode is read, where supported."
            compact
          >
            <input
              type="checkbox"
              checked={value.vibrate}
              onChange={(e) => setValue({ ...value, vibrate: e.target.checked })}
            />
          </SettingsField>
          <SettingsActionBar>
            <button className="primary-button compact" type="submit">
              <Save size={16} aria-hidden="true" />
              Save camera preferences
            </button>
          </SettingsActionBar>
        </SettingsPane>
      </form>
      <SettingsPane
        title="Hardware scanner"
        description="The companion continues adding packages while Bòrd is closed. Every separate product scan counts as another package. Wall actions require the companion’s extended profile."
      >
        <SettingsRow
          title="Connect a handheld scanner"
          description="Register a station below, then scan straight into your pantry."
        >
          <Link className="secondary-button compact" href="/pantry/add?mode=scan">
            Open scan list
          </Link>
        </SettingsRow>
      </SettingsPane>
    </>
  );
}
