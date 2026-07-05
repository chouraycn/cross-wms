import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('子代理 MCP 绑定', () => {
  it('SubagentDefinition 应支持 mcpServers 字段', () => {
    const def = {
      id: 'test-agent',
      name: '测试代理',
      agentType: 'research',
      tools: ['web_search'],
      mcpServers: ['server1', 'server2'],
      capabilities: [],
      maxConcurrent: 1,
      timeoutMs: 30000,
      enabled: true,
    };
    expect(def.mcpServers).toEqual(['server1', 'server2']);
  });
});
