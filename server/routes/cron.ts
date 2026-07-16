/**
 * Cron Engine API 路由
 *
 * 把 engine/cron/*（"dead" 子系统）接入活体服务器，封装为 HTTP 端点。
 *
 * 设计要点：
 * - 持久化复用 engine/cron/store.ts 的 JsonCronJobStore（JSON 文件存储，
 *   ~/<config>/cdfknow/cron/jobs.json），不引入 SQLite，与 store 既有的
 *   连接/写入模式保持一致。
 * - 任务模型使用 engine/cron/types.ts 的 CronJob 类型（schedule / payload /
 *   state 新结构），替代旧的 CronJobConfig/CronJobEntry。
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
  type CronJobStore,
  type LoadedCronStore,
} from '../engine/cron/store.js';
import type { CronJob, CronJobCreate, CronStoreFile } from '../engine/cron/types.js';
import { scheduleNextRun, computePreviousRunAtMs } from '../engine/cron/schedule.js';
import { parseAbsoluteTime } from '../engine/cron/parse.js';
import { logger } from '../logger.js';

/** 任务调度（types.ts 的 CronSchedule，通过索引访问避免重复导入） */
type Schedule = CronJob['schedule'];
/** 会话目标 */
type SessionTarget = CronJob['sessionTarget'];
/** 唤醒模式 */
type WakeMode = CronJob['wakeMode'];
/** 任务 payload */
type Payload = CronJob['payload'];

const router = Router();

// 复用 engine/cron/store.ts 的默认存储实例（JSON 文件，单例）
const store: CronJobStore = getDefaultCronStore();

/** 判断是否为普通对象（非数组、非 null） */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 把字符串规范化为可选时区：空白或非字符串返回 undefined */
function normalizeTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** 从 body 提取 cron 表达式（cronExpression 或 cron），返回去除空白后的字符串 */
function extractCronExpr(body: Record<string, unknown>): string {
  if (typeof body.cronExpression === 'string') return body.cronExpression.trim();
  if (typeof body.cron === 'string') return body.cron.trim();
  return '';
}

/** 校验并提取 sessionTarget，非法值回退到 "isolated" */
function coerceSessionTarget(value: unknown): SessionTarget {
  if (typeof value !== 'string') return 'isolated';
  if (value === 'main' || value === 'isolated' || value === 'current') return value;
  if (value.startsWith('session:')) return value as SessionTarget;
  return 'isolated';
}

/** 校验并提取 wakeMode，非法值回退到 "next-heartbeat" */
function coerceWakeMode(value: unknown): WakeMode {
  if (value === 'next-heartbeat' || value === 'now') return value;
  return 'next-heartbeat';
}

/** 校验 payload 结构（按 kind 检查必需字段） */
function isCronPayload(value: unknown): value is Payload {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'systemEvent') return typeof value.text === 'string';
  if (value.kind === 'agentTurn') return typeof value.message === 'string';
  if (value.kind === 'command') {
    return Array.isArray(value.argv) && value.argv.every((a) => typeof a === 'string');
  }
  return false;
}

/** 用 schedule 计算下次运行时间（毫秒），非法表达式返回 undefined */
function computeNextRunAtMs(schedule: Schedule): number | undefined {
  return scheduleNextRun(schedule, Date.now());
}

/** 读取所有任务 */
async function listJobs(): Promise<CronJob[]> {
  const loaded: LoadedCronStore = await store.load();
  return loaded.store.jobs;
}

/** 根据 id 查找任务 */
async function findJob(id: string): Promise<CronJob | undefined> {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id);
}

/** 把任务数组写回存储 */
async function persistJobs(jobs: CronJob[]): Promise<void> {
  const file: CronStoreFile = { version: 1, jobs };
  await store.save(file);
}

