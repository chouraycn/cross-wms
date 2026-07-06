import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, defineTool, registerTool, unregisterTool } from '../tools';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and get tools', () => {
    const tool = defineTool({
      name: 'test-tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      handler: async () => 'result',
    });

    registry.registerTool(tool);
    const registered = registry.getTool('test-tool');
    expect(registered).not.toBeUndefined();
    expect(registered?.name).toBe('test-tool');
  });

  it('should call tools', async () => {
    const mockHandler = vi.fn().mockResolvedValue('mocked-result');
    registry.registerTool({
      name: 'exec-tool',
      description: 'Executable',
      parameters: { type: 'object', properties: {} },
      handler: mockHandler,
    });

    const result = await registry.callTool('exec-tool', { input: 'test' }, { sessionId: 'test-session' });
    expect(result).toBe('mocked-result');
    expect(mockHandler).toHaveBeenCalledWith({ input: 'test' }, expect.objectContaining({ pluginId: 'system' }));
  });

  it('should list all tools', () => {
    registry.registerTool({
      name: 'tool-a',
      description: 'Tool A',
      parameters: { type: 'object', properties: {} },
      handler: async () => 'a',
    });
    registry.registerTool({
      name: 'tool-b',
      description: 'Tool B',
      parameters: { type: 'object', properties: {} },
      handler: async () => 'b',
    });

    const tools = registry.listTools();
    expect(tools.length).toBe(2);
    expect(tools.some((t) => t.name === 'tool-a')).toBe(true);
  });

  it('should throw error for non-existent tool', async () => {
    await expect(registry.callTool('non-existent', {}, { sessionId: 'test' })).rejects.toThrow('not found');
  });

  it('should unregister tools', () => {
    registry.registerTool({
      name: 'temp-tool',
      description: 'Temporary',
      parameters: {},
      handler: async () => 'temp',
    });
    expect(registry.hasTool('temp-tool')).toBe(true);
    registry.unregisterTool('temp-tool');
    expect(registry.hasTool('temp-tool')).toBe(false);
  });
});