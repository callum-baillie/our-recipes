'use client';
import { useEffect, useState } from 'react';
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
    <section className="settings-card">
      <h2>Device camera</h2>
      <p>Preferences apply to barcode scanning on this browser, including Pantry.</p>
      <form
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
        <label>
          Camera{' '}
          <select
            value={value.facingMode}
            onChange={(e) => setValue({ ...value, facingMode: e.target.value })}
          >
            <option value="environment">Rear camera</option>
            <option value="user">Front camera</option>
          </select>
        </label>
        <label>
          Delay between scans{' '}
          <select
            value={value.cooldownMs}
            onChange={(e) => setValue({ ...value, cooldownMs: Number(e.target.value) })}
          >
            <option value={1000}>1 second</option>
            <option value={1500}>1.5 seconds</option>
            <option value={2500}>2.5 seconds</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.vibrate}
            onChange={(e) => setValue({ ...value, vibrate: e.target.checked })}
          />{' '}
          Vibrate after a scan
        </label>
        <button type="submit">Save camera preferences</button>
      </form>
      <h2>Hardware scanner</h2>
      <p>
        The companion continues adding packages while Bòrd is closed. Every separate product scan
        counts as another package. Wall actions require the companion’s extended profile.
      </p>
    </section>
  );
}
