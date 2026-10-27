import { Document, Fixed, Page, View } from '@formepdf/react';
import { Badge } from './pdfcn/components/badge/badge';
import { PdfCard } from './pdfcn/components/card/card';
import { Divider } from './pdfcn/components/divider/divider';
import { Heading } from './pdfcn/components/heading/heading';
import { PageFooter } from './pdfcn/components/page-footer/page-footer';
import { PageHeader } from './pdfcn/components/page-header/page-header';
import { PdfImage } from './pdfcn/components/pdf-image/pdf-image';
import { Stack } from './pdfcn/components/stack/stack';
import { Table, TableBody, TableCell, TableHeader, TableRow } from './pdfcn/components/table/table';
import { Text } from './pdfcn/components/text/text';
import type { PdfBrand } from './brand';
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
};
export type MealPrintSchedule = { start: string; end: string; meals: ScheduleMeal[] };
const ink = '#26372b';
const muted = '#5f6b58';
const rule = '#dfe5d6';
const wash = '#f2f5ee';

const pageWidth = (paper: PdfExportOptions['paper']) => (paper === 'Letter' ? 612 : 595.28);
const body = { fontSize: 10, lineHeight: 1.45, minWidowLines: 2, minOrphanLines: 2 };

const footer = (
  <PageFooter
    fixed
    leftText="Bòrd · Your kitchen, on paper"
    rightText="{{pageNumber}} / {{totalPages}}"
  />
);

/** The running header: Bòrd lockup on the left, what this page belongs to on the right. */
function RunningHeader({ brand, label }: { brand: PdfBrand; label: string }) {
  return (
    <Fixed position="header">
      <Stack direction="horizontal" align="center" justify="between" gap="none">
        <PdfImage src={brand.lockup} height={14} width={14 * brand.lockupAspect} fit="contain" />
        <Text variant="xs" color="mutedForeground" noMargin>
          {label}
        </Text>
      </Stack>
      <Divider spacing="sm" color="border" />
    </Fixed>
  );
}

const truncate = (value: string, length = 80) =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

function SectionTitle({ children }: { children: string }) {
  return (
    <View wrap={false} style={{ marginTop: 18, marginBottom: 8 }}>
      <Heading level={2} style={{ fontSize: 17, marginBottom: 4 }}>
        {children}
      </Heading>
      <View style={{ height: 2, width: 28, backgroundColor: '#4a6b3c' }} />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 0 }}>
      <Text variant="xs" color="mutedForeground" weight="bold" transform="uppercase" noMargin>
        {label}
      </Text>
      <Text weight="bold" style={{ fontSize: 13, color: ink, marginTop: 2 }} noMargin>
        {value}
      </Text>
    </View>
  );
}

