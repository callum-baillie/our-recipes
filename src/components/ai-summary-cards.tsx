'use client';

import {
  BookOpen,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  Minus,
  ShoppingBasket,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Utensils,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { InlineSkeleton } from '@/components/skeleton';
import type { AiSummaryDomain } from '@/lib/domain/ai-assistant';

import styles from './ai-summary-cards.module.css';

export type AiSummaryCardData = {
  id: string;
  domain: AiSummaryDomain;
  headline: string;
  summary: string;
  highlights: string[];
  metrics: Array<{
    label: string;
    value: string;
    context: string;
    trend: 'up' | 'down' | 'steady' | 'none';
  }>;
  caveats: string[];
  createdAt: string;
};

const DOMAIN_META = {
  nutrition: { label: 'Nutrition insight', icon: Utensils },
  meal_plans: { label: 'Planning insight', icon: CalendarRange },
  shopping_lists: { label: 'Shopping insight', icon: ShoppingBasket },
  recipes: { label: 'Recipebook insight', icon: BookOpen },
} as const;

const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  steady: Minus,
  none: null,
} as const;

export function AiSummaryCards({
  domain,
  placement = 'content',
  initialSummary,
}: {
  domain: AiSummaryDomain;
  placement?: 'content' | 'rail' | 'nutrition';
  initialSummary?: AiSummaryCardData | null;
}) {
  const [summary, setSummary] = useState<AiSummaryCardData | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(initialSummary === undefined);

  useEffect(() => {
    if (initialSummary !== undefined) return;
    let active = true;
    void fetch('/api/v1/ai/summaries?limit=12', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { summaries: [] }))
      .then((body: { summaries?: AiSummaryCardData[] }) => {
        if (active) setSummary(body.summaries?.find((item) => item.domain === domain) ?? null);
      })
      .catch(() => {
        if (active) setSummary(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [domain, initialSummary]);

  if (loading) {
    return (
      <section
        className={styles.section}
        data-placement={placement}
        aria-label={`Loading ${DOMAIN_META[domain].label}`}
      >
        <InlineSkeleton label="Loading AI insight" width="42%" />
        <InlineSkeleton label="Loading AI insight" width="86%" />
        <InlineSkeleton label="Loading AI insight" width="68%" />
      </section>
    );
  }
  if (!summary) return null;

  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;
  return (
    <section className={styles.section} data-placement={placement} aria-labelledby={summary.id}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Icon size={18} />
        </span>
        <div>
          <p>
            <Sparkles size={13} aria-hidden="true" /> AI {meta.label}
          </p>
          <h2 id={summary.id}>{summary.headline}</h2>
        </div>
      </header>
      <p className={styles.summary}>{summary.summary}</p>
      {summary.metrics.length ? (
        <dl className={styles.metrics}>
          {summary.metrics.map((metric) => {
            const Trend = TREND_ICON[metric.trend];
            return (
              <div key={`${metric.label}:${metric.value}`}>
                <dt>{metric.label}</dt>
                <dd>
                  {metric.value}
                  {Trend ? <Trend size={15} aria-label={`${metric.trend} trend`} /> : null}
                </dd>
                {metric.context ? <small>{metric.context}</small> : null}
              </div>
            );
          })}
        </dl>
      ) : null}
      {summary.highlights.length ? (
        <ul className={styles.highlights}>
          {summary.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {summary.caveats.length ? (
        <details className={styles.caveats}>
          <summary>
            Data notes <ChevronDown className={styles.closedIcon} size={15} aria-hidden="true" />
            <ChevronUp className={styles.openIcon} size={15} aria-hidden="true" />
          </summary>
          <ul>
            {summary.caveats.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <footer>
        <span>
          Updated{' '}
          {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
            new Date(summary.createdAt),
          )}
        </span>
        <Link href="/settings/ai">Summary settings</Link>
      </footer>
    </section>
  );
}
