'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import styles from './ai-summary-cards.module.css';

type Summary = {
  id: string;
  kind: string;
  periodStart: string;
  periodEnd: string;
  headline: string;
  body: string;
  highlights: string[];
};

export function AiSummaryCards({ kinds }: { kinds: string[] }) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const kindKey = kinds.join('|');
  useEffect(() => {
    void fetch('/api/v1/ai/summaries?limit=12', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { summaries: [] }))
      .then((body: { summaries?: Summary[] }) => {
        const allowedKinds = new Set(kindKey.split('|'));
        const selected = new Map<string, Summary>();
        for (const summary of body.summaries ?? [])
          if (allowedKinds.has(summary.kind) && !selected.has(summary.kind))
            selected.set(summary.kind, summary);
        setSummaries([...selected.values()]);
      })
      .catch(() => setSummaries([]));
  }, [kindKey]);
  if (!summaries.length) return null;
  return (
    <section className={styles.section} aria-labelledby={`ai-summary-${kinds.join('-')}`}>
      <header className={styles.header}>
        <Sparkles size={18} aria-hidden="true" />
        <h2 id={`ai-summary-${kinds.join('-')}`}>AI summaries</h2>
      </header>
      <div className={styles.cards}>
        {summaries.map((summary) => (
          <article className={styles.card} key={summary.id}>
            <small>
              {summary.kind.replaceAll('_', ' ')} ·{' '}
              {summary.periodStart === summary.periodEnd
                ? summary.periodStart
                : `${summary.periodStart}–${summary.periodEnd}`}
            </small>
            <h3>{summary.headline}</h3>
            <p>{summary.body}</p>
            {summary.highlights.length ? (
              <ul>
                {summary.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
