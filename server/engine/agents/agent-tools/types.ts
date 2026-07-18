import { z } from 'zod';

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'any']),
  description: z.string().default(''),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
  enum: z.array(z.string()).optional(),
  items: z.object({
    type: z.string(),
  }).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), ToolParameterSchema).default({}),
  returns: z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'any']).default('any'),
    description: z.string().default(''),
  }).default({ type: 'any', description: '' }),
  tags: z.array(z.string()).default([]),
  category: z.string().default('general'),
  deprecated: z.boolean().default(false),
  version: z.string().default('1.0.0'),
  requiresAuth: z.boolean().default(false),
  timeoutMs: z.number().min(100).default(30000),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

export interface ToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResult {
  id: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
}

export interface ToolExecutorOptions {
  timeoutMs?: number;
  maxRetries?: number;
  context?: Record<string, unknown>;
  continueOnError?: boolean;
}