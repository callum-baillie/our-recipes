/**
 * Plain-language descriptions of the chat assistant's app functions, used for the live
 * tool-call rows in the conversation. Titles never echo raw arguments beyond a short,
 * length-limited search phrase, so a transcript row cannot leak structured household data.
 */
export type ChatToolKind = 'read' | 'search' | 'draft' | 'prepare' | 'ask';

export type ChatToolEvent = {
  type: 'tool';
  /** Stable per provider call, so the row keeps its place while its state changes. */
  id: string;
  tool: string;
  kind: ChatToolKind;
  state: 'running' | 'success' | 'error';
  title: string;
  summary?: string;
  durationMs?: number;
};

const phrase = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/gu, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
};

type Description = { kind: ChatToolKind; running: string; done: string; failed?: string };

export function describeChatTool(name: string, args: unknown): Description {
  const query = phrase((args as { query?: unknown } | null)?.query);
  switch (name) {
    case 'request_ai_access':
      return {
        kind: 'ask',
        running: 'Preparing a permission request',
        done: 'Permission request ready for review',
      };
    case 'read_household_profiles':
      return {
        kind: 'read',
        running: 'Checking who is in your household',
        done: 'Checked your household',
      };
    case 'read_kitchen_context':
      return {
        kind: 'read',
        running: 'Looking through your pantry and equipment',
        done: 'Looked through your pantry and equipment',
      };
    case 'read_shopping_context':
      return {
        kind: 'read',
        running: 'Checking your shopping lists',
        done: 'Checked your shopping lists',
      };
    case 'search_recipes':
      return {
        kind: 'search',
        running: query ? `Searching your recipes for “${query}”` : 'Searching your recipes',
        done: query ? `Searched your recipes for “${query}”` : 'Searched your recipes',
      };
    case 'get_recipe':
    case 'read_planned_recipe':
      return { kind: 'read', running: 'Opening a saved recipe', done: 'Opened a saved recipe' };
    case 'read_meal_plan':
      return { kind: 'read', running: 'Reading your meal plan', done: 'Read your meal plan' };
    case 'read_nutrition':
      return {
        kind: 'read',
        running: 'Checking your nutrition',
        done: 'Checked your nutrition',
      };
    case 'review_kitchen_data':
    case 'read_review_workspace':
      return {
        kind: 'read',
        running: 'Reviewing your kitchen',
        done: 'Reviewed your kitchen',
      };
    case 'list_app_actions':
    case 'read_app_data':
      return {
        kind: 'read',
        running: 'Reading what the app can do',
        done: 'Read what the app can do',
      };
    case 'generate_recipe':
    case 'generate_recipes':
      return { kind: 'draft', running: 'Drafting a recipe', done: 'Drafted a recipe' };
    case 'generate_meal_plan':
      return {
        kind: 'draft',
        running: 'Drafting your meal plan',
        done: 'Drafted your meal plan',
      };
    case 'revise_meal_plan_draft':
      return { kind: 'draft', running: 'Replacing one meal', done: 'Replaced one meal' };
    case 'ask_clarification':
      return { kind: 'ask', running: 'Preparing a question', done: 'Prepared a question' };
    case 'import_recipes':
      return { kind: 'prepare', running: 'Queuing recipe imports', done: 'Queued recipe imports' };
    case 'prepare_recipe_images':
      return {
        kind: 'prepare',
        running: 'Preparing recipe images',
        done: 'Prepared recipe images',
      };
    default:
      return name.startsWith('read_') || name.startsWith('get_') || name.startsWith('search_')
        ? {
            kind: 'read',
            running: 'Reading permitted kitchen information',
            done: 'Read permitted kitchen information',
          }
        : { kind: 'prepare', running: 'Preparing a review', done: 'Prepared a review' };
  }
}

export function toolStartEvent(id: string, name: string, args: unknown): ChatToolEvent {
  const description = describeChatTool(name, args);
  return {
    type: 'tool',
    id,
    tool: name,
    kind: description.kind,
    state: 'running',
    title: description.running,
  };
}

export function toolFinishEvent(
  id: string,
  name: string,
  args: unknown,
  outcome: { ok: boolean; startedAt: number; summary?: string },
): ChatToolEvent {
  const description = describeChatTool(name, args);
  return {
    type: 'tool',
    id,
    tool: name,
    kind: description.kind,
    state: outcome.ok ? 'success' : 'error',
    title: outcome.ok
      ? description.done
      : (description.failed ?? `Could not finish: ${description.running.toLowerCase()}`),
    summary: outcome.summary,
    durationMs: Math.max(0, Date.now() - outcome.startedAt),
  };
}
