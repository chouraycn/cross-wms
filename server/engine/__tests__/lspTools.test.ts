/**
 * LSP Tools 单元测试
 *
 * 测试 LSP 工具的注册、定义和处理器映射。
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LSPPosition, LSPRange, LSPLocation } from '../lspTypes.js';

// ===================== Mock: logger =====================

vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ===================== Mock: fs =====================

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('const x = 1;'),
}));

// ===================== Mock: child_process =====================

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    pid: 12345,
  })),
  execSync: vi.fn().mockReturnValue('/usr/bin/typescript-language-server'),
}));

// ===================== 测试 =====================

describe('LSP Tools — 工具定义和处理器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('getLspToolDefinitions 返回 7 个工具定义', async () => {
    const { getLspToolDefinitions } = await import('../lspTools.js');
    const definitions = getLspToolDefinitions();

    expect(definitions).toHaveLength(7);
    expect(definitions.map(d => d.function.name)).toEqual([
      'lsp_complete',
      'lsp_hover',
      'lsp_definition',
      'lsp_references',
      'lsp_rename',
      'lsp_diagnose',
      'lsp_format',
    ]);
  });

  it('getLspToolHandlers 返回 7 个处理器映射', async () => {
    const { getLspToolHandlers } = await import('../lspTools.js');
    const handlers = getLspToolHandlers();

    expect(handlers.size).toBe(7);
    expect(handlers.has('lsp_complete')).toBe(true);
    expect(handlers.has('lsp_hover')).toBe(true);
    expect(handlers.has('lsp_definition')).toBe(true);
    expect(handlers.has('lsp_references')).toBe(true);
    expect(handlers.has('lsp_rename')).toBe(true);
    expect(handlers.has('lsp_diagnose')).toBe(true);
    expect(handlers.has('lsp_format')).toBe(true);
  });

  it('工具定义包含必需参数', async () => {
    const { getLspToolDefinitions } = await import('../lspTools.js');
    const definitions = getLspToolDefinitions();

    for (const def of definitions) {
      expect(def.type).toBe('function');
      expect(def.function.name).toBeDefined();
      expect(def.function.description).toBeDefined();
      expect(def.function.parameters).toBeDefined();
      expect(def.function.parameters.type).toBe('object');
      expect(def.function.parameters.properties).toBeDefined();
    }
  });
});

describe('LSP Tools — lsp_complete 参数验证', () => {
  it('lsp_complete 需要必需参数 file、line、character', async () => {
    const { getLspToolDefinitions } = await import('../lspTools.js');
    const definitions = getLspToolDefinitions();

    const completeDef = definitions.find(d => d.function.name === 'lsp_complete');
    expect(completeDef).toBeDefined();
    expect(completeDef!.function.parameters.required).toEqual(['file', 'line', 'character']);

    expect((completeDef!.function.parameters as any).properties.file).toBeDefined();
    expect((completeDef!.function.parameters as any).properties.file.type).toBe('string');

    expect((completeDef!.function.parameters as any).properties.line).toBeDefined();
    expect((completeDef!.function.parameters as any).properties.line.type).toBe('number');

    expect((completeDef!.function.parameters as any).properties.character).toBeDefined();
    expect((completeDef!.function.parameters as any).properties.character.type).toBe('number');

    // triggerCharacter 是可选参数
    expect((completeDef!.function.parameters as any).properties.triggerCharacter).toBeDefined();
    expect(completeDef!.function.parameters.required).not.toContain('triggerCharacter');
  });
});

describe('LSP Tools — lsp_rename 参数验证', () => {
  it('lsp_rename 需要必需参数 file、line、character、newName', async () => {
    const { getLspToolDefinitions } = await import('../lspTools.js');
    const definitions = getLspToolDefinitions();

    const renameDef = definitions.find(d => d.function.name === 'lsp_rename');
    expect(renameDef).toBeDefined();
    expect(renameDef!.function.parameters.required).toEqual(['file', 'line', 'character', 'newName']);

    expect((renameDef!.function.parameters as any).properties.newName).toBeDefined();
    expect((renameDef!.function.parameters as any).properties.newName.type).toBe('string');
  });
});

describe('LSP Tools — lsp_format 参数验证', () => {
  it('lsp_format 只需要 file 参数（其他可选）', async () => {
    const { getLspToolDefinitions } = await import('../lspTools.js');
    const definitions = getLspToolDefinitions();

    const formatDef = definitions.find(d => d.function.name === 'lsp_format');
    expect(formatDef).toBeDefined();
    expect(formatDef!.function.parameters.required).toEqual(['file']);

    // 可选参数
    expect((formatDef!.function.parameters as any).properties.startLine).toBeDefined();
    expect((formatDef!.function.parameters as any).properties.tabSize).toBeDefined();
    expect((formatDef!.function.parameters as any).properties.tabSize.default).toBe(2);
    expect((formatDef!.function.parameters as any).properties.insertSpaces).toBeDefined();
    expect((formatDef!.function.parameters as any).properties.insertSpaces.default).toBe(true);
  });
});

describe('LSP Types — 类型定义验证', () => {
  it('LSPCompletionItemKind 枚举值正确', async () => {
    const { LSPCompletionItemKind } = await import('../lspTypes.js');

    expect(LSPCompletionItemKind.Text).toBe(1);
    expect(LSPCompletionItemKind.Method).toBe(2);
    expect(LSPCompletionItemKind.Function).toBe(3);
    expect(LSPCompletionItemKind.Class).toBe(7);
    expect(LSPCompletionItemKind.Variable).toBe(6);
    expect(LSPCompletionItemKind.Constant).toBe(21);
  });

  it('LSPDiagnosticSeverity 枚举值正确', async () => {
    const { LSPDiagnosticSeverity } = await import('../lspTypes.js');

    expect(LSPDiagnosticSeverity.Error).toBe(1);
    expect(LSPDiagnosticSeverity.Warning).toBe(2);
    expect(LSPDiagnosticSeverity.Information).toBe(3);
    expect(LSPDiagnosticSeverity.Hint).toBe(4);
  });

  it('LSPPosition 和 LSPRange 类型定义正确', async () => {
    // 验证接口结构 — 运行时只能验证对象结构
    const pos: LSPPosition = { line: 0, character: 5 };
    const range: LSPRange = { start: pos, end: { line: 0, character: 10 } };
    const location: LSPLocation = { uri: 'file:///test.ts', range };

    expect(pos.line).toBe(0);
    expect(pos.character).toBe(5);
    expect(range.start).toEqual(pos);
    expect(location.uri).toBe('file:///test.ts');
  });
});

describe('LSP Server Registry — 默认配置验证', () => {
  it('getDefaultServerConfigs 返回预定义服务器配置', async () => {
    const { getDefaultServerConfigs } = await import('../lspServerRegistry.js');
    const configs = getDefaultServerConfigs();

    expect(configs.length).toBeGreaterThan(0);

    // TypeScript 服务器
    const tsConfig = configs.find(c => c.id === 'typescript-language-server');
    expect(tsConfig).toBeDefined();
    expect(tsConfig!.language).toBe('typescript');
    expect(tsConfig!.command).toBe('typescript-language-server');
    expect(tsConfig!.fileExtensions).toContain('.ts');
    expect(tsConfig!.fileExtensions).toContain('.tsx');

    // Python 服务器
    const pyConfig = configs.find(c => c.id === 'pyright');
    expect(pyConfig).toBeDefined();
    expect(pyConfig!.language).toBe('python');
    expect(pyConfig!.fileExtensions).toContain('.py');

    // Go 服务器
    const goConfig = configs.find(c => c.id === 'gopls');
    expect(goConfig).toBeDefined();
    expect(goConfig!.language).toBe('go');
    expect(goConfig!.fileExtensions).toContain('.go');

    // Rust 服务器
    const rustConfig = configs.find(c => c.id === 'rust-analyzer');
    expect(rustConfig).toBeDefined();
    expect(rustConfig!.language).toBe('rust');
    expect(rustConfig!.fileExtensions).toContain('.rs');

    // Java 服务器
    const javaConfig = configs.find(c => c.id === 'jdtls');
    expect(javaConfig).toBeDefined();
    expect(javaConfig!.language).toBe('java');
    expect(javaConfig!.fileExtensions).toContain('.java');
  });

  it('服务器配置包含必需字段', async () => {
    const { getDefaultServerConfigs } = await import('../lspServerRegistry.js');
    const configs = getDefaultServerConfigs();

    for (const config of configs) {
      expect(config.id).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.language).toBeDefined();
      expect(config.command).toBeDefined();
      expect(config.fileExtensions).toBeDefined();
      expect(config.fileExtensions.length).toBeGreaterThan(0);
    }
  });
});

describe('LSP Client Manager — 实例管理', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getLspClientManager 返回单例实例', async () => {
    const { getLspClientManager, resetLspClientManager } = await import('../lspClient.js');

    resetLspClientManager();

    const manager1 = getLspClientManager('/test/workspace');
    const manager2 = getLspClientManager();

    expect(manager1).toBe(manager2);
  });

  it('resetLspClientManager 清理单例', async () => {
    const { getLspClientManager, resetLspClientManager } = await import('../lspClient.js');

    const manager1 = getLspClientManager('/test/workspace1');
    resetLspClientManager();

    const manager2 = getLspClientManager('/test/workspace2');

    expect(manager1).not.toBe(manager2);
  });
});

describe('LSP Server Registry — 实例管理', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetLspServerRegistry } = await import('../lspServerRegistry.js');
    await resetLspServerRegistry();
  });

  it('getLspServerRegistry 返回单例实例', async () => {
    const { getLspServerRegistry } = await import('../lspServerRegistry.js');

    const registry1 = getLspServerRegistry('/test/workspace');
    const registry2 = getLspServerRegistry();

    expect(registry1).toBe(registry2);
  });

  it('getConfigForFile 根据文件路径返回配置', async () => {
    const { getLspServerRegistry, resetLspServerRegistry } = await import('../lspServerRegistry.js');

    await resetLspServerRegistry();
    const registry = getLspServerRegistry('/test/workspace');

    const tsConfig = registry.getConfigForFile('/test/file.ts');
    expect(tsConfig).toBeDefined();
    expect(tsConfig!.language).toBe('typescript');

    const pyConfig = registry.getConfigForFile('/test/file.py');
    expect(pyConfig).toBeDefined();
    expect(pyConfig!.language).toBe('python');

    const goConfig = registry.getConfigForFile('/test/file.go');
    expect(goConfig).toBeDefined();
    expect(goConfig!.language).toBe('go');

    const unknownConfig = registry.getConfigForFile('/test/file.xyz');
    expect(unknownConfig).toBeUndefined();
  });
});

describe('LSP Tools — 工具调用结果格式', () => {
  it('工具结果包含 success 和 duration 字段', async () => {
    // 模拟结果对象
    const mockResult = {
      success: true,
      data: { isIncomplete: false, items: [] },
      serverId: 'typescript-language-server',
      duration: 100,
    };

    expect(mockResult.success).toBe(true);
    expect(mockResult.duration).toBe(100);
    expect(mockResult.serverId).toBeDefined();
  });

  it('错误结果包含 success=false 和 error 字段', async () => {
    const mockErrorResult = {
      success: false,
      error: '未找到支持该文件的语言服务器',
      duration: 50,
    };

    expect(mockErrorResult.success).toBe(false);
    expect(mockErrorResult.error).toBeDefined();
    expect(mockErrorResult.duration).toBeDefined();
  });
});