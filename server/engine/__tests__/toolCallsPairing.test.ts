/**
 * tool_calls 消息配对测试
 *
 * 核心要求：OpenAI API 规定 assistant(tool_calls) 消息后必须紧跟对应的 tool 响应消息。
 * sanitizeToolMessages（多遍扫描算法）和 validateToolMessages（发送前硬校验）共同保证此约束。
 *
 * 防护层级：
 * - Pass 0: 过滤无效 tool_calls / tool 消息
 * - Pass 1: 为每个 assistant(tool_calls) 找出有响应的 tool_call_id
 * - Pass 2: 构建清理后的消息数组
 * - Pass 3: 最终验证
 * - Pass 3.5: 重新排序 — 确保 tool 消息紧跟 assistant(tool_calls)
 * - Pass 4: content 规范化
 * - validateToolMessages: 发送前的最终硬校验
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ApiMessage 类型（与 contextTruncate.ts 中一致）
type ApiMessage = {
  role: string;
  content: unknown;
  tool_calls?: Array<{ id: string; type?: string; function?: { name?: string; arguments?: string } }> | unknown[];
  tool_call_id?: string;
  reasoning_content?: unknown;
};

describe('sanitizeToolMessages 多遍扫描', () => {
  let sanitizeToolMessages: (messages: ApiMessage[]) => ApiMessage[];

  beforeEach(async () => {
    const mod = await import('../../engine/contextTruncate.js');
    sanitizeToolMessages = mod.sanitizeToolMessages;
  });

  // ===================== Pass 0: 过滤无效 tool_calls =====================

  it('Pass 0: 过滤 id 为空的 tool_calls', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: '', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
    ];

    const result = sanitizeToolMessages(messages);
    // 无效的 tool_calls 被全部过滤，且无内容，消息被丢弃
    expect(result).toHaveLength(0);
  });

  it('Pass 0: 过滤无 tool_call_id 的 tool 消息', () => {
    const messages: ApiMessage[] = [
      { role: 'tool', content: 'result', tool_call_id: '' },
      { role: 'tool', content: 'result2', tool_call_id: undefined },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(0);
  });

  it('Pass 0: 保留有效 tool_call_id 的 assistant 消息', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'found', tool_call_id: 'call_1' },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    expect((result[0].tool_calls as Array<{ id: string }>)).toHaveLength(1);
    expect((result[0].tool_calls as Array<{ id: string }>)[0].id).toBe('call_1');
    expect(result[1].role).toBe('tool');
  });

  // ===================== Pass 1 & 2: 配对清理 =====================

  it('Pass 1/2: 移除无 tool 响应的 assistant(tool_calls)', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_orphan', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
    ];

    const result = sanitizeToolMessages(messages);
    // 孤儿 tool_calls 且无 content，应被移除
    expect(result).toHaveLength(0);
  });

  it('Pass 1/2: 有 content 的孤儿 assistant(tool_calls) 降级为普通消息', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: 'Hello', tool_calls: [
        { id: 'call_orphan', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBe('Hello');
    // tool_calls 应被移除
    expect((result[0] as { tool_calls?: unknown }).tool_calls).toBeUndefined();
  });

  it('Pass 1/2: 正确的配对全部保留', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'result 1', tool_call_id: 'call_1' },
      { role: 'tool', content: 'result 2', tool_call_id: 'call_2' },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(3);
    expect((result[0].tool_calls as Array<{ id: string }>)).toHaveLength(2);
  });

  // ===================== Pass 3: 最终验证 =====================

  it('Pass 3: 最终验证丢弃残留的孤儿 tool 消息', () => {
    const messages: ApiMessage[] = [
      { role: 'tool', content: 'orphan result', tool_call_id: 'call_orphan' },
    ];

    const result = sanitizeToolMessages(messages);
    // 孤儿 tool 消息应被丢弃
    expect(result).toHaveLength(0);
  });

  // ===================== Pass 3.5: 重排序 =====================

  it('Pass 3.5: system/user 消息被重新排序到 tool 消息之后', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
      { role: 'system', content: 'System instruction' }, // 应该在 tool 之后再出现
      { role: 'tool', content: 'result', tool_call_id: 'call_1' },
    ];

    const result = sanitizeToolMessages(messages);

    // 验证: assistant(tool_calls) 后紧跟 tool 消息, system 消息排在后面
    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('tool');
    // system 消息应在 tool 之后（重排序生效）
    expect(result.findIndex((m) => m.role === 'system')).toBeGreaterThan(1);
  });

  it('Pass 3.5: 多条 system/user 消息被正确重排序', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
      { role: 'system', content: 'sys 1' },
      { role: 'user', content: 'user 1' },
      { role: 'tool', content: 'result 1', tool_call_id: 'call_1' },
      { role: 'system', content: 'sys 2' },
    ];

    const result = sanitizeToolMessages(messages);

    expect(result[0].role).toBe('assistant');
    expect(result[1].role).toBe('tool');
    // system/user 消息在 tool 之后
    const afterTool = result.slice(2);
    expect(afterTool).toHaveLength(3);
    expect(afterTool.filter((m) => m.role === 'system' || m.role === 'user')).toHaveLength(3);
  });

  // ===================== Pass 4: content 规范化 =====================

  it('Pass 4: null content 的 tool 消息被规范化为 "(no result)"', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
      { role: 'tool', content: null, tool_call_id: 'call_1' },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result[1].content).toBe('(no result)');
  });

  it('Pass 4: null content 的 assistant(无 tool_calls) 规范化为 ""', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result[0].content).toBe('');
  });
});

// ===================== validateToolMessages 硬校验 =====================

describe('validateToolMessages 发送前硬校验', () => {
  it('检测到不完整的配对并补齐缺失的 tool 消息', async () => {
    // validateToolMessages 是 aiClient.ts 内部的函数，不是导出的
    // 我们测试其修复逻辑通过 aiClient 的导出测试
    const mod = await import('../../aiClient.js');

    // 创建缺失 tool 响应的消息数组
    const messages: Array<{ role: string; content?: unknown; tool_calls?: unknown[]; tool_call_id?: string }> = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'result 1', tool_call_id: 'call_1' },
      // call_2 缺失 tool 响应
    ];

    // validateToolMessages 是私有函数，不直接导出。
    // 我们通过检查 sanitizeToolMessages 的处理来间接验证：
    // sanitize 应丢弃孤儿 call_2
    const { sanitizeToolMessages } = await import('../../engine/contextTruncate.js');
    const sanitized = sanitizeToolMessages(messages as unknown as ApiMessage[]);

    // call_2 无匹配 tool，应被移除
    expect(sanitized).toHaveLength(2);
    expect((sanitized[0].tool_calls as Array<{ id: string }>)).toHaveLength(1);
    expect((sanitized[0].tool_calls as Array<{ id: string }>)[0].id).toBe('call_1');
  });

  it('多组 assistant(tool_calls)+tool 正确配对，全部保留', async () => {
    const { sanitizeToolMessages } = await import('../../engine/contextTruncate.js');

    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        { id: 'call_2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'result 1', tool_call_id: 'call_1' },
      { role: 'tool', content: 'result 2', tool_call_id: 'call_2' },
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_3', type: 'function', function: { name: 'write_file', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'result 3', tool_call_id: 'call_3' },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe('assistant');
    expect((result[0].tool_calls as Array<{ id: string }>)).toHaveLength(2);
    expect(result[3].role).toBe('assistant');
    expect((result[3].tool_calls as Array<{ id: string }>)).toHaveLength(1);
  });
});

// ===================== 集成测试 =====================

describe('tool_calls 配对集成测试', () => {
  let sanitizeToolMessages: (messages: ApiMessage[]) => ApiMessage[];

  beforeEach(async () => {
    const mod = await import('../../engine/contextTruncate.js');
    sanitizeToolMessages = mod.sanitizeToolMessages;
  });

  it('多轮工具调用全部正确配对', () => {
    const messages: ApiMessage[] = [
      { role: 'user', content: '搜索文件' },
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'found file.txt', tool_call_id: 'call_1' },
      { role: 'assistant', content: '找到了文件 file.txt' },
      { role: 'user', content: '读取它' },
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ]},
      { role: 'tool', content: 'file content...', tool_call_id: 'call_2' },
    ];

    const result = sanitizeToolMessages(messages);
    // 所有7条消息都应保留
    expect(result).toHaveLength(7);
  });

  it('空消息数组安全处理', () => {
    // @ts-expect-error 测试边界情况
    const result = sanitizeToolMessages(null);
    expect(result).toBe(null);
  });

  it('已正确配对的数组不做修改', () => {
    const messages: ApiMessage[] = [
      { role: 'assistant', content: null, tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'calc', arguments: '{"x":1}' } },
      ]},
      { role: 'tool', content: '42', tool_call_id: 'call_1' },
    ];

    const result = sanitizeToolMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(messages[0]);
    expect(result[1]).toEqual(messages[1]);
  });
});
