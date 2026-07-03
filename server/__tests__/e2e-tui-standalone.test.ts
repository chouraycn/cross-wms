/**
 * E2E 测试：TUI 独立应用
 *
 * 验证 TUI 作为独立终端应用的能力：
 * 1. CLI 启动入口（cli.ts）参数解析
 * 2. HTTP 后端连接（HttpBackend）
 * 3. 配置文件加载与验证（config.ts）
 * 4. 主题管理器（themeManager.ts）
 * 5. AI 引擎类型与命令集成
 * 6. 完整命令集（新增 theme/config/set/profiles）
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock readline（避免实际终端交互）
vi.mock('node:readline', () => {
  const mockRl = {
    on: vi.fn(),
    close: vi.fn(),
    prompt: vi.fn(),
  };
  return {
    createInterface: vi.fn(() => mockRl),
    default: { createInterface: vi.fn(() => mockRl) },
  };
});

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}));

// 简单的内存后端实现（用于测试）
class MockTuiBackend {
  private sessions = new Map<string, { id: string; title: string; updatedAt: number; messages: Array<{ role: string; content: string }> }>();

  async createSession(title: string) {
    const id = 'session_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const session = { id, title, updatedAt: Date.now(), messages: [] };
    this.sessions.set(id, session);
    return { id, title, messageCount: 0, updatedAt: session.updatedAt };
  }

  async listSessions() {
    return Array.from(this.sessions.values())
      .map(s => ({ id: s.id, title: s.title, messageCount: s.messages.length, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteSession(id: string) {
    this.sessions.delete(id);
  }

  async loadHistory(id: string) {
    const s = this.sessions.get(id);
    return s ? s.messages : [];
  }

  async *sendChat(messages: Array<{ role: string; content: string }>) {
    yield { type: 'assistant_start' };
    yield { type: 'assistant_chunk', content: '收到' };
    yield { type: 'assistant_end' };
  }

  abortChat() {}
}

describe('E2E: TUI 独立应用', () => {

  // ==================== 1. CLI 参数解析 ====================
  describe('CLI 参数解析', () => {
    it('parseArgs 应能解析 --http 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--http']);
      expect(args.http).toBe(true);
    });

    it('parseArgs 应能解析 --url 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--url', 'http://example.com:3001']);
      expect(args.url).toBe('http://example.com:3001');
    });

    it('parseArgs 应能解析 --model 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--model', 'gpt-4o']);
      expect(args.model).toBe('gpt-4o');
    });

    it('parseArgs 应能解析 --agent 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--agent', 'wms-expert']);
      expect(args.agent).toBe('wms-expert');
    });

    it('parseArgs 应能解析 --session 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--session', 'sess_123']);
      expect(args.session).toBe('sess_123');
    });

    it('parseArgs 应能解析 --theme 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--theme', 'dark']);
      expect(args.theme).toBe('dark');
    });

    it('parseArgs 应能解析 --config 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--config', '/tmp/my-config.json']);
      expect(args.config).toBe('/tmp/my-config.json');
    });

    it('parseArgs 应能解析 --save-config 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--save-config']);
      expect(args.saveConfig).toBe(true);
    });

    it('parseArgs 应能解析 --version 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--version']);
      expect(args.version).toBe(true);
    });

    it('parseArgs 应能解析 --help 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--help']);
      expect(args.help).toBe(true);
    });

    it('parseArgs 应能解析 -v 短参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['-v']);
      expect(args.version).toBe(true);
    });

    it('parseArgs 应能解析 -h 短参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['-h']);
      expect(args.help).toBe(true);
    });

    it('parseArgs 应能解析 --verbose 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--verbose']);
      expect(args.verbose).toBe(true);
    });

    it('parseArgs 应能解析 --list-backends 参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--list-backends']);
      expect(args.listBackends).toBe(true);
    });

    it('parseArgs 应能同时解析多个参数', async () => {
      const { parseArgs } = await import('../tui/cli.js');
      const args = parseArgs(['--http', '--url', 'http://localhost:3001', '--model', 'gpt-4o', '--verbose']);
      expect(args.http).toBe(true);
      expect(args.url).toBe('http://localhost:3001');
      expect(args.model).toBe('gpt-4o');
      expect(args.verbose).toBe(true);
    });
  });

  // ==================== 2. 配置文件加载 ====================
  describe('配置文件加载', () => {
    let tmpDir: string;
    let configPath: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'tui-test-'));
      configPath = join(tmpDir, 'tui.json');
    });

    afterEach(() => {
      try {
        if (existsSync(configPath)) unlinkSync(configPath);
      } catch { /* ignore */ }
    });

    it('loadTuiConfig 应返回默认配置当无配置文件时', async () => {
      const { loadTuiConfig, DEFAULT_TUI_CONFIG } = await import('../tui/config.js');
      // 使用临时空配置文件，确保不受环境变量影响
      const tmpDir = mkdtempSync(join(tmpdir(), 'tui-empty-'));
      const emptyConfigPath = join(tmpDir, 'empty.json');
      writeFileSync(emptyConfigPath, '{}');
      try {
        const config = loadTuiConfig(emptyConfigPath);
        expect(config.backend).toBe(DEFAULT_TUI_CONFIG.backend);
        expect(config.toolProfile).toBe(DEFAULT_TUI_CONFIG.toolProfile);
        expect(config.compaction.enabled).toBe(true);
        expect(config.compaction.strategy).toBe('semantic');
        expect(config.historySize).toBe(DEFAULT_TUI_CONFIG.historySize);
      } finally {
        try { unlinkSync(emptyConfigPath); } catch { /* ignore */ }
      }
    });

    it('loadTuiConfig 应能加载自定义配置', async () => {
      const customConfig = {
        backend: 'http',
        http: { baseUrl: 'http://192.168.1.10:3001', timeoutMs: 60000 },
        theme: 'light',
        toolProfile: 'coding',
        compaction: { enabled: true, strategy: 'truncation', thresholdRatio: 0.85, preserveRecent: 10 },
        historySize: 200,
        model: 'gpt-4o',
        agentId: 'wms-expert',
      };
      writeFileSync(configPath, JSON.stringify(customConfig));

      const { loadTuiConfig } = await import('../tui/config.js');
      const config = loadTuiConfig(configPath);
      expect(config.backend).toBe('http');
      expect(config.http?.baseUrl).toBe('http://192.168.1.10:3001');
      expect(config.theme).toBe('light');
      expect(config.toolProfile).toBe('coding');
      expect(config.compaction.strategy).toBe('truncation');
      expect(config.compaction.thresholdRatio).toBe(0.85);
      expect(config.compaction.preserveRecent).toBe(10);
      expect(config.historySize).toBe(200);
      expect(config.model).toBe('gpt-4o');
      expect(config.agentId).toBe('wms-expert');
    });

    it('saveTuiConfig 应能保存配置到文件', async () => {
      const { saveTuiConfig, loadTuiConfig } = await import('../tui/config.js');
      const config = {
        backend: 'http' as const,
        http: { baseUrl: 'http://test:3001' },
        theme: 'dark' as const,
        toolProfile: 'minimal' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 0.5, preserveRecent: 3 },
        historySize: 50,
        verbose: false,
      };
      const savedPath = saveTuiConfig(config, configPath);
      expect(existsSync(savedPath)).toBe(true);

      const loaded = loadTuiConfig(configPath);
      expect(loaded.backend).toBe('http');
      expect(loaded.http?.baseUrl).toBe('http://test:3001');
      expect(loaded.toolProfile).toBe('minimal');
    });

    it('validateTuiConfig 应能验证合法配置', async () => {
      const { validateTuiConfig } = await import('../tui/config.js');
      const valid = {
        backend: 'embedded' as const,
        theme: 'auto' as const,
        toolProfile: 'full' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 0.75, preserveRecent: 6 },
        historySize: 100,
        verbose: false,
      };
      const result = validateTuiConfig(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validateTuiConfig 应能识别非法 backend', async () => {
      const { validateTuiConfig } = await import('../tui/config.js');
      const invalid = {
        backend: 'invalid' as any,
        theme: 'auto' as const,
        toolProfile: 'full' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 0.75, preserveRecent: 6 },
        historySize: 100,
        verbose: false,
      };
      const result = validateTuiConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('backend'))).toBe(true);
    });

    it('validateTuiConfig 应能识别缺失的 http.baseUrl', async () => {
      const { validateTuiConfig } = await import('../tui/config.js');
      const invalid = {
        backend: 'http' as const,
        theme: 'auto' as const,
        toolProfile: 'full' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 0.75, preserveRecent: 6 },
        historySize: 100,
        verbose: false,
      };
      const result = validateTuiConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('baseUrl'))).toBe(true);
    });

    it('validateTuiConfig 应能识别非法 URL', async () => {
      const { validateTuiConfig } = await import('../tui/config.js');
      const invalid = {
        backend: 'http' as const,
        http: { baseUrl: 'not-a-url' },
        theme: 'auto' as const,
        toolProfile: 'full' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 0.75, preserveRecent: 6 },
        historySize: 100,
        verbose: false,
      };
      const result = validateTuiConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('baseUrl'))).toBe(true);
    });

    it('validateTuiConfig 应能识别越界的 thresholdRatio', async () => {
      const { validateTuiConfig } = await import('../tui/config.js');
      const invalid = {
        backend: 'embedded' as const,
        theme: 'auto' as const,
        toolProfile: 'full' as const,
        compaction: { enabled: true, strategy: 'semantic' as const, thresholdRatio: 1.5, preserveRecent: 6 },
        historySize: 100,
        verbose: false,
      };
      const result = validateTuiConfig(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('thresholdRatio'))).toBe(true);
    });

    it('getDefaultConfigPath 应返回 ~/.cdf-know-clow/tui.json', async () => {
      const { getDefaultConfigPath } = await import('../tui/config.js');
      const path = getDefaultConfigPath();
      expect(path).toContain('cdf-know-clow');
      expect(path).toContain('tui.json');
    });

    it('环境变量 CDF_TUI_BACKEND 应覆盖配置', async () => {
      const { loadTuiConfig } = await import('../tui/config.js');
      const oldEnv = process.env.CDF_TUI_BACKEND;
      process.env.CDF_TUI_BACKEND = 'http';
      try {
        const config = loadTuiConfig(configPath);
        // 由于 http 但没有 baseUrl，可能 validate 失败，但 load 应返回
        expect(config.backend).toBe('http');
      } finally {
        if (oldEnv === undefined) delete process.env.CDF_TUI_BACKEND;
        else process.env.CDF_TUI_BACKEND = oldEnv;
      }
    });

    it('环境变量 CDF_TUI_MODEL 应覆盖配置', async () => {
      const { loadTuiConfig } = await import('../tui/config.js');
      const oldEnv = process.env.CDF_TUI_MODEL;
      process.env.CDF_TUI_MODEL = 'claude-3-5-sonnet';
      try {
        const config = loadTuiConfig();
        expect(config.model).toBe('claude-3-5-sonnet');
      } finally {
        if (oldEnv === undefined) delete process.env.CDF_TUI_MODEL;
        else process.env.CDF_TUI_MODEL = oldEnv;
      }
    });
  });

  // ==================== 3. 主题管理器 ====================
  describe('主题管理器', () => {
    it('themeManager 应提供默认主题', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      const theme = themeManager.getTheme();
      expect(theme).toBeDefined();
      expect(theme.colors).toBeDefined();
    });

    it('themeManager.listThemes 应列出三个主题', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      const themes = themeManager.listThemes();
      expect(themes).toEqual(['dark', 'light', 'auto']);
    });

    it('themeManager.switchTheme 应能切换到 dark', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      const theme = themeManager.switchTheme('dark');
      expect(theme.name).toBe('dark');
      expect(theme.isDark).toBe(true);
      expect(themeManager.getName()).toBe('dark');
    });

    it('themeManager.switchTheme 应能切换到 light', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      const theme = themeManager.switchTheme('light');
      expect(theme.name).toBe('light');
      expect(theme.isDark).toBe(false);
    });

    it('themeManager.switchTheme 应支持 auto', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      const theme = themeManager.switchTheme('auto');
      expect(theme).toBeDefined();
      expect(['dark', 'light']).toContain(theme.name);
    });

    it('themeManager.switchTheme 应拒绝非法值', async () => {
      const { themeManager } = await import('../tui/themeManager.js');
      expect(() => themeManager.switchTheme('invalid' as any)).toThrow();
    });
  });

  // ==================== 4. AI 引擎类型 ====================
  describe('AI 引擎类型与常量', () => {
    it('TOOL_PROFILE_VALUES 应包含 4 个值', async () => {
      const { TOOL_PROFILE_VALUES } = await import('../tui/types/aiEngine.js');
      expect(TOOL_PROFILE_VALUES).toEqual(['minimal', 'coding', 'messaging', 'full']);
    });

    it('COMPACTION_STRATEGY_VALUES 应包含 3 个值', async () => {
      const { COMPACTION_STRATEGY_VALUES } = await import('../tui/types/aiEngine.js');
      expect(COMPACTION_STRATEGY_VALUES).toEqual(['semantic', 'extractive', 'truncation']);
    });

    it('TOOL_PROFILE_LABELS 应有 4 个标签', async () => {
      const { TOOL_PROFILE_LABELS } = await import('../tui/types/aiEngine.js');
      expect(Object.keys(TOOL_PROFILE_LABELS)).toHaveLength(4);
      expect(TOOL_PROFILE_LABELS.full.label).toBe('完整');
    });

    it('COMPACTION_STRATEGY_LABELS 应有 3 个标签', async () => {
      const { COMPACTION_STRATEGY_LABELS } = await import('../tui/types/aiEngine.js');
      expect(Object.keys(COMPACTION_STRATEGY_LABELS)).toHaveLength(3);
      expect(COMPACTION_STRATEGY_LABELS.semantic.label).toBe('语义摘要');
    });
  });

  // ==================== 5. 新增命令 ====================
  describe('新增 TUI 命令', () => {
    let output: string[];
    let errors: string[];
    let mockBackend: MockTuiBackend;
    let ctx: any;

    beforeEach(async () => {
      output = [];
      errors = [];
      mockBackend = new MockTuiBackend();
      ctx = {
        backend: mockBackend as any,
        sessionId: null,
        setSessionId: vi.fn(),
        print: (text: string) => output.push(text),
        printError: (text: string) => errors.push(text),
        exit: vi.fn(),
      };
    });

    it('/theme 应能显示当前主题', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/theme', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('当前主题'))).toBe(true);
    });

    it('/theme dark 应能切换到暗色主题', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/theme dark', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('已切换'))).toBe(true);
    });

    it('/theme light 应能切换到亮色主题', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/theme light', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('已切换'))).toBe(true);
    });

    it('/config 应能显示当前配置', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/config', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('TUI 配置'))).toBe(true);
      expect(output.some(t => t.includes('后端类型'))).toBe(true);
    });

    it('/profiles 应能列出所有工具 Profile', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/profiles', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('工具 Profile'))).toBe(true);
      expect(output.some(t => t.includes('minimal'))).toBe(true);
      expect(output.some(t => t.includes('coding'))).toBe(true);
    });

    it('/set 应能修改 theme 配置', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      // 使用临时配置文件避免污染用户配置
      const tmpDir = mkdtempSync(join(tmpdir(), 'tui-set-'));
      const tmpConfig = join(tmpDir, 'tui.json');
      const oldEnv = process.env.CDF_TUI_CONFIG;
      process.env.CDF_TUI_CONFIG = tmpConfig;
      try {
        const handled = await executeCommand('/set theme dark', ctx);
        expect(handled).toBe(true);
        expect(output.some(t => t.includes('已保存'))).toBe(true);
      } finally {
        if (oldEnv === undefined) delete process.env.CDF_TUI_CONFIG;
        else process.env.CDF_TUI_CONFIG = oldEnv;
        try { unlinkSync(tmpConfig); } catch { /* ignore */ }
      }
    });

    it('/set 应能拒绝非法 theme', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/set theme invalid', ctx);
      expect(handled).toBe(true);
      expect(errors.some(e => e.includes('theme'))).toBe(true);
    });

    it('/set 应能拒绝非法 toolProfile', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/set toolProfile invalid', ctx);
      expect(handled).toBe(true);
      expect(errors.some(e => e.includes('toolProfile'))).toBe(true);
    });

    it('/set 应能拒绝越界的 threshold', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/set threshold 1.5', ctx);
      expect(handled).toBe(true);
      expect(errors.some(e => e.includes('threshold'))).toBe(true);
    });

    it('/set 应能拒绝未知 key', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/set unknown_key value', ctx);
      expect(handled).toBe(true);
      expect(errors.some(e => e.includes('未知配置项'))).toBe(true);
    });

    it('/set 应能拒绝缺失参数', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/set theme', ctx);
      expect(handled).toBe(true);
      expect(errors.some(e => e.includes('用法'))).toBe(true);
    });

    it('/help 应能展示新命令', async () => {
      const { executeCommand } = await import('../tui/commands.js');
      const handled = await executeCommand('/help', ctx);
      expect(handled).toBe(true);
      expect(output.some(t => t.includes('/theme'))).toBe(true);
      expect(output.some(t => t.includes('/config'))).toBe(true);
      expect(output.some(t => t.includes('/set'))).toBe(true);
      expect(output.some(t => t.includes('/profiles'))).toBe(true);
      expect(output.some(t => t.includes('快捷键'))).toBe(true);
    });
  });

  // ==================== 6. HttpBackend 类 ====================
  describe('HttpBackend 后端', () => {
    it('HttpBackend 类应存在且可实例化', async () => {
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const backend = new HttpBackend({ baseUrl: 'http://localhost:3001' });
      expect(backend).toBeDefined();
      expect(typeof backend.sendChat).toBe('function');
      expect(typeof backend.abortChat).toBe('function');
      expect(typeof backend.loadHistory).toBe('function');
      expect(typeof backend.listSessions).toBe('function');
      expect(typeof backend.createSession).toBe('function');
      expect(typeof backend.deleteSession).toBe('function');
    });

    it('HttpBackend 应去除 baseUrl 末尾的斜杠', async () => {
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const backend = new HttpBackend({ baseUrl: 'http://localhost:3001///' });
      // 通过反射获取私有属性
      const baseUrl = (backend as any).baseUrl;
      expect(baseUrl).toBe('http://localhost:3001');
    });

    it('HttpBackend 错误处理应能转换为 ChatEvent', async () => {
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const backend = new HttpBackend({ baseUrl: 'http://127.0.0.1:1' }); // 错误的端口
      const messages = [{ role: 'user', content: 'test' }];

      const events: any[] = [];
      const stream = backend.sendChat(messages);
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'error' || event.type === 'assistant_end') break;
      }

      // 应该至少有一个错误事件
      expect(events.length).toBeGreaterThan(0);
    });

    it('HttpBackend abortChat 应能取消', async () => {
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const backend = new HttpBackend({ baseUrl: 'http://127.0.0.1:1' });
      expect(() => backend.abortChat()).not.toThrow();
    });
  });

  // ==================== 7. 主入口导出 ====================
  describe('TUI 主入口导出', () => {
    it('index 应导出 HttpBackend', async () => {
      const tui = await import('../tui/index.js');
      expect(tui.HttpBackend).toBeDefined();
    });

    it('index 应导出 themeManager', async () => {
      const tui = await import('../tui/index.js');
      expect(tui.themeManager).toBeDefined();
      expect(typeof tui.themeManager.getTheme).toBe('function');
      expect(typeof tui.themeManager.switchTheme).toBe('function');
    });

    it('index 应导出配置相关函数', async () => {
      const tui = await import('../tui/index.js');
      expect(tui.loadTuiConfig).toBeDefined();
      expect(tui.saveTuiConfig).toBeDefined();
      expect(tui.getDefaultConfigPath).toBeDefined();
      expect(tui.validateTuiConfig).toBeDefined();
      expect(tui.DEFAULT_TUI_CONFIG).toBeDefined();
    });

    it('index 应导出 AI 引擎常量', async () => {
      const tui = await import('../tui/index.js');
      expect(tui.TOOL_PROFILE_VALUES).toBeDefined();
      expect(tui.COMPACTION_STRATEGY_VALUES).toBeDefined();
      expect(tui.TOOL_PROFILE_LABELS).toBeDefined();
      expect(tui.COMPACTION_STRATEGY_LABELS).toBeDefined();
    });

    it('index 应导出 CLI 入口', async () => {
      const tui = await import('../tui/index.js');
      expect(tui.runTuiCli).toBeDefined();
      expect(tui.parseArgs).toBeDefined();
      expect(tui.selectBackend).toBeDefined();
    });
  });

  // ==================== 8. selectBackend ====================
  describe('selectBackend 后端选择', () => {
    it('http 参数为 true 时应返回 HttpBackend', async () => {
      const { selectBackend } = await import('../tui/cli.js');
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const { DEFAULT_TUI_CONFIG } = await import('../tui/config.js');

      const config = { ...DEFAULT_TUI_CONFIG, backend: 'http' as const, http: { baseUrl: 'http://test:3001' } };
      const args = { http: true, saveConfig: false, validateConfig: false, version: false, help: false, verbose: false, listBackends: false } as any;

      const backend = selectBackend(config, args);
      expect(backend).toBeInstanceOf(HttpBackend);
    });

    it('配置 backend=embedded 时应返回 EmbeddedBackend', async () => {
      const { selectBackend } = await import('../tui/cli.js');
      const { ChatServiceBackend } = await import('../tui/embeddedBackend.js');
      const { DEFAULT_TUI_CONFIG } = await import('../tui/config.js');

      const config = { ...DEFAULT_TUI_CONFIG, backend: 'embedded' as const };
      const args = { http: false, saveConfig: false, validateConfig: false, version: false, help: false, verbose: false, listBackends: false } as any;

      const backend = selectBackend(config, args);
      expect(backend).toBeInstanceOf(ChatServiceBackend);
    });

    it('命令行 --url 应覆盖配置的 baseUrl', async () => {
      const { selectBackend } = await import('../tui/cli.js');
      const { HttpBackend } = await import('../tui/httpBackend.js');
      const { DEFAULT_TUI_CONFIG } = await import('../tui/config.js');

      const config = { ...DEFAULT_TUI_CONFIG, backend: 'http' as const, http: { baseUrl: 'http://default:3001' } };
      const args = {
        http: true, url: 'http://override:4000', saveConfig: false, validateConfig: false,
        version: false, help: false, verbose: false, listBackends: false
      } as any;

      const backend = selectBackend(config, args);
      expect(backend).toBeInstanceOf(HttpBackend);
      expect((backend as any).baseUrl).toBe('http://override:4000');
    });
  });
});
