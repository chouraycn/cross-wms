/**
 * 工具支持检测 — 模型工具调用能力检测
 *
 * 检测和管理模型的工具调用支持情况，
 * 包括 function calling、tool use 等能力。
 */

import { logger } from '../../logger.js';
import { normalizeProviderId, normalizeModelId } from './model-selection-normalize.js';

export type ToolSupportLevel = 'full' | 'partial' | 'none' | 'unknown';

export interface ToolCapabilities {
  functionCalling: boolean;
  parallelToolCalls: boolean;
  streamingToolCalls: boolean;
  structuredOutput: boolean;
  jsonMode: boolean;
  codeInterpreter: boolean;
  webSearch: boolean;
  fileSearch: boolean;
  maxToolsPerRequest: number;
  maxToolNameLength: number;
  maxToolDescriptionLength: number;
  supportsNestedObjects: boolean;
  supportsOptionalParameters: boolean;
  supportsArrayParameters: boolean;
}

export interface ToolSupportInfo {
  modelId: string;
  provider: string;
  supportLevel: ToolSupportLevel;
  capabilities: ToolCapabilities;
  toolUseStyle: 'openai-functions' | 'anthropic-tools' | 'google-function-calling' | 'custom' | 'unknown';
  notes?: string[];
  knownLimitations?: string[];
}

const DEFAULT_CAPABILITIES: ToolCapabilities = {
  functionCalling: false,
  parallelToolCalls: false,
  streamingToolCalls: false,
  structuredOutput: false,
  jsonMode: false,
  codeInterpreter: false,
  webSearch: false,
  fileSearch: false,
  maxToolsPerRequest: 128,
  maxToolNameLength: 64,
  maxToolDescriptionLength: 1024,
  supportsNestedObjects: false,
  supportsOptionalParameters: false,
  supportsArrayParameters: false,
};

