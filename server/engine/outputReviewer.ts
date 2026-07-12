import { z } from 'zod';
import { logger } from '../logger.js';
import { DEFAULT_OUTPUT_REVIEWER_SYSTEM_PROMPT } from './outputReviewer.prompt.js';
import { callAIModel, type ModelCallConfig } from '../aiClient.js';
import { loadModelsConfig } from '../modelsStore.js';

export type OutputQuality = 'A' | 'B' | 'C' | 'D';

export interface OutputReviewDecision {
  quality: OutputQuality;
  issues: string[];
  suggestion: string;
}

export interface OutputReviewInput {
  userQuestion: string;
  aiResponse: string;
  context?: string;
  model?: string;
}

const outputReviewResponseSchema = z.object({
  quality: z.enum(['A', 'B', 'C', 'D']),
  issues: z.array(z.string()).optional().default([]),
  suggestion: z.string().optional().default(''),
});

const DEFAULT_REVIEWER_MODEL_ID = 'auto';
const REVIEWER_TIMEOUT_MS = 30_000;
const REVIEWER_MAX_TOKENS = 1024;
const REVIEWER_TEMPERATURE = 0;

function buildReviewerUserPrompt(input: OutputReviewInput): string {
  return [
    'Review this AI output for quality.',
    'User Question:',
    input.userQuestion,
    '',
    'AI Response:',
    input.aiResponse,
    '',
    input.context ? `Context:\n${input.context}` : '',
  ].filter(Boolean).join('\n');
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(text: string): string | null {
  const stripped = stripJsonFence(text);
  if (stripped.startsWith('{') && stripped.endsWith('}')) {
    return stripped;
  }
  return null;
}

export function parseOutputReviewResponse(text: string): OutputReviewDecision {
  const objectText = extractJsonObject(text);
  if (!objectText) {
    logger.warn('Output reviewer returned no parseable JSON');
    return {
      quality: 'C',
      issues: ['reviewer returned no parseable JSON'],
      suggestion: 'Reviewer could not evaluate the response',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    logger.warn('Output reviewer returned malformed JSON');
    return {
      quality: 'C',
      issues: ['reviewer returned malformed JSON'],
      suggestion: 'Reviewer returned invalid JSON',
    };
  }
  const response = outputReviewResponseSchema.safeParse(parsed);
  if (!response.success) {
    logger.warn('Output reviewer returned an unsupported response');
    return {
      quality: 'C',
      issues: ['reviewer returned an unsupported response'],
      suggestion: 'Reviewer response did not match expected schema',
    };
  }
  return {
    quality: response.data.quality,
    issues: response.data.issues ?? [],
    suggestion: response.data.suggestion ?? '',
  };
}

async function resolveReviewerModelConfig(modelId?: string): Promise<ModelCallConfig | null> {
  const modelsConfig = await loadModelsConfig();
  const targetModelId = modelId || DEFAULT_REVIEWER_MODEL_ID;

  if (targetModelId === 'auto') {
    const firstAvailable = modelsConfig.models.find((m) => m.apiKey || (m.provider as string) === 'local');
    if (!firstAvailable) return null;
    return {
      id: firstAvailable.id,
      provider: firstAvailable.provider,
      apiEndpoint: firstAvailable.apiEndpoint,
      apiKey: firstAvailable.apiKey,
      temperature: REVIEWER_TEMPERATURE,
      maxTokens: REVIEWER_MAX_TOKENS,
      contextWindow: firstAvailable.contextWindow,
      capabilities: firstAvailable.capabilities,
      compatConfig: firstAvailable.compatConfig,
      apiType: firstAvailable.apiType,
    };
  }

  const found = modelsConfig.models.find((m) => m.id === targetModelId);
  if (!found) return null;
  return {
    id: found.id,
    provider: found.provider,
    apiEndpoint: found.apiEndpoint,
    apiKey: found.apiKey,
    temperature: REVIEWER_TEMPERATURE,
    maxTokens: REVIEWER_MAX_TOKENS,
    contextWindow: found.contextWindow,
    capabilities: found.capabilities,
    compatConfig: found.compatConfig,
    apiType: found.apiType,
  };
}

export class OutputReviewer {
  private enabled: boolean;
  private threshold: OutputQuality;
  private modelId: string;

  constructor(enabled: boolean = false, threshold: OutputQuality = 'C', modelId: string = DEFAULT_REVIEWER_MODEL_ID) {
    this.enabled = enabled;
    this.threshold = threshold;
    this.modelId = modelId;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getThreshold(): OutputQuality {
    return this.threshold;
  }

  setThreshold(threshold: OutputQuality): void {
    this.threshold = threshold;
  }

  getModelId(): string {
    return this.modelId;
  }

  setModelId(modelId: string): void {
    this.modelId = modelId;
  }

  private qualityToScore(quality: OutputQuality): number {
    const scores: Record<OutputQuality, number> = { A: 4, B: 3, C: 2, D: 1 };
    return scores[quality];
  }

  isQualityAcceptable(quality: OutputQuality): boolean {
    return this.qualityToScore(quality) >= this.qualityToScore(this.threshold);
  }

  async review(input: OutputReviewInput): Promise<OutputReviewDecision> {
    if (!this.enabled) {
      return {
        quality: 'A',
        issues: [],
        suggestion: 'Reviewer is disabled',
      };
    }

    logger.info('Starting output review for:', {
      questionLength: input.userQuestion.length,
      responseLength: input.aiResponse.length,
    });

    const decision = await this.performReview(input);
    
    if (decision.quality === 'D') {
      logger.warn('Output review failed with D quality:', decision);
    } else if (!this.isQualityAcceptable(decision.quality)) {
      logger.warn('Output review below threshold:', decision);
    }

    return decision;
  }

  private async performReview(input: OutputReviewInput): Promise<OutputReviewDecision> {
    const prompt = buildReviewerUserPrompt(input);
    
    try {
      const response = await this.callReviewModel(prompt);
      return parseOutputReviewResponse(response);
    } catch (err) {
      logger.error('Output reviewer model call failed:', err);
      return {
        quality: 'C',
        issues: ['reviewer model call failed'],
        suggestion: 'Failed to review output due to model error',
      };
    }
  }

  private async callReviewModel(prompt: string): Promise<string> {
    const modelConfig = await resolveReviewerModelConfig(this.modelId);
    if (!modelConfig) {
      logger.warn('No reviewer model available, skipping review');
      return '';
    }

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), REVIEWER_TIMEOUT_MS);

    try {
      const messages = [
        { role: 'system', content: DEFAULT_OUTPUT_REVIEWER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ];

      const response = await callAIModel(modelConfig, messages, abortController.signal);
      return response;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        logger.warn('Output reviewer timed out');
        return '';
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export const outputReviewer = new OutputReviewer();
