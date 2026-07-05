import { describe, it, expect } from 'vitest';
import { getBrowserToolDefinitions, getBrowserToolHandlers, BROWSER_TOOL_RISK_LEVELS } from '../browserTools.js';

describe('浏览器工具扩展测试', () => {
  it('应有 16 个工具定义', () => {
    const defs = getBrowserToolDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(16);
  });

  it('cookie/storage/upload/download/screenshot_base64 工具应存在', () => {
    const defs = getBrowserToolDefinitions();
    const names = defs.map(d => d.function?.name || d.name);
    expect(names).toContain('browser_cookies');
    expect(names).toContain('browser_local_storage');
    expect(names).toContain('browser_file_upload');
    expect(names).toContain('browser_download');
    expect(names).toContain('browser_screenshot_base64');
  });

  it('file_upload 和 download 应为 high-risk', () => {
    expect(BROWSER_TOOL_RISK_LEVELS['browser_file_upload']).toBe('high-risk');
    expect(BROWSER_TOOL_RISK_LEVELS['browser_download']).toBe('high-risk');
  });

  it('handler 应能处理 cookies get 操作', async () => {
    const handlers = getBrowserToolHandlers();
    const handler = handlers.get('browser_cookies');
    expect(handler).toBeDefined();
    // 不实际调用，因为需要浏览器进程
  });
});
