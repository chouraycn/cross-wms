/**
 * Subagent Spawn Model Session — 模型会话
 *
 * 处理子代理的模型绑定和会话管理。
 */

import { logger } from '../../logger.js';
import type { SpawnOptions, SpawnContext, SpawnResult } from './subagent-spawn.types.js';
import { spawnSubagent } from './subagent-spawn.js';
import { resolveSpawnContext } from './subagent-spawn.context.js';

export interface ModelSessionOptions {
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
}

export async function spawnModelSessionSubagent(
  options: SpawnOptions,
  context: SpawnContext,
  modelOptions: ModelSessionOptions = {},
): Promise<SpawnResult> {
  if (!context.agentSessionKey) {
    return {
      status: 'error',
      error: 'agentSessionKey is required for model-session spawn',
    };
  }

  const resolvedContext = resolveSpawnContext(context, options, {
    inheritTools: true,
    inheritWorkspace: true,
    inheritMembership: true,
  });

  if (resolvedContext.warnings.length > 0) {
    for (const warning of resolvedContext.warnings) {
      logger.warn(`[SubagentSpawn] ${warning}`);
    }
  }

  const spawnOptions: SpawnOptions = {
    ...options,
    mode: options.mode ?? 'run',
    model: modelOptions.model ?? options.model,
  };

  const spawnContext: SpawnContext = {
    ...resolvedContext.inheritedContext,
  };

  const result = await spawnSubagent(spawnOptions, spawnContext);

  if (result.status === 'accepted' && modelOptions.model) {
    result.resolvedModel = modelOptions.model;
    result.modelApplied = true;
  }

  logger.debug(
    `[SubagentSpawn] Spawned model-session subagent with model: ${result.resolvedModel ?? 'default'}`,
  );

  return result;
}

export function resolveModel(
  requestedModel?: string,
  provider?: string,
): { model?: string; provider?: string; error?: string } {
  if (!requestedModel) {
    return {};
  }

  if (requestedModel.includes('/')) {
    const [providerPart, modelPart] = requestedModel.split('/');
    return {
      model: modelPart,
      provider: providerPart,
    };
  }

  if (provider) {
    return {
      model: requestedModel,
      provider,
    };
  }

  return {
    model: requestedModel,
  };
}

export function validateModelConfiguration(model?: string, provider?: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (model && model.length > 256) {
    errors.push('Model name exceeds 256 characters');
  }

  if (provider && provider.length > 64) {
    errors.push('Provider name exceeds 64 characters');
  }

  if (model && !/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?$/.test(model)) {
    errors.push('Invalid model name format');
  }

  return { valid: errors.length === 0, errors };
}