const PROVIDER_TOOL_SUPPORT: Record<string, Partial<ToolSupportInfo>> = {
  anthropic: {
    supportLevel: 'full',
    toolUseStyle: 'anthropic-tools',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: true,
      streamingToolCalls: true,
      structuredOutput: false,
      jsonMode: false,
      codeInterpreter: false,
      webSearch: false,
      fileSearch: false,
      maxToolsPerRequest: 128,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 1024,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  openai: {
    supportLevel: 'full',
    toolUseStyle: 'openai-functions',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: true,
      streamingToolCalls: true,
      structuredOutput: true,
      jsonMode: true,
      codeInterpreter: true,
      webSearch: true,
      fileSearch: true,
      maxToolsPerRequest: 128,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 512,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  google: {
    supportLevel: 'full',
    toolUseStyle: 'google-function-calling',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: true,
      streamingToolCalls: true,
      structuredOutput: true,
      jsonMode: true,
      codeInterpreter: false,
      webSearch: true,
      fileSearch: false,
      maxToolsPerRequest: 64,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 1024,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  deepseek: {
    supportLevel: 'full',
    toolUseStyle: 'openai-functions',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: false,
      streamingToolCalls: true,
      structuredOutput: false,
      jsonMode: true,
      codeInterpreter: false,
      webSearch: false,
      fileSearch: false,
      maxToolsPerRequest: 64,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 1024,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  mistral: {
    supportLevel: 'partial',
    toolUseStyle: 'openai-functions',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: false,
      streamingToolCalls: false,
      structuredOutput: false,
      jsonMode: true,
      codeInterpreter: false,
      webSearch: false,
      fileSearch: false,
      maxToolsPerRequest: 32,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 1024,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  groq: {
    supportLevel: 'partial',
    toolUseStyle: 'openai-functions',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: false,
      streamingToolCalls: true,
      structuredOutput: false,
      jsonMode: true,
      codeInterpreter: false,
      webSearch: false,
      fileSearch: false,
      maxToolsPerRequest: 32,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 1024,
      supportsNestedObjects: true,
      supportsOptionalParameters: true,
      supportsArrayParameters: true,
    },
  },
  ollama: {
    supportLevel: 'partial',
    toolUseStyle: 'openai-functions',
    capabilities: {
      functionCalling: true,
      parallelToolCalls: false,
      streamingToolCalls: false,
      structuredOutput: false,
      jsonMode: false,
      codeInterpreter: false,
      webSearch: false,
      fileSearch: false,
      maxToolsPerRequest: 16,
      maxToolNameLength: 64,
      maxToolDescriptionLength: 512,
      supportsNestedObjects: false,
      supportsOptionalParameters: false,
      supportsArrayParameters: true,
    },
  },
};

const MODEL_SPECIFIC_OVERRIDES: Record<string, Partial<ToolSupportInfo>> = {};

export function getToolSupportInfo(
  modelId: string,
  providerId: string,
): ToolSupportInfo {
  const normProvider = normalizeProviderId(providerId);
  const normModel = normalizeModelId(modelId);

  const providerSupport = PROVIDER_TOOL_SUPPORT[normProvider];
  const modelOverride = MODEL_SPECIFIC_OVERRIDES[normModel];

  const capabilities: ToolCapabilities = {
    ...DEFAULT_CAPABILITIES,
    ...providerSupport?.capabilities,
    ...modelOverride?.capabilities,
  };

  const result: ToolSupportInfo = {
    modelId,
    provider: providerId,
    supportLevel: 'unknown',
    capabilities,
    toolUseStyle: 'unknown',
    notes: [],
    knownLimitations: [],
  };

  if (providerSupport) {
    result.supportLevel = providerSupport.supportLevel ?? 'unknown';
    result.toolUseStyle = providerSupport.toolUseStyle ?? 'unknown';
    if (providerSupport.notes) result.notes?.push(...providerSupport.notes);
    if (providerSupport.knownLimitations) result.knownLimitations?.push(...providerSupport.knownLimitations);
  }

  if (modelOverride) {
    if (modelOverride.supportLevel) result.supportLevel = modelOverride.supportLevel;
    if (modelOverride.toolUseStyle) result.toolUseStyle = modelOverride.toolUseStyle;
    if (modelOverride.notes) result.notes?.push(...modelOverride.notes);
    if (modelOverride.knownLimitations) result.knownLimitations?.push(...modelOverride.knownLimitations);
  }

  return result;
}

export function supportsToolCalling(modelId: string, providerId: string): boolean {
  const info = getToolSupportInfo(modelId, providerId);
  return info.capabilities.functionCalling;
}

export function supportsParallelToolCalls(modelId: string, providerId: string): boolean {
  const info = getToolSupportInfo(modelId, providerId);
  return info.capabilities.parallelToolCalls;
}

export function supportsStreamingToolCalls(modelId: string, providerId: string): boolean {
  const info = getToolSupportInfo(modelId, providerId);
  return info.capabilities.streamingToolCalls;
}

export function supportsJsonMode(modelId: string, providerId: string): boolean {
  const info = getToolSupportInfo(modelId, providerId);
  return info.capabilities.jsonMode;
}

export function getToolSupportLevel(
  modelId: string,
  providerId: string,
): ToolSupportLevel {
  return getToolSupportInfo(modelId, providerId).supportLevel;
}

export function filterModelsByToolSupport<T extends { id: string; provider: string }>(
  models: T[],
  required: Partial<ToolCapabilities> = {},
): T[] {
  return models.filter(m => {
    const info = getToolSupportInfo(m.id, m.provider);
    for (const [key, value] of Object.entries(required)) {
      if (value === true && !(info.capabilities as unknown as Record<string, boolean>)[key]) {
        return false;
      }
    }
    return true;
  });
}

export function setModelToolOverride(
  modelId: string,
  override: Partial<ToolSupportInfo>,
): void {
  MODEL_SPECIFIC_OVERRIDES[normalizeModelId(modelId)] = override;
  logger.debug(`[ToolSupport] 设置模型工具覆盖: ${modelId}`);
}

export function setProviderToolSupport(
  providerId: string,
  support: Partial<ToolSupportInfo>,
): void {
  PROVIDER_TOOL_SUPPORT[normalizeProviderId(providerId)] = support;
  logger.debug(`[ToolSupport] 设置 Provider 工具支持: ${providerId}`);
}
