'use client';

import { useState } from 'react';

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
    <section className="settings-card" aria-labelledby="support-diagnostics-heading">
      <p className="eyebrow">SUPPORT</p>
      <h2 id="support-diagnostics-heading">Redacted diagnostics</h2>
      <p>
        Export build, migration, storage-health, configuration-presence, and redacted error
        metadata. Household content, paths, origins, and secret values are excluded.
      </p>
      <button type="button" className="text-button" onClick={() => void download()}>
        Download diagnostics
      </button>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
