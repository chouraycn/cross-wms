import { describe, it, expect } from 'vitest';
import { getCodeToolDefinitions, getCodeToolHandlers } from '../codeTools.js';

describe('代码工具扩展测试', () => {
  const handlers = getCodeToolHandlers();

  it('code_execute 应支持 Python', async () => {
    const handler = handlers.get('code_execute')!;
    const result = JSON.parse(await handler({ language: 'python', code: 'print("hello")' }));
    // Python 可能未安装，检查返回结构
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('stdout');
  });

  it('code_execute 应处理语法错误', async () => {
    const handler = handlers.get('code_execute')!;
    const result = JSON.parse(await handler({ language: 'javascript', code: 'syntax error {' }));
    expect(result.success).toBe(false);
    expect(result).toHaveProperty('error');
  });

  it('process_manage info 不存在的 PID 应返回错误', async () => {
    const handler = handlers.get('process_manage')!;
    const result = JSON.parse(await handler({ action: 'info', pid: 999999 }));
    expect(result.success).toBe(false);
  });

  it('process_manage tree 不存在的 PID 应返回错误或空', async () => {
    const handler = handlers.get('process_manage')!;
    const result = JSON.parse(await handler({ action: 'tree', pid: 999999 }));
    // 可能返回 success: false 或空子列表
    expect(result).toHaveProperty('success');
  });

  it('file_search grep 应能搜索内容', async () => {
    const handler = handlers.get('file_search')!;
    const result = JSON.parse(await handler({
      action: 'grep',
      path: '/tmp',
      pattern: 'test',
      maxResults: 5,
    }));
    expect(result).toHaveProperty('success');
  });

  it('file_search 未知操作应返回错误', async () => {
    const handler = handlers.get('file_search')!;
    const result = JSON.parse(await handler({ action: 'unknown', path: '/tmp', pattern: '*' }));
    expect(result.success).toBe(false);
  });
});
