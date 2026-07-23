import styles from '@/components/recipe-normalized-nutrition.module.css';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';
import type { RecipeNutritionPresentation } from '@/lib/domain/nutrition-recipe-presentation';

function number(value: number, precision = 1) {
  return Number(value.toFixed(precision)).toLocaleString();
}

export function RecipeNormalizedNutrition({
  nutrition,
}: {
  nutrition: RecipeNutritionPresentation;
}) {
  return (
    <section className={styles.panel} aria-labelledby="normalized-nutrition-heading">
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>NORMALIZED INGREDIENT CALCULATION</p>
          <h2 id="normalized-nutrition-heading">Calculated recipe nutrition</h2>
        </div>
        <span className={styles.status} data-status={nutrition.status}>
          {nutrition.status === 'current'
            ? 'Current recipe revision'
            : nutrition.status === 'stale'
              ? 'Recalculation needed'
              : 'Not calculated'}
        </span>
      </header>
      {nutrition.status === 'unavailable' ? (
        <p className={styles.callout}>
          No normalized ingredient calculation is available. Missing values are unknown, never zero.
        </p>
      ) : (
        <>
          <p className={styles.meta}>
            Coverage {Math.round((nutrition.completeness ?? 0) * 100)}% · confidence{' '}
            {Math.round((nutrition.confidence ?? 0) * 100)}% · {nutrition.energyMethod} energy ·{' '}
            {nutrition.sourceLabel}
          </p>
          <dl className={styles.grid}>
            {nutrition.values.map((value) => (
              <div key={value.nutrientCode}>
                <dt>
                  <NutritionVisualMarker
                    nutrientCode={value.nutrientCode}
                    label={value.label}
                    compact
                  />
                  {value.label}
                </dt>
                <dd>
                  <strong>
                    {number(value.total)} {value.unit}
                  </strong>
                  <span>whole recipe</span>
                  <b>
                    {value.perServing === null
                      ? 'Per serving unavailable'
                      : `${number(value.perServing)} ${value.unit} per serving`}
                  </b>
                </dd>
              </div>
            ))}
          </dl>
          {nutrition.warnings.length > 0 ? (
            <ul className={styles.warnings}>
              {nutrition.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.footnote}>
            Raw-ingredient estimate. No density, cooking loss, drained yield, optional ingredient,
            or retention factor is assumed without explicit evidence. Calculation revision{' '}
            {nutrition.calculationRevision}; recipe revision {nutrition.recipeRevision}. Method:{' '}
            {nutrition.methodLabel}.
          </p>
        </>
      )}
    </section>
  );
}
