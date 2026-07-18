import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { ToolDefinition, ToolParameter } from './types.js';
import { ToolDefinitionSchema, ToolParameterSchema } from './types.js';

export function generateJsonSchema(definition: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(definition.parameters)) {
    const schema = parameterToJsonSchema(param);
    properties[name] = schema;

    if (param.required) {
      required.push(name);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

export function parameterToJsonSchema(param: ToolParameter): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'array',
    object: 'object',
    any: 'string',
  };

  const schema: Record<string, unknown> = {
    type: typeMap[param.type] ?? 'string',
  };

  if (param.description) {
    schema.description = param.description;
  }

  if (param.default !== undefined) {
    schema.default = param.default;
  }

  if (param.enum) {
    schema.enum = param.enum;
  }

  if (param.type === 'array' && param.items) {
    schema.items = { type: param.items.type };
  }

  if (param.type === 'object' && param.properties) {
    schema.properties = param.properties;
  }

  return schema;
}

export function generateOpenApiSchema(definition: ToolDefinition): {
  operationId: string;
  summary: string;
  description: string;
  parameters?: Array<{
    name: string;
    in: 'query' | 'path' | 'body';
    required: boolean;
    schema: Record<string, unknown>;
  }>;
  requestBody?: {
    content: {
      'application/json': {
        schema: Record<string, unknown>;
      };
    };
  };
  responses: {
    '200': {
      description: string;
      content: {
        'application/json': {
          schema: Record<string, unknown>;
        };
      };
    };
  };
} {
  const parameters: Array<{
    name: string;
    in: 'query' | 'path' | 'body';
    required: boolean;
    schema: Record<string, unknown>;
  }> = [];

  for (const [name, param] of Object.entries(definition.parameters)) {
    parameters.push({
      name,
      in: 'query',
      required: param.required,
      schema: parameterToJsonSchema(param),
    });
  }

  return {
    operationId: definition.name,
    summary: definition.description,
    description: definition.description,
    parameters: parameters.length > 0 ? parameters : undefined,
    responses: {
      '200': {
        description: definition.returns.description || 'Success',
        content: {
          'application/json': {
            schema: {
              type: definition.returns.type,
              description: definition.returns.description,
            },
          },
        },
      },
    },
  };
}

export function validateArguments(definition: ToolDefinition, args: Record<string, unknown>): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  for (const [name, param] of Object.entries(definition.parameters)) {
    const value = args[name];

    if (param.required && value === undefined) {
      errors.push(`Missing required parameter: ${name}`);
      continue;
    }

    if (value !== undefined && !validateParameterValue(value, param)) {
      errors.push(`Invalid value for parameter ${name}: expected ${param.type}`);
    }
  }

  if (errors.length > 0) {
    logger.debug(`[Agents:ToolSchema] Argument validation errors: ${errors.join(', ')}`);
    return { valid: false, errors };
  }

  return { valid: true };
}

function validateParameterValue(value: unknown, param: ToolParameter): boolean {
  switch (param.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null;
    case 'any':
      return true;
    default:
      return true;
  }
}

export function generateGraphqlSchema(definition: ToolDefinition): string {
  const inputFields: string[] = [];
  const typeMap: Record<string, string> = {
    string: 'String',
    number: 'Float',
    boolean: 'Boolean',
    array: '[String]',
    object: 'JSON',
    any: 'JSON',
  };

  for (const [name, param] of Object.entries(definition.parameters)) {
    const suffix = param.required ? '!' : '';
    inputFields.push(`${name}: ${typeMap[param.type]}${suffix}`);
  }

  const returnType = typeMap[definition.returns.type] ?? 'JSON';

  return `
    input ${capitalize(definition.name)}Input {
      ${inputFields.join('\n      ')}
    }

    type Query {
      ${definition.name}(input: ${capitalize(definition.name)}Input!): ${returnType}
    }
  `.trim();
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

logger.debug('[Agents:ToolSchema] Module loaded');