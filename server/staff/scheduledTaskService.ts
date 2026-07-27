/**
 * scheduledTaskService — 数字员工定时任务真实调度器
 *
 * 定位：把 StaffDeck 的定时任务从「仅建 queued 记录」升级为「croner 真调度 + 真实执行」。
 *
 * 设计：
 *  - 调度层用 croner（项目已装 v10）把 once/daily/weekly/monthly 映射为 cron 表达式（或一次性 Date），
 *    注册到内存 registry，并在启动时从 DB 恢复所有 active 任务。
 *  - 执行层复用 staffChatExecutor.runStaffChatTurn —— 与「数字员工对话」走完全相同的引擎链路
 *    （人格隔离 system prompt + 绑定 SOP + 真实 RAG 检索 + 真实 LLM / 本地 mock 兜底），
 *    保证定时任务产出的回答与对话一致，而非另写一套。
 *  - 每次执行写入 sd_scheduled_task_runs（running → succeeded/failed），并回写任务的
 *    last_run_at / last_status / run_count / next_run_at；达到 max_runs 或 once 任务完成后翻转状态为 completed。
 *
 * 状态约定：任务 status ∈ {active, paused, completed, archived}；可执行 = active。
 * 运行记录 status ∈ {queued, running, succeeded, failed}（前端按 succeeded/failed/running 渲染）。
 */
import { Cron } from 'croner';
import { DEFAULT_TENANT_ID } from '../db-staff.js';
import * as scheduledTaskDao from '../dao/staff/staffScheduledTaskDao.js';
import { runStaffChatTurn } from './staffChatExecutor.js';
import { logger } from '../logger.js';
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '../types/staff.js';

// ===================== 调度注册表 =====================

const registry = new Map<string, Cron>();

// ===================== 调度表达式解析 =====================

interface ScheduleParseResult {
  /** cron 表达式字符串，或一次性 Date */
  pattern: string | Date;
  timezone?: string;
}

