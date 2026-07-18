import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { ToolDefinition, ToolParameter } from './types.js';
import { ToolDefinitionSchema, ToolParameterSchema } from './types.js';

export function createToolDefinition(params: {
  name: string;
  description: string;
  parameters?: Record<string, Partial<ToolParameter>>;
  returns?: {
    type?: ToolDefinition['returns']['type'];
    description?: string;
  };
  tags?: string[];
  category?: string;
  deprecated?: boolean;
  version?: string;
  requiresAuth?: boolean;
  timeoutMs?: number;
}): ToolDefinition {
  const normalizedParams: Record<string, ToolParameter> = {};
  for (const [key, param] of Object.entries(params.parameters ?? {})) {
    normalizedParams[key] = ToolParameterSchema.parse({
      name: key,
      ...param,
    });
  }

  return ToolDefinitionSchema.parse({
    name: params.name,
    description: params.description,
    parameters: normalizedParams,
    returns: params.returns ?? { type: 'any' },
    tags: params.tags ?? [],
    category: params.category ?? 'general',
    deprecated: params.deprecated ?? false,
    version: params.version ?? '1.0.0',
    requiresAuth: params.requiresAuth ?? false,
    timeoutMs: params.timeoutMs ?? 30000,
  });
}

export function validateToolDefinition(definition: Partial<ToolDefinition>): {
  valid: boolean;
  errors?: string[];
} {
  const result = ToolDefinitionSchema.safeParse(definition);
  if (result.success) {
    return { valid: true };
  }

  const issues = result.error.issues as Array<{ path: string[]; message: string }>;
  const errors = issues.map(e => `${e.path.join('.')}: ${e.message}`);
  logger.debug(`[Agents:ToolDefinition] Validation errors: ${errors.join(', ')}`);
  return { valid: false, errors };
}

export function normalizeToolDefinition(definition: Partial<ToolDefinition>): ToolDefinition {
  return ToolDefinitionSchema.parse(definition);
}

export function mergeToolDefinitions(base: ToolDefinition, override: Partial<ToolDefinition>): ToolDefinition {
  const mergedParams = { ...base.parameters };
  for (const [key, param] of Object.entries(override.parameters ?? {})) {
    mergedParams[key] = { ...base.parameters[key], ...param, name: key };
  }

  return ToolDefinitionSchema.parse({
    ...base,
    ...override,
    parameters: mergedParams,
  });
}

export function toOpenAIFunction(definition: ToolDefinition): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(definition.parameters)) {
    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      array: 'array',
      object: 'object',
      any: 'string',
    };

    properties[name] = {
      type: typeMap[param.type] ?? 'string',
      description: param.description,
    };

    if (param.enum) {
      (properties[name] as Record<string, unknown>).enum = param.enum;
    }

    if (param.required) {
      required.push(name);
    }
  }

  return {
    name: definition.name,
    description: definition.description,
    parameters: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

export function fromOpenAIFunction(func: {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}): ToolDefinition {
  const params: Record<string, Partial<ToolParameter>> = {};

  if (func.parameters?.properties) {
    for (const [name, prop] of Object.entries(func.parameters.properties as Record<string, unknown>)) {
      const propObj = prop as Record<string, unknown>;
      params[name] = {
        type: (propObj.type as string) as ToolParameter['type'] ?? 'string',
        description: (propObj.description as string) ?? '',
        required: (Array.isArray(func.parameters?.required) && func.parameters.required.includes(name)) ?? false,
      };

      if (propObj.enum) {
        params[name].enum = propObj.enum as string[];
      }
    }
  }

  return createToolDefinition({
    name: func.name,
    description: func.description,
    parameters: params,
  });
}

logger.debug('[Agents:ToolDefinition] Module loaded');