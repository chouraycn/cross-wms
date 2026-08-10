/**
 * scheduledTaskService — 数字员工定时任务调度器
 *
 * 定位：把 StaffDeck 的定时任务接入主程序统一调度器（server/engine/cronScheduler.ts
 * 的 CronScheduler 单例），复用其「调度循环 + 指数退避重试 + 运行日志」能力，
 * 不再自己维护一套 croner 定时器。
 *
 * 设计：
 *  - 每个 active 任务在 CronScheduler 中注册为一个 job（taskType = 'staff-chat-turn'），
 *    触发时由注册好的 executor 调用 runStaffChatTurn（与「数字员工对话」同引擎链路）。
 *  - 运行记录（sd_scheduled_task_runs）仍由本模块写入（持久、前端可读），主 cron 的
 *    run-log 作为内存诊断补充。
 *  - 任务完成（once 已执行 / 达 max_runs）时把 staff DB 状态翻 completed；executor 在
 *    非 active 状态下 no-op，避免重复执行（主调度器按周期触发，但本模块据此熔断）。
 *  - 仅 computeNextRunAt 仍用 croner 做「下一次执行时间」的纯日期计算（无定时器副作用），
 *    用于写入 staff DB 的 next_run_at 展示字段。
 *
 * 状态约定：任务 status ∈ {active, paused, completed, archived}；可执行 = active。
 * 运行记录 status ∈ {queued, running, succeeded, failed}（前端按 succeeded/failed/running 渲染）。
 */
import { Cron } from 'croner';
import { DEFAULT_TENANT_ID } from '../db-staff.js';
import * as scheduledTaskDao from '../dao/staff/staffScheduledTaskDao.js';
import { runStaffChatTurn } from './staffChatExecutor.js';
import { getCronScheduler, registerCronTask } from '../engine/cronScheduler.js';
import { logger } from '../logger.js';
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '../types/staff.js';
import { deliverToChannel } from '../routes/staff/channels.js';

// ===================== 调度注册表（staff taskId → 主 cron jobId） =====================

const cronJobIds = new Map<string, string>();

// ===================== 主 cron 执行器（注册一次，触发时调用数字员工引擎） =====================

registerCronTask('staff-chat-turn', async (params) => {
  const { tenantId, taskDbId } = params as Record<string, string>;
  const task = scheduledTaskDao.getScheduledTaskById(tenantId, taskDbId);
  if (!task) {
    logger.warn(`[ScheduledTaskService] 定时任务 ${taskDbId} 不存在，跳过执行`);
    return { ok: false, error: 'task not found' };
  }
  // 已完成/归档的任务不再执行（主调度器按周期触发，本模块据此熔断，避免重复运行）
  if (task.status !== 'active') {
    return { ok: true, skipped: true };
  }
  const run = createRunningRun(task, Math.random().toString(36).slice(2, 8));
  await executeAndRecord(task, run); // 内部失败会抛错 → 由主 cron 的 withRetry 重试
  return { ok: true };
});

// ===================== 调度表达式解析 =====================

interface ScheduleParseResult {
  /** cron 表达式字符串，或一次性 Date */
  pattern: string | Date;
  timezone?: string;
}

function parseScheduleJson(task: ScheduledTaskRow): Record<string, any> {
  if (!task.schedule_json) return {};
  try {
    return JSON.parse(task.schedule_json) as Record<string, any>;
  } catch {
    return {};
  }
}

