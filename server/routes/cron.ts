/**
 * Cron Engine API 路由
 *
 * 把 engine/cron/*（"dead" 子系统）接入活体服务器，封装为 HTTP 端点。
 *
 * 设计要点：
 * - 持久化复用 engine/cron/store.ts 的 JsonCronJobStore（JSON 文件存储，
 *   ~/<config>/cdfknow/cron/jobs.json），不引入 SQLite，与 store 既有的
 *   连接/写入模式保持一致。
 * - 调度计算复用 engine/cron/schedule.ts 的 scheduleNextRun / computePreviousRunAtMs
 *   （基于 croner 解析 5/6 字段 cron 表达式）。
 * - 时间校验复用 engine/cron/parse.ts 的 parseAbsoluteTime。
 * - 响应统一使用 { success, data } 信封，错误使用 { success:false, error }。
 *
 * 端点：
 * - GET    /api/cron            → 列出所有 cron 任务
 * - POST   /api/cron            → 创建 cron 任务（写入规范化的 cron 表达式）
 * - GET    /api/cron/:id        → 获取单个任务
 * - PUT    /api/cron/:id        → 更新任务
 * - DELETE /api/cron/:id        → 删除任务
 * - POST   /api/cron/parse      → 解析 cron 表达式，返回下次/上次运行时间
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  getDefaultCronStore,
  type CronJobConfig,
  type CronJobEntry,
  type CronJobStore,
  type CronStoreFile,
} from '../engine/cron/store.js';
import { scheduleNextRun, computePreviousRunAtMs } from '../engine/cron/schedule.js';
import { parseAbsoluteTime } from '../engine/cron/parse.js';
import { logger } from '../logger.js';

const router = Router();

// 复用 engine/cron/store.ts 的默认存储实例（JSON 文件，单例）
const store: CronJobStore = getDefaultCronStore();

/** 判断是否为普通对象（非数组、非 null） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把有限数从 unknown 中提取（缺省回退） */
function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return fallback;
}

/** 用 cron 表达式计算下次运行时间（毫秒），非法表达式抛错 */
function computeNextRunAt(config: Pick<CronJobConfig, 'cronExpression' | 'timezone'>): number | undefined {
  return scheduleNextRun(
    { kind: 'cron', expr: config.cronExpression, tz: config.timezone },
    Date.now(),
  );
}

/** 读取所有任务 */
async function listJobs(): Promise<CronJobEntry[]> {
  const loaded = await store.load();
  return loaded.store.jobs;
}

/** 根据 id 查找任务 */
async function findJob(id: string): Promise<CronJobEntry | undefined> {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id);
}

/** 把任务数组写回存储 */
async function persistJobs(jobs: CronJobEntry[]): Promise<void> {
  const file: CronStoreFile = { version: 1, jobs };
  await store.save(file);
}

/** 为返回结果附加计算得到的下次运行时间（不改动持久化数据） */
function withComputedNextRun(entry: CronJobEntry): CronJobEntry {
  if (typeof entry.nextRunAt === 'number') {
    return entry;
  }
  const computed = computeNextRunAt(entry);
  return computed === undefined ? entry : { ...entry, nextRunAt: computed };
}

// ===================== 解析端点（须位于 /:id 之前） =====================

/**
 * POST /api/cron/parse
 * 解析 cron 表达式，返回下次运行时间 / 上次运行时间 / 描述。
 *
 * Body:
 * - cron: cron 表达式（必需）
 * - timezone: 时区（可选，默认宿主时区）
 * - from: 参考时间（可选，ISO 8601 或 epoch 毫秒，默认 now）
 */
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { cron, timezone, from } = req.body ?? {};
    if (typeof cron !== 'string' || !cron.trim()) {
      return res.status(400).json({ success: false, error: 'cron (string) is required' });
    }
    const expr = cron.trim();
    const tz = typeof timezone === 'string' && timezone.trim() ? timezone.trim() : undefined;

    const refMs = typeof from === 'string' || typeof from === 'number'
      ? parseAbsoluteTime(from)
      : null;
    const nowMs = refMs !== null ? refMs : Date.now();

    // 通过 scheduleNextRun 校验表达式合法性（非法会抛错）
    const nextRunAt = scheduleNextRun({ kind: 'cron', expr, tz }, nowMs);
    if (nextRunAt === undefined) {
      return res.status(400).json({ success: false, error: 'invalid cron expression' });
    }

    const previousRunAt = computePreviousRunAtMs({ kind: 'cron', expr, tz }, nowMs);

    res.json({
      success: true,
      data: {
        expression: expr,
        timezone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        nextRunAt,
        previousRunAt: previousRunAt ?? null,
        nextRunAtIso: new Date(nextRunAt).toISOString(),
        description: `Cron schedule: ${expr}`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to parse cron expression';
    logger.warn('[CronAPI] /parse 失败:', message);
    res.status(400).json({ success: false, error: message });
  }
});

// ===================== CRUD =====================

