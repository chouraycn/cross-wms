/**
 * StaffDeck Scheduled Tasks Routes — 挂载 /api/staffdeck/scheduled-tasks
 *
 * 端点：
 *   GET    /                       — 列表
 *   POST   /                       — 创建
 *   GET    /runs                   — 获取所有任务执行历史
 *   GET    /:task_id              — 详情
 *   PUT    /:task_id              — 更新
 *   DELETE /:task_id              — 删除（归档）
 *   GET    /:task_id/runs         — 单个任务的执行历史
 *   POST   /:task_id/run-now      — 立即执行（stub）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type {
  ScheduledTaskRow,
  ScheduledTaskRunRow,
  ScheduledTaskRead,
} from '../../types/staff.js';
import * as scheduledTaskDao from '../../dao/staff/staffScheduledTaskDao.js';

const router = Router();

// ===================== Row → Read 转换 =====================

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function scheduledTaskRead(row: ScheduledTaskRow): ScheduledTaskRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    agent_id: row.agent_id,
    created_by_user_id: row.created_by_user_id,
    title: row.title,
    prompt: row.prompt,
    description: row.description,
    schedule_type: row.schedule_type,
    schedule: parseJson(row.schedule_json, {}),
    timezone: row.timezone,
    rrule: row.rrule,
    status: row.status,
    concurrency_policy: row.concurrency_policy,
    misfire_policy: row.misfire_policy,
    max_runs: row.max_runs,
    end_at: row.end_at,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    last_status: row.last_status,
    run_count: row.run_count,
    lease_owner: row.lease_owner,
    lease_until: row.lease_until,
    source_session_id: row.source_session_id,
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

interface RunRead {
  id: string;
  tenant_id: string;
  scheduled_task_id: string;
  agent_id: string;
  user_id: string | null;
  session_id: string | null;
  scheduled_for: number;
  status: string;
  started_at: number | null;
  finished_at: number | null;
  result_summary: string | null;
  error: string | null;
  trace: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

function runRead(row: ScheduledTaskRunRow): RunRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    scheduled_task_id: row.scheduled_task_id,
    agent_id: row.agent_id,
    user_id: row.user_id,
    session_id: row.session_id,
    scheduled_for: row.scheduled_for,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    result_summary: row.result_summary,
    error: row.error,
    trace: parseJson(row.trace_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== GET / — 列表 =====================

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const agent_id = req.query.agent_id as string | undefined;
  const status = req.query.status as string | undefined;
  const created_by_user_id = req.query.created_by_user_id as string | undefined;
  const rows = scheduledTaskDao.listScheduledTasks(tenantId, { agent_id, status, created_by_user_id });
  res.json({ code: 0, data: rows.map(scheduledTaskRead), message: 'ok' });
});

// ===================== POST / — 创建 =====================

router.post('/', (req: Request, res: Response) => {
  const {
    agent_id,
    title,
    prompt,
    description,
    schedule_type,
    schedule,
    timezone,
    rrule,
    status,
    concurrency_policy,
    misfire_policy,
    max_runs,
    end_at,
    next_run_at,
    source_session_id,
    created_by_user_id,
    metadata,
  } = req.body;

  if (!agent_id || typeof agent_id !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'agent_id 不能为空' });
    return;
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'title 不能为空' });
    return;
  }
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'prompt 不能为空' });
    return;
  }

  const tenantId = (req.body.tenant_id as string) || DEFAULT_TENANT_ID;

  const row = scheduledTaskDao.createScheduledTask({
    tenant_id: tenantId,
    agent_id,
    created_by_user_id: created_by_user_id ?? null,
    title: title.trim(),
    prompt: prompt.trim(),
    description: description ?? null,
    schedule_type,
    schedule,
    timezone,
    rrule,
    status,
    concurrency_policy,
    misfire_policy,
    max_runs,
    end_at,
    next_run_at,
    source_session_id,
    metadata,
  });
  // TODO: 接入 croner 调度器
  res.status(201).json({ code: 0, data: scheduledTaskRead(row), message: 'ok' });
});

// ===================== GET /runs — 所有任务执行历史 =====================
// 注意：此路由必须在 GET /:task_id 之前注册

router.get('/runs', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const agent_id = req.query.agent_id as string | undefined;
  const status = req.query.status as string | undefined;
  const user_id = req.query.user_id as string | undefined;
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const rows = scheduledTaskDao.listAllRuns(tenantId, { agent_id, status, user_id }, limit);
  res.json({ code: 0, data: rows.map(runRead), message: 'ok' });
});

// ===================== GET /:task_id — 详情 =====================

router.get('/:task_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = scheduledTaskDao.getScheduledTaskById(tenantId, req.params.task_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
    return;
  }
  res.json({ code: 0, data: scheduledTaskRead(row), message: 'ok' });
});

// ===================== PUT /:task_id — 更新 =====================

router.put('/:task_id', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = scheduledTaskDao.updateScheduledTask(tenantId, req.params.task_id, {
    title: req.body.title,
    prompt: req.body.prompt,
    description: req.body.description,
    schedule_type: req.body.schedule_type,
    schedule: req.body.schedule,
    timezone: req.body.timezone,
    rrule: req.body.rrule,
    status: req.body.status,
    concurrency_policy: req.body.concurrency_policy,
    misfire_policy: req.body.misfire_policy,
    max_runs: req.body.max_runs,
    end_at: req.body.end_at,
    next_run_at: req.body.next_run_at,
    metadata: req.body.metadata,
  });
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
    return;
  }
  // TODO: 接入 croner 调度器（更新调度）
  res.json({ code: 0, data: scheduledTaskRead(row), message: 'ok' });
});

// ===================== DELETE /:task_id — 删除（归档） =====================

router.delete('/:task_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const hard = req.query.hard === 'true';
  if (hard) {
    const ok = scheduledTaskDao.deleteScheduledTask(tenantId, req.params.task_id);
    if (!ok) {
      res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
      return;
    }
  } else {
    const row = scheduledTaskDao.archiveScheduledTask(tenantId, req.params.task_id);
    if (!row) {
      res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
      return;
    }
  }
  // TODO: 接入 croner 调度器（取消调度）
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== GET /:task_id/runs — 单个任务的执行历史 =====================

router.get('/:task_id/runs', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const task = scheduledTaskDao.getScheduledTaskById(tenantId, req.params.task_id);
  if (!task) {
    res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
    return;
  }
  const rows = scheduledTaskDao.listRunsForTask(tenantId, req.params.task_id);
  res.json({ code: 0, data: rows.map(runRead), message: 'ok' });
});

// ===================== POST /:task_id/run-now — 立即执行（stub） =====================

router.post('/:task_id/run-now', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const task = scheduledTaskDao.getScheduledTaskById(tenantId, req.params.task_id);
  if (!task) {
    res.status(404).json({ code: 404, data: null, message: '定时任务不存在' });
    return;
  }
  if (task.status === 'archived') {
    res.status(400).json({ code: 400, data: null, message: '已删除的自动任务不能运行' });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  // TODO: 接入 croner / 真实任务执行器，此处仅创建一条 queued 记录
  const run = scheduledTaskDao.createRun({
    tenant_id: tenantId,
    scheduled_task_id: task.id,
    agent_id: task.agent_id,
    user_id: task.created_by_user_id,
    scheduled_for: now,
    status: 'queued',
  });
  res.json({ code: 0, data: runRead(run), message: 'ok' });
});

export default router;
