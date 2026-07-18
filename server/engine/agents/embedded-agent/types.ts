import { z } from 'zod';

export const EmbeddedAgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  model: z.string().default('gpt-4o'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).default(4096),
  systemPrompt: z.string().default(''),
  timeoutMs: z.number().min(1000).default(120000),
  enableTools: z.boolean().default(true),
  enableMemory: z.boolean().default(true),
  enabled: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type EmbeddedAgentConfig = z.infer<typeof EmbeddedAgentConfigSchema>;

export interface EmbeddedAgentState {
  agentId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentTask?: string;
  lastActivity?: number;
  error?: string;
}

export interface EmbeddedAgentRunOptions {
  input: string;
  context?: Record<string, unknown>;
  tools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
}

export interface EmbeddedAgentRunResult {
  agentId: string;
  output: string;
  status: 'success' | 'failed' | 'timeout';
  toolCalls?: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
  turnCount: number;
  totalTokens?: {
    input: number;
    output: number;
  };
  durationMs: number;
}