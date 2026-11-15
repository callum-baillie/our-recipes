import 'server-only';
import { aiRecipeResponseContent, type AiRecipeImage } from '@/lib/domain/ai-bulk-import';

import { AI_GROUNDING_INSTRUCTIONS } from '@/lib/domain/ai-grounding';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { aiStructuredRecipeSchema } from '@/lib/domain/ai';
import {
  aiMealPlanCandidateSchema,
  aiMealPlanStructuredOutputSchema,
  aiSummaryBundleOutputSchema,
  type AiMealPlanCandidate,
  type AiReasoningEffort,
  type AiSummaryBundleOutput,
} from '@/lib/domain/ai-assistant';
import { recipeInputSchema, type RecipeInput } from '@/lib/domain/recipe';
import { getOpenAiApiKey } from '@/lib/providers/openai-key';

export type AssistantTool = {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: true;
};

export type AssistantToolCall = {
  callId: string;
  name: string;
  arguments: unknown;
};

export type AssistantProviderResult = {
  text: string;
  toolCalls: AssistantToolCall[];
  usage: { inputTokens: number | null; outputTokens: number | null };
  responseItems: unknown[];
};

export interface AiAssistantProvider {
  respond(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    messages: unknown[];
    tools: AssistantTool[];
    safetyIdentifier: string;
    promptGuidance?: string;
    requestTimeoutSeconds?: number;
    signal?: AbortSignal;
    onTextDelta?: (delta: string) => void;
    maxOutputTokens?: number;
  }): Promise<AssistantProviderResult>;
  generateMealPlan(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    context: unknown;
    maxOutputTokens?: number;
    signal?: AbortSignal;
    safetyIdentifier: string;
    promptGuidance?: string;
    requestTimeoutSeconds?: number;
  }): Promise<AiMealPlanCandidate>;
  generateRecipe(input: {
    images?: AiRecipeImage[];
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    context: unknown;
    maxOutputTokens?: number;
    signal?: AbortSignal;
    safetyIdentifier: string;
    promptGuidance?: string;
    requestTimeoutSeconds?: number;
  }): Promise<RecipeInput>;
  generateRecipes?(
    inputs: Array<Parameters<AiAssistantProvider['generateRecipe']>[0]>,
  ): Promise<RecipeInput[]>;
  generateSummaryBundle(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    evidence: unknown;
    maxOutputTokens?: number;
    signal?: AbortSignal;
    safetyIdentifier: string;
    promptGuidance?: string;
    requestTimeoutSeconds?: number;
  }): Promise<AiSummaryBundleOutput>;
}

export class AiAssistantProviderUnavailableError extends Error {}
export class AiAssistantProviderResponseError extends Error {}

type ResponsesClient = {
  stream?(
    request: unknown,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<{
    type: string;
    delta?: string;
  }> & {
    finalResponse(): Promise<{
      status?: string;
      incomplete_details?: { reason?: string } | null;
      output?: Array<Record<string, unknown>>;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
  create(
    request: unknown,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<{
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output?: Array<Record<string, unknown>>;
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  }>;
  parse(
    request: unknown,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<{
    output_parsed: unknown;
  }>;
};

function normalizeOpenAiToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeOpenAiToolSchema);
  if (value === null || typeof value !== 'object') return value;

  const normalized: Record<string, unknown> = {};
  let hasConst = false;
  let constValue: unknown;
  for (const [key, entry] of Object.entries(value)) {
    // These are useful to local validators but are outside OpenAI's strict tool-schema subset.
    if (key === '$schema' || key === 'minLength' || key === 'maxLength') continue;
    if (key === 'const') {
      hasConst = true;
      constValue = entry;
      continue;
    }
    normalized[key] = normalizeOpenAiToolSchema(entry);
  }
  if (hasConst) normalized.enum = [constValue];
  return normalized;
}

// Responses streams attach SDK-only parsing helpers to output items. Those fields
// are not accepted as API input when continuing a stateless tool conversation.
function responseItemForInput(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const item = { ...(value as Record<string, unknown>) };
  if (item.type === 'function_call') delete item.parsed_arguments;
  if (item.type === 'message' && Array.isArray(item.content)) {
    item.content = item.content.map((value: unknown) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
      const content = { ...(value as Record<string, unknown>) };
      if (content.type === 'output_text') delete content.parsed;
      return content;
    });
  }
  return item;
}

function logStructuredFailure(workload: string, error: unknown) {
  const e = error as {
    status?: unknown;
    code?: unknown;
    param?: unknown;
    issues?: Array<{ code: string; path: PropertyKey[] }>;
  } | null;
  const safe = (value: unknown) =>
    typeof value === 'string' && /^[A-Za-z0-9_.\[\]-]{1,160}$/u.test(value) ? value : undefined;
  console.warn('Bord structured provider failure', {
    workload,
    errorType: error instanceof Error ? error.constructor.name : 'unknown',
    status: typeof e?.status === 'number' ? e.status : undefined,
    code: safe(e?.code),
    param: safe(e?.param),
    validation: e?.issues
      ?.slice(0, 8)
      .map((issue) => ({ code: issue.code, path: issue.path.map(String).join('.') })),
  });
}

function structuredFailureMessage(error: unknown, fallback: string) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429)
    return 'OpenAI is rate limited or its quota is exhausted. Check provider usage and try again later.';
  if (status === 401)
    return 'The OpenAI credential was rejected. Check the provider key in AI settings.';
  if (status === 400)
    return 'OpenAI rejected the drafting request. Review the configured model and response schema; the server log contains the rejected parameter.';
  return fallback;
}

