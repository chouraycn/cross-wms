/**
 * 系统洞察 REST API — 暴露五大深化模块的功能
 *
 * 端点：
 * - GET  /api/insights/audit-trail           Agent 审计跟踪查询
 * - GET  /api/insights/audit-trail/stats     Agent 审计跟踪统计
 * - GET  /api/insights/audit-trail/timeline/:agentId  Agent 时间线
 * - GET  /api/insights/channels/health       所有通道健康度
 * - GET  /api/insights/channels/health/:channelId    单通道健康度
 * - GET  /api/insights/channels/unhealthy    不健康通道列表
 * - GET  /api/insights/llm/cost/aggregate     LLM 用量聚合
 * - GET  /api/insights/llm/cost/recent        LLM 最近调用
 * - GET  /api/insights/llm/cost/agent/:agentId Agent 总成本
 * - GET  /api/insights/llm/pricings          LLM 定价表
 * - GET  /api/insights/config/migrations     已注册迁移列表
 * - POST /api/insights/config/migrate         执行配置迁移（dry-run 可选）
 * - POST /api/insights/config/rollback       执行配置回滚
 * - GET  /api/insights/skills/versions/:name  技能版本列表
 * - GET  /api/insights/skills/versions/:name/latest  技能最新版本
 * - GET  /api/insights/skills/aliases/:name   技能别名列表
 * - GET  /api/insights/skills/version-stats   技能版本统计
 *
 * 集成模块（additive，不改动 LIVE 行为）：
 * - GET  /api/insights/integration/status        所有集成模块激活状态
 * - GET  /api/insights/llm/circuit-breakers      LLM 熔断器列表
 * - DELETE /api/insights/llm/circuit-breakers    重置所有 LLM 熔断器
 * - GET  /api/insights/channels/circuit-breakers      通道熔断器列表
 * - GET  /api/insights/channels/circuit-breakers/open 已熔断通道列表
 * - POST /api/insights/channels/circuit-breakers/sync  手动同步通道熔断器
 * - DELETE /api/insights/channels/circuit-breakers     重置所有通道熔断器
 * - GET  /api/insights/skills/dependency-check/recent 最近一次批量依赖检查结果
 * - POST /api/insights/skills/dependency-check        手动触发批量依赖检查
 * - POST /api/insights/skills/dependency-check/pre-install  模拟安装前检查
 * - GET  /api/insights/permissions/policies       已加载权限策略
 * - GET  /api/insights/permissions/templates       可用策略模板
 * - POST /api/insights/permissions/load            加载策略（不写盘）
 * - POST /api/insights/permissions/validate        dry-run 验证策略
 * - POST /api/insights/permissions/load-from-file  从文件加载策略
 * - POST /api/insights/config/bootstrap            执行启动时配置引导
 */

import { Router, type Request, type Response } from 'express';
import { agentAuditTrail } from '../engine/agents/agent-audit-trail.js';
import { channelHealthMonitor } from '../channels/channel-health-monitor.js';
import { llmCostTracker } from '../engine/llm/cost-tracker.js';
import { configMigrationManager, CURRENT_CONFIG_VERSION } from '../config/config-migration.js';
import { skillVersionRegistry } from '../engine/skills/skill-version-registry.js';

// 集成模块
import {
  listCircuitBreakers as listLlmCircuitBreakers,
  clearCircuitBreakers,
} from '../engine/llm/llm-invoker.js';
import { channelCircuitBreakerManager } from '../channels/channel-circuit-breaker.js';
import {
  preInstallCheck,
  postLoadCheck,
  type BatchCheckResult,
} from '../engine/skills/skill-dependency-checker.js';
import {
  loadPolicies,
  validatePolicyInputs,
  loadPoliciesFromFile,
  listLoadedPolicies,
  listTemplates,
  type PolicyConfigInput,
} from '../engine/agents/permission-policy-loader.js';
import { bootstrapConfig } from '../config/config-bootstrap.js';

export const insightsRouter = Router();

// ============================================================================
// Agent Audit Trail
// ============================================================================

