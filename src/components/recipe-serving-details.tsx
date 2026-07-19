'use client';

import { Clock3, LoaderCircle, Minus, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { RecipeClassificationToolbar } from '@/components/recipe-classification-toolbar';
import { useToast } from '@/components/toast-provider';
import {
  formatScaledQuantity,
  parseServingCount,
  scaleIngredientMeasurement,
} from '@/lib/domain/ingredient-scaling';

type IngredientGroup = {
  id: string;
  name: string;
  ingredients: Array<{
    id: string;
    quantity: number | null;
    unit: string;
    item: string;
    note: string;
  }>;
};

type InstructionSection = {
  id: string;
  title: string;
  steps: Array<{ id: string; body: string }>;
};

type RecipeServingDetailsProps = {
  servings: string;
  prepMinutes: number;
  cookMinutes: number;
  restMinutes: number;
  category: string;
  cuisine: string;
  difficulty: string;
  cookingMethod: string;
  recipeId: string;
  currentRevision: number;
  tags: string[];
  availableTags: string[];
  nutritionCalories: number | null;
  nutritionProteinGrams: number | null;
  nutritionCarbohydrateGrams: number | null;
  nutritionFatGrams: number | null;
  nutritionSaturatedFatGrams: number | null;
  nutritionFiberGrams: number | null;
  nutritionSugarGrams: number | null;
  nutritionSodiumMilligrams: number | null;
  collections: Array<{ id: string; name: string }>;
  ingredientGroups: IngredientGroup[];
  instructionSections: InstructionSection[];
};

function NutritionValue({ value, unit }: { value: number | null; unit: string }) {
  return (
    <dd className={value === null ? 'recipe-fact-empty' : undefined}>
      {value === null ? '-' : `${value} ${unit}`}
    </dd>
  );
}

export function RecipeServingDetails(props: RecipeServingDetailsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const baseServings = useMemo(() => parseServingCount(props.servings), [props.servings]);
  const [selectedServings, setSelectedServings] = useState(baseServings ?? 1);
  const [estimatingNutrition, setEstimatingNutrition] = useState(false);
  const totalMinutes = props.prepMinutes + props.cookMinutes + props.restMinutes;
  const multiplier = baseServings ? selectedServings / baseServings : 1;
  const adjusted = baseServings !== null && Math.abs(selectedServings - baseServings) > 0.001;

  const nutrition = [
    ['Calories', props.nutritionCalories, 'kcal'],
    ['Protein', props.nutritionProteinGrams, 'g'],
    ['Carbs', props.nutritionCarbohydrateGrams, 'g'],
    ['Fat', props.nutritionFatGrams, 'g'],
    ['Saturated fat', props.nutritionSaturatedFatGrams, 'g'],
    ['Fiber', props.nutritionFiberGrams, 'g'],
    ['Sugar', props.nutritionSugarGrams, 'g'],
    ['Sodium', props.nutritionSodiumMilligrams, 'mg'],
  ] as const;
  const nutritionIncomplete = nutrition.some(([, value]) => value === null);

  async function estimateNutrition() {
    setEstimatingNutrition(true);
    try {
      const response = await fetch(`/api/v1/recipes/${props.recipeId}/nutrition/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, expectedRevision: props.currentRevision }),
      });
      const body = (await response.json().catch(() => null)) as {
        recipe?: { currentRevision?: number };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.recipe?.currentRevision) {
        throw new Error(
          body?.error?.message ?? 'OpenAI could not estimate this recipe’s nutrition.',
        );
      }
      showToast(
        'Nutrition estimate saved. Review the per-serving values before relying on them.',
        'success',
      );
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'OpenAI could not estimate this recipe’s nutrition.',
        'error',
      );
    } finally {
      setEstimatingNutrition(false);
    }
  }

  return (
    <>
      <dl className="recipe-facts">
        <div className="serving-fact">
          <dt>Serves</dt>
          <dd>
            {baseServings === null ? (
              <span className="recipe-fact-empty">-</span>
            ) : (
              <span className="serving-stepper">
                <button
                  type="button"
                  onClick={() => setSelectedServings((current) => Math.max(1, current - 1))}
                  disabled={selectedServings <= 1}
                  aria-label="Decrease servings"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <output aria-label="Selected servings">
                  {formatScaledQuantity(selectedServings)}
                </output>
                <button
                  type="button"
                  onClick={() => setSelectedServings((current) => Math.min(99, current + 1))}
                  disabled={selectedServings >= 99}
                  aria-label="Increase servings"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Prep</dt>
          <dd>{props.prepMinutes} min</dd>
        </div>
        <div>
          <dt>Cook</dt>
          <dd>{props.cookMinutes} min</dd>
        </div>
        {props.restMinutes > 0 && (
          <div>
            <dt>Rest</dt>
            <dd>{props.restMinutes} min</dd>
          </div>
        )}
        <div>
          <dt>Total</dt>
          <dd>
            <Clock3 size={15} aria-hidden="true" /> {totalMinutes} min
          </dd>
        </div>
      </dl>

      <section
        className="nutrition-panel"
        aria-labelledby="nutrition-heading"
        aria-busy={estimatingNutrition}
      >
        <div className="nutrition-heading">
          <div>
            <p className="eyebrow">PER SERVING</p>
            <h2 id="nutrition-heading">Nutritional information</h2>
          </div>
          <div className="nutrition-heading-actions">
            <p>Values are per serving. AI-generated estimates should be reviewed.</p>
            {nutritionIncomplete && (
              <button
                className="text-button nutrition-estimate-button"
                type="button"
                disabled={estimatingNutrition}
                onClick={() => void estimateNutrition()}
                title="Uses one paid OpenAI request"
              >
                {estimatingNutrition ? (
                  <LoaderCircle className="spin" size={16} aria-hidden="true" />
                ) : (
                  <Sparkles size={16} aria-hidden="true" />
                )}
                {estimatingNutrition ? 'Estimating with OpenAI…' : 'Estimate from AI'}
              </button>
            )}
          </div>
        </div>
        <dl className="nutrition-grid">
          {nutrition.map(([label, value, unit]) => (
            <div key={label}>
              <dt>{label}</dt>
              <NutritionValue value={value} unit={unit} />
            </div>
          ))}
        </dl>
      </section>

      <RecipeClassificationToolbar
        recipeId={props.recipeId}
        currentRevision={props.currentRevision}
        category={props.category}
        cuisine={props.cuisine}
        difficulty={props.difficulty}
        cookingMethod={props.cookingMethod}
        tags={props.tags}
        availableTags={props.availableTags}
      />

      {props.collections.length > 0 && (
        <aside className="recipe-notes collection-links">
          <strong>In these collections</strong>
          <div>
            {props.collections.map((collection) => (
              <Link href={`/collections/${collection.id}`} key={collection.id}>
                {collection.name}
              </Link>
            ))}
          </div>
        </aside>
      )}

      <p className="serving-adjustment-note" role="status" aria-live="polite">
        {adjusted
          ? `Ingredients adjusted from ${formatScaledQuantity(baseServings!)} to ${formatScaledQuantity(selectedServings)} servings.`
          : baseServings
            ? 'Adjust the serving count to scale ingredient quantities.'
            : 'Add a numeric serving size to enable ingredient scaling.'}
      </p>

      <div className="recipe-body">
        <section>
          <h2>Ingredients</h2>
          {props.ingredientGroups.map((group) => (
            <div className="ingredient-group" key={group.id}>
              {group.name && <h3>{group.name}</h3>}
              <ul>
                {group.ingredients.map((ingredient) => {
                  const measurement = scaleIngredientMeasurement(
                    ingredient.quantity,
                    ingredient.unit,
                    multiplier,
                  );
                  return (
                    <li key={ingredient.id}>
                      {(measurement.quantity || measurement.unit) && (
                        <span className="ingredient-quantity">
                          {[measurement.quantity, measurement.unit].filter(Boolean).join(' ')}
                        </span>
                      )}{' '}
                      {ingredient.item}
                      {ingredient.note && <em> — {ingredient.note}</em>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
        <section>
          <h2>Method</h2>
          {props.instructionSections.map((section) => (
            <div className="instruction-section" key={section.id}>
              {section.title && <h3>{section.title}</h3>}
              <ol>
                {section.steps.map((step) => (
                  <li key={step.id}>{step.body}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
