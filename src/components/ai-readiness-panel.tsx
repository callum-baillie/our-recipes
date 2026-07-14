import type { AiConnectionStatus } from '@/lib/domain/ai';

export function AiReadinessPanel({ status }: { status: AiConnectionStatus }) {
  return (
    <main className="recipe-page">
      <section className="settings-page">
        <div className="settings-intro">
          <p className="eyebrow">AI CONNECTION</p>
          <h1>AI stays off until you choose otherwise.</h1>
          <p>
            Recipe capture remains local and review-first. No provider key is stored, sent, or
            exposed by this screen.
          </p>
        </div>
        <section className="settings-card" aria-labelledby="ai-status-title">
          <p className="eyebrow">
            {status.provider.toUpperCase()} · {status.state.toUpperCase()}
          </p>
          <h2 id="ai-status-title">
            {status.enabled ? 'Ready when a household member asks' : 'Not configured'}
          </h2>
          <p role="status">{status.message}</p>
          <p>
            Review-first operations:{' '}
            {status.supportedOperationKinds.join(', ').replaceAll('-', ' ')}.
          </p>
          <p>
            Recipe source text, normalized scans, and recipe details leave this server only after a
            household member explicitly starts an OpenAI action. A candidate is never saved without
            review and confirmation.
          </p>
        </section>
      </section>
    </main>
  );
}
