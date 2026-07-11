import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import { globalRegistry } from '../engine/context-engine/index.js';
import type { ContextEngineRuntimeSettings } from '../engine/context-engine/index.js';
// vX: 接入 contextEngineService —— 真正初始化并驱动上下文引擎（含 VecMemoryHost 激活）
import {
  ensureContextEngineService,
  getAllActiveSessions,
  getActiveSessionCount,
  getEngineStats,
  getEngineSessionState,
  getMemoryBudgetStats,
  getSessionMemoryBudgetStats,
  ingestMessages,
  assembleContext,
  listEnginesWithHealth,
  // vX: 新接入的 5 个子模块服务接口
  getPromptCacheInfo,
  updatePromptCacheUsage,
  detectPromptCacheBreak,
  formatPromptCacheUsage,
  listQuarantineHealth,
  getQuarantineHealth,
  recordQuarantineFailure,
  recordQuarantineSuccess,
  resetQuarantineHealth,
  isEngineQuarantined,
  buildDefaultRuntimeSettings,
  runtimeContextFromSettings,
  settingsFromRuntimeContext,
  getRuntimeDiagnosticsSummarySafe,
  listSubagentSessions,
  listActiveSubagentSessions,
  createTranscriptCheckpoint,
  listTranscriptCheckpoints,
  getTranscriptCheckpoint,
  restoreTranscriptCheckpoint,
  clearTranscriptCheckpoints,
  getTranscriptCheckpointStats,
} from '../services/contextEngineService.js';
import type { AgentMessage } from '../engine/context-engine/types.js';

const router = Router();

// 尽力初始化上下文引擎服务（不阻断既有 registry 路由；初始化失败仅告警）
function ensureServiceSoft(): void {
  try {
    ensureContextEngineService();
  } catch (e) {
    logger.warn('[ContextEngineRoute] 上下文引擎服务初始化失败（部分功能不可用）:', e instanceof Error ? e.message : String(e));
  }
}

// 初始化失败时直接返回 500（用于强依赖服务实例的端点）
function ensureServiceStrict(res: Response): boolean {
  try {
    ensureContextEngineService();
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('[ContextEngineRoute] 上下文引擎服务初始化失败:', message);
    res.status(500).json({ error: `上下文引擎初始化失败: ${message}` });
    return false;
  }
}

// ===================== Engine Registry (既有) =====================

