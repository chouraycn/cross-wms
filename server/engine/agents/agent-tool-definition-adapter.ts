import { z } from 'zod';
import { logger } from '../../logger.js';
import type { ToolDefinition } from './tool-catalog.js';

export interface OpenAIFunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export function toOpenAIFunction(tool: ToolDefinition): OpenAIFunctionDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} },
  };
}

export function fromOpenAIFunction(fn: OpenAIFunctionDefinition): ToolDefinition {
  return {
    name: fn.name,
    description: fn.description ?? '',
    parameters: fn.parameters,
    inputSchema: fn.parameters,
    tags: [],
    category: 'general',
    deprecated: false,
    version: '1.0.0',
  };
}

export function toAnthropicTool(tool: ToolDefinition): AnthropicToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
  };
}

export function fromAnthropicTool(tool: AnthropicToolDefinition): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.input_schema,
    inputSchema: tool.input_schema,
    tags: [],
    category: 'general',
    deprecated: false,
    version: '1.0.0',
  };
}

export function toOpenAIFunctions(tools: ToolDefinition[]): OpenAIFunctionDefinition[] {
  return tools.map(toOpenAIFunction);
}

export function fromOpenAIFunctions(fns: OpenAIFunctionDefinition[]): ToolDefinition[] {
  return fns.map(fromOpenAIFunction);
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export function toMCPTool(tool: ToolDefinition): MCPToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || tool.parameters || { type: 'object', properties: {} },
  };
}

export function fromMCPTool(tool: MCPToolDefinition): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.inputSchema,
    inputSchema: tool.inputSchema,
    tags: [],
    category: 'general',
    deprecated: false,
    version: '1.0.0',
  };
}

export function validateToolDefinition(tool: unknown): tool is ToolDefinition {
  const schema = z.object({
    name: z.string(),
    description: z.string().default(''),
    parameters: z.record(z.string(), z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
    category: z.string().default('general'),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    deprecated: z.boolean().default(false),
    version: z.string().default('1.0.0'),
  });
  
  return schema.safeParse(tool).success;
}

export function normalizeToolDefinition(tool: Record<string, unknown>): ToolDefinition {
  return {
    name: String(tool.name ?? 'unknown'),
    description: String(tool.description ?? ''),
    parameters: (tool.parameters as Record<string, unknown>) || {},
    inputSchema: (tool.inputSchema as Record<string, unknown>) || undefined,
    outputSchema: (tool.outputSchema as Record<string, unknown>) || undefined,
    tags: Array.isArray(tool.tags) ? tool.tags as string[] : [],
    category: String(tool.category ?? 'general'),
    deprecated: Boolean(tool.deprecated ?? false),
    version: String(tool.version ?? '1.0.0'),
  };
}

export function mergeToolDefinitions(tools: ToolDefinition[]): ToolDefinition[] {
  const seen = new Map<string, ToolDefinition>();
  
  for (const tool of tools) {
    const existing = seen.get(tool.name);
    if (!existing) {
      seen.set(tool.name, tool);
    } else {
      seen.set(tool.name, {
        ...existing,
        ...tool,
        tags: [...new Set([...existing.tags, ...tool.tags])],
      });
    }
  }
  
  return Array.from(seen.values());
}

logger.debug('[Agents:AgentToolDefinitionAdapter] Module loaded');
