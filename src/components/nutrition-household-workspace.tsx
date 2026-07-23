import styles from '@/components/nutrition-household-workspace.module.css';
import { NutritionVisualMarker } from '@/components/nutrition-visual-marker';
import { resolveNutritionVisual } from '@/lib/domain/nutrition-visuals';
import type { HouseholdNutritionComparison } from '@/lib/services/nutrition-comparison-service';

type HouseholdProfile = {
  id: string;
  displayName: string;
  profileType: string;
};

const RANGE_DAYS = [7, 14, 30, 90] as const;

type HouseholdComparisonView = HouseholdNutritionComparison & {
  focusMemberKey?: string;
};

function householdHref(days: number, member?: string): string {
  const parameters = new URLSearchParams({ view: 'household', range: String(days) });
  if (member) parameters.set('member', member);
  return `/nutrition?${parameters.toString()}`;
}

function percentage(value: number | null): string {
  return value === null ? 'No data' : `${Math.round(value * 100)}%`;
}

export function NutritionHouseholdWorkspace({
  profiles,
  comparison,
}: {
  profiles: readonly HouseholdProfile[];
  comparison: HouseholdComparisonView;
}) {
  const servings = (value: number | null) => (value === null ? 'No serving data' : value);
  const focusedMember =
    comparison.members.find((member) => member.key === comparison.focusMemberKey) ??
    comparison.members[0];
  const servingMaximum = focusedMember
    ? Math.max(
        1,
        ...Object.values(focusedMember.allocationServings).map((value) => value ?? 0),
        comparison.allocationSummary.unassignedServings ?? 0,
      )
    : 1;
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <h2>Household Nutrition profiles</h2>
        <p>
          Every household profile is visible here. Switch the active person in the app header to
          edit their settings, goals, measurements, or diary.
        </p>
        <ul className={styles.profileList}>
          {profiles.map((profile) => (
            <li
              key={profile.id}
              data-focused={focusedMember?.key === profile.id ? 'true' : undefined}
            >
              <strong>{profile.displayName}</strong>
              <span>{profile.profileType}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Household activity and normalized goals</h2>
        <p>
          Confirmed food is reported separately from planned and allocated portions. Missing days
          remain missing, and each percentage uses that person&apos;s own active goal.
        </p>
        <div className={styles.controls} aria-label="Household Nutrition chart controls">
          <div>
            <span className={styles.controlLabel}>Date range</span>
            <div className={styles.controlLinks}>
              {RANGE_DAYS.map((days) => (
                <a
                  key={days}
                  href={householdHref(days, comparison.focusMemberKey)}
                  aria-current={comparison.periodDays === days ? 'true' : undefined}
                >
                  {days} days
                </a>
              ))}
            </div>
          </div>
          <div>
            <span className={styles.controlLabel}>Linked member focus</span>
            <div className={styles.controlLinks}>
              {profiles.map((profile) => (
                <a
                  key={profile.id}
                  href={householdHref(comparison.periodDays, profile.id)}
                  aria-current={focusedMember?.key === profile.id ? 'true' : undefined}
                >
                  {profile.displayName}
                </a>
              ))}
            </div>
          </div>
        </div>
        <p>
          Planned meal capacity:{' '}
          {comparison.allocationSummary.plannedMealServings === null
            ? 'No planned meals'
            : `${comparison.allocationSummary.plannedMealServings} servings`}
          {' · '}Explicitly unassigned:{' '}
          {comparison.allocationSummary.unassignedServings === null
            ? comparison.allocationSummary.unknownServingAllocations > 0
              ? 'Unknown because an allocation has only portion-weight evidence'
              : 'No planned meal data'
            : `${comparison.allocationSummary.unassignedServings} servings`}
        </p>
        {focusedMember ? (
          <div className={styles.visuals} aria-label={`${focusedMember.label} chart summaries`}>
            <article className={styles.visualPanel}>
              <h3>{focusedMember.label}: own-goal status</h3>
              {focusedMember.nutrients.length === 0 ? (
                <p>Insufficient data. Missing nutrient values are unknown, not zero.</p>
              ) : (
                <ul className={styles.metricList}>
                  {focusedMember.nutrients.map((nutrient) => (
                    <li key={nutrient.nutrientCode}>
                      <div className={styles.metricLabel}>
                        <NutritionVisualMarker nutrientCode={nutrient.nutrientCode} compact />
                        <strong>{nutrient.nutrientCode}</strong>
                        <span>
                          {Math.round(nutrient.normalizedPercent)}% {nutrient.semantic} —{' '}
                          {nutrient.status}
                        </span>
                      </div>
                      <div
                        className={`${styles.barTrack} ${styles[`status_${nutrient.status}`]}`}
                        role="img"
                        aria-label={`${nutrient.nutrientCode}: ${Math.round(nutrient.normalizedPercent)}% ${nutrient.semantic}, ${nutrient.status}`}
                      >
                        <span
                          className={styles.barFill}
                          style={{
                            width: `${Math.min(100, nutrient.normalizedPercent)}%`,
                            background: resolveNutritionVisual(nutrient.nutrientCode).color,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className={styles.visualPanel}>
              <h3>Activity evidence</h3>
              <dl className={styles.statGrid}>
                <div>
                  <dt>Planned meal capacity</dt>
                  <dd>
                    {comparison.allocationSummary.plannedMealServings === null
                      ? 'No serving data'
                      : `${comparison.allocationSummary.plannedMealServings} servings`}
                  </dd>
                </div>
                <div>
                  <dt>Confirmed diary records</dt>
                  <dd>{focusedMember.confirmedCount} records</dd>
                </div>
                <div>
                  <dt>Recorded days</dt>
                  <dd>{focusedMember.observedDays || 'No data'}</dd>
                </div>
                <div>
                  <dt>Evidence completeness</dt>
                  <dd>{percentage(focusedMember.averageCompleteness)}</dd>
                </div>
              </dl>
              <p className={styles.note}>
                Planned servings and confirmed records use different units and are not combined.
              </p>
            </article>

            <article className={styles.visualPanel}>
              <h3>Serving states</h3>
              <ul className={styles.servingList}>
                {Object.entries(focusedMember.allocationServings).map(([state, value]) => (
                  <li key={state}>
                    <span className={styles.stateMarker} aria-hidden="true">
                      {state.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{state}</strong>
                    <span>{value === null ? 'No serving data' : `${value} servings`}</span>
                    <i className={styles.servingTrack} aria-hidden="true">
                      {value === null ? null : (
                        <b style={{ width: `${(value / servingMaximum) * 100}%` }} />
                      )}
                    </i>
                  </li>
                ))}
                <li>
                  <span className={styles.stateMarker} aria-hidden="true">
                    U
                  </span>
                  <strong>unassigned</strong>
                  <span>
                    {comparison.allocationSummary.unassignedServings === null
                      ? 'Unknown or no planned meal data'
                      : `${comparison.allocationSummary.unassignedServings} servings`}
                  </span>
                  <i className={styles.servingTrack} aria-hidden="true">
                    {comparison.allocationSummary.unassignedServings === null ? null : (
                      <b
                        style={{
                          width: `${(comparison.allocationSummary.unassignedServings / servingMaximum) * 100}%`,
                        }}
                      />
                    )}
                  </i>
                </li>
              </ul>
            </article>
          </div>
        ) : (
          <p>No linked household member data is available for this range.</p>
        )}
        <details className={styles.tableDisclosure}>
          <summary>View detailed household activity</summary>
          <div
            className={styles.tableWrap}
            role="region"
            aria-label="Scrollable household Nutrition activity table"
            tabIndex={0}
          >
            <table>
              <caption>
                Household Nutrition activity for {comparison.range.start}–{comparison.range.end}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Recorded days</th>
                  <th scope="col">Confirmed</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Served</th>
                  <th scope="col">Eaten</th>
                  <th scope="col">Skipped</th>
                  <th scope="col">Leftover</th>
                  <th scope="col">Completeness</th>
                  <th scope="col">Own-goal comparison</th>
                </tr>
              </thead>
              <tbody>
                {comparison.members.map((member) => (
                  <tr key={member.key}>
                    <th scope="row">{member.label}</th>
                    <td>{member.observedDays || 'No data'}</td>
                    <td>{member.confirmedCount}</td>
                    <td>{servings(member.allocationServings.planned)}</td>
                    <td>{servings(member.allocationServings.served)}</td>
                    <td>{servings(member.allocationServings.eaten)}</td>
                    <td>{servings(member.allocationServings.skipped)}</td>
                    <td>{servings(member.allocationServings.leftover)}</td>
                    <td>
                      {member.averageCompleteness === null
                        ? 'No data'
                        : `${Math.round(member.averageCompleteness * 100)}%`}
                    </td>
                    <td>
                      {member.nutrients.length === 0
                        ? 'Insufficient data'
                        : member.nutrients
                            .map(
                              (nutrient) =>
                                `${nutrient.nutrientCode}: ${Math.round(nutrient.normalizedPercent)}% ${nutrient.semantic} (${nutrient.status})`,
                            )
                            .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
