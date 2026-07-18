import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../logger.js';

export const ToolCallIdSchema = z.string().uuid();

export type ToolCallId = z.infer<typeof ToolCallIdSchema>;

const callIdMap = new Map<string, {
  toolName: string;
  agentId: string;
  sessionId: string;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  metadata: Record<string, unknown>;
}>();

export function generateToolCallId(): string {
  return uuidv4();
}

export function registerToolCall(params: {
  toolName: string;
  agentId: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}): string {
  const callId = generateToolCallId();
  callIdMap.set(callId, {
    toolName: params.toolName,
    agentId: params.agentId,
    sessionId: params.sessionId,
    createdAt: Date.now(),
    status: 'pending',
    metadata: params.metadata ?? {},
  });
  logger.debug(`[Agents:ToolCallId] Registered call ${callId} for tool ${params.toolName}`);
  return callId;
}

export function getToolCallInfo(callId: string) {
  return callIdMap.get(callId);
}

export function updateToolCallStatus(
  callId: string,
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  metadata?: Record<string, unknown>,
): boolean {
  const info = callIdMap.get(callId);
  if (!info) return false;

  info.status = status;
  if (metadata) {
    info.metadata = { ...info.metadata, ...metadata };
  }
  return true;
}

export function removeToolCall(callId: string): boolean {
  return callIdMap.delete(callId);
}

export function listToolCallsBySession(sessionId: string): string[] {
  const result: string[] = [];
  for (const [callId, info] of callIdMap.entries()) {
    if (info.sessionId === sessionId) {
      result.push(callId);
    }
  }
  return result;
}

export function listToolCallsByAgent(agentId: string): string[] {
  const result: string[] = [];
  for (const [callId, info] of callIdMap.entries()) {
    if (info.agentId === agentId) {
      result.push(callId);
    }
  }
  return result;
}

export function cleanupOldToolCalls(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let count = 0;
  
  for (const [callId, info] of callIdMap.entries()) {
    if (now - info.createdAt > maxAgeMs && 
        (info.status === 'completed' || info.status === 'failed' || info.status === 'cancelled')) {
      callIdMap.delete(callId);
      count++;
    }
  }
  
  if (count > 0) {
    logger.debug(`[Agents:ToolCallId] Cleaned up ${count} old tool calls`);
  }
  return count;
}

export function clearToolCallIds(): void {
  callIdMap.clear();
}

logger.debug('[Agents:ToolCallId] Module loaded');