/**
 * 把 StaffDeck 的 schedule_type（once/daily/weekly/monthly）解析为 cron 表达式（或一次性 Date）。
 * 前端 weekday：0=周一 … 6=周日；croner/标准 cron 的 dow：0=周日 … 6=周六，故需 (d+1)%7 映射。
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
        ? (schedule.weekdays as any[]).map((d) => (Number(d) + 1) % 7)
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

/** 把解析结果统一为 5 字段 cron 表达式字符串（once 转为「年触发一次」，完成后由 executor no-op 熔断） */
function toCronExpression(parsed: ScheduleParseResult): string {
  if (typeof parsed.pattern === 'string') return parsed.pattern;
  const d = parsed.pattern as Date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMinutes())} ${pad(d.getHours())} ${pad(d.getDate())} ${pad(d.getMonth() + 1)} *`;
}

function isSchedulable(task: ScheduledTaskRow): boolean {
  return task.status === 'active';
}

// ===================== 公共工具 =====================

/** 计算任务的下一次执行时间（unix 秒），无法解析/过去时间返回 null。复用 croner 仅做纯日期计算。 */
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

/** 注册（或重注册）一个任务到主 CronScheduler。非 active 任务直接跳过（并清理旧注册） */
export function registerTask(task: ScheduledTaskRow): void {
  unregisterTask(task.id);
  if (!isSchedulable(task)) return;
  const parsed = parseSchedule(task);
  if (!parsed) {
    logger.warn(`[ScheduledTaskService] 任务 ${task.id} 调度表达式无法解析，跳过注册`);
    return;
  }
  const cronExpression = toCronExpression(parsed);
  const sched = getCronScheduler();
  const job = sched.createJob({
    name: task.title,
    cronExpression,
    taskType: 'staff-chat-turn',
    taskParams: {
      tenantId: task.tenant_id,
      agentId: task.agent_id,
      prompt: task.prompt,
      taskDbId: task.id,
    },
    agent: task.agent_id,
    enabled: true,
    metadata: { staffTaskId: task.id },
  });
  cronJobIds.set(task.id, job.id);
  const next = computeNextRunAt(task);
  if (next !== null) {
    scheduledTaskDao.updateScheduledTask(task.tenant_id, task.id, { next_run_at: next });
  }
}

/** 从主 CronScheduler 注销一个任务 */
export function unregisterTask(taskId: string): void {
  const jobId = cronJobIds.get(taskId);
  if (jobId) {
    getCronScheduler().deleteJob(jobId);
    cronJobIds.delete(taskId);
  }
}

/** 启动调度器：从 DB 恢复所有 active 任务到主 CronScheduler（其定时器由 server/index.ts 的 startCronScheduler 驱动） */
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
    `[ScheduledTaskService] 调度器初始化完成：已注册 ${registered}/${tasks.length} 个任务（复用主 CronScheduler）`,
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
 * 尝试将定时任务产出投递到渠道。
 *
 * 读取任务 metadata_json 中的 deliver_to_channel 配置：
 *   { deliver_to_channel: { binding_id?: string, channel?: string, chat_id?: string, max_length?: number } }
 *
 * 深度完善：
 *   - 投递失败自动重试（最多 3 次，间隔 1s/2s/4s 指数退避）
 *   - 长内容智能截断（默认 4000 字符，可配置 max_length），追加截断提示
 *   - 投递状态记录到 run 的 metadata 中，便于前端展示
 *   - 投递失败不影响任务执行状态（任务本身已成功）
 *
 * 返回投递结果摘要，供调用方记录到 run metadata。
 */
async function tryDeliverToChannel(
  task: ScheduledTaskRow,
  content: string,
): Promise<{ delivered: boolean; deliveryId?: string; error?: string }> {
  const meta = typeof task.metadata_json === 'string'
    ? JSON.parse(task.metadata_json || '{}')
    : (task.metadata_json || {});
  const deliverCfg = meta?.deliver_to_channel;
  if (!deliverCfg || typeof deliverCfg !== 'object') {
    return { delivered: false };
  }

  // 智能截断：IM 消息通常有长度限制（飞书 4000 字、企微 2048 字）
  const maxLength = deliverCfg.max_length || 4000;
  let deliverContent = content;
  if (content.length > maxLength) {
    deliverContent = content.slice(0, maxLength) + '\n\n[内容过长，已截断]';
  }

  // 指数退避重试
  const maxRetries = 3;
  const delays = [1000, 2000, 4000];
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = deliverToChannel({
        tenantId: task.tenant_id,
        bindingId: deliverCfg.binding_id,
        channel: deliverCfg.channel,
        agentId: task.agent_id,
        title: task.title,
        content: deliverContent,
        type: 'text',
      });

      if (result.ok) {
        logger.info(
          `[ScheduledTaskService] 任务 ${task.id} 产出已投递到渠道 (delivery=${result.delivery?.id}, attempt=${attempt + 1})`,
        );
        return {
          delivered: true,
          deliveryId: result.delivery?.id,
        };
      }

      lastError = result.error || '未知错误';
      logger.warn(
        `[ScheduledTaskService] 任务 ${task.id} 渠道投递失败 (attempt=${attempt + 1}/${maxRetries + 1}): ${lastError}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn(
        `[ScheduledTaskService] 任务 ${task.id} 渠道投递异常 (attempt=${attempt + 1}/${maxRetries + 1}): ${lastError}`,
      );
    }

    // 非最后一次重试，等待退避
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }

  logger.warn(`[ScheduledTaskService] 任务 ${task.id} 渠道投递最终失败: ${lastError}`);
  return { delivered: false, error: lastError };
}

/**
 * 真正执行一次任务：调用数字员工引擎产出回答，并回写运行记录与任务统计。
 * 与「对话」共用 runStaffChatTurn，因此拥有同等的人格 / SOP / RAG 能力。
 * 注意：once / 达 max_runs 的任务在此将 staff DB 状态翻为 completed；其调度熔断由
 * executor 的 no-op 守卫负责（主调度器按周期触发，但非 active 时不再执行）。
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
          const data = event.data as { text?: any } | undefined;
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

    // 投递产出到渠道（若任务配置了 deliver_to_channel）
    const deliverContent = summary || result.content.slice(0, 1000);
    const deliverResult = await tryDeliverToChannel(task, deliverContent);

    // 将投递状态追加到 run 的 result_summary（便于前端展示投递结果）
    if (deliverResult.delivered || deliverResult.error) {
      const deliveryNote = deliverResult.delivered
        ? `\n\n[已投递到渠道 delivery=${deliverResult.deliveryId}]`
        : `\n\n[渠道投递失败: ${deliverResult.error}]`;
      scheduledTaskDao.updateRun(task.tenant_id, run.id, {
        result_summary: (summary || result.content.slice(0, 1000)) + deliveryNote,
      });
    }

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
