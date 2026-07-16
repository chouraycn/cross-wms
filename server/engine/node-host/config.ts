import { logger } from '../../logger.js';

export type NodeHostConfig = {
  nodeId: string;
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  capabilities?: string[];
  platform?: string;
};

export function resolveNodeHostConfig(raw?: Partial<NodeHostConfig>): NodeHostConfig {
  return {
    nodeId: raw?.nodeId ?? `node-${Date.now()}`,
    baseUrl: raw?.baseUrl ?? process.env.NODE_HOST_URL,
    token: raw?.token ?? process.env.NODE_HOST_TOKEN,
    timeoutMs: raw?.timeoutMs ?? 30_000,
    maxRetries: raw?.maxRetries ?? 3,
    capabilities: raw?.capabilities ?? [],
    platform: raw?.platform ?? 'auto',
  };
}

export function validateNodeHostConfig(config: NodeHostConfig): string[] {
  const errors: string[] = [];
  if (!config.nodeId) errors.push('nodeId is required');
  if (config.baseUrl && !config.baseUrl.startsWith('http')) errors.push('baseUrl must start with http or https');
  if (config.timeoutMs !== undefined && config.timeoutMs < 1000) errors.push('timeoutMs must be at least 1000ms');
  if (config.maxRetries !== undefined && config.maxRetries < 0) errors.push('maxRetries must be non-negative');
  if (errors.length > 0) {
    logger.warn(`[NodeHost] Config validation failed: ${errors.join(', ')}`);
  }
  return errors;
}