insightsRouter.get('/audit-trail', (req: Request, res: Response) => {
  try {
    const result = agentAuditTrail.query({
      agentId: req.query.agentId as string | undefined,
      category: req.query.category as any,
      level: req.query.level as any,
      type: req.query.type as string | undefined,
      sessionId: req.query.sessionId as string | undefined,
      parentAgentId: req.query.parentAgentId as string | undefined,
      fromTimestamp: req.query.fromTimestamp ? parseInt(req.query.fromTimestamp as string, 10) : undefined,
      toTimestamp: req.query.toTimestamp ? parseInt(req.query.toTimestamp as string, 10) : undefined,
      keyword: req.query.keyword as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      descending: req.query.descending === 'false' ? false : true,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `查询审计跟踪失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/audit-trail/stats', (_req: Request, res: Response) => {
  try {
    res.json({ data: agentAuditTrail.getStats() });
  } catch (e) {
    res.status(500).json({ error: `获取审计统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/audit-trail/timeline/:agentId', (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const fromTimestamp = req.query.fromTimestamp ? parseInt(req.query.fromTimestamp as string, 10) : undefined;
    const toTimestamp = req.query.toTimestamp ? parseInt(req.query.toTimestamp as string, 10) : undefined;
    const timeline = agentAuditTrail.getTimeline(agentId, { fromTimestamp, toTimestamp });
    res.json({ data: timeline });
  } catch (e) {
    res.status(500).json({ error: `获取时间线失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ============================================================================
// Channel Health
// ============================================================================

insightsRouter.get('/channels/health', (_req: Request, res: Response) => {
  try {
    res.json({ data: channelHealthMonitor.getAllHealth() });
  } catch (e) {
    res.status(500).json({ error: `获取通道健康度失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/channels/health/:channelId', (req: Request, res: Response) => {
  try {
    const health = channelHealthMonitor.getHealth(req.params.channelId);
    if (!health) {
      res.status(404).json({ error: `通道 ${req.params.channelId} 未注册` });
      return;
    }
    res.json({ data: health });
  } catch (e) {
    res.status(500).json({ error: `获取通道健康度失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/channels/unhealthy', (_req: Request, res: Response) => {
  try {
    res.json({ data: channelHealthMonitor.getUnhealthyChannels() });
  } catch (e) {
    res.status(500).json({ error: `获取不健康通道失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ============================================================================
// LLM Cost Tracker
// ============================================================================

insightsRouter.get('/llm/cost/aggregate', (req: Request, res: Response) => {
  try {
    const filter = {
      agentId: req.query.agentId as string | undefined,
      sessionId: req.query.sessionId as string | undefined,
      provider: req.query.provider as string | undefined,
      modelId: req.query.modelId as string | undefined,
      fromTimestamp: req.query.fromTimestamp ? parseInt(req.query.fromTimestamp as string, 10) : undefined,
      toTimestamp: req.query.toTimestamp ? parseInt(req.query.toTimestamp as string, 10) : undefined,
    };
    res.json({ data: llmCostTracker.aggregate(filter) });
  } catch (e) {
    res.status(500).json({ error: `获取用量聚合失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/llm/cost/recent', (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    res.json({ data: llmCostTracker.getRecent(limit) });
  } catch (e) {
    res.status(500).json({ error: `获取最近用量失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/llm/cost/agent/:agentId', (req: Request, res: Response) => {
  try {
    const cost = llmCostTracker.getAgentTotalCost(req.params.agentId);
    res.json({ data: { agentId: req.params.agentId, totalCost: cost } });
  } catch (e) {
    res.status(500).json({ error: `获取 Agent 成本失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/llm/pricings', (_req: Request, res: Response) => {
  try {
    res.json({ data: llmCostTracker.listPricings() });
  } catch (e) {
    res.status(500).json({ error: `获取定价表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ============================================================================
// Config Migration
// ============================================================================

insightsRouter.get('/config/migrations', (_req: Request, res: Response) => {
  try {
    res.json({
      data: {
        currentVersion: CURRENT_CONFIG_VERSION,
        migrations: configMigrationManager.listMigrations(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取迁移列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/config/migrate', async (req: Request, res: Response) => {
  try {
    const { config, targetVersion, dryRun, force } = req.body ?? {};
    if (!config || typeof config !== 'object') {
      res.status(400).json({ error: '请求体必须包含 config 对象' });
      return;
    }
    const result = await configMigrationManager.migrate(config, targetVersion ?? CURRENT_CONFIG_VERSION, {
      dryRun: dryRun === true,
      force: force === true,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `配置迁移失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/config/rollback', async (req: Request, res: Response) => {
  try {
    const { config, targetVersion, dryRun } = req.body ?? {};
    if (!config || typeof config !== 'object') {
      res.status(400).json({ error: '请求体必须包含 config 对象' });
      return;
    }
    if (typeof targetVersion !== 'number') {
      res.status(400).json({ error: '请求体必须包含 targetVersion' });
      return;
    }
    const result = await configMigrationManager.rollback(config, targetVersion, {
      dryRun: dryRun === true,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `配置回滚失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ============================================================================
// Skill Version Registry
// ============================================================================

insightsRouter.get('/skills/versions/:name', (req: Request, res: Response) => {
  try {
    const versions = skillVersionRegistry.listVersions(req.params.name);
    res.json({ data: versions });
  } catch (e) {
    res.status(500).json({ error: `获取技能版本失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/skills/versions/:name/latest', (req: Request, res: Response) => {
  try {
    const latest = skillVersionRegistry.getLatest(req.params.name);
    if (!latest) {
      res.status(404).json({ error: `技能 ${req.params.name} 未注册` });
      return;
    }
    res.json({ data: latest });
  } catch (e) {
    res.status(500).json({ error: `获取最新版本失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/skills/aliases/:name', (req: Request, res: Response) => {
  try {
    const aliases = skillVersionRegistry.getAliases(req.params.name);
    res.json({ data: aliases });
  } catch (e) {
    res.status(500).json({ error: `获取别名失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/skills/version-stats', (_req: Request, res: Response) => {
  try {
    res.json({ data: skillVersionRegistry.getStats() });
  } catch (e) {
    res.status(500).json({ error: `获取版本统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ============================================================================
// 集成模块（additive，不改动 LIVE 行为）
// ============================================================================

// 缓存最近一次批量依赖检查结果（in-memory，进程内可见）
let lastSkillDependencyCheck: BatchCheckResult | undefined;

/** 派生集成模块激活状态（基于模块自身状态，不维护额外字段） */
function deriveIntegrationStatus() {
  const channelBreakers = channelCircuitBreakerManager.listBreakers();
  const llmBreakers = listLlmCircuitBreakers();
  return {
    llmInvoker: {
      module: 'llm-invoker',
      registeredCircuitBreakers: llmBreakers.length,
      openCircuits: llmBreakers.filter((b) => b.state !== 'closed').map((b) => b.provider),
    },
    channelCircuitBreaker: {
      module: 'channel-circuit-breaker',
      boundToHealthMonitor: channelBreakers.length > 0,
      registeredBreakers: channelBreakers.length,
      openCircuits: channelCircuitBreakerManager.listOpenCircuits(),
    },
    configBootstrap: {
      module: 'config-bootstrap',
      // 仅在显式调用 /config/bootstrap 时执行；这里返回就绪状态
      ready: true,
    },
    skillDependencyChecker: {
      module: 'skill-dependency-checker',
      lastCheckSummary: lastSkillDependencyCheck
        ? {
            total: lastSkillDependencyCheck.total,
            passed: lastSkillDependencyCheck.passed,
            failed: lastSkillDependencyCheck.failed,
            cycles: lastSkillDependencyCheck.globalCycles.length,
          }
        : undefined,
    },
    permissionPolicyLoader: {
      module: 'permission-policy-loader',
      loadedPolicies: listLoadedPolicies().length,
      availableTemplates: listTemplates().length,
    },
  };
}

insightsRouter.get('/integration/status', (_req: Request, res: Response) => {
  try {
    res.json({ data: deriveIntegrationStatus() });
  } catch (e) {
    res.status(500).json({ error: `获取集成模块状态失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ---- LLM 熔断器 ----

insightsRouter.get('/llm/circuit-breakers', (_req: Request, res: Response) => {
  try {
    res.json({ data: listLlmCircuitBreakers() });
  } catch (e) {
    res.status(500).json({ error: `获取 LLM 熔断器失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.delete('/llm/circuit-breakers', (_req: Request, res: Response) => {
  try {
    clearCircuitBreakers();
    res.json({ data: { cleared: true } });
  } catch (e) {
    res.status(500).json({ error: `重置 LLM 熔断器失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ---- 通道熔断器 ----

insightsRouter.get('/channels/circuit-breakers', (_req: Request, res: Response) => {
  try {
    res.json({ data: channelCircuitBreakerManager.listBreakers() });
  } catch (e) {
    res.status(500).json({ error: `获取通道熔断器失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/channels/circuit-breakers/open', (_req: Request, res: Response) => {
  try {
    res.json({ data: channelCircuitBreakerManager.listOpenCircuits() });
  } catch (e) {
    res.status(500).json({ error: `获取已熔断通道失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/channels/circuit-breakers/sync', (_req: Request, res: Response) => {
  try {
    channelCircuitBreakerManager.syncAllFromHealthMonitor();
    res.json({ data: { synced: true, breakers: channelCircuitBreakerManager.listBreakers().length } });
  } catch (e) {
    res.status(500).json({ error: `同步通道熔断器失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.delete('/channels/circuit-breakers', (_req: Request, res: Response) => {
  try {
    channelCircuitBreakerManager.resetAll();
    res.json({ data: { reset: true } });
  } catch (e) {
    res.status(500).json({ error: `重置通道熔断器失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ---- 技能依赖检查 ----

insightsRouter.get('/skills/dependency-check/recent', (_req: Request, res: Response) => {
  try {
    if (!lastSkillDependencyCheck) {
      res.status(404).json({ error: '尚未执行过批量依赖检查' });
      return;
    }
    res.json({
      data: {
        total: lastSkillDependencyCheck.total,
        passed: lastSkillDependencyCheck.passed,
        failed: lastSkillDependencyCheck.failed,
        globalCycles: lastSkillDependencyCheck.globalCycles,
        loadOrder: lastSkillDependencyCheck.loadOrder.map((e) => e.skill.name),
        report: lastSkillDependencyCheck.report,
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取依赖检查结果失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/skills/dependency-check', (req: Request, res: Response) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (entries.length === 0) {
      res.status(400).json({ error: '请求体必须包含 entries 数组' });
      return;
    }
    const result = postLoadCheck(entries);
    lastSkillDependencyCheck = result;
    res.json({
      data: {
        total: result.total,
        passed: result.passed,
        failed: result.failed,
        globalCycles: result.globalCycles,
        loadOrder: result.loadOrder.map((e) => e.skill.name),
      },
    });
  } catch (e) {
    res.status(500).json({ error: `批量依赖检查失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/skills/dependency-check/pre-install', (req: Request, res: Response) => {
  try {
    const { newEntry, existingEntries, options } = req.body ?? {};
    if (!newEntry || !Array.isArray(existingEntries)) {
      res.status(400).json({ error: '请求体必须包含 newEntry 和 existingEntries' });
      return;
    }
    const result = preInstallCheck(newEntry, existingEntries, options ?? {});
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `安装前检查失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ---- 权限策略加载器 ----

insightsRouter.get('/permissions/policies', (_req: Request, res: Response) => {
  try {
    res.json({ data: listLoadedPolicies() });
  } catch (e) {
    res.status(500).json({ error: `获取已加载策略失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.get('/permissions/templates', (_req: Request, res: Response) => {
  try {
    res.json({ data: listTemplates() });
  } catch (e) {
    res.status(500).json({ error: `获取策略模板失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/permissions/load', (req: Request, res: Response) => {
  try {
    const inputs = req.body?.inputs;
    if (!Array.isArray(inputs)) {
      res.status(400).json({ error: '请求体必须包含 inputs 数组' });
      return;
    }
    const audit = req.body?.audit !== false;
    const result = loadPolicies(inputs as PolicyConfigInput[], { audit });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `加载策略失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/permissions/validate', (req: Request, res: Response) => {
  try {
    const inputs = req.body?.inputs;
    if (!Array.isArray(inputs)) {
      res.status(400).json({ error: '请求体必须包含 inputs 数组' });
      return;
    }
    const result = validatePolicyInputs(inputs as PolicyConfigInput[]);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `验证策略失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

insightsRouter.post('/permissions/load-from-file', (req: Request, res: Response) => {
  try {
    const { configPath } = req.body ?? {};
    if (typeof configPath !== 'string') {
      res.status(400).json({ error: '请求体必须包含 configPath' });
      return;
    }
    const result = loadPoliciesFromFile(configPath);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `从文件加载策略失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ---- 配置启动引导 ----

insightsRouter.post('/config/bootstrap', async (req: Request, res: Response) => {
  try {
    const {
      configPath,
      failOnError,
      persistAfterMigrate,
      rollbackOnFailure,
      backupDir,
      createBackup,
    } = req.body ?? {};
    if (typeof configPath !== 'string') {
      res.status(400).json({ error: '请求体必须包含 configPath' });
      return;
    }
    const result = await bootstrapConfig({
      configPath,
      failOnError,
      persistAfterMigrate,
      rollbackOnFailure,
      backupDir,
      createBackup,
    });
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `配置引导失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default insightsRouter;
