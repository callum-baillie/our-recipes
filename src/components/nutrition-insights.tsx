'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AiSummaryCards, type AiSummaryCardData } from './ai-summary-cards';
import { AsyncSkeleton } from './skeleton';
export function NutritionInsights({
  initialSummary,
}: {
  initialSummary?: AiSummaryCardData | null;
}) {
  const [generated, setGenerated] = useState<AiSummaryCardData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setConfirming(false);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/ai/summaries', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Insights could not be updated.');
      const next = (body.summaries as AiSummaryCardData[]).find(
        (item) => item.domain === 'nutrition',
      );
      if (!next)
        throw new Error(
          'No nutrition insight was generated. Check that nutrition summaries and data sharing are enabled in your AI preferences.',
        );
      setGenerated(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Insights could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="nutrition-insight-workspace"
      aria-label="Nutrition insights"
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>Your nutrition patterns</h2>
          <p>
            Insights use recorded meals, goals and measurements you allow the assistant to access.
            Incomplete logs are not treated as a complete day.
          </p>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          <Sparkles size={18} />
          {busy ? 'Reviewing your records…' : 'Refresh insights'}
        </button>
      </header>
      {confirming && (
        <div className="nutrition-insight-confirmation">
          <p>
            Generate fresh insights with a paid AI request? This refreshes your enabled insight
            categories using your AI data-sharing preferences.
          </p>
          <button className="primary-button compact" type="button" onClick={() => void refresh()}>
            Generate insights
          </button>
          <button className="text-button" type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {busy && <AsyncSkeleton label="Reviewing recorded nutrition and goals" variant="message" />}
      <AiSummaryCards
        domain="nutrition"
        placement="nutrition"
        initialSummary={generated ?? initialSummary}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
