import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { aiStructuredRecipeSchema } from '@/lib/domain/ai';
import {
  aiMealPlanCandidateSchema,
  aiMealPlanStructuredOutputSchema,
  aiSummaryOutputSchema,
  type AiMealPlanCandidate,
  type AiReasoningEffort,
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
  }): Promise<AssistantProviderResult>;
  generateMealPlan(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    context: unknown;
    safetyIdentifier: string;
  }): Promise<AiMealPlanCandidate>;
  generateRecipe(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    context: unknown;
    safetyIdentifier: string;
  }): Promise<RecipeInput>;
  generateRecipes?(
    inputs: Array<Parameters<AiAssistantProvider['generateRecipe']>[0]>,
  ): Promise<RecipeInput[]>;
  generateSummary(input: {
    model: string;
    reasoningEffort: AiReasoningEffort | null;
    instructions: string;
    evidence: unknown;
    safetyIdentifier: string;
  }): Promise<{
    headline: string;
    body: string;
    highlights: string[];
    caveats: string[];
  }>;
}

export class AiAssistantProviderUnavailableError extends Error {}
export class AiAssistantProviderResponseError extends Error {}

type ResponsesClient = {
  create(request: unknown): Promise<{
    output?: Array<Record<string, unknown>>;
    output_text?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  }>;
  parse(request: unknown): Promise<{
    output_parsed: unknown;
  }>;
};

function reasoning(effort: AiReasoningEffort | null) {
  return effort ? { reasoning: { effort } } : {};
}

export class OpenAiAssistantProvider implements AiAssistantProvider {
  private readonly responses: ResponsesClient;

  constructor(apiKey: string, client?: ResponsesClient) {
    this.responses =
      client ?? (new OpenAI({ apiKey }) as unknown as { responses: ResponsesClient }).responses;
  }

  async respond(input: Parameters<AiAssistantProvider['respond']>[0]) {
    try {
      const response = await this.responses.create({
        model: input.model,
        instructions: input.instructions,
        input: input.messages,
        tools: input.tools,
        store: false,
        safety_identifier: input.safetyIdentifier,
        ...reasoning(input.reasoningEffort),
      });
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
      if (error instanceof AiAssistantProviderResponseError) throw error;
      throw new AiAssistantProviderResponseError('OpenAI could not complete that chat turn.');
    }
  }

  async generateMealPlan(input: Parameters<AiAssistantProvider['generateMealPlan']>[0]) {
    try {
      const response = await this.responses.parse({
        model: input.model,
        instructions: input.instructions,
        input: [
          {
            role: 'user',
            content: `Untrusted household planning context follows:\n${JSON.stringify(input.context)}`,
          },
        ],
        text: { format: zodTextFormat(aiMealPlanStructuredOutputSchema, 'meal_plan_candidate') },
        store: false,
        safety_identifier: input.safetyIdentifier,
        ...reasoning(input.reasoningEffort),
      });
      return aiMealPlanCandidateSchema.parse(response.output_parsed);
    } catch {
      throw new AiAssistantProviderResponseError('OpenAI could not create a valid meal plan.');
    }
  }

  async generateRecipe(input: Parameters<AiAssistantProvider['generateRecipe']>[0]) {
    try {
      const response = await this.responses.parse({
        model: input.model,
        instructions: input.instructions,
        input: [
          {
            role: 'user',
            content: `Untrusted household recipe context follows:\n${JSON.stringify(input.context)}`,
          },
        ],
        text: { format: zodTextFormat(aiStructuredRecipeSchema, 'generated_recipe') },
        store: false,
        safety_identifier: input.safetyIdentifier,
        ...reasoning(input.reasoningEffort),
      });
      return recipeInputSchema.parse(response.output_parsed);
    } catch {
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

  async generateSummary(input: Parameters<AiAssistantProvider['generateSummary']>[0]) {
    try {
      const response = await this.responses.parse({
        model: input.model,
        instructions: input.instructions,
        input: [
          {
            role: 'user',
            content: `Untrusted recorded evidence follows:\n${JSON.stringify(input.evidence)}`,
          },
        ],
        text: { format: zodTextFormat(aiSummaryOutputSchema, 'periodic_summary') },
        store: false,
        safety_identifier: input.safetyIdentifier,
        ...reasoning(input.reasoningEffort),
      });
      return aiSummaryOutputSchema.parse(response.output_parsed);
    } catch {
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
