/**
 * Capabilities Route — 死代码能力单例的统一 HTTP 暴露面
 *
 * 本文件为一批"已孤立（dead）"的能力单例提供只读 HTTP 表面，用于在不改动
 * LIVE 聊天路径（runChatSession / streamExecutor / chatService）的前提下，
 * 安全地把这些单例接入服务器。
 *
 * 设计原则：
 * - 所有端点均为只读探测（read-only introspection），不修改任何 LIVE 行为。
 * - 每个端点都用 try/catch 包裹，单例内部异常不会影响服务器启动或其余路由。
 * - 需要"真实数据"的端点（如 tool-search）会在首次请求时惰性地从已注册工具
 *   （listTools）补充种子，绝不替换 LIVE 工具解析路径。
 *
 * 端点的存在本身即构成对这些单例的自然 join point（HTTP 表面），
 * 对应各模块在 LIVE 路径内的潜在接入点已在集成报告中 DOCUMENT。
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';

// ===================== 候选能力单例导入 =====================

import {
  listThinkingLevelOptions,
  resolveThinkingProfile,
  type ThinkLevel,
} from '../engine/thinkingMode.js';

import { getToolSearchCatalog, type ToolMode } from '../engine/toolSearch.js';
import { listTools } from '../engine/toolRegistry.js';

import { getFastModeManager } from '../engine/fastMode.js';
import { getModelMetadataStore } from '../engine/modelMetadata.js';
import toolPolicyEngine from '../engine/toolPolicyEngine.js';
import { fewShotTemplates } from '../engine/fewShotTemplates.js';
import {
  computeSessionFingerprint,
  hashString,
  hashObject,
  type SessionFingerprintConfig,
} from '../engine/sessionFingerprint.js';

import {
  genMessageId,
  isValidEnvelope,
  createStatusNoticeEnvelope,
} from '../message/envelope.js';

import { getConfig, getConfigValue } from '../engine/configManager.js';

import { isRetryableError, calculateBackoff, createChannelRetryConfig } from '../infra/retry.js';
import { resolveGlobalDedupeCache } from '../infra/dedupe.js';
import { withFileLock, acquireFileLock, FileLockTimeoutError } from '../infra/file-lock.js';

import {
  FailoverReason,
  shouldFallback,
  shouldRotateAuthProfile,
  isContextOverflowError,
  isAbortError,
} from '../errors/failover.js';

import { getStreamingHandler } from '../engine/streamingHandler.js';
import { getHooksManager } from '../engine/hooksManager.js';
import contextWindowCache from '../engine/contextCache.js';

import { DEFAULT_HEARTBEAT_INTERVAL_MS, DEFAULT_MAX_HEARTBEATS } from '../engine/heartbeat.js';

const router = Router();

// ===================== 工具函数 =====================

/** 安全包装：执行 fn，异常时返回 { ok:false, error }，不影响整体路由。 */
function safe<T>(fn: () => T): T | { ok: false; error: string } {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[capabilities] 端点执行失败: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** 惰性种子：把已注册工具名补充进 tool-search 目录（只读副作用，不影响 LIVE 路径）。 */
let toolSearchSeeded = false;
function ensureToolSearchSeeded(): void {
  if (toolSearchSeeded) return;
  try {
    const catalog = getToolSearchCatalog();
    for (const name of listTools()) {
      if (!catalog.getTool(name)) {
        catalog.registerTool(
          { type: 'function', function: { name, description: '', parameters: {} } },
          { source: 'builtin', visibility: 'always' },
        );
      }
    }
    toolSearchSeeded = true;
  } catch (err) {
    logger.warn('[capabilities] tool-search 种子补充失败（非阻塞）:', err instanceof Error ? err.message : String(err));
  }
}

// ===================== 端点定义 =====================

/**
 * GET /api/capabilities/thinking-modes
 * 暴露 thinkingMode 的思考级别解析能力（纯函数，只读）。
 */
router.get('/thinking-modes', (req: Request, res: Response) => {
  const provider = (req.query.provider as string) || null;
  const model = (req.query.model as string) || null;
  const result = safe(() => ({
    options: listThinkingLevelOptions(provider, model),
    profile: resolveThinkingProfile({ provider, model }),
  }));
  res.json(result);
});

/**
 * GET /api/capabilities/tool-search
 * 暴露 toolSearch 目录的搜索/统计能力（惰性种子自 listTools）。
 */
router.get('/tool-search', (req: Request, res: Response) => {
  ensureToolSearchSeeded();
  const catalog = getToolSearchCatalog();
  const query = (req.query.q as string) || '';
  const mode = (req.query.mode as ToolMode) || undefined;
  const result = safe(() => {
    if (query) {
      return {
        type: 'search',
        query,
        results: catalog.search(query, { mode, limit: Number(req.query.limit) || 20 })
          .map((r) => ({ name: r.tool.name, score: r.score, reasons: r.matchReasons })),
      };
    }
    return { type: 'stats', stats: catalog.getStats() };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/fast-mode
 * 暴露 fastMode 管理器当前配置（只读，不触发自动降级）。
 */
router.get('/fast-mode', (_req: Request, res: Response) => {
  const result = safe(() => {
    const mgr = getFastModeManager();
    return {
      hasActiveSession: mgr.isActive(),
      currentModelId: mgr.getCurrentModelId(),
      progressText: mgr.getProgressText(),
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/model-metadata
 * 暴露 modelMetadata 存储的已注册模型元数据（只读）。
 */
router.get('/model-metadata', (_req: Request, res: Response) => {
  const result = safe(() => {
    const store = getModelMetadataStore();
    return { total: store.getAll().length, models: store.getAll().map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      apiType: m.apiType,
      capabilities: m.capabilities,
    })) };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/tool-policy
 * 暴露 toolPolicyEngine 规则引擎的当前规则（只读）。
 *
 * 规则字段映射（toolPolicyEngine → 旧 ToolPolicyAction 语义）：
 * - action: requireApproval ? 'ask' : (riskLevel === 'critical' ? 'deny' : 'allow')
 * - priority: 数组索引（靠前优先级更高）
 */
router.get('/tool-policy', (req: Request, res: Response) => {
  const toolName = req.query.tool as string | undefined;
  const result = safe(() => {
    const rules = toolPolicyEngine.listRules(toolName ? { toolName } : undefined);
    return {
      defaultAction: toolPolicyEngine.getDefaultAction(),
      rules: rules.map((r, idx) => ({
        id: r.toolPattern,
        name: r.description ?? r.toolPattern,
        toolName: r.toolPattern,
        riskLevel: r.riskLevel,
        acpClass: r.acpClass ?? null,
        requireApproval: r.requireApproval,
        action: r.requireApproval ? 'ask' : (r.riskLevel === 'critical' ? 'deny' : 'allow'),
        priority: rules.length - idx,
        enabled: true,
        timeoutMs: r.timeoutMs ?? null,
        hasConditions: !!r.conditions,
        hasSandboxConfig: !!r.sandboxConfig,
      })),
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/few-shot-templates
 * 暴露 fewShotTemplates 的模板清单（只读，不注入到 LIVE prompt）。
 */
router.get('/few-shot-templates', (_req: Request, res: Response) => {
  const result = safe(() => ({
    total: fewShotTemplates.getTemplates().length,
    templates: fewShotTemplates.getTemplates().map((t) => ({ id: t.id, name: t.name, triggerPatterns: t.triggerPatterns.map((p) => p.source) })),
  }));
  res.json(result);
});

/**
 * GET /api/capabilities/session-fingerprint
 * 暴露 sessionFingerprint 的哈希/指纹计算能力（纯函数，只读）。
 */
router.get('/session-fingerprint', (req: Request, res: Response) => {
  const result = safe(() => {
    const config: SessionFingerprintConfig = {
      authProfileId: (req.query.authProfileId as string) || undefined,
      extraSystemPrompt: (req.query.extraSystemPrompt as string) || undefined,
      promptToolNames: (req.query.promptToolNames as string) || undefined,
      cwd: (req.query.cwd as string) || undefined,
    };
    return {
      sampleHashes: {
        string: hashString(config.extraSystemPrompt),
        object: hashObject(config.cwd ? { cwd: config.cwd } : undefined),
      },
      fingerprint: computeSessionFingerprint(config),
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/envelope
 * 暴露 message/envelope 的校验与构造能力（只读，不改动 LIVE 消息格式）。
 */
router.get('/envelope', (_req: Request, res: Response) => {
  const result = safe(() => {
    const sample = createStatusNoticeEnvelope('demo-session', 'capabilities probe');
    return {
      genMessageId: genMessageId(),
      isValidSample: isValidEnvelope(sample),
      sampleMetaKeys: sample.meta ? Object.keys(sample.meta) : [],
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/config
 * 暴露 configManager 的配置条目（只读，不覆盖 LIVE config 目录）。
 */
router.get('/config', (req: Request, res: Response) => {
  const prefix = req.query.prefix as string | undefined;
  const result = safe(() => ({
    total: getConfig().listEntries(prefix ? { prefix } : undefined).length,
    entries: getConfig().listEntries(prefix ? { prefix } : undefined)
      .map((e) => ({ key: e.key, value: e.value, scope: e.scope, type: e.type })),
  }));
  res.json(result);
});

/**
 * GET /api/capabilities/infra/retry
 * 暴露 infra/retry 的重试判定与退避计算能力（纯函数，只读）。
 */
router.get('/infra/retry', (req: Request, res: Response) => {
  const result = safe(() => {
    const sampleError = (req.query.error as string) || 'ECONNRESET socket timeout';
    return {
      isRetryableSample: isRetryableError(new Error(sampleError)),
      backoff: {
        attempt1: calculateBackoff(1, { minDelayMs: 300, maxDelayMs: 30000, jitter: 0 }),
        attempt3: calculateBackoff(3, { minDelayMs: 300, maxDelayMs: 30000, jitter: 0 }),
      },
      channelRetryConfig: createChannelRetryConfig().attempts,
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/infra/dedupe
 * 暴露 infra/dedupe 的全局去重缓存状态（只读）。
 */
router.get('/infra/dedupe', (_req: Request, res: Response) => {
  const result = safe(() => {
    const cache = resolveGlobalDedupeCache();
    return { size: cache.size };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/infra/file-lock
 * 暴露 infra/file-lock 的能力描述（函数式，无状态）。
 */
router.get('/infra/file-lock', (_req: Request, res: Response) => {
  res.json({
    available: true,
    methods: ['acquireFileLock', 'withFileLock'],
    timeoutError: FileLockTimeoutError.name,
    supportsStaleDetection: true,
  });
});

/**
 * GET /api/capabilities/errors/failover
 * 暴露 errors/failover 的错误分类能力（纯函数，只读）。
 */
router.get('/errors/failover', (req: Request, res: Response) => {
  const result = safe(() => {
    const sampleMsg = (req.query.message as string) || 'upstream timeout connecting to model';
    const sampleErr = new Error(sampleMsg);
    return {
      reasons: Object.values(FailoverReason),
      sample: {
        message: sampleMsg,
        shouldFallback: shouldFallback(sampleErr),
        shouldRotateAuthProfile: shouldRotateAuthProfile(sampleErr),
        isContextOverflow: isContextOverflowError(sampleErr),
        isAbort: isAbortError(sampleErr),
      },
    };
  });
  res.json(result);
});

/**
 * GET /api/capabilities/streaming
 * 暴露 streamingHandler 的运行期统计（只读，不接管 LIVE SSE 流）。
 */
router.get('/streaming', (_req: Request, res: Response) => {
  const result = safe(() => getStreamingHandler().getStats());
  res.json(result);
});

/**
 * GET /api/capabilities/hooks
 * 暴露 hooksManager 的钩子统计（只读，不注入到 LIVE 钩子总线）。
 */
router.get('/hooks', (_req: Request, res: Response) => {
  const result = safe(() => getHooksManager().getStats());
  res.json(result);
});

/**
 * GET /api/capabilities/context-cache
 * 暴露 contextCache 的运行期统计（只读，不接管 LIVE 上下文窗口解析）。
 */
router.get('/context-cache', (_req: Request, res: Response) => {
  const result = safe(() => ({ size: contextWindowCache.size, stats: contextWindowCache.stats }));
  res.json(result);
});

/**
 * GET /api/capabilities/heartbeat
 * 暴露 heartbeat 的默认配置常量（只读）。
 */
router.get('/heartbeat', (_req: Request, res: Response) => {
  res.json({
    defaultIntervalMs: DEFAULT_HEARTBEAT_INTERVAL_MS,
    defaultMaxHeartbeats: DEFAULT_MAX_HEARTBEATS,
  });
});

/**
 * GET /api/capabilities
 * 能力清单总览。
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    note: '只读能力探测面：所有端点均为 introspection，不修改 LIVE 聊天路径行为。',
    endpoints: [
      '/thinking-modes', '/tool-search', '/fast-mode', '/model-metadata',
      '/tool-policy', '/few-shot-templates', '/session-fingerprint', '/envelope',
      '/config', '/infra/retry', '/infra/dedupe', '/infra/file-lock',
      '/errors/failover', '/streaming', '/hooks', '/context-cache', '/heartbeat',
    ],
    configValueSample: getConfigValue('ai.defaultModel') ?? null,
  });
});

export default router;