function reasoning(effort: AiReasoningEffort | null) {
  return effort ? { reasoning: { effort } } : {};
}

export class OpenAiAssistantProvider implements AiAssistantProvider {
  private readonly responses: ResponsesClient;

  constructor(apiKey: string, client?: ResponsesClient) {
    this.responses =
      client ??
      (
        new OpenAI({ apiKey, maxRetries: 2, timeout: 120_000 }) as unknown as {
          responses: ResponsesClient;
        }
      ).responses;
  }

  private async structured(request: unknown, options: { signal?: AbortSignal; timeout?: number }) {
    const deadline = AbortSignal.timeout(options.timeout ?? 180_000);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    // Read the terminal state before parsing JSON: SDK parse helpers can otherwise
    // turn a truncated response into an unhelpful SyntaxError.
    const response = await this.responses.create(request, { ...options, signal });
    signal.throwIfAborted();
    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason;
      console.warn('Bord structured response incomplete', { reason, usage: response.usage });
      throw new AiAssistantProviderResponseError(
        reason === 'max_output_tokens'
          ? 'The draft exceeded the configured response limit. Try fewer meals or raise Maximum response tokens in AI settings.'
          : 'The provider could not finish the draft. Try a smaller request.',
      );
    }
    if (response.status && response.status !== 'completed')
      throw new AiAssistantProviderResponseError(
        'The provider did not complete the draft. Please try again.',
      );
    const content = (response.output ?? []).flatMap((item) =>
      Array.isArray(item.content) ? (item.content as Record<string, unknown>[]) : [],
    );
    if (content.some((item) => item.type === 'refusal'))
      throw new AiAssistantProviderResponseError(
        'The provider declined this drafting request. Try rephrasing it.',
      );
    const text =
      response.output_text ??
      content
        .filter((item) => item.type === 'output_text')
        .map((item) => String(item.text ?? ''))
        .join('');
    try {
      return { output_parsed: JSON.parse(text) as unknown };
    } catch {
      throw new AiAssistantProviderResponseError(
        'The provider returned an unreadable draft. Please try again.',
      );
    }
  }

  async respond(input: Parameters<AiAssistantProvider['respond']>[0]) {
    try {
      input.signal?.throwIfAborted();
      const request = {
        model: input.model,
        instructions: [
          AI_GROUNDING_INSTRUCTIONS,
          input.instructions,
          input.promptGuidance ?? '',
        ].join('\n'),
        input: input.messages.map(responseItemForInput),
        include: ['reasoning.encrypted_content'],
        tools: input.tools.map((tool) => ({
          ...tool,
          parameters: normalizeOpenAiToolSchema(tool.parameters) as Record<string, unknown>,
        })),
        store: false,
        parallel_tool_calls: false,
        max_output_tokens: input.maxOutputTokens ?? 4096,
        safety_identifier: input.safetyIdentifier,
        ...reasoning(input.reasoningEffort),
      };
      const deadline = AbortSignal.timeout(
        Math.max(1, Math.floor((input.requestTimeoutSeconds ?? 180) * 1000)),
      );
      const signal = input.signal ? AbortSignal.any([input.signal, deadline]) : deadline;
      const stream = this.responses.stream?.(request, { signal });
      let response: Awaited<ReturnType<ResponsesClient['create']>>;
      if (stream) {
        for await (const event of stream) {
          input.signal?.throwIfAborted();
          if (event.type === 'response.output_text.delta' && event.delta)
            input.onTextDelta?.(event.delta);
          if (event.type === 'response.refusal.delta' && event.delta)
            input.onTextDelta?.(event.delta);
        }
        const final = await stream.finalResponse();
        if (final.status && final.status !== 'completed') {
          console.warn('Bord chat response incomplete', {
            status: final.status,
            reason: final.incomplete_details?.reason,
          });
          throw new AiAssistantProviderResponseError(
            final.incomplete_details?.reason === 'max_output_tokens'
              ? 'The assistant reached the configured response limit. Try a smaller request or raise Maximum response tokens in AI settings.'
              : 'The response ended before completion. Review the conversation before trying again.',
          );
        }
        response = final;
      } else {
        response = await this.responses.create(request, { signal });
        input.signal?.throwIfAborted();
        if (response.output_text) input.onTextDelta?.(response.output_text);
      }
      const output = response.output ?? [];
      return {
        text: response.output_text ?? '',
        toolCalls: output.flatMap((item): AssistantToolCall[] => {
          if (item.type !== 'function_call') return [];
          let args: unknown = {};
          try {
            args = JSON.parse(String(item.arguments ?? '{}'));
          } catch {
            throw new AiAssistantProviderResponseError('OpenAI returned invalid tool arguments.');
          }
          return [
            {
              callId: String(item.call_id ?? ''),
              name: String(item.name ?? ''),
              arguments: args,
            },
          ];
        }),
        usage: {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
        },
        responseItems: output.map(responseItemForInput),
      };
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof AiAssistantProviderResponseError) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const param =
        error && typeof error === 'object' && 'param' in error ? String(error.param) : '';
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const detail =
        status === 429
          ? 'OpenAI is busy or its quota is exhausted. Check usage and try again later.'
          : status === 401
            ? 'The OpenAI credential was rejected. Check the provider key in AI settings.'
            : status === 400
              ? 'OpenAI rejected the chat request. Check the configured model and tool compatibility.'
              : 'OpenAI could not complete that chat turn. Reload to review any drafts before trying again.';
      // Provider messages may contain household input. Retain only bounded machine diagnostics.
      console.warn('Bord chat provider failure', {
        status,
        code: /^[a-z_]{1,80}$/u.test(code) ? code : 'unknown',
        param: /^[A-Za-z0-9_.\[\]-]{1,160}$/u.test(param) ? param : 'unknown',
      });
      throw new AiAssistantProviderResponseError(detail);
    }
  }

  async generateMealPlan(input: Parameters<AiAssistantProvider['generateMealPlan']>[0]) {
    try {
      input.signal?.throwIfAborted();
      const format = zodTextFormat(aiMealPlanStructuredOutputSchema, 'meal_plan_candidate');
      const context = input.context as {
        context?: { recipes?: Array<{ id?: unknown }> };
        request?: { sourceMode?: string };
      } | null;
      const ids = (context?.context?.recipes ?? []).flatMap((recipe) =>
        typeof recipe.id === 'string' ? [recipe.id] : [],
      );
      const schema = format.schema as {
        properties: { entries: { items: { properties: Record<string, unknown> } } };
      };
      schema.properties.entries.items.properties.existingRecipeId = {
        type: ['string', 'null'],
        enum: [...new Set(ids), null],
      };
      const response = await this.structured(
        {
          model: input.model,
          instructions: [
            AI_GROUNDING_INSTRUCTIONS,
            input.instructions,
            input.promptGuidance ?? '',
          ].join('\n'),
          input: [
            {
              role: 'user',
              content: `Untrusted household planning context follows:\n${JSON.stringify(input.context)}`,
            },
          ],
          text: { format },
          store: false,
          max_output_tokens: input.maxOutputTokens ?? 4096,
          safety_identifier: input.safetyIdentifier,
          ...reasoning(input.reasoningEffort),
        },
        { signal: input.signal, timeout: (input.requestTimeoutSeconds ?? 180) * 1000 },
      );
      input.signal?.throwIfAborted();
      return aiMealPlanCandidateSchema.parse(response.output_parsed);
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof AiAssistantProviderResponseError) throw error;
      logStructuredFailure('meal_plan_generation', error);
      throw new AiAssistantProviderResponseError(
        structuredFailureMessage(
          error,
          'OpenAI could not create a valid meal plan. Try fewer meals or review AI settings.',
        ),
      );
    }
  }

  async generateRecipe(input: Parameters<AiAssistantProvider['generateRecipe']>[0]) {
    try {
      input.signal?.throwIfAborted();
      const response = await this.structured(
        {
          model: input.model,
          instructions: [
            AI_GROUNDING_INSTRUCTIONS,
            input.instructions,
            input.promptGuidance ?? '',
          ].join('\n'),
          input: [
            {
              role: 'user',
              content: aiRecipeResponseContent(input.context, input.images),
            },
          ],
          text: { format: zodTextFormat(aiStructuredRecipeSchema, 'generated_recipe') },
          store: false,
          max_output_tokens: input.maxOutputTokens ?? 4096,
          safety_identifier: input.safetyIdentifier,
          ...reasoning(input.reasoningEffort),
        },
        { signal: input.signal, timeout: (input.requestTimeoutSeconds ?? 180) * 1000 },
      );
      input.signal?.throwIfAborted();
      return recipeInputSchema.parse(response.output_parsed);
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof AiAssistantProviderResponseError) throw error;
      logStructuredFailure('recipe_generation', error);
      throw new AiAssistantProviderResponseError(
        structuredFailureMessage(error, 'OpenAI could not create a valid recipe.'),
      );
    }
  }

  async generateRecipes(inputs: Array<Parameters<AiAssistantProvider['generateRecipe']>[0]>) {
    const recipes: RecipeInput[] = [];
    for (let index = 0; index < inputs.length; index += 4) {
      recipes.push(
        ...(await Promise.all(
          inputs.slice(index, index + 4).map((input) => this.generateRecipe(input)),
        )),
      );
    }
    return recipes;
  }

  async generateSummaryBundle(input: Parameters<AiAssistantProvider['generateSummaryBundle']>[0]) {
    try {
      input.signal?.throwIfAborted();
      const response = await this.structured(
        {
          model: input.model,
          instructions: [
            AI_GROUNDING_INSTRUCTIONS,
            input.instructions,
            input.promptGuidance ?? '',
          ].join('\n'),
          input: [
            {
              role: 'user',
              content: `Untrusted recorded evidence follows:\n${JSON.stringify(input.evidence)}`,
            },
          ],
          text: { format: zodTextFormat(aiSummaryBundleOutputSchema, 'household_summary_bundle') },
          store: false,
          max_output_tokens: input.maxOutputTokens ?? 4096,
          safety_identifier: input.safetyIdentifier,
          ...reasoning(input.reasoningEffort),
        },
        { signal: input.signal, timeout: (input.requestTimeoutSeconds ?? 180) * 1000 },
      );
      input.signal?.throwIfAborted();
      return aiSummaryBundleOutputSchema.parse(response.output_parsed);
    } catch (error) {
      input.signal?.throwIfAborted();
      if (error instanceof AiAssistantProviderResponseError) throw error;
      logStructuredFailure('summary_generation', error);
      throw new AiAssistantProviderResponseError(
        structuredFailureMessage(error, 'OpenAI could not create a valid summary.'),
      );
    }
  }
}

let providerForTests: AiAssistantProvider | null = null;

export function getAiAssistantProvider(): AiAssistantProvider {
  if (providerForTests) return providerForTests;
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new AiAssistantProviderUnavailableError('OpenAI is not configured.');
  return new OpenAiAssistantProvider(apiKey);
}

export function setAiAssistantProviderForTests(provider: AiAssistantProvider | null): void {
  providerForTests = provider;
}
