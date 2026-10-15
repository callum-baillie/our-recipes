'use client';
import { bodyMetricFields } from '@/lib/domain/body-metrics';
import type { CompositionEstimate } from '@/lib/domain/qn-body-composition';
import styles from './nutrition-onboarding-flow.module.css';
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
      <summary>View calculated body composition</summary>
      <p className={styles.hint}>
        Estimated with qn-scale-ble
        {measuredAt ? ` from the weigh-in on ${new Date(measuredAt).toLocaleDateString()}` : ''}.
        These values can differ substantially from VeSync, especially BMR. Imported and manually
        entered readings are kept separately. These estimates do not set your calorie targets.
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
    </details>
  );
}
