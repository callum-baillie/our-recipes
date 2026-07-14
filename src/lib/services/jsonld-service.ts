import {
  MAX_JSONLD_CANDIDATES,
  MAX_JSONLD_SOURCE_BYTES,
  JsonLdValidationError,
} from '@/lib/domain/jsonld';
import { recipeInputSchema, type RecipePayload } from '@/lib/domain/recipe';
import { getRecipe, type RecipeDetail } from '@/lib/services/recipe-service';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type RecipeNode = {
  node: JsonObject;
  hasSchemaContext: boolean;
};

export type JsonLdCandidate = {
  index: number;
  title: string;
  summary: string;
  warnings: string[];
};

export type JsonLdDraft = {
  candidate: JsonLdCandidate;
  recipe: RecipePayload;
  warnings: string[];
};

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: JsonValue | undefined, max = 2_000): string {
  if (typeof value === 'string' || typeof value === 'number')
    return String(value).trim().slice(0, max);
  if (Array.isArray(value)) return value.map((item) => text(item, max)).find(Boolean) ?? '';
  return '';
}

function textList(value: JsonValue | undefined, maxItems: number, maxLength: number): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function isSchemaContext(value: JsonValue | undefined): boolean {
  if (typeof value === 'string') return /^https?:\/\/schema\.org\/?$/iu.test(value.trim());
  if (Array.isArray(value)) return value.some((item) => isSchemaContext(item));
  if (isObject(value)) return /^https?:\/\/schema\.org\//iu.test(text(value['@vocab'], 256));
  return false;
}

function hasRecipeType(value: JsonValue | undefined): boolean {
  return textList(value, 12, 256).some(
    (type) =>
      type === 'Recipe' ||
      type === 'schema:Recipe' ||
      /^https?:\/\/schema\.org\/Recipe$/iu.test(type),
  );
}

function hasFullyQualifiedRecipeType(value: JsonValue | undefined): boolean {
  return textList(value, 12, 256).some((type) => /^https?:\/\/schema\.org\/Recipe$/iu.test(type));
}

function recipeNodes(document: JsonValue): RecipeNode[] {
  const found: RecipeNode[] = [];

  function visit(value: JsonValue, inheritedContext: boolean, depth: number): void {
    if (depth > 8 || found.length >= MAX_JSONLD_CANDIDATES) return;
    if (Array.isArray(value)) {
      value
        .slice(0, MAX_JSONLD_CANDIDATES)
        .forEach((entry) => visit(entry, inheritedContext, depth + 1));
      return;
    }
    if (!isObject(value)) return;
    const hasContext = inheritedContext || isSchemaContext(value['@context']);
    if (
      hasRecipeType(value['@type']) &&
      (hasContext || hasFullyQualifiedRecipeType(value['@type']))
    ) {
      found.push({ node: value, hasSchemaContext: hasContext });
    }
    const graph = value['@graph'];
    if (Array.isArray(graph)) visit(graph, hasContext, depth + 1);
  }

  visit(document, false, 0);
  return found;
}

function durationMinutes(value: JsonValue | undefined): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/iu.exec(text(value, 80));
  if (!match) return null;
  const minutes =
    Number(match[1] ?? 0) * 1_440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(minutes) && minutes <= 10_080 ? minutes : null;
}

function quantityFromText(value: string): number | '' {
  const normalized = value.trim();
  if (/^\d+(?:\.\d+)?$/u.test(normalized)) return Number(normalized);
  const fraction = /^(\d+)\/(\d+)$/u.exec(normalized);
  if (!fraction || Number(fraction[2]) === 0) return '';
  const result = Number(fraction[1]) / Number(fraction[2]);
  return Number.isFinite(result) && result > 0 ? result : '';
}

function ingredientFromText(value: string) {
  const compact = value.replace(/\s+/gu, ' ').trim().slice(0, 430);
  const match =
    /^(\d+(?:\.\d+)?|\d+\/\d+)\s+(tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|ounces?|lb|lbs|pounds?|g|kg|ml|l|pinch(?:es)?|cloves?)\.?\s+(.+)$/iu.exec(
      compact,
    );
  return {
    quantity: match ? quantityFromText(match[1]!) : '',
    unit: match?.[2]?.toLocaleLowerCase() ?? '',
    item: (match?.[3] ?? compact).slice(0, 160),
    note: '',
  };
}

function ingredientText(value: JsonValue | undefined, depth = 0): string[] {
  if (depth > 5 || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => ingredientText(entry, depth + 1));
  if (!isObject(value)) return [];
  if (value['itemListElement'] !== undefined)
    return ingredientText(value['itemListElement'], depth + 1);
  const amount = text(value.value, 40);
  const unit = text(value.unitText ?? value.unitCode, 40);
  const name = text(value.name ?? value.description, 300);
  return [amount, unit, name].filter(Boolean).join(' ').trim()
    ? [[amount, unit, name].filter(Boolean).join(' ')]
    : [];
}

