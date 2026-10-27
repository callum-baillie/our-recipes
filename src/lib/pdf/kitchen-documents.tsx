import { Document, Page, View, Image, Fixed, QrCode } from '@formepdf/react';
import { Heading } from './pdfcn/components/heading/heading';
import { Text } from './pdfcn/components/text/text';
import { PageFooter } from './pdfcn/components/page-footer/page-footer';
import type { RecipePayload } from '@/lib/domain/recipe';
import { mealTypeLabel } from '@/lib/domain/meal-types';
import { parseServingCount } from '@/lib/domain/ingredient-scaling';
import { exportDateLabel, exportDays, type PdfExportOptions } from '@/lib/domain/pdf-export';

export type RecipePrintCard = {
  key: string;
  recipeId: string;
  revision: number;
  recipe: RecipePayload;
  servings?: number;
  occasions?: string[];
  image?: string;
  adapted?: boolean;
};
export type ScheduleMeal = {
  id: string;
  date: string;
  slot: string;
  slotLabel?: string;
  slotOrder?: number;
  context?: string;
  title: string;
  servings: number;
  note: string;
  status: string;
  cardKey: string | null;
  scannerCode?: string;
};
export type MealPrintSchedule = { start: string; end: string; meals: ScheduleMeal[] };
const ink = '#26372b';
const muted = '#657060';

const footer = (
  <PageFooter
    fixed
    leftText="Bòrd · Your kitchen, on paper"
    rightText="{{pageNumber}} / {{totalPages}}"
  />
);
const body = { fontSize: 10, lineHeight: 1.4, minWidowLines: 2, minOrphanLines: 2 };
const section = { marginTop: 16, marginBottom: 7 };

