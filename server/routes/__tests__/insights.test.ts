/**
 * Insights 路由单元测试
 *
 * 覆盖系统洞察 API 的所有端点：
 * - Agent 审计跟踪
 * - 通道健康度
 * - LLM 成本追踪
 * - 配置迁移
 * - 技能版本注册表
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 中可用（vi.mock 是 hoisted 的）
const {
  mockAgentAuditTrail,
  mockChannelHealthMonitor,
  mockLlmCostTracker,
  mockConfigMigrationManager,
  mockSkillVersionRegistry,
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

// 导入路由（在 mock 之后）
import insightsRouter from '../insights.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/insights', insightsRouter);
  return app;
}

describe('Insights Router', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('Agent 审计跟踪', () => {
    it('GET /audit-trail 应返回查询结果', async () => {
      mockAgentAuditTrail.query.mockReturnValue({
        events: [{ id: 'evt-1', agentId: 'a-1' }],
        total: 1,
        offset: 0,
        limit: 100,
      });

      const res = await request(app).get('/api/insights/audit-trail?agentId=a-1&limit=50');

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(mockAgentAuditTrail.query).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'a-1',
          limit: 50,
          descending: true,
        }),
      );
    });

    it('GET /audit-trail/stats 应返回统计', async () => {
      mockAgentAuditTrail.getStats.mockReturnValue({ total: 0 });

      const res = await request(app).get('/api/insights/audit-trail/stats');

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
    });

    it('GET /audit-trail/timeline/:agentId 应返回时间线', async () => {
      mockAgentAuditTrail.getTimeline.mockReturnValue([
        { id: 'evt-1', type: 'lifecycle.created' },
      ]);

      const res = await request(app).get('/api/insights/audit-trail/timeline/agent-1');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(mockAgentAuditTrail.getTimeline).toHaveBeenCalledWith('agent-1', {});
    });

    it('应支持时间范围参数', async () => {
      mockAgentAuditTrail.getTimeline.mockReturnValue([]);

      await request(app).get(
        '/api/insights/audit-trail/timeline/agent-1?fromTimestamp=1000&toTimestamp=2000',
      );

      expect(mockAgentAuditTrail.getTimeline).toHaveBeenCalledWith('agent-1', {
        fromTimestamp: 1000,
        toTimestamp: 2000,
      });
    });
  });

  describe('通道健康度', () => {
    it('GET /channels/health 应返回所有通道健康度', async () => {
      mockChannelHealthMonitor.getAllHealth.mockReturnValue([
        { channelId: 'ch-1', status: 'healthy' },
      ]);

      const res = await request(app).get('/api/insights/channels/health');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('GET /channels/health/:channelId 应返回单通道健康度', async () => {
      mockChannelHealthMonitor.getHealth.mockReturnValue({
        channelId: 'ch-1',
        status: 'healthy',
      });

      const res = await request(app).get('/api/insights/channels/health/ch-1');

      expect(res.status).toBe(200);
      expect(res.body.data.channelId).toBe('ch-1');
    });

    it('未注册的通道应返回 404', async () => {
      mockChannelHealthMonitor.getHealth.mockReturnValue(undefined);

      const res = await request(app).get('/api/insights/channels/health/unknown');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('未注册');
    });

    it('GET /channels/unhealthy 应返回不健康通道', async () => {
      mockChannelHealthMonitor.getUnhealthyChannels.mockReturnValue([
        { channelId: 'ch-bad', status: 'unhealthy' },
      ]);

      const res = await request(app).get('/api/insights/channels/unhealthy');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('LLM 成本', () => {
    it('GET /llm/cost/aggregate 应返回聚合', async () => {
      mockLlmCostTracker.aggregate.mockReturnValue({
        totalCalls: 10,
        totalCost: 0.5,
      });

      const res = await request(app).get('/api/insights/llm/cost/aggregate');

      expect(res.status).toBe(200);
      expect(res.body.data.totalCalls).toBe(10);
    });

    it('GET /llm/cost/recent 应返回最近调用', async () => {
      mockLlmCostTracker.getRecent.mockReturnValue([{ id: 'usage-1' }]);

      const res = await request(app).get('/api/insights/llm/cost/recent?limit=5');

      expect(res.status).toBe(200);
      expect(mockLlmCostTracker.getRecent).toHaveBeenCalledWith(5);
    });

    it('GET /llm/cost/agent/:agentId 应返回 Agent 成本', async () => {
      mockLlmCostTracker.getAgentTotalCost.mockReturnValue(0.123);

      const res = await request(app).get('/api/insights/llm/cost/agent/agent-1');

      expect(res.status).toBe(200);
      expect(res.body.data.totalCost).toBe(0.123);
    });

    it('GET /llm/pricings 应返回定价表', async () => {
      mockLlmCostTracker.listPricings.mockReturnValue([
        { modelId: 'gpt-4o', promptPricePerMillion: 2.5 },
      ]);

      const res = await request(app).get('/api/insights/llm/pricings');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('配置迁移', () => {
    it('GET /config/migrations 应返回迁移列表', async () => {
      mockConfigMigrationManager.listMigrations.mockReturnValue([
        { fromVersion: 1, toVersion: 2, name: 'm1' },
      ]);

      const res = await request(app).get('/api/insights/config/migrations');

      expect(res.status).toBe(200);
      expect(res.body.data.currentVersion).toBe(3);
      expect(res.body.data.migrations.length).toBe(1);
    });

    it('POST /config/migrate 应执行迁移', async () => {
      mockConfigMigrationManager.migrate.mockResolvedValue({
        success: true,
        fromVersion: 1,
        toVersion: 3,
      });

      const res = await request(app)
        .post('/api/insights/config/migrate')
        .send({ config: { configVersion: 1 }, targetVersion: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(mockConfigMigrationManager.migrate).toHaveBeenCalledWith(
        { configVersion: 1 },
        3,
        { dryRun: false, force: false },
      );
    });

    it('dryRun 应正确传递', async () => {
      mockConfigMigrationManager.migrate.mockResolvedValue({ success: true });

      await request(app)
        .post('/api/insights/config/migrate')
        .send({ config: { configVersion: 1 }, dryRun: true });

      expect(mockConfigMigrationManager.migrate).toHaveBeenCalledWith(
        { configVersion: 1 },
        3,
        { dryRun: true, force: false },
      );
    });

    it('缺少 config 应返回 400', async () => {
      const res = await request(app).post('/api/insights/config/migrate').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config');
    });

    it('POST /config/rollback 应执行回滚', async () => {
      mockConfigMigrationManager.rollback.mockResolvedValue({
        success: true,
        fromVersion: 3,
        toVersion: 1,
      });

      const res = await request(app)
        .post('/api/insights/config/rollback')
        .send({ config: { configVersion: 3 }, targetVersion: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });

    it('回滚缺少 targetVersion 应返回 400', async () => {
      const res = await request(app)
        .post('/api/insights/config/rollback')
        .send({ config: { configVersion: 3 } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('targetVersion');
    });
  });

  describe('技能版本注册表', () => {
    it('GET /skills/versions/:name 应返回版本列表', async () => {
      mockSkillVersionRegistry.listVersions.mockReturnValue([
        { versionString: '1.0.0' },
        { versionString: '2.0.0' },
      ]);

      const res = await request(app).get('/api/insights/skills/versions/my-skill');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(mockSkillVersionRegistry.listVersions).toHaveBeenCalledWith('my-skill');
    });

    it('GET /skills/versions/:name/latest 应返回最新版本', async () => {
      mockSkillVersionRegistry.getLatest.mockReturnValue({
        versionString: '2.0.0',
      });

      const res = await request(app).get('/api/insights/skills/versions/my-skill/latest');

      expect(res.status).toBe(200);
      expect(res.body.data.versionString).toBe('2.0.0');
    });

    it('未注册的技能 latest 应返回 404', async () => {
      mockSkillVersionRegistry.getLatest.mockReturnValue(undefined);

      const res = await request(app).get('/api/insights/skills/versions/unknown/latest');

      expect(res.status).toBe(404);
    });

    it('GET /skills/aliases/:name 应返回别名列表', async () => {
      mockSkillVersionRegistry.getAliases.mockReturnValue([
        { alias: 'latest', version: { major: 2 } },
      ]);

      const res = await request(app).get('/api/insights/skills/aliases/my-skill');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('GET /skills/version-stats 应返回统计', async () => {
      mockSkillVersionRegistry.getStats.mockReturnValue({
        totalSkills: 5,
        totalVersions: 12,
      });

      const res = await request(app).get('/api/insights/skills/version-stats');

      expect(res.status).toBe(200);
      expect(res.body.data.totalSkills).toBe(5);
    });
  });

  describe('错误处理', () => {
    it('Agent audit trail 查询失败应返回 500', async () => {
      mockAgentAuditTrail.query.mockImplementation(() => {
        throw new Error('boom');
      });

      const res = await request(app).get('/api/insights/audit-trail');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('boom');
    });

    it('通道健康查询失败应返回 500', async () => {
      mockChannelHealthMonitor.getAllHealth.mockImplementation(() => {
        throw new Error('channels boom');
      });

      const res = await request(app).get('/api/insights/channels/health');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('channels boom');
    });

    it('LLM 成本查询失败应返回 500', async () => {
      mockLlmCostTracker.aggregate.mockImplementation(() => {
        throw new Error('llm boom');
      });

      const res = await request(app).get('/api/insights/llm/cost/aggregate');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('llm boom');
    });

    it('配置迁移失败应返回 500', async () => {
      mockConfigMigrationManager.migrate.mockRejectedValue(new Error('migrate boom'));

      const res = await request(app)
        .post('/api/insights/config/migrate')
        .send({ config: { configVersion: 1 } });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('migrate boom');
    });
  });
});
