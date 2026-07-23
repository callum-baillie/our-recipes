'use client';

import { useState } from 'react';

import styles from '@/components/nutrition-chart-panels.module.css';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';
import type { NutritionChartDatasets } from '@/lib/domain/nutrition-chart-datasets';
import {
  nutritionVisuals,
  resolveNutritionVisual,
  type NutritionVisualKey,
} from '@/lib/domain/nutrition-visuals';

const MACRO_LABELS: Record<string, string> = {
  protein: 'Protein',
  carbohydrate: 'Carbohydrate',
  total_fat: 'Total fat',
  alcohol: 'Alcohol',
};

function calorieGoalLabel(datasets: NutritionChartDatasets) {
  const goal = datasets.calorie.goal;
  if (datasets.calorie.status === 'ambiguous_goal') return 'Ambiguous: multiple current goals';
  if (!goal) return 'No current configured goal';
  if (goal.kind === 'range') return `${goal.minimum}–${goal.maximum} ${goal.unit} range`;
  if (goal.kind === 'limit') return `${goal.maximum} ${goal.unit} limit`;
  return `${goal.value} ${goal.unit} ${goal.kind}`;
}

export function NutritionChartPanels({
  datasets,
  mode,
  nutrientLabels,
}: {
  datasets: NutritionChartDatasets;
  mode: 'overview' | 'nutrients';
  nutrientLabels: Record<string, string>;
}) {
  const [coverageFilter, setCoverageFilter] = useState<'all' | NutritionVisualKey>('all');
  if (mode === 'nutrients') {
    const availableVisuals = new Set(
      datasets.coverage.map((row) => resolveNutritionVisual(row.nutrientCode).key),
    );
    const visibleCoverage = datasets.coverage.filter(
      (row) =>
        coverageFilter === 'all' || resolveNutritionVisual(row.nutrientCode).key === coverageFilter,
    );
    return (
      <section className={styles.panel} aria-labelledby="nutrient-coverage-chart-title">
        <header>
          <h2 id="nutrient-coverage-chart-title">Today&apos;s configured nutrient coverage</h2>
          <p>
            Target, minimum, range, and limit rows keep their own meanings. Missing values are
            unknown, not zero.
          </p>
          <small>
            {datasets.calorie.profileLabel} · {datasets.calorie.date}
          </small>
        </header>
        {datasets.coverage.length ? (
          <>
            <div className={styles.filters} aria-label="Filter nutrient coverage">
              <button
                type="button"
                aria-pressed={coverageFilter === 'all'}
                onClick={() => setCoverageFilter('all')}
              >
                All
              </button>
              {nutritionVisuals()
                .filter((visual) => availableVisuals.has(visual.key))
                .map((visual) => (
                  <button
                    key={visual.key}
                    type="button"
                    aria-pressed={coverageFilter === visual.key}
                    onClick={() => setCoverageFilter(visual.key)}
                  >
                    {visual.label}
                  </button>
                ))}
            </div>
            <div className={styles.coverageList} aria-label="Nutrient coverage bars">
              {visibleCoverage.map((row) => (
                <article key={row.id}>
                  <div>
                    <NutritionVisualMarker nutrientCode={row.nutrientCode} compact />
                    <span>
                      <strong>{nutrientLabels[row.nutrientCode] ?? row.nutrientCode}</strong>
                      <small>
                        {row.kind} · {row.status.replaceAll('_', ' ')}
                      </small>
                    </span>
                  </div>
                  <div className={styles.track} aria-hidden="true">
                    <span
                      style={{
                        width: `${row.visualPercent}%`,
                        background: resolveNutritionVisual(row.nutrientCode).color,
                      }}
                    />
                  </div>
                  <p>{row.comparison}</p>
                </article>
              ))}
            </div>
            <details className={styles.dataDisclosure}>
              <summary>View exact nutrient values</summary>
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <caption>Table equivalent for today&apos;s configured nutrient coverage</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nutrient</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Confirmed</th>
                      <th scope="col">Configured boundary</th>
                      <th scope="col">Status</th>
                      <th scope="col">Boundary ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCoverage.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">{nutrientLabels[row.nutrientCode] ?? row.nutrientCode}</th>
                        <td>{row.kind}</td>
                        <td>{row.amount === null ? 'No data' : `${row.amount} ${row.unit}`}</td>
                        <td>
                          {row.kind === 'range'
                            ? `${row.minimum}–${row.maximum} ${row.unit}`
                            : `${row.kind === 'limit' ? row.maximum : row.value} ${row.unit}`}
                        </td>
                        <td>{row.status.replaceAll('_', ' ')}</td>
                        <td>
                          {row.ratio === null
                            ? 'No data'
                            : `${(row.ratio * 100).toFixed(1)}% of ${
                                row.kind === 'range' || row.kind === 'limit' ? 'maximum' : row.kind
                              }`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className={styles.empty}>No current configured nutrient goals are available.</p>
        )}
      </section>
    );
  }

  const { calorie, macroComposition } = datasets;
  return (
    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="daily-calorie-chart-title">
        <header>
          <h2 id="daily-calorie-chart-title">Daily calorie progress</h2>
          <p>{calorie.takeaway}</p>
          <small>
            {calorie.profileLabel} · {calorie.date} · recent completeness{' '}
            {calorie.recentCompleteness === null
              ? 'unknown'
              : `${Math.round(calorie.recentCompleteness * 100)}%`}
          </small>
        </header>
        <div
          className={styles.bullet}
          aria-label={
            calorie.showPlannedNutrition
              ? 'Confirmed and separately planned calories'
              : 'Confirmed calories'
          }
        >
          <div>
            <span>Confirmed</span>
            <div className={styles.track} aria-hidden="true">
              <span style={{ width: `${calorie.confirmedVisualPercent}%` }} />
            </div>
            <b>
              {calorie.confirmedEnergy === null ? 'No data' : `${calorie.confirmedEnergy} kcal`}
            </b>
          </div>
          {calorie.showPlannedNutrition ? (
            <div>
              <span>Planned separately</span>
              <div className={`${styles.track} ${styles.planned}`} aria-hidden="true">
                <span style={{ width: `${calorie.plannedVisualPercent}%` }} />
              </div>
              <b>{calorie.plannedEnergy === null ? 'No data' : `${calorie.plannedEnergy} kcal`}</b>
            </div>
          ) : null}
        </div>
        <table className={styles.table}>
          <caption>Table equivalent for daily calorie progress</caption>
          <tbody>
            <tr>
              <th scope="row">Confirmed calories</th>
              <td>
                {calorie.confirmedEnergy === null ? 'No data' : `${calorie.confirmedEnergy} kcal`}
              </td>
            </tr>
            {calorie.showPlannedNutrition ? (
              <tr>
                <th scope="row">Planned calories, not counted as consumed</th>
                <td>
                  {calorie.plannedEnergy === null ? 'No data' : `${calorie.plannedEnergy} kcal`}
                </td>
              </tr>
            ) : null}
            <tr>
              <th scope="row">Configured goal</th>
              <td>{calorieGoalLabel(datasets)}</td>
            </tr>
            <tr>
              <th scope="row">Goal comparison</th>
              <td>{calorie.takeaway}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className={styles.panel} aria-labelledby="macro-composition-chart-title">
        <header>
          <h2 id="macro-composition-chart-title">Confirmed macro composition</h2>
          <p>{macroComposition.takeaway}</p>
          <small>
            {macroComposition.profileLabel} · {macroComposition.date}
          </small>
        </header>
        {macroComposition.status === 'ready' ? (
          <>
            <div className={styles.stacked} aria-label="Percentage of calculated macro energy">
              {macroComposition.items.map((item) => (
                <span
                  key={item.code}
                  className={styles[item.code]}
                  style={{ width: `${item.visualPercent}%` }}
                  title={`${MACRO_LABELS[item.code]}: ${item.grams} g, ${item.percentOfCalculatedEnergy.toFixed(1)}%`}
                >
                  <span className={styles.srOnly}>{MACRO_LABELS[item.code]}</span>
                </span>
              ))}
            </div>
            <div className={styles.legend} aria-label="Macro colors">
              {macroComposition.items.map((item) => (
                <span key={item.code}>
                  <NutritionVisualMarker nutrientCode={item.code} compact />
                  {MACRO_LABELS[item.code]} {item.percentOfCalculatedEnergy.toFixed(0)}%
                </span>
              ))}
            </div>
            <details className={styles.dataDisclosure}>
              <summary>View exact macro values</summary>
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <caption>Table equivalent for confirmed macro composition</caption>
                  <thead>
                    <tr>
                      <th scope="col">Macro</th>
                      <th scope="col">Grams</th>
                      <th scope="col">Calculated kcal</th>
                      <th scope="col">Calculated energy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {macroComposition.items.map((item) => (
                      <tr key={item.code}>
                        <th scope="row">{MACRO_LABELS[item.code]}</th>
                        <td>{item.grams}</td>
                        <td>{item.kcal.toFixed(1)}</td>
                        <td>{item.percentOfCalculatedEnergy.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className={styles.empty}>{macroComposition.takeaway}</p>
        )}
      </section>
    </div>
  );
}