function RecipeCard({ card, options }: { card: RecipePrintCard; options: PdfExportOptions }) {
  const recipe = card.recipe;
  const base = parseServingCount(recipe.servings);
  const scale = card.servings && base ? card.servings / base : 1;
  const quantity = (value: number | '') =>
    value === '' ? '' : (value * scale).toLocaleString('en-GB', { maximumSignificantDigits: 6 });
  const nutrition = [
    ['Energy', recipe.nutritionCalories, 'kcal'],
    ['Protein', recipe.nutritionProteinGrams, 'g'],
    ['Carbohydrate', recipe.nutritionCarbohydrateGrams, 'g'],
    ['Fat', recipe.nutritionFatGrams, 'g'],
    ['Fibre', recipe.nutritionFiberGrams, 'g'],
    ['Sodium', recipe.nutritionSodiumMilligrams, 'mg'],
  ] as const;
  return (
    <Page size={options.paper} margin={{ top: 55, right: 44, bottom: 54, left: 44 }}>
      {footer}
      <Fixed position="header">
        <Text
          variant="xs"
          color="mutedForeground"
          noMargin
        >{`Recipe · ${recipe.title.slice(0, 95)}${recipe.title.length > 95 ? '…' : ''}`}</Text>
      </Fixed>
      <Text variant="xs" color="primary" weight="bold">
        RECIPE CARD · REVISION {card.revision}
        {card.adapted ? ' · ADAPTED FOR THIS MEAL' : ''}
      </Text>
      <Heading level={1} style={{ fontSize: 29, marginBottom: 8 }}>
        {recipe.title}
      </Heading>
      {!card.adapted &&
      (card.servings ?? base) &&
      (card.servings ?? base)! > 0 &&
      (card.servings ?? base)! <= 100 ? (
        <View wrap={false} style={{ marginBottom: 12, padding: 10 }}>
          <QrCode
            data={`BORD:1:RECIPE:${card.recipeId}:${card.servings ?? base}:${card.revision}`}
            size={78}
          />
          <Text style={{ fontSize: 8 }}>
            Scan to record cooking immediately · ingredients will be deducted
          </Text>
        </View>
      ) : null}
      {options.includeImage && card.image ? (
        <Image
          src={card.image}
          width={480}
          height={180}
          alt={recipe.title}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {recipe.summary ? <Text style={{ ...body, color: muted }}>{recipe.summary}</Text> : null}
      <View style={{ padding: 11, backgroundColor: '#f0f3e9', marginTop: 8, marginBottom: 12 }}>
        <Text weight="bold" style={body} noMargin>
          {[
            card.servings
              ? base
                ? `Makes ${card.servings} serving${card.servings === 1 ? '' : 's'}`
                : `Requested export yield: ${card.servings} serving${card.servings === 1 ? '' : 's'}`
              : recipe.servings
                ? `Servings: ${recipe.servings}`
                : 'Servings not specified',
            recipe.prepMinutes !== null ? `Prep ${recipe.prepMinutes} min` : '',
            recipe.cookMinutes !== null ? `Cook ${recipe.cookMinutes} min` : '',
            recipe.restMinutes ? `Rest ${recipe.restMinutes} min` : '',
          ]
            .filter(Boolean)
            .join('   ·   ')}
        </Text>
      </View>
      {card.servings && !base ? (
        <Text variant="sm">
          Ingredient quantities are unchanged: this recipe has no numeric serving count.
        </Text>
      ) : null}
      {card.occasions?.length ? (
        <Text variant="sm" color="mutedForeground">
          On your plan: {card.occasions.join('; ')}
        </Text>
      ) : null}
      {options.includeEquipment && recipe.equipment.length ? (
        <Text variant="sm">Equipment: {recipe.equipment.join(', ')}</Text>
      ) : null}
      {options.includeIngredients &&
        recipe.ingredientGroups.map((group, index) => (
          <View key={index}>
            <View wrap={false}>
              {index === 0 && (
                <Heading level={2} style={section}>
                  Ingredients
                </Heading>
              )}
              {group.name ? (
                <Heading level={3} style={{ fontSize: 12, marginTop: 8, marginBottom: 5 }}>
                  {group.name}
                </Heading>
              ) : null}
              {group.ingredients.slice(0, 1).map((item, i) => (
                <Text key={i} style={{ ...body, marginBottom: 5 }}>
                  {options.ingredientCheckboxes ? '[  ]  ' : ''}
                  {[quantity(item.quantity), item.unit, item.item].filter(Boolean).join(' ')}
                  {item.note ? ` (${item.note})` : ''}
                </Text>
              ))}
            </View>
            {group.ingredients.slice(1).map((item, i) => (
              <Text key={i} style={{ ...body, marginBottom: 5 }}>
                {options.ingredientCheckboxes ? '[  ]  ' : ''}
                {[quantity(item.quantity), item.unit, item.item].filter(Boolean).join(' ')}
                {item.note ? ` (${item.note})` : ''}
              </Text>
            ))}
          </View>
        ))}
      {options.includeMethod &&
        recipe.instructionSections.map((part, index) => (
          <View key={index}>
            <View wrap={(part.steps[0]?.length ?? 0) > 1000}>
              {index === 0 && (
                <Heading level={2} style={section}>
                  Method
                </Heading>
              )}
              {part.title ? (
                <Heading level={3} style={{ fontSize: 12, marginTop: 8, marginBottom: 5 }}>
                  {part.title}
                </Heading>
              ) : null}
              {part.steps[0] ? (
                <Text style={{ ...body, marginBottom: 9 }}>1. {part.steps[0]}</Text>
              ) : null}
            </View>
            {part.steps.slice(1).map((step, i) => (
              <Text key={i} style={{ ...body, marginBottom: 9 }}>
                {i + 2}. {step}
              </Text>
            ))}
          </View>
        ))}
      {options.includeNotes && (recipe.tips || recipe.sharedNotes) ? (
        <View>
          <Heading level={2} style={section}>
            Kitchen notes
          </Heading>
          {recipe.tips ? <Text style={body}>{recipe.tips}</Text> : null}
          {recipe.sharedNotes ? <Text style={body}>{recipe.sharedNotes}</Text> : null}
        </View>
      ) : null}
      {options.includeNutrition ? (
        <View>
          <Heading level={2} style={section}>
            Nutrition per serving
          </Heading>
          <Text style={body}>
            {nutrition
              .map(
                ([label, value, unit]) =>
                  `${label}: ${value === '' ? 'not recorded' : `${value} ${unit}`}`,
              )
              .join('   ·   ')}
          </Text>
          <Text variant="xs" color="mutedForeground">
            Recipe-provided estimates. Missing values are unknown, not zero.
          </Text>
        </View>
      ) : null}
      {options.includeSource && (recipe.sourceName || recipe.sourceUrl) ? (
        <Text variant="xs" color="mutedForeground">
          Source: {[recipe.sourceName, recipe.sourceUrl].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </Page>
  );
}

function SchedulePages({
  schedule,
  options,
}: {
  schedule: MealPrintSchedule;
  options: PdfExportOptions;
}) {
  const days = exportDays(schedule.start, schedule.end);
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <>
      {weeks.map((week, index) => (
        <Page
          key={week[0]}
          size={options.paper}
          margin={{ top: 52, right: 38, bottom: 54, left: 38 }}
        >
          {footer}
          <Fixed position="header">
            <Text variant="xs" color="mutedForeground" noMargin>
              Meal plan · {exportDateLabel(week[0]!)} – {exportDateLabel(week.at(-1)!)}
            </Text>
          </Fixed>
          <Text variant="xs" color="primary" weight="bold">
            MEAL PLAN · SECTION {index + 1} OF {weeks.length}
            {week.length < 7 ? ` · ${week.length} ${week.length === 1 ? 'DAY' : 'DAYS'}` : ''}
          </Text>
          <Heading level={1} style={{ fontSize: 27, marginBottom: 5 }}>
            At the table
          </Heading>
          <Text variant="sm" color="mutedForeground">
            {exportDateLabel(week[0]!)} – {exportDateLabel(week.at(-1)!)}
          </Text>
          {week.map((date) => {
            const meals = schedule.meals
              .filter((meal) => meal.date === date)
              .sort((a, b) => (a.slotOrder ?? 999) - (b.slotOrder ?? 999));
            return (
              <View
                key={date}
                style={{
                  marginTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: '#d8dfcd',
                  paddingTop: 8,
                }}
              >
                <View wrap={false}>
                  <Text weight="bold" style={{ fontSize: 12, color: ink, marginBottom: 5 }}>
                    {exportDateLabel(date)}
                  </Text>
                  {!meals.length && (
                    <Text variant="sm" color="mutedForeground">
                      No meal planned.
                    </Text>
                  )}
                  {meals.slice(0, 1).map((meal) => (
                    <View key={meal.id} style={{ marginBottom: 5 }}>
                      <Text style={body} noMargin>
                        <Text weight="bold">{meal.slotLabel ?? mealTypeLabel(meal.slot)}: </Text>
                        {meal.title} · {meal.servings} serving{meal.servings === 1 ? '' : 's'}
                        {meal.status === 'cooked' ? ' · cooked' : ''}
                      </Text>
                      {meal.context ? (
                        <Text variant="xs" color="mutedForeground" noMargin>
                          {meal.context}
                        </Text>
                      ) : null}
                      {meal.scannerCode ? (
                        <View style={{ padding: 8 }}>
                          <QrCode data={meal.scannerCode} size={64} />
                          <Text style={{ fontSize: 8 }}>
                            Scan to record this planned cooking immediately
                          </Text>
                        </View>
                      ) : null}
                      {options.includeNotes && meal.note ? (
                        <Text variant="xs" color="mutedForeground" noMargin>
                          {meal.note}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                {meals.length
                  ? meals.slice(1).map((meal) => (
                      <View key={meal.id} wrap={false} style={{ marginBottom: 5 }}>
                        <Text style={body} noMargin>
                          <Text weight="bold">{meal.slotLabel ?? mealTypeLabel(meal.slot)}: </Text>
                          {meal.title} · {meal.servings} serving{meal.servings === 1 ? '' : 's'}
                          {meal.status === 'cooked' ? ' · cooked' : ''}
                        </Text>
                        {meal.context ? (
                          <Text variant="xs" color="mutedForeground" noMargin>
                            {meal.context}
                          </Text>
                        ) : null}
                        {meal.scannerCode ? (
                          <View style={{ padding: 8 }}>
                            <QrCode data={meal.scannerCode} size={64} />
                            <Text style={{ fontSize: 8 }}>
                              Scan to record this planned cooking immediately
                            </Text>
                          </View>
                        ) : null}
                        {options.includeNotes && meal.note ? (
                          <Text variant="xs" color="mutedForeground" noMargin>
                            {meal.note}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  : null}
              </View>
            );
          })}
        </Page>
      ))}
    </>
  );
}

export function KitchenDocument({
  cards,
  options,
  schedule,
}: {
  cards: RecipePrintCard[];
  options: PdfExportOptions;
  schedule?: MealPrintSchedule;
}) {
  return (
    <Document
      title={
        schedule
          ? 'Meal plan and recipe cards'
          : cards.length === 1
            ? cards[0]!.recipe.title
            : 'Recipe collection'
      }
      author="Bòrd"
    >
      {schedule ? <SchedulePages schedule={schedule} options={options} /> : null}
      {cards.map((card) => (
        <RecipeCard key={card.key} card={card} options={options} />
      ))}
    </Document>
  );
}

export type InventoryPrintRow = {
  label: string;
  quantity: string;
  quantityCaption?: string;
  detail?: string;
  note?: string;
  state?: string;
};
export type InventoryPrintGroup = { name: string; rows: InventoryPrintRow[] };
function InventoryRow({
  row,
  options,
}: {
  row: InventoryPrintRow;
  options: PdfExportOptions & { countColumn?: boolean };
}) {
  const completed = row.state === 'sourced';
  const stateLabel = completed
    ? 'Completed / sourced'
    : row.state === 'in_cart'
      ? 'In cart'
      : row.state === 'cant_find'
        ? "Can't find"
        : '';
  return (
    <View
      wrap={false}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e3e6df',
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <View style={{ width: 10, height: 10, marginTop: 2, borderWidth: 1, borderColor: muted }}>
        <Text style={{ fontSize: 8, lineHeight: 1, textAlign: 'center' }} noMargin>
          {completed ? 'x' : ''}
        </Text>
      </View>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
        <Text weight="bold" style={{ ...body, color: completed ? muted : ink }} noMargin>
          {row.label}
        </Text>
        {stateLabel ? (
          <Text variant="xs" color="mutedForeground" noMargin>
            {stateLabel}
          </Text>
        ) : null}
        {row.detail ? (
          <Text variant="xs" color="mutedForeground" noMargin>
            {row.detail}
          </Text>
        ) : null}
        {options.includeNotes && row.note ? (
          <Text variant="xs" color="mutedForeground" noMargin>
            {row.note}
          </Text>
        ) : null}
      </View>
      <View style={{ width: options.countColumn ? 90 : 110 }}>
        {row.quantityCaption ? (
          <Text variant="xs" color="mutedForeground" noMargin>
            {row.quantityCaption}
          </Text>
        ) : null}
        <Text style={body} noMargin>
          {row.quantity}
        </Text>
      </View>
      {options.countColumn && (
        <View style={{ width: 78 }}>
          <Text variant="xs" noMargin>
            Count
          </Text>
          <View style={{ height: 20, borderBottomWidth: 1, borderBottomColor: muted }} />
        </View>
      )}
    </View>
  );
}
export function InventoryDocument({
  title,
  groups,
  options,
  note,
}: {
  title: string;
  note?: string;
  groups: InventoryPrintGroup[];
  options: PdfExportOptions & { countColumn?: boolean };
}) {
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <Document title={title} author="Bòrd">
      <Page size={options.paper} margin={{ top: 55, right: 40, bottom: 54, left: 40 }}>
        {footer}
        <Fixed position="header">
          <Text variant="xs" color="mutedForeground" noMargin>
            {title.slice(0, 100)}
          </Text>
        </Fixed>
        <Heading level={1}>{title}</Heading>
        <Text variant="sm" color="mutedForeground">
          {count}{' '}
          {title === 'Pantry inventory'
            ? count === 1
              ? 'stock batch'
              : 'stock batches'
            : count === 1
              ? 'item'
              : 'items'}{' '}
          · {new Date().toLocaleDateString('en-GB')}
        </Text>
        {options.includeNotes && note ? <Text style={body}>{note}</Text> : null}
        {groups.map((group) => (
          <View key={group.name}>
            <View wrap={false}>
              <Heading level={2} style={section}>
                {group.name}
              </Heading>
              {group.rows[0] && <InventoryRow row={group.rows[0]} options={options} />}
            </View>
            {group.rows.slice(1).map((row, index) => (
              <InventoryRow key={index} row={row} options={options} />
            ))}
          </View>
        ))}
        {!count && (
          <Text>
            {title === 'Pantry inventory'
              ? 'No active stock batches match these print options.'
              : 'No items match these print options.'}
          </Text>
        )}
      </Page>
    </Document>
  );
}