/**
 * GET /api/cron
 * 列出所有 cron 任务（附带计算得到的下次运行时间）。
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const jobs = await listJobs();
    const data = jobs.map(withComputedNextRun);
    res.json({ success: true, data, total: data.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to list cron jobs';
    logger.error('[CronAPI] GET / 失败:', message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/cron
 * 创建 cron 任务。
 *
 * Body（字段对齐 engine/cron/store.ts 的 CronJobConfig）：
 * - id?          ：缺省自动生成
 * - name         ：任务名（缺省 "Untitled Cron Job"）
 * - cronExpression / cron ：cron 表达式（必需）
 * - taskType     ：任务类型（缺省 "command"）
 * - taskParams   ：任务参数对象
 * - description? 、 sessionKey? 、 agent? 、 timezone? 、 staggerMs? 、 metadata?
 * - enabled?     ：默认 true
 * - maxRetries? 、 retryDelayMs? 、 timeoutMs?
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const rawExpr = typeof body.cronExpression === 'string'
      ? body.cronExpression.trim()
      : typeof body.cron === 'string'
        ? body.cron.trim()
        : '';
    if (!rawExpr) {
      return res.status(400).json({ success: false, error: 'cronExpression (string) is required' });
    }

    // 先校验表达式合法性（非法抛错）
    if (scheduleNextRun({ kind: 'cron', expr: rawExpr, tz: body.timezone }, Date.now()) === undefined) {
      return res.status(400).json({ success: false, error: 'invalid cronExpression' });
    }

    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
    const now = Date.now();

    const config: CronJobConfig = {
      id,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled Cron Job',
      description: typeof body.description === 'string' ? body.description : undefined,
      cronExpression: rawExpr,
      taskType: typeof body.taskType === 'string' && body.taskType.trim() ? body.taskType.trim() : 'command',
      taskParams: isRecord(body.taskParams) ? (body.taskParams as Record<string, unknown>) : {},
      sessionKey: typeof body.sessionKey === 'string' ? body.sessionKey : undefined,
      agent: typeof body.agent === 'string' && body.agent.trim() ? body.agent.trim() : undefined,
      timezone: typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : undefined,
      enabled: body.enabled !== false,
      maxRetries: coerceInt(body.maxRetries, 0),
      retryDelayMs: coerceInt(body.retryDelayMs, 5000),
      timeoutMs: coerceInt(body.timeoutMs, 30000),
      staggerMs: typeof body.staggerMs === 'number' ? Math.floor(body.staggerMs) : undefined,
      metadata: isRecord(body.metadata) ? (body.metadata as Record<string, unknown>) : undefined,
    };

    const entry: CronJobEntry = {
      ...config,
      status: 'active',
      consecutiveFailures: 0,
      totalRuns: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      createdAt: now,
      updatedAt: now,
    };

    const jobs = await listJobs();
    if (jobs.some((j) => j.id === id)) {
      return res.status(409).json({ success: false, error: `cron job already exists: ${id}` });
    }
    jobs.push(entry);
    await persistJobs(jobs);

    res.status(201).json({ success: true, data: withComputedNextRun(entry) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to create cron job';
    logger.error('[CronAPI] POST / 失败:', message);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/cron/:id
 * 获取单个 cron 任务。
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await findJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }
    res.json({ success: true, data: withComputedNextRun(job) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to get cron job';
    logger.error('[CronAPI] GET /:id 失败:', message);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PUT /api/cron/:id
 * 更新 cron 任务（局部合并）。
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await findJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }

    const body = req.body ?? {};
    const jobs = await listJobs();
    const idx = jobs.findIndex((j) => j.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }

    const next: CronJobEntry = { ...existing };
    if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim();
    if (typeof body.description === 'string') next.description = body.description;
    if (typeof body.taskType === 'string' && body.taskType.trim()) next.taskType = body.taskType.trim();
    if (isRecord(body.taskParams)) next.taskParams = body.taskParams as Record<string, unknown>;
    if (typeof body.sessionKey === 'string') next.sessionKey = body.sessionKey;
    if (typeof body.agent === 'string' && body.agent.trim()) next.agent = body.agent.trim();
    if (typeof body.timezone === 'string' && body.timezone.trim()) next.timezone = body.timezone.trim();
    if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
    if (body.maxRetries !== undefined) next.maxRetries = coerceInt(body.maxRetries, 0);
    if (body.retryDelayMs !== undefined) next.retryDelayMs = coerceInt(body.retryDelayMs, 5000);
    if (body.timeoutMs !== undefined) next.timeoutMs = coerceInt(body.timeoutMs, 30000);
    if (typeof body.staggerMs === 'number') next.staggerMs = Math.floor(body.staggerMs);
    if (isRecord(body.metadata)) next.metadata = body.metadata as Record<string, unknown>;

    // cronExpression 单独校验
    const rawExpr = typeof body.cronExpression === 'string'
      ? body.cronExpression.trim()
      : existing.cronExpression;
    if (typeof body.cronExpression === 'string') {
      if (!rawExpr) {
        return res.status(400).json({ success: false, error: 'cronExpression cannot be empty' });
      }
      if (scheduleNextRun({ kind: 'cron', expr: rawExpr, tz: next.timezone }, Date.now()) === undefined) {
        return res.status(400).json({ success: false, error: 'invalid cronExpression' });
      }
      next.cronExpression = rawExpr;
    }

    next.updatedAt = Date.now();
    jobs[idx] = next;
    await persistJobs(jobs);

    res.json({ success: true, data: withComputedNextRun(next) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to update cron job';
    logger.error('[CronAPI] PUT /:id 失败:', message);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/cron/:id
 * 删除 cron 任务。
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await findJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }
    const jobs = await listJobs();
    const next = jobs.filter((j) => j.id !== req.params.id);
    if (next.length === jobs.length) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }
    await persistJobs(next);
    res.json({ success: true, deleted: req.params.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'failed to delete cron job';
    logger.error('[CronAPI] DELETE /:id 失败:', message);
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
