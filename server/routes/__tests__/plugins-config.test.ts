/**
 * 插件配置 API 集成测试
 *
 * 覆盖 /api/plugins/:id/config 相关端点：
 * - GET /api/plugins/:id/config — 获取配置和 Schema
 * - PUT /api/plugins/:id/config — 更新配置
 * - POST /api/plugins/:id/config/reset — 重置为默认值
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// 使用 vi.hoisted 定义 mock 函数，避免 hoisting 问题
const mockFns = vi.hoisted(() => ({
  getPlugin: vi.fn(),
  getPluginConfig: vi.fn(),
  setPluginConfig: vi.fn(),
  listPlugins: vi.fn(),
  updatePlugin: vi.fn(),
}));

vi.mock('../../dao/plugins.js', () => ({
  getPlugin: mockFns.getPlugin,
  getPluginConfig: mockFns.getPluginConfig,
  setPluginConfig: mockFns.setPluginConfig,
  listPlugins: mockFns.listPlugins,
  updatePlugin: mockFns.updatePlugin,
}));

// mock pluginRegistry
vi.mock('../../engine/pluginRegistry.js', () => ({
  pluginRegistry: {
    getHealth: vi.fn().mockReturnValue({}),
    reload: vi.fn(),
  },
}));

// mock plugins index barrel 文件，避免加载大量未移植模块
vi.mock('../../engine/plugins/index.js', () => ({
  pluginRegistry: {
    getHealth: vi.fn().mockReturnValue({}),
    reload: vi.fn(),
    install: vi.fn(),
    installFromGit: vi.fn(),
    installFromNpm: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    uninstall: vi.fn(),
  },
  pluginManager: {
    getStats: vi.fn().mockReturnValue({ total: 0, enabled: 0, disabled: 0 }),
    getHealth: vi.fn().mockReturnValue({ status: 'healthy' }),
    getPluginInfo: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    bulkActivate: vi.fn(),
    bulkDeactivate: vi.fn(),
    resetConfig: vi.fn(),
    listPlugins: vi.fn().mockReturnValue({ items: [], total: 0 }),
  },
}));

import pluginsRouter from '../plugins.js';

describe('插件配置 API', () => {
  let app: express.Application;
  let mockGetPlugin: typeof mockFns.getPlugin;
  let mockGetPluginConfig: typeof mockFns.getPluginConfig;
  let mockSetPluginConfig: typeof mockFns.setPluginConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/plugins', pluginsRouter);

    // 快捷引用
    mockGetPlugin = mockFns.getPlugin;
    mockGetPluginConfig = mockFns.getPluginConfig;
    mockSetPluginConfig = mockFns.setPluginConfig;
  });

  const mockPlugin = {
    id: 'plugin-1',
    name: 'Test Plugin',
    version: '1.0.0',
    status: 'enabled',
    manifest_json: JSON.stringify({
      name: 'Test Plugin',
      configSchema: {
        version: '1.0',
        fields: [
          {
            key: 'apiKey',
            type: 'string',
            label: 'API Key',
            description: 'Your API key',
            default: '',
            required: true,
          },
          {
            key: 'timeout',
            type: 'number',
            label: 'Timeout',
            description: 'Request timeout in ms',
            default: 5000,
          },
          {
            key: 'enabled',
            type: 'boolean',
            label: 'Enabled',
            description: 'Enable this feature',
            default: true,
          },
          {
            key: 'mode',
            type: 'string',
            label: 'Mode',
            description: 'Operation mode',
            default: 'auto',
            enum: ['auto', 'manual', 'disabled'],
          },
        ],
      },
    }),
    metadata: JSON.stringify({ config: { apiKey: 'secret-key', timeout: 3000 } }),
  };

  const mockPluginNoSchema = {
    id: 'plugin-2',
    name: 'Simple Plugin',
    version: '1.0.0',
    status: 'enabled',
    manifest_json: JSON.stringify({ name: 'Simple Plugin' }),
    metadata: '{}',
  };

  // ===================== GET /:id/config =====================
  describe('GET /api/plugins/:id/config', () => {
    it('返回插件配置和 Schema', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);
      mockGetPluginConfig.mockReturnValue({ apiKey: 'secret-key', timeout: 3000 });

      const res = await request(app).get('/api/plugins/plugin-1/config');
      expect(res.status).toBe(200);
      expect(res.body.data.config).toEqual({ apiKey: 'secret-key', timeout: 3000 });
      expect(res.body.data.configSchema).not.toBeNull();
      expect(res.body.data.configSchema.fields).toHaveLength(4);
    });

    it('无 Schema 的插件返回 null configSchema', async () => {
      mockGetPlugin.mockReturnValue(mockPluginNoSchema);
      mockGetPluginConfig.mockReturnValue({});

      const res = await request(app).get('/api/plugins/plugin-2/config');
      expect(res.status).toBe(200);
      expect(res.body.data.config).toEqual({});
      expect(res.body.data.configSchema).toBeNull();
    });

    it('不存在的插件返回 404', async () => {
      mockGetPlugin.mockReturnValue(undefined);

      const res = await request(app).get('/api/plugins/nonexistent/config');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('不存在');
    });

    it('manifest_json 解析失败时仍返回配置', async () => {
      mockGetPlugin.mockReturnValue({
        ...mockPlugin,
        manifest_json: 'invalid-json',
      });
      mockGetPluginConfig.mockReturnValue({ apiKey: 'test' });

      const res = await request(app).get('/api/plugins/plugin-1/config');
      expect(res.status).toBe(200);
      expect(res.body.data.config).toEqual({ apiKey: 'test' });
      expect(res.body.data.configSchema).toBeNull();
    });
  });

  // ===================== PUT /:id/config =====================
  describe('PUT /api/plugins/:id/config', () => {
    it('更新插件配置', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);
      mockSetPluginConfig.mockReturnValue(mockPlugin);

      const newConfig = { apiKey: 'new-key', timeout: 10000 };
      const res = await request(app)
        .put('/api/plugins/plugin-1/config')
        .send({ config: newConfig });

      expect(res.status).toBe(200);
      expect(mockSetPluginConfig).toHaveBeenCalledWith('plugin-1', newConfig);
    });

    it('config 不是对象时返回 400', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);

      const res = await request(app)
        .put('/api/plugins/plugin-1/config')
        .send({ config: 'not-an-object' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config');
    });

    it('config 为 null 时返回 400', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);

      const res = await request(app)
        .put('/api/plugins/plugin-1/config')
        .send({ config: null });

      expect(res.status).toBe(400);
    });

    it('不存在的插件返回 404', async () => {
      mockGetPlugin.mockReturnValue(undefined);

      const res = await request(app)
        .put('/api/plugins/nonexistent/config')
        .send({ config: {} });

      expect(res.status).toBe(404);
    });

    it('更新失败时返回 500', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);
      mockSetPluginConfig.mockReturnValue(undefined);

      const res = await request(app)
        .put('/api/plugins/plugin-1/config')
        .send({ config: { key: 'value' } });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('更新插件配置失败');
    });
  });

  // ===================== POST /:id/config/reset =====================
  describe('POST /api/plugins/:id/config/reset', () => {
    it('重置为 Schema 中的默认值', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);
      mockSetPluginConfig.mockReturnValue(mockPlugin);

      const res = await request(app).post('/api/plugins/plugin-1/config/reset');
      expect(res.status).toBe(200);

      // 验证传入 setPluginConfig 的是默认值
      const expectedDefaults = {
        apiKey: '',
        timeout: 5000,
        enabled: true,
        mode: 'auto',
      };
      expect(mockSetPluginConfig).toHaveBeenCalledWith('plugin-1', expectedDefaults);
    });

    it('无 Schema 的插件重置为空对象', async () => {
      mockGetPlugin.mockReturnValue(mockPluginNoSchema);
      mockSetPluginConfig.mockReturnValue(mockPluginNoSchema);

      const res = await request(app).post('/api/plugins/plugin-2/config/reset');
      expect(res.status).toBe(200);
      expect(mockSetPluginConfig).toHaveBeenCalledWith('plugin-2', {});
    });

    it('不存在的插件返回 404', async () => {
      mockGetPlugin.mockReturnValue(undefined);

      const res = await request(app).post('/api/plugins/nonexistent/config/reset');
      expect(res.status).toBe(404);
    });

    it('重置失败时返回 500', async () => {
      mockGetPlugin.mockReturnValue(mockPlugin);
      mockSetPluginConfig.mockReturnValue(undefined);

      const res = await request(app).post('/api/plugins/plugin-1/config/reset');
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('重置插件配置失败');
    });
  });
});
