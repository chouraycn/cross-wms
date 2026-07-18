import { logger } from '../../logger.js';
import { getHeaderValue, type HttpRequestLike } from './http-common.js';

export type ModelOverride = {
  model?: string;
  modelProvider?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: string;
};

export type ModelOverrideSource = 'header' | 'query' | 'body' | 'env';

export function extractModelOverrideFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): ModelOverride {
  const override: ModelOverride = {};

  const model = getHeaderValue(headers, 'x-model-override');
  if (model) {
    override.model = model;
  }

  const provider = getHeaderValue(headers, 'x-model-provider-override');
  if (provider) {
    override.modelProvider = provider;
  }

  const baseUrl = getHeaderValue(headers, 'x-model-base-url');
  if (baseUrl) {
    override.baseUrl = baseUrl;
  }

  const temperature = getHeaderValue(headers, 'x-model-temperature');
  if (temperature) {
    const parsed = parseFloat(temperature);
    if (!isNaN(parsed)) {
      override.temperature = parsed;
    }
  }

  const maxTokens = getHeaderValue(headers, 'x-model-max-tokens');
  if (maxTokens) {
    const parsed = parseInt(maxTokens, 10);
    if (!isNaN(parsed)) {
      override.maxTokens = parsed;
    }
  }

  const thinkingLevel = getHeaderValue(headers, 'x-model-thinking-level');
  if (thinkingLevel) {
    override.thinkingLevel = thinkingLevel;
  }

  return override;
}

export function extractModelOverrideFromQuery(
  query: Record<string, string | string[] | undefined>,
): ModelOverride {
  const override: ModelOverride = {};

  const model = typeof query.model === 'string' ? query.model : undefined;
  if (model) {
    override.model = model;
  }

  const provider = typeof query.modelProvider === 'string' ? query.modelProvider : undefined;
  if (provider) {
    override.modelProvider = provider;
  }

  return override;
}

export function extractModelOverrideFromBody(body: unknown): ModelOverride {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const override: ModelOverride = {};
  const bodyObj = body as Record<string, unknown>;

  if (typeof bodyObj.model === 'string') {
    override.model = bodyObj.model;
  }

  if (typeof bodyObj.modelProvider === 'string') {
    override.modelProvider = bodyObj.modelProvider;
  }

  if (typeof bodyObj.temperature === 'number') {
    override.temperature = bodyObj.temperature;
  }

  if (typeof bodyObj.maxTokens === 'number') {
    override.maxTokens = bodyObj.maxTokens;
  }

  if (typeof bodyObj.thinkingLevel === 'string') {
    override.thinkingLevel = bodyObj.thinkingLevel;
  }

  return override;
}

export function mergeModelOverrides(...overrides: ModelOverride[]): ModelOverride {
  const result: ModelOverride = {};
  for (const override of overrides) {
    Object.assign(result, override);
  }
  return result;
}

export function extractModelOverride(req: HttpRequestLike): ModelOverride {
  const headerOverride = extractModelOverrideFromHeaders(req.headers);

  let queryOverride: ModelOverride = {};
  if (req.query) {
    queryOverride = extractModelOverrideFromQuery(req.query);
  }

  let bodyOverride: ModelOverride = {};
  if (req.body) {
    bodyOverride = extractModelOverrideFromBody(req.body);
  }

  return mergeModelOverrides(queryOverride, headerOverride, bodyOverride);
}

export function validateModelOverride(
  override: ModelOverride,
  options?: {
    allowedModels?: string[];
    allowedProviders?: string[];
    maxTemperature?: number;
    minTemperature?: number;
    maxMaxTokens?: number;
  },
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (options?.allowedModels && override.model) {
    if (!options.allowedModels.includes(override.model)) {
      errors.push(`model "${override.model}" is not in allowed models list`);
    }
  }

  if (options?.allowedProviders && override.modelProvider) {
    if (!options.allowedProviders.includes(override.modelProvider)) {
      errors.push(`provider "${override.modelProvider}" is not in allowed providers list`);
    }
  }

  if (override.temperature !== undefined) {
    if (options?.minTemperature !== undefined && override.temperature < options.minTemperature) {
      errors.push(`temperature ${override.temperature} is below minimum ${options.minTemperature}`);
    }
    if (options?.maxTemperature !== undefined && override.temperature > options.maxTemperature) {
      errors.push(`temperature ${override.temperature} is above maximum ${options.maxTemperature}`);
    }
  }

  if (override.maxTokens !== undefined && options?.maxMaxTokens !== undefined) {
    if (override.maxTokens > options.maxMaxTokens) {
      errors.push(`maxTokens ${override.maxTokens} is above maximum ${options.maxMaxTokens}`);
    }
  }

  if (override.baseUrl) {
    try {
      new URL(override.baseUrl);
    } catch {
      errors.push('baseUrl is not a valid URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function applyModelOverride(
  baseConfig: Record<string, unknown>,
  override: ModelOverride,
): Record<string, unknown> {
  const result = { ...baseConfig };

  if (override.model) {
    result.model = override.model;
  }

  if (override.modelProvider) {
    result.modelProvider = override.modelProvider;
  }

  if (override.temperature !== undefined) {
    result.temperature = override.temperature;
  }

  if (override.maxTokens !== undefined) {
    result.maxTokens = override.maxTokens;
  }

  if (override.thinkingLevel) {
    result.thinkingLevel = override.thinkingLevel;
  }

  if (override.baseUrl) {
    result.baseUrl = override.baseUrl;
  }

  return result;
}
