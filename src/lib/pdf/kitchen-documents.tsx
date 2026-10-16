import { Document, Page, View, Image } from '@formepdf/react';
import { Heading } from './pdfcn/components/heading/heading';
import { Text } from './pdfcn/components/text/text';
import { PageFooter } from './pdfcn/components/page-footer/page-footer';
import type { RecipePayload } from '@/lib/domain/recipe';
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
};
export type ScheduleMeal = {
  id: string;
  date: string;
  slot: string;
  title: string;
  servings: number;
  note: string;
  status: string;
  cardKey: string | null;
};
export type MealPrintSchedule = { start: string; end: string; meals: ScheduleMeal[] };
const ink = '#26372b';
const muted = '#657060';
const slots = ['breakfast', 'lunch', 'dinner', 'dessert', 'snack'];
const footer = (
  <PageFooter
    fixed
    leftText="Bòrd · Your kitchen, on paper"
    rightText="{{pageNumber}} / {{totalPages}}"
  />
);
const body = { fontSize: 10, lineHeight: 1.4 };
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
    <Page size={options.paper} margin={{ top: 40, right: 44, bottom: 54, left: 44 }}>
      {footer}
      <Text variant="xs" color="primary" weight="bold">
        RECIPE CARD · REVISION {card.revision}
      </Text>
      <Heading level={1} style={{ fontSize: 29, marginBottom: 8 }}>
        {recipe.title}
      </Heading>
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
              ? `Makes ${card.servings} servings`
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
      {options.includeIngredients && (
        <>
          <Heading level={2} style={section}>
            Ingredients
          </Heading>
          {recipe.ingredientGroups.map((group, index) => (
            <View key={index}>
              {group.name ? (
                <Heading level={3} style={{ fontSize: 12, marginTop: 8, marginBottom: 5 }}>
                  {group.name}
                </Heading>
              ) : null}
              {group.ingredients.map((item, i) => (
                <Text key={i} style={{ ...body, marginBottom: 5 }} noMargin>
                  {options.ingredientCheckboxes ? '[  ]  ' : ''}
                  {[quantity(item.quantity), item.unit, item.item].filter(Boolean).join(' ')}
                  {item.note ? ` (${item.note})` : ''}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
      {options.includeMethod && (
        <>
          <Heading level={2} style={section}>
            Method
          </Heading>
          {recipe.instructionSections.map((part, index) => (
            <View key={index}>
              {part.title ? (
                <Heading level={3} style={{ fontSize: 12, marginTop: 8, marginBottom: 5 }}>
                  {part.title}
                </Heading>
              ) : null}
              {part.steps.map((step, i) => (
                <Text key={i} style={{ ...body, marginBottom: 9 }}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
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
          margin={{ top: 38, right: 38, bottom: 54, left: 38 }}
        >
          {footer}
          <Text variant="xs" color="primary" weight="bold">
            MEAL PLAN · WEEK {index + 1} OF {weeks.length}
          </Text>
          <Heading level={1} style={{ fontSize: 27, marginBottom: 5 }}>
            A week at the table
          </Heading>
          <Text variant="sm" color="mutedForeground">
            {exportDateLabel(week[0]!)} – {exportDateLabel(week.at(-1)!)} · {week[0]!.slice(0, 4)}
          </Text>
          {week.map((date) => {
            const meals = schedule.meals
              .filter((meal) => meal.date === date)
              .sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
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
                <Text weight="bold" style={{ fontSize: 12, color: ink, marginBottom: 5 }}>
                  {exportDateLabel(date)}
                </Text>
                {meals.length ? (
                  meals.map((meal) => (
                    <View key={meal.id} style={{ marginBottom: 5 }}>
                      <Text style={body} noMargin>
                        <Text weight="bold">
                          {meal.slot.charAt(0).toUpperCase() + meal.slot.slice(1)}:{' '}
                        </Text>
                        {meal.title} · {meal.servings} serving{meal.servings === 1 ? '' : 's'}
                        {meal.status === 'cooked' ? ' · cooked' : ''}
                      </Text>
                      {options.includeNotes && meal.note ? (
                        <Text variant="xs" color="mutedForeground" noMargin>
                          {meal.note}
                        </Text>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text variant="sm" color="mutedForeground">
                    No meal planned.
                  </Text>
                )}
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

export type InventoryPrintGroup = {
  name: string;
  rows: { label: string; quantity: string; detail?: string; note?: string }[];
};
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
  return (
    <Document title={title} author="Bòrd">
      <Page size={options.paper} margin={{ top: 40, right: 40, bottom: 54, left: 40 }}>
        {footer}
        <Heading level={1}>{title}</Heading>
        <Text variant="sm" color="mutedForeground">
          {groups.reduce((sum, group) => sum + group.rows.length, 0)} items ·{' '}
          {new Date().toLocaleDateString('en-US')}
        </Text>
        {options.includeNotes && note ? <Text style={body}>{note}</Text> : null}
        {groups.map((group) => (
          <View key={group.name}>
            <Heading level={2} style={section}>
              {group.name}
            </Heading>
            {group.rows.map((row, index) => (
              <View
                key={index}
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: '#e3e6df',
                  paddingTop: 7,
                  paddingBottom: 7,
                }}
              >
                <Text style={body} noMargin>
                  [ ] {row.label} · {row.quantity}
                  {options.countColumn ? '     Count: __________' : ''}
                </Text>
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
            ))}
          </View>
        ))}
        {!groups.length && <Text>No items match these print options.</Text>}
      </Page>
    </Document>
  );
}
