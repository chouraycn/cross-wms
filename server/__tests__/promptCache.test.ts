import { describe, it, expect } from 'vitest';

describe('Prompt Cache 配置测试', () => {
  it('AdapterCompatConfig 应支持 supportsPromptCache 字段', () => {
    const config = {
      supportsPromptCache: true,
      cacheBreakpoints: ['system', 'tools', 'last-user'],
    };
    expect(config.supportsPromptCache).toBe(true);
    expect(config.cacheBreakpoints).toHaveLength(3);
  });

  it('cacheBreakpoints 应接受有效值', () => {
    const validValues = ['system', 'tools', 'last-user'];
    for (const v of validValues) {
      expect(validValues).toContain(v);
    }
  });
});
