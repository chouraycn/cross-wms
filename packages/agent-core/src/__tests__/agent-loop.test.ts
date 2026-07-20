import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentEventSink } from '../agent-loop';
import type { AgentMessage, AgentRuntimeDeps, ToolCall, ToolDefinition } from '../types';

const msg = (content: string): AgentMessage => ({ role: 'user', content, timestamp: Date.now() });

function runtimeReturning(content: string, toolCalls?: ToolCall[]): AgentRuntimeDeps {
  return {
    completeSimple: async () => ({ content, toolCalls, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } as any }),
    streamSimple: async function* () {},
  };
}

const echoTool: ToolDefinition = {
  name: 'echo',
  description: 'echo tool',
  parameters: { type: 'object' },
};

describe('AgentLoop', () => {
  it('should return final content when no tool calls', async () => {
    const events: unknown[] = [];
    const emit: AgentEventSink = (e) => { events.push(e); };
    const result = await runAgentLoop(
      [msg('hello')],
      { systemPrompt: '', messages: [msg('hello')] },
      { model: { id: 'm', name: 'm', api: 'openai', provider: 'default' }, convertToLlm: async (m) => m as any[] },
      emit,
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('should emit agent_start and agent_end events', async () => {
    const events: unknown[] = [];
    const emit: AgentEventSink = (e) => { events.push(e); };
    await runAgentLoop(
      [msg('hello')],
      { systemPrompt: '', messages: [msg('hello')] },
      { model: { id: 'm', name: 'm', api: 'openai', provider: 'default' }, convertToLlm: async (m) => m as any[] },
      emit,
    );
    expect(events.some((e: any) => e.type === 'agent_start')).toBe(true);
    expect(events.some((e: any) => e.type === 'agent_end')).toBe(true);
  });
});