/** 为返回结果附加计算得到的下次运行时间（不改动持久化数据） */
function withComputedNextRun(job: CronJob): CronJob {
  if (typeof job.state.nextRunAtMs === 'number') return job;
  const computed = computeNextRunAtMs(job.schedule);
  if (computed === undefined) return job;
  return { ...job, state: { ...job.state, nextRunAtMs: computed } };
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
    const body = isRecord(req.body) ? req.body : {};
    const { cron, timezone, from } = body;
    if (typeof cron !== 'string' || !cron.trim()) {
      return res.status(400).json({ success: false, error: 'cron (string) is required' });
    }
    const expr = cron.trim();
    const tz = normalizeTimezone(timezone);

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
 * Body（字段对齐 engine/cron/types.ts 的 CronJob）：
 * - id?                 ：缺省自动生成
 * - name                ：任务名（缺省 "Untitled Cron Job"）
 * - cronExpression/cron ：cron 表达式（必需）
 * - timezone?           ：时区
 * - description?        ：任务描述
 * - agentId?            ：目标 agent
 * - sessionKey?         ：会话 key
 * - sessionTarget?      ：会话目标（main/isolated/current/session:<key>，缺省 isolated）
 * - wakeMode?           ：唤醒模式（next-heartbeat/now，缺省 next-heartbeat）
 * - payload?            ：任务 payload（systemEvent/agentTurn/command，缺省空 systemEvent）
 * - enabled?            ：默认 true
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = isRecord(req.body) ? req.body : {};
    const rawExpr = extractCronExpr(body);
    if (!rawExpr) {
      return res.status(400).json({ success: false, error: 'cronExpression (string) is required' });
    }

    const tz = normalizeTimezone(body.timezone);

    // 先校验表达式合法性（非法抛错）
    if (scheduleNextRun({ kind: 'cron', expr: rawExpr, tz }, Date.now()) === undefined) {
      return res.status(400).json({ success: false, error: 'invalid cronExpression' });
    }

    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
    const now = Date.now();

    // 构建调度：cron 类型，携带可选时区
    const schedule: Schedule = { kind: 'cron', expr: rawExpr, ...(tz ? { tz } : {}) };

    // 构建 CronJobCreate（不含 id / 时间戳 / state，由后续补齐）
    const create: CronJobCreate = {
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled Cron Job',
      enabled: body.enabled !== false,
      schedule,
      sessionTarget: coerceSessionTarget(body.sessionTarget),
      wakeMode: coerceWakeMode(body.wakeMode),
      payload: isCronPayload(body.payload) ? body.payload : { kind: 'systemEvent', text: '' },
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(typeof body.agentId === 'string' && body.agentId.trim() ? { agentId: body.agentId.trim() } : {}),
      ...(typeof body.sessionKey === 'string' ? { sessionKey: body.sessionKey } : {}),
    };

    // 物化为完整 CronJob（补齐 id / 时间戳 / 初始 state）
    const job: CronJob = {
      ...create,
      id,
      createdAtMs: now,
      updatedAtMs: now,
      state: { consecutiveErrors: 0, consecutiveSkipped: 0 },
    };

    const jobs = await listJobs();
    if (jobs.some((j) => j.id === id)) {
      return res.status(409).json({ success: false, error: `cron job already exists: ${id}` });
    }
    jobs.push(job);
    await persistJobs(jobs);

    res.status(201).json({ success: true, data: withComputedNextRun(job) });
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
 * 更新 cron 任务（局部合并，使用 Partial<CronJob>）。
 *
 * 可更新字段：name / description / agentId / sessionKey / sessionTarget /
 * wakeMode / enabled / payload / cronExpression(cron) / timezone。
 * 运行时 state 保持不变；若调度发生变化则清除旧的 nextRunAtMs 促使重新计算。
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await findJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }

    const body = isRecord(req.body) ? req.body : {};
    const jobs = await listJobs();
    const idx = jobs.findIndex((j) => j.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'cron job not found' });
    }

    // 以 Partial<CronJob> 收集更新字段，仅在对应字段被提供时写入
    const patch: Partial<CronJob> = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === 'string') patch.description = body.description;
    if (typeof body.agentId === 'string' && body.agentId.trim()) patch.agentId = body.agentId.trim();
    if (typeof body.sessionKey === 'string') patch.sessionKey = body.sessionKey;
    if (body.sessionTarget !== undefined) patch.sessionTarget = coerceSessionTarget(body.sessionTarget);
    if (body.wakeMode !== undefined) patch.wakeMode = coerceWakeMode(body.wakeMode);
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (isCronPayload(body.payload)) patch.payload = body.payload;

    // cronExpression / cron 单独校验，重建 schedule
    const hasCronUpdate = typeof body.cronExpression === 'string' || typeof body.cron === 'string';
    let scheduleChanged = false;
    if (hasCronUpdate) {
      const rawExpr = extractCronExpr(body);
      if (!rawExpr) {
        return res.status(400).json({ success: false, error: 'cronExpression cannot be empty' });
      }
      // 优先取 body.timezone；缺省回退到既有 cron 调度的 tz
      const tz = normalizeTimezone(body.timezone)
        ?? (existing.schedule.kind === 'cron' ? existing.schedule.tz : undefined);
      if (scheduleNextRun({ kind: 'cron', expr: rawExpr, tz }, Date.now()) === undefined) {
        return res.status(400).json({ success: false, error: 'invalid cronExpression' });
      }
      patch.schedule = { kind: 'cron', expr: rawExpr, ...(tz ? { tz } : {}) };
      scheduleChanged = true;
    }

    // 合并补丁，保留运行时 state，刷新 updatedAtMs
    const next: CronJob = {
      ...existing,
      ...patch,
      state: existing.state,
      updatedAtMs: Date.now(),
    };

    // 调度变化时清除旧的 nextRunAtMs，让 withComputedNextRun 重新计算
    if (scheduleChanged) {
      next.state = { ...next.state, nextRunAtMs: undefined };
    }

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