function parseScheduleJson(task: ScheduledTaskRow): Record<string, unknown> {
  if (!task.schedule_json) return {};
  try {
    return JSON.parse(task.schedule_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 把 StaffDeck 的 schedule_type（once/daily/weekly/monthly）解析为 croner 可接受的 pattern。
 * 前端 weekday：0=周一 … 6=周日；croner dow：0=周日 … 6=周六，故需 (d+1)%7 映射。
 */
function parseSchedule(task: ScheduledTaskRow): ScheduleParseResult | null {
  const schedule = parseScheduleJson(task);
  const timezone = task.timezone || 'Asia/Shanghai';
  const type = task.schedule_type;
  try {
    if (type === 'once') {
      const runAt = schedule.run_at;
      if (!runAt || typeof runAt !== 'string') return null;
      return { pattern: new Date(runAt), timezone };
    }
    if (type === 'daily') {
      const [hh, mm] = String(schedule.time || '09:00').split(':');
      return { pattern: `${mm} ${hh} * * *`, timezone };
    }
    if (type === 'weekly') {
      const [hh, mm] = String(schedule.time || '09:00').split(':');
      const days = Array.isArray(schedule.weekdays) && schedule.weekdays.length
        ? (schedule.weekdays as unknown[]).map((d) => (Number(d) + 1) % 7)
        : [1];
      return { pattern: `${mm} ${hh} * * ${days.join(',')}`, timezone };
    }
    if (type === 'monthly') {
      const [hh, mm] = String(schedule.time || '09:00').split(':');
      const dom = Number(schedule.day_of_month) || 1;
      return { pattern: `${mm} ${hh} ${dom} * *`, timezone };
    }
    // 兜底：若前端传了原生 cron 表达式（如未来扩展）
    if (typeof schedule.cron === 'string' && schedule.cron.trim()) {
      return { pattern: schedule.cron.trim(), timezone };
    }
    return null;
  } catch (err) {
    logger.warn('[ScheduledTaskService] 解析调度表达式失败:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function isSchedulable(task: ScheduledTaskRow): boolean {
  return task.status === 'active';
}

// ===================== 公共工具 =====================

/** 计算任务的下一次执行时间（unix 秒），无法解析/过去时间返回 null */
export function computeNextRunAt(task: ScheduledTaskRow): number | null {
  const parsed = parseSchedule(task);
  if (!parsed) return null;
  try {
    const cron = new Cron(parsed.pattern, { timezone: parsed.timezone });
    const next = cron.nextRun();
    cron.stop();
    return next ? Math.floor(next.getTime() / 1000) : null;
  } catch {
    return null;
  }
}

// ===================== 注册 / 注销 =====================

/** 注册（或重注册）一个任务到 croner。非 active 任务直接跳过（并清理旧注册） */
export function registerTask(task: ScheduledTaskRow): void {
  unregisterTask(task.id);
  if (!isSchedulable(task)) return;
  const parsed = parseSchedule(task);
  if (!parsed) {
    logger.warn(`[ScheduledTaskService] 任务 ${task.id} 调度表达式无法解析，跳过注册`);
    return;
  }
  const cron = new Cron(
    parsed.pattern,
    { timezone: parsed.timezone },
    async () => {
      try {
        await startTaskRun(task.tenant_id, task.id);
      } catch (err) {
        logger.error('[ScheduledTaskService] 定时触发执行失败:', err instanceof Error ? err.message : String(err));
      }
    },
  );
  registry.set(task.id, cron);
  const next = cron.nextRun();
  if (next) {
    scheduledTaskDao.updateScheduledTask(task.tenant_id, task.id, {
      next_run_at: Math.floor(next.getTime() / 1000),
    });
  }
}

/** 从 croner 注销一个任务 */
export function unregisterTask(taskId: string): void {
  const existing = registry.get(taskId);
  if (existing) {
    existing.stop();
    registry.delete(taskId);
  }
}

/** 启动调度器：从 DB 恢复所有 active 任务 */
export function initScheduledTaskScheduler(): void {
  let registered = 0;
  const tasks = scheduledTaskDao.listAllScheduledTasks();
  for (const task of tasks) {
    if (isSchedulable(task)) {
      registerTask(task);
      registered++;
    }
  }
  logger.info(
    `[ScheduledTaskService] 调度器初始化完成：已注册 ${registered}/${tasks.length} 个任务（croner 真调度）`,
  );
}

// ===================== 执行核心 =====================

function createRunningRun(task: ScheduledTaskRow, nonce: string): ScheduledTaskRunRow {
  const now = Math.floor(Date.now() / 1000);
  return scheduledTaskDao.createRun({
    tenant_id: task.tenant_id,
    scheduled_task_id: task.id,
    agent_id: task.agent_id,
    user_id: task.created_by_user_id,
    session_id: `sched-${task.id}-${now}-${nonce}`,
    scheduled_for: now,
    status: 'running',
    started_at: now,
  });
}

/**
 * 真正执行一次任务：调用数字员工引擎产出回答，并回写运行记录与任务统计。
 * 与「对话」共用 runStaffChatTurn，因此拥有同等的人格 / SOP / RAG 能力。
 */
async function executeAndRecord(task: ScheduledTaskRow, run: ScheduledTaskRunRow): Promise<void> {
  const startedAt = Math.floor(Date.now() / 1000);
  try {
    let content = '';
    const result = await runStaffChatTurn(
      {
        tenantId: task.tenant_id,
        sessionId: run.session_id || `sched-${task.id}`,
        agentId: task.agent_id,
        message: task.prompt,
        history: [],
      },
      (event) => {
        if (event.type === 'text.delta') {
          const data = event.data as { text?: unknown } | undefined;
          content += typeof data?.text === 'string' ? data.text : '';
        }
      },
    );
    const summary = content.slice(0, 1000);
    const finishedAt = Math.floor(Date.now() / 1000);
    scheduledTaskDao.updateRun(task.tenant_id, run.id, {
      status: 'succeeded',
      finished_at: finishedAt,
      result_summary: summary || result.content.slice(0, 1000),
    });

    const runCount = (task.run_count || 0) + 1;
    let nextStatus = task.status;
    if (task.schedule_type === 'once') {
      nextStatus = 'completed';
    } else if (task.max_runs && task.max_runs > 0 && runCount >= task.max_runs) {
      nextStatus = 'completed';
    }
    const next = computeNextRunAt(task);
    scheduledTaskDao.updateScheduledTask(task.tenant_id, task.id, {
      last_run_at: startedAt,
      last_status: 'succeeded',
      run_count: runCount,
      next_run_at: nextStatus === 'completed' ? null : next,
      status: nextStatus,
    });
    if (nextStatus === 'completed') unregisterTask(task.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scheduledTaskDao.updateRun(task.tenant_id, run.id, {
      status: 'failed',
      finished_at: Math.floor(Date.now() / 1000),
      error: message,
    });
    scheduledTaskDao.updateScheduledTask(task.tenant_id, task.id, {
      last_run_at: startedAt,
      last_status: 'failed',
    });
    throw err;
  }
}

/**
 * 立即启动一次任务运行（后台异步执行，不阻塞调用方）。
 * 返回刚创建的 running 状态运行记录；实际结果稍后通过 /runs 轮询获取。
 */
export function startTaskRun(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): ScheduledTaskRunRow {
  const task = scheduledTaskDao.getScheduledTaskById(tenantId, taskId);
  if (!task) throw new Error(`定时任务不存在: ${taskId}`);
  if (task.status === 'archived') throw new Error('已删除的自动任务不能运行');
  const nonce = Math.random().toString(36).slice(2, 8);
  const run = createRunningRun(task, nonce);
  void executeAndRecord(task, run).catch((err) => {
    logger.error('[ScheduledTaskService] 任务执行失败:', err instanceof Error ? err.message : String(err));
  });
  return run;
}

/**
 * 同步等待一次任务运行完成并返回最终运行记录（供测试 / 需要立即拿结果的场景）。
 */
export async function runScheduledTaskNow(
  tenantId: string = DEFAULT_TENANT_ID,
  taskId: string,
): Promise<ScheduledTaskRunRow> {
  const task = scheduledTaskDao.getScheduledTaskById(tenantId, taskId);
  if (!task) throw new Error(`定时任务不存在: ${taskId}`);
  if (task.status === 'archived') throw new Error('已删除的自动任务不能运行');
  const nonce = Math.random().toString(36).slice(2, 8);
  const run = createRunningRun(task, nonce);
  await executeAndRecord(task, run);
  return scheduledTaskDao.getRunById(tenantId, run.id) ?? run;
}
