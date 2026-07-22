/**
 * Insights 路由集成模块端点测试
 *
 * 覆盖 5 个新集成模块的 HTTP API：
 * - GET  /api/insights/integration/status
 * - GET  /api/insights/llm/circuit-breakers
 * - DELETE /api/insights/llm/circuit-breakers
 * - GET  /api/insights/channels/circuit-breakers
 * - GET  /api/insights/channels/circuit-breakers/open
 * - POST /api/insights/channels/circuit-breakers/sync
 * - DELETE /api/insights/channels/circuit-breakers
 * - GET  /api/insights/skills/dependency-check/recent
 * - POST /api/insights/skills/dependency-check
 * - POST /api/insights/skills/dependency-check/pre-install
 * - GET  /api/insights/permissions/policies
 * - GET  /api/insights/permissions/templates
 * - POST /api/insights/permissions/load
 * - POST /api/insights/permissions/validate
 * - POST /api/insights/permissions/load-from-file
 * - POST /api/insights/config/bootstrap
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock logger（避免测试产生日志噪音）
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 使用 vi.hoisted 保证 mock 在 vi.mock 中可用
const {
  mockAgentAuditTrail,
  mockChannelHealthMonitor,
  mockLlmCostTracker,
  mockConfigMigrationManager,
  mockSkillVersionRegistry,
  mockLlmInvoker,
  mockChannelCircuitBreakerManager,
  mockSkillDependencyChecker,
  mockPermissionPolicyLoader,
  mockConfigBootstrap,
} = vi.hoisted(() => ({
  mockAgentAuditTrail: {
    query: vi.fn(),
    getStats: vi.fn(),
    getTimeline: vi.fn(),
  },
  mockChannelHealthMonitor: {
    getAllHealth: vi.fn(),
    getHealth: vi.fn(),
    getUnhealthyChannels: vi.fn(),
  },
  mockLlmCostTracker: {
    aggregate: vi.fn(),
    getRecent: vi.fn(),
    getAgentTotalCost: vi.fn(),
    listPricings: vi.fn(),
  },
  mockConfigMigrationManager: {
    listMigrations: vi.fn(),
    migrate: vi.fn(),
    rollback: vi.fn(),
  },
  mockSkillVersionRegistry: {
    listVersions: vi.fn(),
    getLatest: vi.fn(),
    getAliases: vi.fn(),
    getStats: vi.fn(),
  },
  mockLlmInvoker: {
    listCircuitBreakers: vi.fn(),
    clearCircuitBreakers: vi.fn(),
  },
  mockChannelCircuitBreakerManager: {
    listBreakers: vi.fn(),
    listOpenCircuits: vi.fn(),
    syncAllFromHealthMonitor: vi.fn(),
    resetAll: vi.fn(),
  },
  mockSkillDependencyChecker: {
    preInstallCheck: vi.fn(),
    postLoadCheck: vi.fn(),
  },
  mockPermissionPolicyLoader: {
    loadPolicies: vi.fn(),
    validatePolicyInputs: vi.fn(),
    loadPoliciesFromFile: vi.fn(),
    listLoadedPolicies: vi.fn(),
    listTemplates: vi.fn(),
  },
  mockConfigBootstrap: {
    bootstrapConfig: vi.fn(),
  },
}));

vi.mock('../../engine/agents/agent-audit-trail.js', () => ({
  agentAuditTrail: mockAgentAuditTrail,
}));

vi.mock('../../channels/channel-health-monitor.js', () => ({
  channelHealthMonitor: mockChannelHealthMonitor,
}));

vi.mock('../../engine/llm/cost-tracker.js', () => ({
  llmCostTracker: mockLlmCostTracker,
}));

vi.mock('../../config/config-migration.js', () => ({
  configMigrationManager: mockConfigMigrationManager,
  CURRENT_CONFIG_VERSION: 3,
}));

vi.mock('../../engine/skills/skill-version-registry.js', () => ({
  skillVersionRegistry: mockSkillVersionRegistry,
}));

// 集成模块 mock
vi.mock('../../engine/llm/llm-invoker.js', () => mockLlmInvoker);
vi.mock('../../channels/channel-circuit-breaker.js', () => ({
  channelCircuitBreakerManager: mockChannelCircuitBreakerManager,
}));
vi.mock('../../engine/skills/skill-dependency-checker.js', () => mockSkillDependencyChecker);
vi.mock('../../engine/agents/permission-policy-loader.js', () => mockPermissionPolicyLoader);
vi.mock('../../config/config-bootstrap.js', () => mockConfigBootstrap);

import insightsRouter from '../insights.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', insightsRouter);
  return app;
}

describe('Insights Router - 集成模块端点', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('GET /api/insights/integration/status', () => {
    it('应返回所有 5 个集成模块的激活状态', async () => {
      mockLlmInvoker.listCircuitBreakers.mockReturnValue([
        { provider: 'openai', state: 'closed', snapshot: {} },
      ]);
      mockChannelCircuitBreakerManager.listBreakers.mockReturnValue([
        { channelId: 'chan-1', state: 'closed', snapshot: {} },
      ]);
      mockChannelCircuitBreakerManager.listOpenCircuits.mockReturnValue([]);
      mockPermissionPolicyLoader.listLoadedPolicies.mockReturnValue([
        { agentId: 'agent-1', policy: {} },
      ]);
      mockPermissionPolicyLoader.listTemplates.mockReturnValue([
        { name: 'strict', definition: {} },
        { name: 'permissive', definition: {} },
      ]);

      const res = await request(app).get('/api/insights/integration/status');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.llmInvoker.registeredCircuitBreakers).toBe(1);
      expect(res.body.data.channelCircuitBreaker.registeredBreakers).toBe(1);
      expect(res.body.data.configBootstrap.ready).toBe(true);
      expect(res.body.data.skillDependencyChecker.lastCheckSummary).toBeUndefined();
      expect(res.body.data.permissionPolicyLoader.loadedPolicies).toBe(1);
      expect(res.body.data.permissionPolicyLoader.availableTemplates).toBe(2);
    });

    it('当 LLM 熔断器有 open 状态时应返回 openCircuits 列表', async () => {
      mockLlmInvoker.listCircuitBreakers.mockReturnValue([
        { provider: 'openai', state: 'closed', snapshot: {} },
        { provider: 'anthropic', state: 'open', snapshot: {} },
      ]);
      mockChannelCircuitBreakerManager.listBreakers.mockReturnValue([]);
      mockChannelCircuitBreakerManager.listOpenCircuits.mockReturnValue([]);
      mockPermissionPolicyLoader.listLoadedPolicies.mockReturnValue([]);
      mockPermissionPolicyLoader.listTemplates.mockReturnValue([]);

      const res = await request(app).get('/api/insights/integration/status');

      expect(res.status).toBe(200);
      expect(res.body.data.llmInvoker.openCircuits).toEqual(['anthropic']);
    });
  });

  describe('LLM 熔断器', () => {
    it('GET /llm/circuit-breakers 应返回熔断器列表', async () => {
      mockLlmInvoker.listCircuitBreakers.mockReturnValue([
        { provider: 'openai', state: 'closed', snapshot: { failures: 0 } },
      ]);

      const res = await request(app).get('/api/insights/llm/circuit-breakers');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].provider).toBe('openai');
    });

    it('DELETE /llm/circuit-breakers 应清空所有熔断器', async () => {
      const res = await request(app).delete('/api/insights/llm/circuit-breakers');

      expect(res.status).toBe(200);
      expect(res.body.data.cleared).toBe(true);
      expect(mockLlmInvoker.clearCircuitBreakers).toHaveBeenCalledTimes(1);
    });
  });

  describe('通道熔断器', () => {
    it('GET /channels/circuit-breakers 应返回通道熔断器列表', async () => {
      mockChannelCircuitBreakerManager.listBreakers.mockReturnValue([
        { channelId: 'wechat', state: 'closed', snapshot: {} },
      ]);

      const res = await request(app).get('/api/insights/channels/circuit-breakers');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].channelId).toBe('wechat');
    });

    it('GET /channels/circuit-breakers/open 应返回已熔断通道', async () => {
      mockChannelCircuitBreakerManager.listOpenCircuits.mockReturnValue(['slack', 'discord']);

      const res = await request(app).get('/api/insights/channels/circuit-breakers/open');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(['slack', 'discord']);
    });

    it('POST /channels/circuit-breakers/sync 应触发手动同步', async () => {
      mockChannelCircuitBreakerManager.listBreakers.mockReturnValue([
        { channelId: 'wechat', state: 'closed', snapshot: {} },
      ]);

      const res = await request(app).post('/api/insights/channels/circuit-breakers/sync');

      expect(res.status).toBe(200);
      expect(res.body.data.synced).toBe(true);
      expect(res.body.data.breakers).toBe(1);
      expect(mockChannelCircuitBreakerManager.syncAllFromHealthMonitor).toHaveBeenCalledTimes(1);
    });

    it('DELETE /channels/circuit-breakers 应重置所有熔断器', async () => {
      const res = await request(app).delete('/api/insights/channels/circuit-breakers');

      expect(res.status).toBe(200);
      expect(res.body.data.reset).toBe(true);
      expect(mockChannelCircuitBreakerManager.resetAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('技能依赖检查', () => {
    it('GET /skills/dependency-check/recent 未执行过检查时应返回 404', async () => {
      const res = await request(app).get('/api/insights/skills/dependency-check/recent');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('尚未执行过');
    });

    it('POST /skills/dependency-check 缺少 entries 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/skills/dependency-check')
        .send({ entries: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('entries');
    });

    it('POST /skills/dependency-check 应返回检查结果并缓存', async () => {
      const fakeBatch = {
        total: 2,
        passed: 1,
        failed: 1,
        globalCycles: [],
        loadOrder: [
          { skill: { name: 'skill-a' } },
          { skill: { name: 'skill-b' } },
        ],
        results: new Map(),
        report: 'batch report',
      };
      mockSkillDependencyChecker.postLoadCheck.mockReturnValue(fakeBatch);

      const res = await request(app)
        .post('/api/insights/skills/dependency-check')
        .send({ entries: [{ skill: { name: 'skill-a' } }, { skill: { name: 'skill-b' } }] });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.passed).toBe(1);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.loadOrder).toEqual(['skill-a', 'skill-b']);
      expect(mockSkillDependencyChecker.postLoadCheck).toHaveBeenCalledTimes(1);

      // 再请求 /recent 应该返回缓存结果
      const res2 = await request(app).get('/api/insights/skills/dependency-check/recent');
      expect(res2.status).toBe(200);
      expect(res2.body.data.total).toBe(2);
      expect(res2.body.data.report).toBe('batch report');
    });

    it('POST /skills/dependency-check/pre-install 缺少参数应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/skills/dependency-check/pre-install')
        .send({ newEntry: { skill: { name: 'x' } } }); // missing existingEntries

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('existingEntries');
    });

    it('POST /skills/dependency-check/pre-install 应返回安装前检查结果', async () => {
      mockSkillDependencyChecker.preInstallCheck.mockReturnValue({
        allowed: true,
        result: { valid: true },
        report: 'ok',
      });

      const res = await request(app)
        .post('/api/insights/skills/dependency-check/pre-install')
        .send({
          newEntry: { skill: { name: 'x' } },
          existingEntries: [],
          options: { allowOverride: true },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.allowed).toBe(true);
      expect(mockSkillDependencyChecker.preInstallCheck).toHaveBeenCalledWith(
        { skill: { name: 'x' } },
        [],
        { allowOverride: true },
      );
    });
  });

  describe('权限策略加载器', () => {
    it('GET /permissions/policies 应返回已加载策略列表', async () => {
      mockPermissionPolicyLoader.listLoadedPolicies.mockReturnValue([
        { agentId: 'agent-1', policy: { allowed: ['file.read'] } },
      ]);

      const res = await request(app).get('/api/insights/permissions/policies');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].agentId).toBe('agent-1');
    });

    it('GET /permissions/templates 应返回模板列表', async () => {
      mockPermissionPolicyLoader.listTemplates.mockReturnValue([
        { name: 'strict', definition: { denied: ['exec.shell'] } },
      ]);

      const res = await request(app).get('/api/insights/permissions/templates');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('strict');
    });

    it('POST /permissions/load 缺少 inputs 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/permissions/load')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('inputs');
    });

    it('POST /permissions/load 应批量加载策略', async () => {
      mockPermissionPolicyLoader.loadPolicies.mockReturnValue({
        loaded: 1,
        skipped: 0,
        errors: [],
        policies: [{ agentId: 'agent-1' }],
      });

      const res = await request(app)
        .post('/api/insights/permissions/load')
        .send({ inputs: [{ agentId: 'agent-1', template: 'strict' }], audit: true });

      expect(res.status).toBe(200);
      expect(res.body.data.loaded).toBe(1);
      expect(mockPermissionPolicyLoader.loadPolicies).toHaveBeenCalledWith(
        [{ agentId: 'agent-1', template: 'strict' }],
        { audit: true },
      );
    });

    it('POST /permissions/load 默认应启用 audit', async () => {
      mockPermissionPolicyLoader.loadPolicies.mockReturnValue({ loaded: 0, skipped: 0, errors: [], policies: [] });

      await request(app)
        .post('/api/insights/permissions/load')
        .send({ inputs: [] });

      // audit 默认为 true（req.body?.audit !== false）
      expect(mockPermissionPolicyLoader.loadPolicies).toHaveBeenCalledWith([], { audit: true });
    });

    it('POST /permissions/load 显式 audit=false 应禁用审计', async () => {
      mockPermissionPolicyLoader.loadPolicies.mockReturnValue({ loaded: 0, skipped: 0, errors: [], policies: [] });

      await request(app)
        .post('/api/insights/permissions/load')
        .send({ inputs: [], audit: false });

      expect(mockPermissionPolicyLoader.loadPolicies).toHaveBeenCalledWith([], { audit: false });
    });

    it('POST /permissions/validate 缺少 inputs 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/permissions/validate')
        .send({});

      expect(res.status).toBe(400);
    });

    it('POST /permissions/validate 应返回验证结果', async () => {
      mockPermissionPolicyLoader.validatePolicyInputs.mockReturnValue({
        valid: true,
        errors: [],
        resolved: [{ agentId: 'agent-1' }],
      });

      const res = await request(app)
        .post('/api/insights/permissions/validate')
        .send({ inputs: [{ agentId: 'agent-1', template: 'strict' }] });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    it('POST /permissions/load-from-file 缺少 configPath 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/permissions/load-from-file')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('configPath');
    });

    it('POST /permissions/load-from-file 应从文件加载策略', async () => {
      mockPermissionPolicyLoader.loadPoliciesFromFile.mockReturnValue({
        loaded: 2,
        skipped: 0,
        errors: [],
        policies: [{ agentId: 'a' }, { agentId: 'b' }],
      });

      const res = await request(app)
        .post('/api/insights/permissions/load-from-file')
        .send({ configPath: '/tmp/policies.json' });

      expect(res.status).toBe(200);
      expect(res.body.data.loaded).toBe(2);
      expect(mockPermissionPolicyLoader.loadPoliciesFromFile).toHaveBeenCalledWith('/tmp/policies.json');
    });
  });

  describe('配置启动引导', () => {
    it('POST /config/bootstrap 缺少 configPath 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/config/bootstrap')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('configPath');
    });

    it('POST /config/bootstrap 应执行配置引导', async () => {
      mockConfigBootstrap.bootstrapConfig.mockResolvedValue({
        success: true,
        config: { configVersion: 3 },
        migration: { appliedMigrations: ['v1-to-v2'] },
        validation: { errorCount: 0, errors: [] },
        configPath: '/tmp/config.json',
        persisted: true,
      });

      const res = await request(app)
        .post('/api/insights/config/bootstrap')
        .send({
          configPath: '/tmp/config.json',
          failOnError: true,
          persistAfterMigrate: true,
          createBackup: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.persisted).toBe(true);
      expect(mockConfigBootstrap.bootstrapConfig).toHaveBeenCalledWith({
        configPath: '/tmp/config.json',
        failOnError: true,
        persistAfterMigrate: true,
        rollbackOnFailure: undefined,
        backupDir: undefined,
        createBackup: true,
      });
    });

    it('bootstrapConfig 抛错时应返回 500', async () => {
      mockConfigBootstrap.bootstrapConfig.mockRejectedValue(new Error('disk full'));

      const res = await request(app)
        .post('/api/insights/config/bootstrap')
        .send({ configPath: '/tmp/x.json' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('disk full');
    });
  });
});