router.get('/engines', (req, res) => {
  ensureServiceSoft();
  try {
    const engines = globalRegistry.listEngines();

    const result = engines.map(engine => ({
      id: engine.engineId,
      config: {
        name: engine.displayName,
        description: engine.description,
        version: engine.version,
      },
      isDefault: globalRegistry.getDefaultEngineId() === engine.engineId,
      owner: globalRegistry.getOwner(engine.engineId),
      health: globalRegistry.getHealth(engine.engineId) || { status: 'unknown' as const },
    }));

    res.json({ data: result, total: result.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list engines:', e);
    res.status(500).json({ error: `获取引擎列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.get('/engines/:id', (req, res) => {
  ensureServiceSoft();
  try {
    const { id } = req.params;
    const engines = globalRegistry.listEngines();
    const engine = engines.find(e => e.engineId === id);

    if (!engine) {
      return res.status(404).json({ error: '引擎不存在' });
    }

    const health = globalRegistry.getHealth(id);

    res.json({
      data: {
        id: engine.engineId,
        config: {
          name: engine.displayName,
          description: engine.description,
          version: engine.version,
        },
        isDefault: globalRegistry.getDefaultEngineId() === id,
        owner: globalRegistry.getOwner(id),
        health,
      },
    });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get engine:', e);
    res.status(500).json({ error: `获取引擎信息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.post('/engines/:id/quarantine', (req, res) => {
  ensureServiceSoft();
  try {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    globalRegistry.recordFailure(id, reason);
    res.json({ success: true });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to quarantine engine:', e);
    res.status(500).json({ error: `隔离引擎失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.post('/engines/:id/recover', (req, res) => {
  ensureServiceSoft();
  try {
    const { id } = req.params;
    const success = globalRegistry.resetHealth(id);
    res.json({ success });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to recover engine:', e);
    res.status(500).json({ error: `恢复引擎失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

router.get('/stats', (req, res) => {
  ensureServiceSoft();
  try {
    const engines = globalRegistry.listEngines();

    let activeCount = 0;
    let quarantinedCount = 0;

    for (const engine of engines) {
      const health = globalRegistry.getHealth(engine.engineId);
      if (health?.status === 'quarantined') {
        quarantinedCount++;
      } else {
        activeCount++;
      }
    }

    const stats = {
      totalEngines: engines.length,
      activeEngines: activeCount,
      quarantinedEngines: quarantinedCount,
      totalOperations: 0,
      avgLatencyMs: 0,
    };

    res.json({ data: stats });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get stats:', e);
    res.status(500).json({ error: `获取统计信息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Engine Health (via service) =====================

/**
 * GET /api/context-engine/health
 * 返回所有引擎及其健康状态（经由 contextEngineService 聚合）
 */
router.get('/health', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const engines = listEnginesWithHealth();
    res.json({ data: engines, total: engines.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get engine health:', e);
    res.status(500).json({ error: `获取引擎健康失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Active Sessions (via service) =====================

/**
 * GET /api/context-engine/sessions
 * 返回当前活跃的上下文引擎会话
 */
router.get('/sessions', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const data = {
      activeCount: getActiveSessionCount(),
      sessions: getAllActiveSessions(),
    };
    res.json({ data });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list sessions:', e);
    res.status(500).json({ error: `获取会话列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/sessions/:id/ingest
 * 向指定会话注入消息。Body: { messages: AgentMessage[] }
 */
router.post('/sessions/:id/ingest', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.id;
    const { messages, runtimeContext } = req.body as {
      messages?: AgentMessage[];
      runtimeContext?: unknown;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages 不能为空' });
      return;
    }

    const result = await ingestMessages(sessionId, messages, runtimeContext as never);
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to ingest messages:', e);
    res.status(500).json({ error: `注入消息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/sessions/:id/assemble
 * 组装指定会话的上下文。Body 可选: { messages?, tokenBudget?, availableTools?, model?, prompt? }
 */
router.post('/sessions/:id/assemble', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.id;
    const body = req.body as {
      messages?: AgentMessage[];
      tokenBudget?: number;
      availableTools?: string[];
      model?: string;
      prompt?: string;
      runtimeContext?: unknown;
    };

    const result = await assembleContext(
      sessionId,
      {
        messages: body.messages,
        tokenBudget: body.tokenBudget,
        availableTools: Array.isArray(body.availableTools) ? new Set(body.availableTools) : undefined,
        model: body.model,
        prompt: body.prompt,
      },
      body.runtimeContext as never,
    );
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to assemble context:', e);
    res.status(500).json({ error: `组装上下文失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/sessions/:id/budget
 * 返回会话内存预算统计（会话不存在则返回全局预算统计）
 */
router.get('/sessions/:id/budget', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.id;
    const stats = getSessionMemoryBudgetStats(sessionId) ?? getMemoryBudgetStats();
    res.json({ success: true, data: stats });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get budget:', e);
    res.status(500).json({ error: `获取预算统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/sessions/:id/stats
 * 返回指定引擎实例的运行统计
 */
router.get('/sessions/:id/stats', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.id;
    const stats = await getEngineStats(sessionId);
    if (!stats) {
      res.status(404).json({ error: '会话引擎不存在' });
      return;
    }
    res.json({ success: true, data: stats });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get session stats:', e);
    res.status(500).json({ error: `获取会话统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/sessions/:id/state
 * 返回指定引擎实例的会话状态
 */
router.get('/sessions/:id/state', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.id;
    const state = await getEngineSessionState(sessionId);
    if (!state) {
      res.status(404).json({ error: '会话引擎不存在' });
      return;
    }
    res.json({ success: true, data: state });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get session state:', e);
    res.status(500).json({ error: `获取会话状态失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Prompt Cache (经由 service) =====================

/**
 * GET /api/context-engine/prompt-cache
 * 返回全局 PromptCacheManager 的当前缓存信息（保留策略 / 过期时间 / 观测）。
 */
router.get('/prompt-cache', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    res.json({ success: true, data: getPromptCacheInfo() });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get prompt-cache:', e);
    res.status(500).json({ error: `获取 prompt-cache 失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/prompt-cache/usage
 * 上报一次 LLM 调用的 token 用量，跟踪 prompt-cache 是否失效。Body: UpdateUsageOptions
 */
router.post('/prompt-cache/usage', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    updatePromptCacheUsage(req.body);
    res.json({ success: true, data: getPromptCacheInfo() });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to update prompt-cache usage:', e);
    res.status(500).json({ error: `更新 prompt-cache 失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/prompt-cache/detect
 * 基于前后两次用量推断缓存是否中断。Body: DetectCacheBreakOptions
 */
router.post('/prompt-cache/detect', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const observation = detectPromptCacheBreak(req.body);
    res.json({ success: true, data: observation });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to detect prompt-cache break:', e);
    res.status(500).json({ error: `检测缓存中断失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/prompt-cache/format
 * 将一次用量格式化为可读字符串。Body: { usage, showTotal?, showPercentage? }
 */
router.post('/prompt-cache/format', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const text = formatPromptCacheUsage(req.body);
    res.json({ success: true, data: { text } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to format prompt-cache usage:', e);
    res.status(500).json({ error: `格式化用量失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Quarantine Health (经由 service) =====================

/**
 * GET /api/context-engine/quarantine-health
 * 返回所有引擎的持久化健康状态（来自 QuarantineHealthStore）。
 */
router.get('/quarantine-health', async (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const data = await listQuarantineHealth();
    res.json({ success: true, data, total: data.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list quarantine health:', e);
    res.status(500).json({ error: `获取隔离健康失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/quarantine-health/:id
 * 返回单个引擎的健康状态。
 */
router.get('/quarantine-health/:id', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const health = await getQuarantineHealth(req.params.id);
    if (!health) {
      res.status(404).json({ error: '引擎健康状态不存在' });
      return;
    }
    res.json({ success: true, data: health });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get quarantine health:', e);
    res.status(500).json({ error: `获取引擎健康失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/quarantine-health/:id/is-quarantined
 * 返回引擎当前是否处于隔离状态。
 */
router.get('/quarantine-health/:id/is-quarantined', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const quarantined = await isEngineQuarantined(req.params.id);
    res.json({ success: true, data: { engineId: req.params.id, quarantined } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to check quarantine:', e);
    res.status(500).json({ error: `检查隔离状态失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/quarantine-health/:id/failure
 * 记录一次引擎失败（累计到隔离阈值后隔离）。Body 可选: { reason?, isAbortError? }
 */
router.post('/quarantine-health/:id/failure', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const { reason, isAbortError } = req.body as { reason?: string; isAbortError?: boolean };
    const status = await recordQuarantineFailure(req.params.id, reason, isAbortError);
    res.json({ success: true, data: { engineId: req.params.id, status } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to record failure:', e);
    res.status(500).json({ error: `记录失败失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/quarantine-health/:id/success
 * 记录一次引擎成功（连续成功达阈值后恢复健康）。
 */
router.post('/quarantine-health/:id/success', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    await recordQuarantineSuccess(req.params.id);
    res.json({ success: true, data: { engineId: req.params.id } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to record success:', e);
    res.status(500).json({ error: `记录成功失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/quarantine-health/:id/reset
 * 重置引擎健康状态。
 */
router.post('/quarantine-health/:id/reset', async (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const ok = await resetQuarantineHealth(req.params.id);
    res.json({ success: ok, data: { engineId: req.params.id } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to reset quarantine health:', e);
    res.status(500).json({ error: `重置健康失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Runtime Settings (经由 service) =====================

/**
 * GET /api/context-engine/runtime-settings
 * 返回默认运行时设置（可附带 overrides）。Body 可选: Partial<ContextEngineRuntimeSettings>
 */
router.get('/runtime-settings', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const settings = buildDefaultRuntimeSettings(req.body as Partial<ContextEngineRuntimeSettings> | undefined);
    res.json({ success: true, data: settings });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to build runtime settings:', e);
    res.status(500).json({ error: `构建运行时设置失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/runtime-settings/diagnostics
 * 返回默认设置的诊断摘要字符串。
 */
router.get('/runtime-settings/diagnostics', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const settings = buildDefaultRuntimeSettings();
    res.json({ success: true, data: { summary: getRuntimeDiagnosticsSummarySafe(settings) } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get diagnostics:', e);
    res.status(500).json({ error: `获取诊断失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/runtime-settings/context
 * 将运行时设置转换为 ContextEngineRuntimeContext。Body: { settings }
 */
router.post('/runtime-settings/context', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const settings = (req.body as { settings?: ContextEngineRuntimeSettings }).settings;
    if (!settings) {
      res.status(400).json({ error: 'settings 必填' });
      return;
    }
    res.json({ success: true, data: runtimeContextFromSettings(settings) });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to convert settings to context:', e);
    res.status(500).json({ error: `转换失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/runtime-settings/settings
 * 将 ContextEngineRuntimeContext 转换为运行时设置。Body: ContextEngineRuntimeContext
 */
router.post('/runtime-settings/settings', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    res.json({ success: true, data: settingsFromRuntimeContext(req.body) });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to convert context to settings:', e);
    res.status(500).json({ error: `转换失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Subagent Lifecycle (经由 service) =====================

/**
 * GET /api/context-engine/subagents
 * 返回所有子代理生命周期会话。
 */
router.get('/subagents', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessions = listSubagentSessions();
    res.json({ success: true, data: sessions, total: sessions.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list subagents:', e);
    res.status(500).json({ error: `获取子代理列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/subagents/active
 * 仅返回活跃的子代理会话。
 */
router.get('/subagents/active', (_req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessions = listActiveSubagentSessions();
    res.json({ success: true, data: sessions, total: sessions.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list active subagents:', e);
    res.status(500).json({ error: `获取活跃子代理失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// ===================== Transcript Rewrite / Checkpoints (经由 service) =====================

/**
 * POST /api/context-engine/transcripts/:sessionId/checkpoint
 * 为会话创建转录本检查点。Body: { messages: AgentMessage[], description? }
 */
router.post('/transcripts/:sessionId/checkpoint', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const sessionId = req.params.sessionId;
    const { messages, description } = req.body as {
      messages?: AgentMessage[];
      description?: string;
    };
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'messages 必须为数组' });
      return;
    }
    const checkpoint = createTranscriptCheckpoint(sessionId, messages, description);
    res.json({ success: true, data: checkpoint });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to create checkpoint:', e);
    res.status(500).json({ error: `创建检查点失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/transcripts/:sessionId/checkpoint-stats
 * 返回会话检查点统计。
 */
router.get('/transcripts/:sessionId/checkpoint-stats', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    res.json({ success: true, data: getTranscriptCheckpointStats(req.params.sessionId) });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get checkpoint stats:', e);
    res.status(500).json({ error: `获取检查点统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/transcripts/:sessionId/checkpoints
 * 返回会话所有检查点。
 */
router.get('/transcripts/:sessionId/checkpoints', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const checkpoints = listTranscriptCheckpoints(req.params.sessionId);
    res.json({ success: true, data: checkpoints, total: checkpoints.length });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to list checkpoints:', e);
    res.status(500).json({ error: `获取检查点列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * GET /api/context-engine/transcripts/:sessionId/checkpoints/:checkpointId
 * 返回单个检查点。
 */
router.get('/transcripts/:sessionId/checkpoints/:checkpointId', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const checkpoint = getTranscriptCheckpoint(req.params.sessionId, req.params.checkpointId);
    if (!checkpoint) {
      res.status(404).json({ error: '检查点不存在' });
      return;
    }
    res.json({ success: true, data: checkpoint });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to get checkpoint:', e);
    res.status(500).json({ error: `获取检查点失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/context-engine/transcripts/:sessionId/checkpoints/:checkpointId/restore
 * 恢复到指定检查点，返回恢复后的消息与恢复数量。
 */
router.post('/transcripts/:sessionId/checkpoints/:checkpointId/restore', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const result = restoreTranscriptCheckpoint(req.params.sessionId, req.params.checkpointId);
    if (!result) {
      res.status(404).json({ error: '检查点不存在' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to restore checkpoint:', e);
    res.status(500).json({ error: `恢复检查点失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * DELETE /api/context-engine/transcripts/:sessionId/checkpoints
 * 清空会话所有检查点。
 */
router.delete('/transcripts/:sessionId/checkpoints', (req, res) => {
  if (!ensureServiceStrict(res)) return;
  try {
    const count = clearTranscriptCheckpoints(req.params.sessionId);
    res.json({ success: true, data: { removed: count } });
  } catch (e) {
    logger.error('[ContextEngineRoute] Failed to clear checkpoints:', e);
    res.status(500).json({ error: `清除检查点失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export { router as contextEngineRouter };
