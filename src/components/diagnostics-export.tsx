'use client';

import { ToastNotice } from './toast-provider';

import { useState } from 'react';
import { SettingsPane, SettingsRow } from '@/components/settings-primitives';

export function DiagnosticsExport() {
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);

  async function download() {
    if (pending) return;
    setPending(true);
    setStatus('Preparing redacted diagnostics…');
    try {
      const response = await fetch('/api/v1/diagnostics', { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Diagnostics could not be exported.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `bord-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Troubleshooting JSON report prepared; download started.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Check your connection and retry.');
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsPane
      eyebrow="SUPPORT"
      id="support"
      title="Troubleshooting report (JSON)"
      description="Redacted installation details for support. This is not a restorable backup."
    >
      <SettingsRow
        title="Diagnostic report"
        description="Includes build, migration, storage health, configuration presence, and redacted errors. Household content, paths, origins, and secrets are excluded."
      >
        <button
          type="button"
          className="secondary-button compact"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void download()}
        >
          {pending ? 'Preparing…' : 'Download diagnostics'}
        </button>
      </SettingsRow>
      {status ? <ToastNotice>{status}</ToastNotice> : null}
    </SettingsPane>
  );
}
