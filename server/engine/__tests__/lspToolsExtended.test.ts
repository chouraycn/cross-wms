import { describe, it, expect } from 'vitest';
import { getLspToolDefinitions, getLspToolHandlers } from '../lspTools.js';

describe('LSP 工具扩展测试', () => {
  it('应有 11 个工具定义', () => {
    const defs = getLspToolDefinitions();
    expect(defs.length).toBe(11);
  });

  it('新增 4 个工具应存在', () => {
    const defs = getLspToolDefinitions();
    const names = defs.map(d => d.function?.name || d.name);
    expect(names).toContain('lsp_code_action');
    expect(names).toContain('lsp_signature_help');
    expect(names).toContain('lsp_document_symbols');
    expect(names).toContain('lsp_workspace_symbols');
  });

  it('handler 映射应完整', () => {
    const handlers = getLspToolHandlers();
    expect(handlers.has('lsp_code_action')).toBe(true);
    expect(handlers.has('lsp_signature_help')).toBe(true);
    expect(handlers.has('lsp_document_symbols')).toBe(true);
    expect(handlers.has('lsp_workspace_symbols')).toBe(true);
  });
});
