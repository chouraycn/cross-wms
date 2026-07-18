import { z } from 'zod';

export const AgentContextSchema = z.object({
  agentId: z.string(),
  sessionId: z.string(),
  workspaceDir: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  memory: z.record(z.string(), z.unknown()).default({}),
  startTime: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export interface ContextSnapshot {
  context: AgentContext;
  timestamp: number;
  version: number;
}

export interface ContextPropagationOptions {
  includeEnv?: boolean;
  includeMemory?: boolean;
  includeMetadata?: boolean;
  includeWorkspace?: boolean;
}