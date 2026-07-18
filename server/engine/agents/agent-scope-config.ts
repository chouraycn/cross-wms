import { z } from 'zod';
import { logger } from '../../logger.js';
import { createScope, type AgentScope } from './agent-scope.js';

export const ScopeConfigSchema = z.object({
  defaultScopeType: z.enum(['global', 'project', 'session', 'agent', 'user']).default('session'),
  defaultAllowedTools: z.array(z.string()).default([]),
  defaultDeniedTools: z.array(z.string()).default([]),
  defaultAllowedPaths: z.array(z.string()).default([]),
  defaultDeniedPaths: z.array(z.string()).default([]),
  defaultMaxTokens: z.number().optional(),
  defaultMaxDurationMs: z.number().optional(),
  defaultMaxToolCalls: z.number().optional(),
  scopeInheritance: z.boolean().default(true),
  autoCreateSessionScopes: z.boolean().default(true),
});

export type ScopeConfig = z.infer<typeof ScopeConfigSchema>;

let currentConfig: ScopeConfig = ScopeConfigSchema.parse({});

export function setScopeConfig(config: Partial<ScopeConfig>): ScopeConfig {
  currentConfig = {
    ...currentConfig,
    ...config,
  };
  logger.debug('[Agents:ScopeConfig] Updated scope config');
  return currentConfig;
}

export function getScopeConfig(): ScopeConfig {
  return { ...currentConfig };
}

export function createDefaultScope(scopeId: string, name: string, type?: AgentScope['type']): AgentScope {
  const scopeType = type ?? currentConfig.defaultScopeType;
  
  return createScope({
    id: scopeId,
    name,
    type: scopeType,
    allowedTools: [...currentConfig.defaultAllowedTools],
    deniedTools: [...currentConfig.defaultDeniedTools],
    allowedPaths: [...currentConfig.defaultAllowedPaths],
    deniedPaths: [...currentConfig.defaultDeniedPaths],
    maxTokens: currentConfig.defaultMaxTokens,
    maxDurationMs: currentConfig.defaultMaxDurationMs,
    maxToolCalls: currentConfig.defaultMaxToolCalls,
  });
}

export function createSessionScope(sessionId: string, agentId: string): AgentScope {
  return createDefaultScope(
    `session:${sessionId}`,
    `Session ${sessionId.slice(0, 8)}`,
    'session',
  );
}

export function createAgentScope(agentId: string): AgentScope {
  return createDefaultScope(
    `agent:${agentId}`,
    `Agent ${agentId}`,
    'agent',
  );
}

export function resetScopeConfig(): void {
  currentConfig = ScopeConfigSchema.parse({});
  logger.debug('[Agents:ScopeConfig] Reset scope config to defaults');
}

logger.debug('[Agents:AgentScopeConfig] Module loaded');