function ingredients(value: JsonValue | undefined) {
  const groups: Array<{ name: string; ingredients: ReturnType<typeof ingredientFromText>[] }> = [];
  const entries = Array.isArray(value) ? value : [value];
  entries.forEach((entry) => {
    if (isObject(entry) && entry.itemListElement !== undefined) {
      const items = ingredientText(entry.itemListElement)
        .map(ingredientFromText)
        .filter((ingredient) => ingredient.item);
      if (items.length)
        groups.push({ name: text(entry.name, 80), ingredients: items.slice(0, 80) });
      return;
    }
    const items = ingredientText(entry)
      .map(ingredientFromText)
      .filter((ingredient) => ingredient.item);
    if (items.length) {
      const existing = groups.find((group) => !group.name);
      if (existing) existing.ingredients.push(...items);
      else groups.push({ name: '', ingredients: items });
    }
  });
  return groups
    .map((group) => ({ ...group, ingredients: group.ingredients.slice(0, 80) }))
    .slice(0, 20);
}

function stepText(value: JsonValue | undefined, depth = 0): string[] {
  if (depth > 5 || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number') return [String(value).trim()];
  if (Array.isArray(value)) return value.flatMap((entry) => stepText(entry, depth + 1));
  if (!isObject(value)) return [];
  if (value.itemListElement !== undefined) return stepText(value.itemListElement, depth + 1);
  return [text(value.text ?? value.description ?? value.name, 2_000)].filter(Boolean);
}

function instructions(value: JsonValue | undefined) {
  const sections: Array<{ title: string; steps: string[] }> = [];
  const entries = Array.isArray(value) ? value : [value];
  entries.forEach((entry) => {
    if (
      isObject(entry) &&
      (entry['@type'] === 'HowToSection' || entry.itemListElement !== undefined)
    ) {
      const steps = stepText(entry.itemListElement ?? entry)
        .filter(Boolean)
        .slice(0, 80);
      if (steps.length) sections.push({ title: text(entry.name, 80), steps });
      return;
    }
    const steps = stepText(entry).filter(Boolean);
    if (steps.length) {
      const existing = sections.find((section) => !section.title);
      if (existing) existing.steps.push(...steps);
      else sections.push({ title: '', steps });
    }
  });
  return sections
    .map((section) => ({ ...section, steps: section.steps.slice(0, 80) }))
    .slice(0, 20);
}

function keywordTags(value: JsonValue | undefined): string[] {
  const raw = Array.isArray(value)
    ? value.flatMap((entry) => text(entry, 160).split(','))
    : text(value, 800).split(',');
  return raw
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function sourceUrl(node: JsonObject): string {
  const value = text(node.url ?? node.mainEntityOfPage, 2_048);
  try {
    return value && /^https?:$/iu.test(new URL(value).protocol) ? value : '';
  } catch {
    return '';
  }
}

function mapCandidate(recipeNode: RecipeNode, index: number): JsonLdDraft {
  const { node, hasSchemaContext } = recipeNode;
  const warnings: string[] = [];
  if (!hasSchemaContext)
    warnings.push(
      'The recipe uses a fully qualified Schema.org type without an @context. Review every field.',
    );
  const prepMinutes = durationMinutes(node.prepTime);
  const cookMinutes = durationMinutes(node.cookTime);
  if (node.prepTime !== undefined && prepMinutes === null)
    warnings.push('Prep time was not a supported ISO 8601 duration and needs review.');
  if (node.cookTime !== undefined && cookMinutes === null)
    warnings.push('Cook time was not a supported ISO 8601 duration and needs review.');
  if (node.totalTime !== undefined)
    warnings.push(
      'Total time is shown in the source but is not used to infer prep, cook, or rest time.',
    );
  ['image', 'nutrition', 'aggregateRating', 'video', 'review'].forEach((property) => {
    if (node[property] !== undefined)
      warnings.push(`${property} is not imported into a household recipe.`);
  });
  const parsed = recipeInputSchema.safeParse({
    title: text(node.name, 160),
    summary: text(node.description, 800),
    status: 'active',
    servings: text(node.recipeYield, 80) || 'Review servings',
    prepMinutes: prepMinutes ?? 0,
    cookMinutes: cookMinutes ?? 0,
    restMinutes: 0,
    difficulty: '',
    cuisine: text(node.recipeCuisine, 80),
    category: text(node.recipeCategory, 80),
    tips: '',
    sharedNotes: '',
    sourceName: 'Schema.org JSON-LD',
    sourceUrl: sourceUrl(node),
    tags: keywordTags(node.keywords),
    ingredientGroups: ingredients(node.recipeIngredient),
    instructionSections: instructions(node.recipeInstructions),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new JsonLdValidationError(
      'invalid_recipe_candidate',
      issue?.message ?? 'This Recipe node does not contain a compatible household recipe.',
    );
  }
  return {
    candidate: {
      index,
      title: parsed.data.title,
      summary: parsed.data.summary,
      warnings,
    },
    recipe: parsed.data,
    warnings,
  };
}

function parseDocument(source: string): RecipeNode[] {
  if (new TextEncoder().encode(source).byteLength > MAX_JSONLD_SOURCE_BYTES) {
    throw new JsonLdValidationError('source_too_large', 'Paste no more than 1 MB of JSON-LD.');
  }
  let document: JsonValue;
  try {
    document = JSON.parse(source) as JsonValue;
  } catch {
    throw new JsonLdValidationError('invalid_jsonld', 'Paste valid JSON-LD, not HTML or a file.');
  }
  if (!Array.isArray(document) && !isObject(document)) {
    throw new JsonLdValidationError(
      'invalid_jsonld',
      'JSON-LD must be an object, an @graph, or an array.',
    );
  }
  const nodes = recipeNodes(document);
  if (!nodes.length) {
    throw new JsonLdValidationError(
      'no_recipe_candidates',
      'No Schema.org Recipe nodes were found in this pasted JSON-LD.',
    );
  }
  return nodes;
}

export function findJsonLdCandidates(source: string): JsonLdCandidate[] {
  return parseDocument(source).map((node, index) => {
    try {
      return mapCandidate(node, index).candidate;
    } catch (error) {
      const message =
        error instanceof JsonLdValidationError
          ? error.message
          : 'This Recipe node could not be converted into a household recipe.';
      return {
        index,
        title: text(node.node.name, 160) || `Recipe candidate ${index + 1}`,
        summary: text(node.node.description, 800),
        warnings: [message],
      };
    }
  });
}

export function createJsonLdDraft(source: string, candidateIndex: number): JsonLdDraft {
  const nodes = parseDocument(source);
  const node = nodes[candidateIndex];
  if (!node) {
    throw new JsonLdValidationError(
      'candidate_not_found',
      'Choose one of the recipe candidates shown.',
    );
  }
  return mapCandidate(node, candidateIndex);
}

function isoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `PT${hours ? `${hours}H` : ''}${remainingMinutes || !hours ? `${remainingMinutes}M` : ''}`;
}

function formattedIngredient(
  ingredient: RecipeDetail['ingredientGroups'][number]['ingredients'][number],
): string {
  return [
    ingredient.quantity ?? '',
    ingredient.unit,
    ingredient.item,
    ingredient.note && `(${ingredient.note})`,
  ]
    .filter(Boolean)
    .join(' ');
}

function recipeIngredients(recipe: RecipeDetail): JsonValue[] {
  return recipe.ingredientGroups.map((group) => ({
    '@type': 'ItemList',
    ...(group.name ? { name: group.name } : {}),
    itemListElement: group.ingredients.map(formattedIngredient),
  }));
}

function recipeInstructions(recipe: RecipeDetail): JsonValue[] {
  return recipe.instructionSections.map((section) => ({
    '@type': 'HowToSection',
    ...(section.title ? { name: section.title } : {}),
    itemListElement: section.steps.map((step) => ({ '@type': 'HowToStep', text: step.body })),
  }));
}

export type RecipeJsonLdOptions = {
  images?: Array<{ path: string; altText: string }>;
};

export function recipeAsJsonLd(
  recipe: RecipeDetail,
  options: RecipeJsonLdOptions = {},
): JsonObject {
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes + recipe.restMinutes;
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    '@id': `urn:uuid:${recipe.id}`,
    name: recipe.title,
    ...(recipe.summary ? { description: recipe.summary } : {}),
    recipeYield: recipe.servings,
    prepTime: isoDuration(recipe.prepMinutes),
    cookTime: isoDuration(recipe.cookMinutes),
    totalTime: isoDuration(totalMinutes),
    ...(recipe.category ? { recipeCategory: recipe.category } : {}),
    ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
    ...(recipe.tags.length ? { keywords: recipe.tags } : {}),
    ...(recipe.sourceUrl ? { url: recipe.sourceUrl } : {}),
    ...(options.images?.length
      ? {
          image: options.images.map((image) => ({
            '@type': 'ImageObject',
            contentUrl: image.path,
            ...(image.altText ? { caption: image.altText } : {}),
          })),
        }
      : {}),
    recipeIngredient: recipeIngredients(recipe),
    recipeInstructions: recipeInstructions(recipe),
  };
}

export function exportRecipeAsJsonLd(recipeId: string): JsonObject | null {
  const recipe = getRecipe(recipeId);
  return recipe ? recipeAsJsonLd(recipe) : null;
}