function IngredientRow({
  item,
  quantity,
  checkbox,
  width,
}: {
  item: RecipePrintCard['recipe']['ingredientGroups'][number]['ingredients'][number];
  quantity: (value: number | '') => string;
  checkbox: boolean;
  width: number;
}) {
  const amount = [quantity(item.quantity), item.unit].filter(Boolean).join(' ');
  return (
    <View
      wrap={false}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingTop: 4,
        paddingBottom: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: rule,
      }}
    >
      {checkbox ? (
        <View
          style={{
            width: 9,
            height: 9,
            marginTop: 2,
            marginRight: 8,
            borderWidth: 1,
            borderColor: muted,
            borderRadius: 2,
          }}
        />
      ) : null}
      <View style={{ width: 58 }}>
        <Text weight="bold" style={{ ...body, color: '#4a6b3c' }} noMargin>
          {amount}
        </Text>
      </View>
      <View style={{ width: width - 58 - (checkbox ? 17 : 0) }}>
        <Text style={body} noMargin>
          {item.item}
          {item.note ? <Text style={{ color: muted }}>{` · ${item.note}`}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function MethodStep({ number, text, width }: { number: number; text: string; width: number }) {
  return (
    <View
      wrap={text.length > 1000}
      style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 }}
    >
      <View
        style={{
          width: 17,
          height: 17,
          marginRight: 10,
          marginTop: 1,
          borderRadius: 9,
          backgroundColor: '#4a6b3c',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          weight="bold"
          style={{ fontSize: 8.5, color: '#ffffff', textAlign: 'center', lineHeight: 1 }}
          noMargin
        >
          {String(number)}
        </Text>
      </View>
      <View style={{ width: width - 27 }}>
        <Text style={body} noMargin>
          {text}
        </Text>
      </View>
    </View>
  );
}

function RecipeCard({
  card,
  options,
  brand,
}: {
  card: RecipePrintCard;
  options: PdfExportOptions;
  brand: PdfBrand;
}) {
  const recipe = card.recipe;
  const contentWidth = pageWidth(options.paper) - 88;
  const base = parseServingCount(recipe.servings);
  const scale = card.servings && base ? card.servings / base : 1;
  const quantity = (value: number | '') =>
    value === '' ? '' : (value * scale).toLocaleString('en-GB', { maximumSignificantDigits: 6 });
  const totalMinutes =
    (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0) + (recipe.restMinutes ?? 0);
  const minutes = (value: number | null | undefined) => (value ? `${value} min` : '–');
  const servingsLabel = card.servings
    ? base
      ? `${card.servings}`
      : `${card.servings} (requested)`
    : recipe.servings || 'Not specified';
  const labels = [recipe.category, recipe.cuisine, recipe.difficulty, recipe.cookingMethod].filter(
    Boolean,
  );
  const nutrition = [
    ['Energy', recipe.nutritionCalories, 'kcal'],
    ['Protein', recipe.nutritionProteinGrams, 'g'],
    ['Carbs', recipe.nutritionCarbohydrateGrams, 'g'],
    ['Fat', recipe.nutritionFatGrams, 'g'],
    ['Fibre', recipe.nutritionFiberGrams, 'g'],
    ['Sodium', recipe.nutritionSodiumMilligrams, 'mg'],
  ] as const;
  return (
    <Page size={options.paper} margin={{ top: 56, right: 44, bottom: 56, left: 44 }}>
      {footer}
      <RunningHeader brand={brand} label={`Recipe · ${truncate(recipe.title, 70)}`} />
      <Stack direction="horizontal" align="center" gap="sm" style={{ marginBottom: 8 }}>
        <Badge variant="primary" size="sm">
          {`RECIPE CARD · REVISION ${card.revision}`}
        </Badge>
        {card.adapted ? (
          <Badge variant="warning" size="sm">
            ADAPTED FOR THIS MEAL
          </Badge>
        ) : null}
      </Stack>
      <Heading level={1} style={{ fontSize: 28, marginBottom: 6 }}>
        {recipe.title}
      </Heading>
      {recipe.summary ? (
        <Text style={{ ...body, fontSize: 11, color: muted, marginBottom: 10 }}>
          {recipe.summary}
        </Text>
      ) : null}
      {labels.length ? (
        <Stack direction="horizontal" wrap gap="sm" style={{ marginBottom: 10 }}>
          {labels.map((label) => (
            <Badge key={label} variant="outline" size="sm">
              {label}
            </Badge>
          ))}
        </Stack>
      ) : null}
      {options.includeImage && card.image ? (
        <PdfImage
          src={card.image}
          width="100%"
          height={180}
          fit="cover"
          borderRadius={6}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <PdfCard variant="muted" padding="md" style={{ marginBottom: 6 }}>
        <View style={{ flexDirection: 'row' }}>
          <Fact label="Serves" value={servingsLabel} />
          <Fact label="Prep" value={minutes(recipe.prepMinutes)} />
          <Fact label="Cook" value={minutes(recipe.cookMinutes)} />
          {recipe.restMinutes ? <Fact label="Rest" value={minutes(recipe.restMinutes)} /> : null}
          <Fact label="Total" value={totalMinutes ? `${totalMinutes} min` : '–'} />
        </View>
      </PdfCard>
      {card.servings && !base ? (
        <Text variant="sm" color="mutedForeground">
          Ingredient quantities are unchanged: this recipe has no numeric serving count.
        </Text>
      ) : null}
      {card.occasions?.length ? (
        <Text variant="sm" color="mutedForeground">
          On your plan: {card.occasions.join('; ')}
        </Text>
      ) : null}
      {options.includeEquipment && recipe.equipment.length ? (
        <View wrap={false} style={{ marginTop: 8 }}>
          <Text variant="xs" color="mutedForeground" weight="bold" transform="uppercase">
            Equipment
          </Text>
          <Stack direction="horizontal" wrap gap="sm">
            {recipe.equipment.map((item) => (
              <Badge key={item} variant="default" size="sm">
                {item}
              </Badge>
            ))}
          </Stack>
        </View>
      ) : null}
      {options.includeIngredients &&
        recipe.ingredientGroups.map((group, index) => (
          <View key={index}>
            <View wrap={false}>
              {index === 0 && <SectionTitle>Ingredients</SectionTitle>}
              {group.name ? (
                <Text
                  weight="bold"
                  style={{ fontSize: 10.5, color: ink, marginTop: index === 0 ? 0 : 10 }}
                  noMargin
                >
                  {group.name}
                </Text>
              ) : null}
              {group.ingredients.slice(0, 1).map((item, i) => (
                <IngredientRow
                  key={i}
                  item={item}
                  quantity={quantity}
                  checkbox={options.ingredientCheckboxes}
                  width={contentWidth}
                />
              ))}
            </View>
            {group.ingredients.slice(1).map((item, i) => (
              <IngredientRow
                key={i}
                item={item}
                quantity={quantity}
                checkbox={options.ingredientCheckboxes}
                width={contentWidth}
              />
            ))}
          </View>
        ))}
      {options.includeMethod &&
        recipe.instructionSections.map((part, index) => {
          let offset = 0;
          for (const earlier of recipe.instructionSections.slice(0, index))
            offset += earlier.steps.length;
          return (
            <View key={index}>
              <View wrap={(part.steps[0]?.length ?? 0) > 1000}>
                {index === 0 && <SectionTitle>Method</SectionTitle>}
                {part.title ? (
                  <Text
                    weight="bold"
                    style={{
                      fontSize: 10.5,
                      color: ink,
                      marginTop: index === 0 ? 0 : 10,
                      marginBottom: 6,
                    }}
                    noMargin
                  >
                    {part.title}
                  </Text>
                ) : null}
                {part.steps[0] ? (
                  <MethodStep number={offset + 1} text={part.steps[0]} width={contentWidth} />
                ) : null}
              </View>
              {part.steps.slice(1).map((step, i) => (
                <MethodStep key={i} number={offset + i + 2} text={step} width={contentWidth} />
              ))}
            </View>
          );
        })}
      {options.includeNotes && (recipe.tips || recipe.sharedNotes) ? (
        <View wrap={recipe.tips.length + recipe.sharedNotes.length > 1200}>
          <SectionTitle>Kitchen notes</SectionTitle>
          <PdfCard variant="muted" padding="md" wrap>
            {recipe.tips ? (
              <View style={{ marginBottom: recipe.sharedNotes ? 8 : 0 }}>
                <Text variant="xs" weight="bold" color="primary" transform="uppercase" noMargin>
                  Tips
                </Text>
                <Text style={body} noMargin>
                  {recipe.tips}
                </Text>
              </View>
            ) : null}
            {recipe.sharedNotes ? (
              <View>
                <Text variant="xs" weight="bold" color="primary" transform="uppercase" noMargin>
                  Shared notes
                </Text>
                <Text style={body} noMargin>
                  {recipe.sharedNotes}
                </Text>
              </View>
            ) : null}
          </PdfCard>
        </View>
      ) : null}
      {options.includeNutrition ? (
        <View wrap={false}>
          <SectionTitle>Nutrition per serving</SectionTitle>
          <Table variant="primary-header">
            <TableHeader>
              <TableRow header>
                {nutrition.map(([label]) => (
                  <TableCell key={label} header align="center">
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                {nutrition.map(([label, value, unit]) => (
                  <TableCell key={label} align="center">
                    {value === '' ? 'not recorded' : `${value} ${unit}`}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <Text variant="xs" color="mutedForeground" style={{ marginTop: 5 }}>
            Recipe-provided estimates. Missing values are unknown, not zero.
          </Text>
        </View>
      ) : null}
      {options.includeSource && (recipe.sourceName || recipe.sourceUrl) ? (
        <Text variant="xs" color="mutedForeground" style={{ marginTop: 10 }}>
          Source: {[recipe.sourceName, recipe.sourceUrl].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </Page>
  );
}

function MealLine({ meal, options }: { meal: ScheduleMeal; options: PdfExportOptions }) {
  return (
    <View wrap={false} style={{ marginBottom: 6 }}>
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
      {options.includeNotes && meal.note ? (
        <Text variant="xs" color="mutedForeground" noMargin>
          {meal.note}
        </Text>
      ) : null}
    </View>
  );
}

function SchedulePages({
  schedule,
  options,
  brand,
}: {
  schedule: MealPrintSchedule;
  options: PdfExportOptions;
  brand: PdfBrand;
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
          margin={{ top: 56, right: 40, bottom: 56, left: 40 }}
        >
          {footer}
          <RunningHeader
            brand={brand}
            label={`Meal plan · ${exportDateLabel(week[0]!)} – ${exportDateLabel(week.at(-1)!)}`}
          />
          <PageHeader
            variant="minimal"
            title="At the table"
            subtitle={`${exportDateLabel(week[0]!)} – ${exportDateLabel(week.at(-1)!)}`}
            rightText={`MEAL PLAN · SECTION ${index + 1} OF ${weeks.length}${
              week.length < 7 ? ` · ${week.length} ${week.length === 1 ? 'DAY' : 'DAYS'}` : ''
            }`}
            marginBottom={10}
          />
          {week.map((date) => {
            const meals = schedule.meals
              .filter((meal) => meal.date === date)
              .sort((a, b) => (a.slotOrder ?? 999) - (b.slotOrder ?? 999));
            return (
              <View
                key={date}
                style={{
                  marginTop: 8,
                  flexDirection: 'row',
                  borderTopWidth: 0.75,
                  borderTopColor: rule,
                  paddingTop: 8,
                }}
              >
                <View style={{ width: 116 }}>
                  <Text weight="bold" style={{ fontSize: 11, color: ink }} noMargin>
                    {exportDateLabel(date)}
                  </Text>
                </View>
                <View style={{ flexGrow: 1, flexBasis: 0 }}>
                  {!meals.length && (
                    <Text variant="sm" color="mutedForeground" noMargin>
                      No meal planned.
                    </Text>
                  )}
                  {meals.map((meal) => (
                    <MealLine key={meal.id} meal={meal} options={options} />
                  ))}
                </View>
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
  brand,
}: {
  cards: RecipePrintCard[];
  options: PdfExportOptions;
  schedule?: MealPrintSchedule;
  brand: PdfBrand;
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
      {schedule ? <SchedulePages schedule={schedule} options={options} brand={brand} /> : null}
      {cards.map((card) => (
        <RecipeCard key={card.key} card={card} options={options} brand={brand} />
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
        borderBottomWidth: 0.5,
        borderBottomColor: rule,
        paddingTop: 7,
        paddingBottom: 7,
      }}
    >
      <View
        style={{
          width: 11,
          height: 11,
          marginTop: 1,
          marginRight: 9,
          borderWidth: 1,
          borderColor: completed ? '#4a6b3c' : muted,
          borderRadius: 2,
          backgroundColor: completed ? '#4a6b3c' : '#ffffff',
        }}
      >
        <Text
          style={{ fontSize: 8, lineHeight: 1, textAlign: 'center', color: '#ffffff' }}
          noMargin
        >
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
  brand,
}: {
  title: string;
  note?: string;
  groups: InventoryPrintGroup[];
  options: PdfExportOptions & { countColumn?: boolean };
  brand: PdfBrand;
}) {
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const summary = `${count} ${
    title === 'Pantry inventory'
      ? count === 1
        ? 'stock batch'
        : 'stock batches'
      : count === 1
        ? 'item'
        : 'items'
  } · ${new Date().toLocaleDateString('en-GB')}`;
  return (
    <Document title={title} author="Bòrd">
      <Page size={options.paper} margin={{ top: 56, right: 40, bottom: 56, left: 40 }}>
        {footer}
        <RunningHeader brand={brand} label={truncate(title, 100)} />
        <PageHeader variant="minimal" title={title} subtitle={summary} marginBottom={6} />
        {options.includeNotes && note ? (
          <PdfCard variant="muted" padding="sm" style={{ marginTop: 6 }}>
            <Text style={body} noMargin>
              {note}
            </Text>
          </PdfCard>
        ) : null}
        {groups.map((group) => (
          <View key={group.name}>
            <View wrap={false}>
              <View style={{ marginTop: 16, marginBottom: 4 }}>
                <Stack direction="horizontal" align="center" gap="sm">
                  <Heading level={2} style={{ fontSize: 15, marginBottom: 0 }}>
                    {group.name}
                  </Heading>
                  <Badge variant="default" size="sm">
                    {String(group.rows.length)}
                  </Badge>
                </Stack>
              </View>
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
