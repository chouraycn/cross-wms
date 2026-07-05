/**
 * Code Tools 测试 — 代码执行沙箱工具测试
 *
 * 测试 code_execute、process_manage、file_search 工具
 */

import { describe, it, expect } from 'vitest';
import { getCodeToolDefinitions, getCodeToolHandlers } from '../codeTools.js';

describe('代码工具', () => {
  it('应返回 3 个工具定义', () => {
    const defs = getCodeToolDefinitions();
    expect(defs).toHaveLength(3);
    expect(defs.map(d => d.function.name)).toContain('code_execute');
    expect(defs.map(d => d.function.name)).toContain('process_manage');
    expect(defs.map(d => d.function.name)).toContain('file_search');
  });

  it('应返回对应的 handler', () => {
    const handlers = getCodeToolHandlers();
    expect(handlers.has('code_execute')).toBe(true);
    expect(handlers.has('process_manage')).toBe(true);
    expect(handlers.has('file_search')).toBe(true);
  });

  it('code_execute 应能执行 JavaScript', async () => {
    const handlers = getCodeToolHandlers();
    const handler = handlers.get('code_execute')!;
    const result = JSON.parse(await handler({ language: 'javascript', code: 'console.log("hello")' }));
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('hello');
  });

  it('code_execute 超时应返回错误', async () => {
    const handlers = getCodeToolHandlers();
    const handler = handlers.get('code_execute')!;
    const result = JSON.parse(await handler({
      language: 'javascript',
      code: 'while(true) {}',
      timeout: 1000,
    }));
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it('process_manage list 应返回进程列表', async () => {
    const handlers = getCodeToolHandlers();
    const handler = handlers.get('process_manage')!;
    const result = JSON.parse(await handler({ action: 'list' }));
    expect(result.success).toBe(true);
    expect(result.processes.length).toBeGreaterThan(0);
  });

  it('file_search find 应能搜索文件', async () => {
    const handlers = getCodeToolHandlers();
    const handler = handlers.get('file_search')!;
    const result = JSON.parse(await handler({
      action: 'find',
      path: '/tmp',
      pattern: '*.json',
    }));
    expect(result.success).toBe(true);
  });
});
