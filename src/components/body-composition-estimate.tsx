'use client';
import { bodyMetricFields } from '@/lib/domain/body-metrics';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import styles from './nutrition-measurements.module.css';
import { ChevronDown } from 'lucide-react';
export function BodyCompositionEstimatePanel({
  estimate,
  measuredAt,
  imperial = false,
}: {
  estimate: CompositionEstimate | null;
  measuredAt?: string;
  imperial?: boolean;
}) {
  if (!estimate) return null;
  return (
    <details>
      <summary className="recipe-disclosure-summary">
        Calculated estimates
        <ChevronDown size={18} />
      </summary>
      <p className={styles.hint}>
        Calculated estimates
        {measuredAt ? ` from the observation on ${new Date(measuredAt).toLocaleDateString()}` : ''}.
        These can differ from imported or recorded measurements. They do not set calorie goals.
      </p>
      <dl className={styles.review}>
        <div>
          <dt>BMI</dt>
          <dd>{estimate.bmi.toFixed(1)}</dd>
        </div>
        {bodyMetricFields.map((field) => {
          const value = estimate.metrics[field.key];
          if (value == null) return null;
          const pounds = imperial && field.unit === 'kg';
          return (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>
                {Number((value * (pounds ? 2.2046226218 : 1)).toFixed(1))}{' '}
                {pounds ? 'lb' : field.unit}
              </dd>
            </div>
          );
        })}
      </dl>
      <details>
        <summary className="recipe-disclosure-summary">
          Calculation method
          <ChevronDown size={16} />
        </summary>
        <p className={styles.hint}>
          Calculated with qn-scale-ble from saved observation inputs. Device and calculated
          estimates can differ substantially, especially BMR.
        </p>
      </details>
    </details>
  );
}
