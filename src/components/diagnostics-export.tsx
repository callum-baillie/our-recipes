'use client';

import { useState } from 'react';
import { SettingsPane, SettingsRow } from '@/components/settings-primitives';

export function DiagnosticsExport() {
  const [status, setStatus] = useState('');

  async function download() {
    setStatus('Preparing redacted diagnostics…');
    const response = await fetch('/api/v1/diagnostics', { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setStatus(body?.error?.message ?? 'Diagnostics could not be exported.');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bord-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('Redacted diagnostics downloaded.');
  }

  return (
    <SettingsPane
      eyebrow="SUPPORT"
      title="Redacted diagnostics"
      description="Export safe installation details for troubleshooting."
    >
      <SettingsRow
        title="Diagnostic report"
        description="Includes build, migration, storage health, configuration presence, and redacted errors. Household content, paths, origins, and secrets are excluded."
      >
        <button type="button" className="secondary-button compact" onClick={() => void download()}>
          Download diagnostics
        </button>
      </SettingsRow>
      {status ? (
        <p className="settings-inline-status" role="status">
          {status}
        </p>
      ) : null}
    </SettingsPane>
  );
}
