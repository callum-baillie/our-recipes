import 'server-only';
import type {
  DecisionJob,
  DecisionRequest,
  DecisionOption,
} from '@/lib/domain/decision-assistance';
import type { RequestPrincipal } from './auth-service';
import { DecisionError } from '@/lib/providers/decisions-provider';
import { getAiDataPolicy } from './ai-settings-service';
import { getPantryDashboard, listPantryLocations } from './pantry-service';
import { listPlannedMeals } from './planning-service';
import { listShoppingTrips } from './shopping-trip-service';
import { buildDecisionJobs } from './decision-jobs-service';
const unknown = {
  value: 'unknown',
  label: 'Insufficient evidence',
  description: 'The records do not support a forecast.',
};
const option = (value: string, label: string): DecisionOption => ({
  value,
  label,
  description: label,
});
export async function buildPredictionJobs(
  p: RequestPrincipal,
  input: DecisionRequest,
): Promise<DecisionJob[] | null> {
  if (
    !['pantry_expiry', 'pantry_location', 'next_shop', 'meal_success', 'goal_success'].includes(
      input.task,
    )
  )
    return null;
  const policy = getAiDataPolicy(p.profileId);
  const day = new Date().toISOString().slice(0, 10);
  const evidence = (label: string, value: unknown) => ({
    label,
    source: 'saved app records',
    value,
  });
  const make = (
    subjectKey: string,
    title: string,
    instructions: string,
    facts: DecisionJob['evidence'],
    options: DecisionOption[],
    href: string,
  ): DecisionJob => ({
    task: input.task,
    subjectKey,
    title,
    instructions: `This is an exploratory forecast, not a fact or calibrated outcome probability. ${instructions}`,
    evidence: [
      evidence('Forecast date (UTC)', day),
      evidence('User question', input.query),
      ...facts,
    ],
    options: [...options, unknown],
    href,
  });
  if (input.task === 'goal_success') {
    const source = await buildDecisionJobs(p, { ...input, task: 'insights', offset: 0 });
    return source.jobs.map((job) =>
      make(
        job.subjectKey,
        `Goal outlook: ${job.title}`,
        'Assess whether the recorded nutrient goal appears on track over the next seven days. Require representative logged intake and explicit goals. Sparse or incomplete coverage means unknown. Do not infer a medical diagnosis, weight outcome or missing intake. Explainable evidence is in the input; never invent causality.',
        job.evidence,
        [
          option('on_track', 'Likely on track'),
          option('at_risk', 'At risk without a change'),
          option('mixed', 'Mixed evidence'),
        ],
        '/nutrition',
      ),
    );
  }
  if (input.task === 'meal_success') {
    if (!policy.shareMealPlans || !policy.shareSharedRecipes)
      throw new DecisionError(
        'Enable meal-plan and shared recipe sharing to forecast follow-through.',
        403,
      );
    const date = (delta: number) =>
      new Date(Date.parse(day) + delta * 86400000).toISOString().slice(0, 10);
    const project = (start: string, end: string) =>
      listPlannedMeals(start, end)
        .slice(0, 280)
        .map((m) => ({
          title: m.title,
          plannedFor: m.plannedFor,
          status: m.effectiveStatus,
          servings: m.servings,
        }));
    return [
      make(
        'week',
        'Will next week’s meal plan happen?',
        'Forecast the chance of following through on the next seven days of planned meals from the last 28 days of recorded plan statuses. Unmarked plans are not failures. Do not infer eating from cooking. No upcoming meals or no usable history means unknown. Consider schedule density and repetition, not invented personal habits.',
        [
          evidence('Last 28 days (up to 280 entries)', project(date(-28), date(-1))),
          evidence('Next seven days (up to 280 entries)', project(day, date(6))),
        ],
        [
          option('likely', 'Likely achievable'),
          option('fragile', 'Plan looks fragile'),
          option('unlikely', 'Unlikely without simplification'),
        ],
        '/planner',
      ),
    ];
  }
  if (!policy.sharePantry)
    throw new DecisionError('Enable Pantry sharing to forecast stock needs.', 403);
  const dashboard = getPantryDashboard();
  if (input.task === 'next_shop') {
    if (!policy.shareShoppingLists)
      throw new DecisionError('Enable shopping-list sharing to use trip history.', 403);
    return [
      make(
        'next-trip',
        'When should you shop next?',
        'Choose a practical shopping window from recorded low-stock signals and completed trip history. Counts are inventory coverage, not physical pantry fullness; do not infer consumption rate from batch count. A large shop is explicitly user-reported. Missing trip history or uncertain stock may mean unknown. Do not assume unrecorded food is absent.',
        [
          evidence('Stock coverage', {
            trackedBatches: dashboard.batches.length,
            lowStockProducts: dashboard.lowStockProductIds.length,
          }),
          evidence(
            'Last 100 reported trips',
            listShoppingTrips(p).map((t) => ({
              occurredOn: t.occurredOn,
              size: t.size,
              note: t.note,
            })),
          ),
        ],
        [
          option('today', 'Shop today'),
          option('within_3_days', 'Shop in the next three days'),
          option('within_week', 'Shop within a week'),
          option('later', 'No immediate trip indicated'),
        ],
        '/lists',
      ),
    ];
  }
  const locations = listPantryLocations(false);
  return dashboard.batches.map((batch) =>
    make(
      batch.id,
      `${input.task === 'pantry_location' ? 'Storage' : 'Freshness window'}: ${batch.product.displayName}`,
      input.task === 'pantry_location'
        ? 'Choose an existing storage location compatible with this food, package and opening state. Respect manufacturer storage instructions and freezing suitability. A location suggestion does not move stock.'
        : 'Estimate a freshness REVIEW window measured from recorded intake time, not a guaranteed expiration date. Intake/scan time is not manufacture, harvest or purchase time. Use recorded purchase, opened, prepared, frozen/thawed and printed dates first; never extend a printed use-by date. Unknown prior storage or insufficient product detail means unknown. This must never be a food-safety assurance.',
      [
        evidence('Food and intake', {
          name: batch.product.displayName,
          brand: batch.product.brand,
          variant: batch.product.variant,
          recordedAt: batch.createdAt,
          purchaseDate: batch.purchaseDate,
          openedDate: batch.openedDate,
          preparedDate: batch.preparedDate,
          frozenDate: batch.frozenDate,
          thawedDate: batch.thawedDate,
          useByDate: batch.useByDate,
          bestBeforeDate: batch.bestBeforeDate,
          location: batch.location.name,
          storageType: batch.location.storageType,
          shelfLifeAfterOpeningDays: batch.product.shelfLifeAfterOpeningDays,
        }),
      ],
      input.task === 'pantry_location'
        ? locations.map((l) => ({
            value: l.id,
            label: l.name,
            description: `${l.name}: ${l.storageType}`,
          }))
        : [
            option('1_day', 'Review within one day of intake'),
            option('3_days', 'Review within three days of intake'),
            option('7_days', 'Review within seven days of intake'),
            option('14_days', 'Review within two weeks of intake'),
            option('30_days', 'Review within a month of intake'),
            option('printed_date', 'Follow the recorded package date'),
          ],
      '/pantry',
    ),
  );
}
