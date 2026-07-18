import { z } from 'zod';
import { logger } from '../../logger.js';

export const McpTransportConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['stdio', 'http', 'sse', 'websocket']),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().default(30000),
  maxRetries: z.number().default(3),
  retryDelayMs: z.number().default(1000),
  headers: z.record(z.string(), z.string()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const McpStdioTransportConfigSchema = McpTransportConfigSchema.extend({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
});

export const McpHttpTransportConfigSchema = McpTransportConfigSchema.extend({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['POST', 'GET']).default('POST'),
});

export const McpSseTransportConfigSchema = McpTransportConfigSchema.extend({
  type: z.literal('sse'),
  url: z.string().url(),
});

export const McpWebsocketTransportConfigSchema = McpTransportConfigSchema.extend({
  type: z.literal('websocket'),
  url: z.string().url(),
  reconnect: z.boolean().default(true),
  reconnectDelayMs: z.number().default(3000),
});

export type McpTransportConfig = z.infer<typeof McpTransportConfigSchema>;
export type McpStdioTransportConfig = z.infer<typeof McpStdioTransportConfigSchema>;
export type McpHttpTransportConfig = z.infer<typeof McpHttpTransportConfigSchema>;
export type McpSseTransportConfig = z.infer<typeof McpSseTransportConfigSchema>;
export type McpWebsocketTransportConfig = z.infer<typeof McpWebsocketTransportConfigSchema>;

const configStore = new Map<string, McpTransportConfig>();

export function registerTransportConfig(config: McpTransportConfig): void {
  let schema;
  switch (config.type) {
    case 'stdio':
      schema = McpStdioTransportConfigSchema;
      break;
    case 'http':
      schema = McpHttpTransportConfigSchema;
      break;
    case 'sse':
      schema = McpSseTransportConfigSchema;
      break;
    case 'websocket':
      schema = McpWebsocketTransportConfigSchema;
      break;
    default:
      schema = McpTransportConfigSchema;
  }

  const result = schema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid MCP transport config: ${result.error.message}`);
  }

  configStore.set(config.id, result.data as McpTransportConfig);
  logger.debug(`[Agents:McpTransportConfig] Registered transport: ${config.id} (${config.type})`);
}

export function getTransportConfig(id: string): McpTransportConfig | undefined {
  return configStore.get(id);
}

export function listTransportConfigs(): McpTransportConfig[] {
  return Array.from(configStore.values());
}

export function updateTransportConfig(id: string, updates: Partial<McpTransportConfig>): McpTransportConfig | undefined {
  const existing = configStore.get(id);
  if (!existing) return undefined;

  const updated: McpTransportConfig = {
    ...existing,
    ...updates,
    id,
  } as McpTransportConfig;

  configStore.set(id, updated);
  logger.debug(`[Agents:McpTransportConfig] Updated transport: ${id}`);
  return updated;
}

export function deleteTransportConfig(id: string): boolean {
  const existed = configStore.has(id);
  if (existed) {
    configStore.delete(id);
    logger.debug(`[Agents:McpTransportConfig] Deleted transport: ${id}`);
  }
  return existed;
}

export function getTransportConfigsByType(type: McpTransportConfig['type']): McpTransportConfig[] {
  return listTransportConfigs().filter(c => c.type === type && c.enabled);
}

export function createStdioConfig(params: {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}): McpStdioTransportConfig {
  return McpStdioTransportConfigSchema.parse({
    id: params.id,
    name: params.name,
    type: 'stdio',
    command: params.command,
    args: params.args ?? [],
    cwd: params.cwd,
    env: params.env ?? {},
    timeoutMs: params.timeoutMs ?? 30000,
    maxRetries: params.maxRetries ?? 3,
  });
}

export function createHttpConfig(params: {
  id: string;
  name: string;
  url: string;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}): McpHttpTransportConfig {
  return McpHttpTransportConfigSchema.parse({
    id: params.id,
    name: params.name,
    type: 'http',
    url: params.url,
    method: params.method ?? 'POST',
    headers: params.headers ?? {},
    timeoutMs: params.timeoutMs ?? 30000,
    maxRetries: params.maxRetries ?? 3,
  });
}

export function clearTransportConfigs(): void {
  configStore.clear();
}

logger.debug('[Agents:McpTransportConfig] Module loaded');
