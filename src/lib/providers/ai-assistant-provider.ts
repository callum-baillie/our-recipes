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
      output?: Array<Record<string, unknown>>;
      output_text?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
  create(
    request: unknown,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<{
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

function reasoning(effort: AiReasoningEffort | null) {
  return effort ? { reasoning: { effort } } : {};
}

export class OpenAiAssistantProvider implements AiAssistantProvider {
  private readonly responses: ResponsesClient;

  constructor(apiKey: string, client?: ResponsesClient) {
    this.responses =
      client ??
      (
        new OpenAI({ apiKey, maxRetries: 0, timeout: 120_000 }) as unknown as {
          responses: ResponsesClient;
        }
      ).responses;
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
        input: input.messages,
        include: ['reasoning.encrypted_content'],
        tools: input.tools.map((tool) => ({
          ...tool,
          parameters: normalizeOpenAiToolSchema(tool.parameters) as Record<string, unknown>,
        })),
        store: false,
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
          throw new AiAssistantProviderResponseError(
            'The response ended before completion. Review the conversation before trying again.',
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
        responseItems: output,
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
      const response = await this.responses.parse(
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
          text: { format: zodTextFormat(aiMealPlanStructuredOutputSchema, 'meal_plan_candidate') },
          store: false,
          max_output_tokens: input.maxOutputTokens ?? 4096,
          safety_identifier: input.safetyIdentifier,
          ...reasoning(input.reasoningEffort),
        },
        { signal: input.signal, timeout: (input.requestTimeoutSeconds ?? 180) * 1000 },
      );
      input.signal?.throwIfAborted();
      return aiMealPlanCandidateSchema.parse(response.output_parsed);
    } catch {
      input.signal?.throwIfAborted();
      throw new AiAssistantProviderResponseError('OpenAI could not create a valid meal plan.');
    }
  }

  async generateRecipe(input: Parameters<AiAssistantProvider['generateRecipe']>[0]) {
    try {
      input.signal?.throwIfAborted();
      const response = await this.responses.parse(
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
    } catch {
      input.signal?.throwIfAborted();
      throw new AiAssistantProviderResponseError('OpenAI could not create a valid recipe.');
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
      const response = await this.responses.parse(
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
    } catch {
      input.signal?.throwIfAborted();
      throw new AiAssistantProviderResponseError('OpenAI could not create a valid summary.');
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
