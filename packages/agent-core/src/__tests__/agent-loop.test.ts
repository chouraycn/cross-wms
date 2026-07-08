import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from '../agent-loop';
import type { AgentMessage, AgentRuntimeDeps, ToolCall, ToolDefinition } from '../types';

const msg = (content: string): AgentMessage => ({ id: '1', role: 'user', content, timestamp: Date.now() });

function runtimeReturning(content: string, toolCalls?: ToolCall[]): AgentRuntimeDeps {
  return {
    completeSimple: async () => ({ content, toolCalls, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }),
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
    const loop = new AgentLoop({ runtime: runtimeReturning('done'), model: 'm', maxIterations: 5 });
    const result = await loop.execute({ messages: [msg('hello')], tools: [echoTool] });
    expect(result.content).toBe('done');
    expect(result.iterations).toBe(1);
    expect(result.usage?.totalTokens).toBe(15);
  });

  it('should execute tools and append results across iterations', async () => {
    let call = 0;
    const runtime: AgentRuntimeDeps = {
      completeSimple: async () => {
        call += 1;
        if (call === 1) {
          const tc: ToolCall = { id: 't1', type: 'function', function: { name: 'echo', arguments: '{"x":1}' } };
          return { content: 'call tool', toolCalls: [tc] };
        }
        return { content: 'final answer' };
      },
      streamSimple: async function* () {},
    };
    const loop = new AgentLoop({ runtime, model: 'm', maxIterations: 5 });
    const result = await loop.execute({ messages: [msg('go')], tools: [echoTool] });
    expect(result.content).toBe('final answer');
    expect(result.iterations).toBe(2);
    // system-0 + user + assistant(toolcall) + tool result
    expect(result.messages.some((m) => m.role === 'tool')).toBe(true);
  });

  it('should report unknown tool gracefully', async () => {
    const tc: ToolCall = { id: 't1', type: 'function', function: { name: 'missing', arguments: '{}' } };
    const loop = new AgentLoop({ runtime: runtimeReturning('act', [tc]), model: 'm', maxIterations: 3 });
    const result = await loop.execute({ messages: [msg('go')], tools: [echoTool] });
    const toolMsg = result.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('not found');
  });

  it('should invoke callbacks', async () => {
    const onIteration = vi.fn();
    const onToolCall = vi.fn();
    const tc: ToolCall = { id: 't1', type: 'function', function: { name: 'echo', arguments: '{}' } };
    const loop = new AgentLoop({
      runtime: runtimeReturning('act', [tc]),
      model: 'm',
      maxIterations: 3,
      onIteration,
      onToolCall,
    });
    await loop.execute({ messages: [msg('go')], tools: [echoTool] });
    expect(onIteration).toHaveBeenCalled();
    expect(onToolCall).toHaveBeenCalled();
  });

  it('should throw on abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const loop = new AgentLoop({ runtime: runtimeReturning('x'), model: 'm', maxIterations: 5, signal: controller.signal });
    await expect(loop.execute({ messages: [msg('go')], tools: [] })).rejects.toThrow('aborted');
  });

  it('should prepend system prompt when missing', async () => {
    const loop = new AgentLoop({ runtime: runtimeReturning('ok'), model: 'm', maxIterations: 2 });
    const result = await loop.execute({ messages: [msg('hi')], tools: [], systemPrompt: 'SYS' });
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('SYS');
  });
});
