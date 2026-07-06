import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../agent';

describe('Agent', () => {
  const mockRuntime = {
    completeSimple: async () => ({ content: 'test response' }),
    streamSimple: async function* () {
      yield { type: 'token' as const, content: 'test' };
      yield { type: 'finish' as const, content: 'test response' };
    },
  };

  it('should initialize with runtime', () => {
    const agent = new Agent({ runtime: mockRuntime });
    expect(agent).toBeDefined();
  });

  it('should emit events during run', async () => {
    const agent = new Agent({ runtime: mockRuntime });

    const events: string[] = [];
    agent.on('start', () => events.push('start'));
    agent.on('finish', () => events.push('finish'));

    await agent.run({
      messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }],
    });

    expect(events).toContain('start');
    expect(events).toContain('finish');
  });

  it('should handle errors during run', async () => {
    const agent = new Agent({
      runtime: {
        completeSimple: async () => {
          throw new Error('Test error');
        },
        streamSimple: async function* () {
          throw new Error('Test error');
        },
      },
    });

    const result = await agent.run({
      messages: [{ id: '1', role: 'user', content: 'Hello', timestamp: Date.now() }],
    });

    expect(result.error).toBeDefined();
  });
});