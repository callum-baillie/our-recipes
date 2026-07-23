'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import styles from '@/components/nutrition-advanced-chart-panels.module.css';
import type { AdvancedNutritionCharts } from '@/lib/domain/nutrition-advanced-charts';
import type { NutritionWeightTrend } from '@/lib/domain/nutrition-weight-trend';

function value(value: number | null, unit: string, digits = 1) {
  return value === null ? 'No data' : `${value.toFixed(digits)} ${unit}`;
}

function goalText(goal: AdvancedNutritionCharts['calorieTrend'][number]['goal']) {
  if (!goal) return 'No configured goal';
  if (goal.kind === 'range') return `${goal.minimum}–${goal.maximum} ${goal.unit} range`;
  if (goal.kind === 'limit') return `${goal.maximum} ${goal.unit} limit`;
  return `${goal.value} ${goal.unit} ${goal.kind}`;
}

export function NutritionWeightTrendPanel({ trend }: { trend?: NutritionWeightTrend | null }) {
  if (!trend || trend.status === 'disabled') return null;
  if (trend.status === 'empty') {
    return (
      <section className={styles.panel} aria-labelledby="weight-trend-title">
        <header>
          <h2 id="weight-trend-title">Weight trend</h2>
          <p>Weight tracking is enabled, but no observations are recorded in this date range.</p>
          <small>
            {trend.profileLabel} · {trend.startDate}–{trend.endDate} · {trend.unit}
          </small>
        </header>
      </section>
    );
  }

  const observationsByDate = new Map(
    trend.rollingAverages.map((average) => [
      average.date,
      trend.observations.filter((observation) => observation.localDate === average.date),
    ]),
  );
  return (
    <section className={styles.panel} aria-labelledby="weight-trend-title">
      <header>
        <h2 id="weight-trend-title">Weight trend</h2>
        <p>
          Every observation remains distinct. The seven-day average uses the latest observation on
          each present local day; days without an observation are not treated as zero.
        </p>
        <small>
          {trend.profileLabel} · {trend.startDate}–{trend.endDate} · {trend.unit}
        </small>
      </header>
      <div
        className={styles.weightChart}
        aria-label={`Weight observations and seven-day averages from ${trend.axis.minimumDisplay} to ${trend.axis.maximumDisplay} ${trend.unit}`}
      >
        <div className={styles.weightAxis} aria-hidden="true">
          <span>
            {trend.axis.minimumDisplay} {trend.unit}
          </span>
          <span>
            {trend.axis.maximumDisplay} {trend.unit}
          </span>
        </div>
        {trend.rollingAverages.map((average) => (
          <div className={styles.weightDay} key={average.date}>
            <time dateTime={average.date}>{average.date}</time>
            <div className={styles.weightTrack}>
              {(observationsByDate.get(average.date) ?? []).map((observation) => (
                <span
                  className={styles.weightObservation}
                  key={observation.id}
                  style={{ left: `${observation.visualPercent}%` }}
                  title={`${observation.measuredAt}: ${observation.displayWeight} ${trend.unit}`}
                >
                  ◆<span className={styles.srOnly}>Observation</span>
                </span>
              ))}
              {average.visualPercent === null ? null : (
                <span
                  className={styles.weightAverage}
                  style={{ left: `${average.visualPercent}%` }}
                  title={`${average.date}: ${average.displayWeight} ${trend.unit} average from ${average.contributingDays} present days`}
                >
                  ●<span className={styles.srOnly}>Seven-day average</span>
                </span>
              )}
              {trend.target ? (
                <span
                  className={styles.weightTarget}
                  style={{ left: `${trend.target.visualPercent}%` }}
                  title={`Configured target: ${trend.target.displayWeight} ${trend.unit}`}
                >
                  <span className={styles.srOnly}>Configured target</span>
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className={styles.legend}>
        <span>◆ observation</span> <span>● seven-day average</span>
        {trend.target ? <span>┊ configured target</span> : null}
      </p>
      {trend.target ? (
        <p>
          Configured target: {trend.target.displayWeight} {trend.unit} (
          {trend.target.weightKilograms.toFixed(3)} kg canonical).
        </p>
      ) : null}
      <table className={styles.table}>
        <caption>Exact weight observations</caption>
        <thead>
          <tr>
            <th scope="col">Local day</th>
            <th scope="col">Recorded at</th>
            <th scope="col">Displayed weight</th>
            <th scope="col">Canonical weight</th>
            <th scope="col">Source</th>
            <th scope="col">Precision</th>
          </tr>
        </thead>
        <tbody>
          {trend.observations.map((observation) => (
            <tr key={observation.id}>
              <th scope="row">{observation.localDate}</th>
              <td>
                <time dateTime={observation.measuredAt}>{observation.measuredAt}</time>
              </td>
              <td>
                {observation.displayWeight} {trend.unit}
              </td>
              <td>{observation.weightKilograms.toFixed(3)} kg</td>
              <td>{observation.sourceType.replaceAll('_', ' ')}</td>
              <td>{observation.approximate ? 'Approximate' : 'As recorded'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className={styles.table}>
        <caption>Seven-day averages by local day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Average</th>
            <th scope="col">Present days used</th>
          </tr>
        </thead>
        <tbody>
          {trend.rollingAverages.map((average) => (
            <tr key={average.date}>
              <th scope="row">{average.date}</th>
              <td>
                {average.displayWeight === null
                  ? 'No data'
                  : `${average.displayWeight} ${trend.unit}`}
              </td>
              <td>{average.contributingDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function NutritionAdvancedChartPanels({
  charts,
  nutrientLabels,
  nutrientUnits,
}: {
  charts: AdvancedNutritionCharts;
  nutrientLabels: Record<string, string>;
  nutrientUnits: Record<string, string>;
}) {
  const [macroMode, setMacroMode] = useState<'grams' | 'percent'>('grams');
  const sourceCodes = Object.keys(charts.sourceRankings);
  const [sourceNutrient, setSourceNutrient] = useState(sourceCodes[0] ?? 'fiber');
  const sourceRows = charts.sourceRankings[sourceNutrient] ?? [];
  const comparisonCodes = [...new Set(charts.plannedVersusConsumed.map((row) => row.nutrientCode))];
  const [comparisonNutrient, setComparisonNutrient] = useState(
    comparisonCodes.includes('energy_kcal') ? 'energy_kcal' : (comparisonCodes[0] ?? ''),
  );
  const comparisonData = charts.plannedVersusConsumed.filter(
    (row) => row.nutrientCode === comparisonNutrient,
  );
  const macroData = charts.macroTrend.map((day) => ({
    date: day.date,
    protein:
      macroMode === 'grams'
        ? (day.items.find((item) => item.code === 'protein')?.grams ?? null)
        : (day.items.find((item) => item.code === 'protein')?.percentOfCalculatedEnergy ?? null),
    carbohydrate:
      macroMode === 'grams'
        ? (day.items.find((item) => item.code === 'carbohydrate')?.grams ?? null)
        : (day.items.find((item) => item.code === 'carbohydrate')?.percentOfCalculatedEnergy ??
          null),
    total_fat:
      macroMode === 'grams'
        ? (day.items.find((item) => item.code === 'total_fat')?.grams ?? null)
        : (day.items.find((item) => item.code === 'total_fat')?.percentOfCalculatedEnergy ?? null),
  }));
  const tooltipStyle = {
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: '0.7rem',
    color: 'var(--ink)',
  };
  const hasCalorieData = charts.calorieTrend.some(
    (day) => day.confirmed !== null || day.planned !== null || day.rollingAverage !== null,
  );
  const hasMacroData = macroData.some(
    (day) => day.protein !== null || day.carbohydrate !== null || day.total_fat !== null,
  );
  const hasComparisonData = comparisonData.some(
    (day) => day.consumed !== null || day.planned !== null,
  );
  const hasCompletenessData = charts.recordCompleteness.some(
    (day) => day.averageCompleteness !== null,
  );

  return (
    <div className={styles.stack}>
      <div className={styles.twoColumn}>
        <section className={styles.panel} aria-labelledby="advanced-calorie-title">
          <header>
            <h2 id="advanced-calorie-title">Confirmed calorie trend</h2>
            <p>
              Missing days stay blank. The rolling average uses present confirmed values from the
              trailing seven calendar days
              {charts.showPlannedNutrition ? '; planned values remain separate' : ''}.
            </p>
            <small>
              {charts.profileLabel} · {charts.startDate}–{charts.endDate}
            </small>
          </header>
          {hasCalorieData ? (
            <div
              className={styles.chart}
              aria-label="Confirmed calories, separate plan, and rolling average by day"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={charts.calorieTrend} accessibilityLayer>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} />
                  <YAxis width={46} unit="k" />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(date) => String(date)} />
                  <Legend />
                  <Bar
                    dataKey="confirmed"
                    name="Confirmed kcal"
                    fill="var(--nutrition-energy)"
                    radius={[5, 5, 0, 0]}
                  />
                  {charts.showPlannedNutrition ? (
                    <Bar
                      dataKey="planned"
                      name="Planned kcal"
                      fill="var(--nutrition-grain)"
                      radius={[5, 5, 0, 0]}
                    />
                  ) : null}
                  <Line
                    dataKey="rollingAverage"
                    name="7-day average"
                    stroke="var(--nutrition-protein)"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <strong>No calorie records in this range</strong>
              <span>
                Confirmed and planned values will appear here without filling missing days with
                zero.
              </span>
            </div>
          )}
          <details className={styles.dataDisclosure}>
            <summary>View exact calorie history</summary>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption>Exact confirmed calorie history</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Confirmed</th>
                    {charts.showPlannedNutrition ? <th scope="col">Planned separately</th> : null}
                    <th scope="col">7-day average</th>
                    <th scope="col">Historical goal context</th>
                    <th scope="col">Record evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.calorieTrend.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{day.date}</th>
                      <td>{value(day.confirmed, 'kcal', 0)}</td>
                      {charts.showPlannedNutrition ? (
                        <td>
                          {value(day.planned, 'kcal', 0)}
                          {day.planEvidenceIncomplete ? ' (plan evidence incomplete)' : ''}
                        </td>
                      ) : null}
                      <td>{value(day.rollingAverage, 'kcal', 0)}</td>
                      <td>
                        {day.goalStatus === 'unavailable'
                          ? 'Not authorized'
                          : day.goalStatus === 'ambiguous'
                            ? 'Ambiguous current goals'
                            : goalText(day.goal)}
                      </td>
                      <td>{day.completenessStatus.replaceAll('_', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="advanced-macro-title">
          <header>
            <h2 id="advanced-macro-title">Confirmed macro trend</h2>
            <p>
              Percent mode uses server-calculated macro energy and requires protein, carbohydrate,
              and fat.
            </p>
            <small>
              {charts.profileLabel} · {charts.startDate}–{charts.endDate}
            </small>
          </header>
          <div className={styles.modeButtons} aria-label="Macro trend representation">
            <button
              type="button"
              aria-pressed={macroMode === 'grams'}
              onClick={() => setMacroMode('grams')}
            >
              Grams
            </button>
            <button
              type="button"
              aria-pressed={macroMode === 'percent'}
              onClick={() => setMacroMode('percent')}
            >
              Percent of calculated energy
            </button>
          </div>
          {hasMacroData ? (
            <div
              className={styles.chart}
              aria-label={`Protein, carbohydrate, and fat trend shown as ${macroMode}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={macroData} accessibilityLayer>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} />
                  <YAxis
                    width={42}
                    unit={macroMode === 'grams' ? 'g' : '%'}
                    domain={macroMode === 'percent' ? [0, 100] : undefined}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(date) => String(date)} />
                  <Legend />
                  <Bar
                    dataKey="protein"
                    name="Protein"
                    fill="var(--nutrition-protein)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="carbohydrate"
                    name="Carbohydrate"
                    fill="var(--nutrition-carbohydrate)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="total_fat"
                    name="Fat"
                    fill="var(--nutrition-fat)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <strong>No complete macro records in this range</strong>
              <span>
                Protein, carbohydrate, and fat need recorded values before a trend can be drawn.
              </span>
            </div>
          )}
          <details className={styles.dataDisclosure}>
            <summary>View exact macro history</summary>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption>Table view of the selected macro representation</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Protein</th>
                    <th scope="col">Carbohydrate</th>
                    <th scope="col">Total fat</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.macroTrend.map((day) => {
                    const item = (code: string) =>
                      day.items.find((candidate) => candidate.code === code);
                    const display = (code: string) => {
                      const found = item(code);
                      if (!found) return 'No data';
                      return macroMode === 'grams'
                        ? `${found.grams.toFixed(1)} g`
                        : `${found.percentOfCalculatedEnergy.toFixed(1)}%`;
                    };
                    return (
                      <tr key={day.date}>
                        <th scope="row">{day.date}</th>
                        <td>{display('protein')}</td>
                        <td>{display('carbohydrate')}</td>
                        <td>{display('total_fat')}</td>
                        <td>{day.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>

      <div className={styles.twoColumn}>
        {charts.showPlannedNutrition ? (
          <section className={styles.panel} aria-labelledby="planned-consumed-title">
            <header>
              <h2 id="planned-consumed-title">Planned versus confirmed</h2>
              <p>
                Values are compared side by side; a plan is never netted into or counted as
                consumption.
              </p>
            </header>
            <label className={styles.chartControl}>
              Nutrient
              <select
                value={comparisonNutrient}
                onChange={(event) => setComparisonNutrient(event.target.value)}
              >
                {comparisonCodes.map((code) => (
                  <option key={code} value={code}>
                    {nutrientLabels[code] ?? code}
                  </option>
                ))}
              </select>
            </label>
            {hasComparisonData ? (
              <div
                className={styles.compactChart}
                aria-label={`Planned and confirmed ${nutrientLabels[comparisonNutrient] ?? comparisonNutrient} by day`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} accessibilityLayer>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} />
                    <YAxis width={42} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar
                      dataKey="consumed"
                      name="Confirmed"
                      fill="var(--nutrition-protein)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="planned"
                      name="Planned"
                      fill="var(--nutrition-grain)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className={styles.emptyChart}>
                <strong>No planned or confirmed values for this nutrient</strong>
                <span>Choose another nutrient or add an explicit meal allocation.</span>
              </div>
            )}
            <details className={styles.dataDisclosure}>
              <summary>View exact planned and confirmed values</summary>
              <div className={styles.tableScroller}>
                <table className={styles.table}>
                  <caption>Daily planned and confirmed nutrient values</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nutrient</th>
                      <th scope="col">Date</th>
                      <th scope="col">Confirmed</th>
                      <th scope="col">Planned</th>
                      <th scope="col">Plan evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonCodes.flatMap((code) =>
                      charts.plannedVersusConsumed
                        .filter((row) => row.nutrientCode === code)
                        .map((row) => (
                          <tr key={`${code}:${row.date}`}>
                            <th scope="row">{nutrientLabels[code] ?? code}</th>
                            <td>{row.date}</td>
                            <td>{value(row.consumed, nutrientUnits[code] ?? '')}</td>
                            <td>{value(row.planned, nutrientUnits[code] ?? '')}</td>
                            <td>
                              {row.planEvidenceIncomplete
                                ? 'Incomplete'
                                : 'Available when recorded'}
                            </td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        ) : null}

        <section className={styles.panel} aria-labelledby="record-completeness-title">
          <header>
            <h2 id="record-completeness-title">Record completeness</h2>
            <p>
              This describes nutrient evidence in confirmed entries. It does not prove that every
              meal was logged.
            </p>
          </header>
          {hasCompletenessData ? (
            <div
              className={styles.compactChart}
              aria-label="Confirmed entry evidence completeness by day"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.recordCompleteness} accessibilityLayer>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} />
                  <YAxis
                    width={42}
                    domain={[0, 1]}
                    tickFormatter={(amount: number) => `${Math.round(amount * 100)}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(amount) =>
                      amount === null || amount === undefined
                        ? 'No data'
                        : `${Math.round(Number(amount) * 100)}%`
                    }
                  />
                  <Bar
                    dataKey="averageCompleteness"
                    name="Evidence coverage"
                    fill="var(--nutrition-fiber)"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <strong>No evidence coverage to chart</strong>
              <span>
                Completeness is unknown until confirmed entries include nutrient evidence.
              </span>
            </div>
          )}
          <details className={styles.dataDisclosure}>
            <summary>View exact completeness values</summary>
            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <caption>Daily confirmed-entry evidence completeness</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">State</th>
                    <th scope="col">Entries</th>
                    <th scope="col">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {charts.recordCompleteness.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">{day.date}</th>
                      <td>{day.status.replaceAll('_', ' ')}</td>
                      <td>{day.entryCount}</td>
                      <td>
                        {day.averageCompleteness === null
                          ? 'No data'
                          : `${(day.averageCompleteness * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>

      <details className={styles.panel}>
        <summary>Advanced nutrient source ranking</summary>
        <p>
          Amounts come from immutable confirmed snapshots, not today&apos;s mutable recipe or
          product data.
        </p>
        <label>
          Nutrient
          <select
            value={sourceNutrient}
            onChange={(event) => setSourceNutrient(event.target.value)}
          >
            {sourceCodes.map((code) => (
              <option key={code} value={code}>
                {nutrientLabels[code] ?? code}
              </option>
            ))}
          </select>
        </label>
        {sourceRows.length ? (
          <table className={styles.table}>
            <caption>
              Ranked confirmed sources for {nutrientLabels[sourceNutrient] ?? sourceNutrient}
            </caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Type</th>
                <th scope="col">Amount</th>
                <th scope="col">Recorded share</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {row.recipeId ? (
                      <Link href={`/recipes/${row.recipeId}`}>{row.label}</Link>
                    ) : (
                      row.label
                    )}
                  </th>
                  <td>{row.sourceType}</td>
                  <td>{value(row.amount, nutrientUnits[sourceNutrient] ?? '')}</td>
                  <td>
                    {row.percentOfRecorded === null
                      ? 'No ratio'
                      : `${row.percentOfRecorded.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No confirmed source values are available for this nutrient.</p>
        )}
      </details>

      <details className={styles.panel}>
        <summary>Advanced nutrient trend matrix</summary>
        {charts.goalContext === 'unavailable' ? (
          <p>
            Historical goal context is not authorized for this viewer, so semantic comparison is
            unavailable.
          </p>
        ) : (
          <table className={styles.table}>
            <caption>Table equivalent for selected nutrient history and historical goals</caption>
            <thead>
              <tr>
                <th scope="col">Nutrient</th>
                <th scope="col">Date</th>
                <th scope="col">Confirmed</th>
                <th scope="col">Historical boundary</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {charts.heatmap.map((cell) => (
                <tr key={`${cell.nutrientCode}:${cell.date}`}>
                  <th scope="row">{nutrientLabels[cell.nutrientCode] ?? cell.nutrientCode}</th>
                  <td>{cell.date}</td>
                  <td>{value(cell.amount, nutrientUnits[cell.nutrientCode] ?? '')}</td>
                  <td>{goalText(cell.goal)}</td>
                  <td>{cell.status.replaceAll('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  );
}
