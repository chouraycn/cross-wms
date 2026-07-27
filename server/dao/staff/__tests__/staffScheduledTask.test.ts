/**
 * @vitest-environment node
 *
 * 数字员工「定时任务真实调度」测试：
 * 1. runScheduledTaskNow 真正调用数字员工引擎（runStaffChatTurn），运行记录置 succeeded，回写任务统计；
 *    once 任务执行后状态翻转为 completed、next_run_at 清空。
 * 2. computeNextRunAt 对 daily 调度返回未来时间戳（croner 真调度表达式正确）。
 *
 * 策略：vi.mock 把 db.js 替换为内存 SQLite + initStaffTables 建表；
 * 把 staffChatExecutor.runStaffChatTurn 替换为可控的确定性 mock（不走真实 LLM）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ===================== Mock Setup（必须在导入 DAO / Service 之前） =====================

let mockDb: Database.Database;

vi.mock('../../../db.js', () => ({
  initDb: vi.fn(() => mockDb),
}));

// 可控的「数字员工引擎」mock：模拟流式吐字，最终返回确定内容
vi.mock('../../../staff/staffChatExecutor.js', () => ({
  runStaffChatTurn: vi.fn(async (_input: unknown, emit?: (e: { type: string; data?: { text?: string } }) => void) => {
    const parts = ['你好，', '这是定时任务', '的执行结果。'];
    if (emit) {
      for (const p of parts) emit({ type: 'text.delta', data: { text: p } });
    }
    return { content: parts.join(''), thinkingContent: '', mock: true };
  }),
}));

const { initStaffTables } = await import('../../../db-staff.js');
const scheduledTaskDao = await import('../staffScheduledTaskDao.js');
const svc = await import('../../../staff/scheduledTaskService.js');

const TENANT = 'default';

beforeEach(() => {
  mockDb = new Database(':memory:');
  initStaffTables(mockDb);
});

describe('定时任务真实执行', () => {
  it('runScheduledTaskNow 调用引擎、记录 succeeded、回写统计，once 任务完成后翻 completed', async () => {
    const task = scheduledTaskDao.createScheduledTask({
      tenant_id: TENANT,
      agent_id: 'agent-test-1',
      title: '每日简报',
      prompt: '请生成今日简报',
      schedule_type: 'once',
      schedule: { run_at: '2020-01-01T09:00:00+08:00' }, // 过去时间，仅用于测试执行路径
      status: 'active',
    });

    const run = await svc.runScheduledTaskNow(TENANT, task.id);

    // 运行记录成功
    expect(run.status).toBe('succeeded');
    expect(run.result_summary).toContain('执行结果');

    // 任务统计回写
    const updated = scheduledTaskDao.getScheduledTaskById(TENANT, task.id);
    expect(updated?.run_count).toBe(1);
    expect(updated?.last_status).toBe('succeeded');
    // once 任务执行后翻转
    expect(updated?.status).toBe('completed');
    expect(updated?.next_run_at).toBeNull();
  });

  it('执行过程中引擎抛错时，运行记录为 failed 且任务 last_status 为 failed', async () => {
    const executor = await import('../../../staff/staffChatExecutor.js');
    vi.mocked(executor.runStaffChatTurn).mockRejectedValueOnce(new Error('引擎故障'));

    const task = scheduledTaskDao.createScheduledTask({
      tenant_id: TENANT,
      agent_id: 'agent-test-2',
      title: '会失败的任务',
      prompt: 'boom',
      schedule_type: 'once',
      schedule: { run_at: '2020-01-01T09:00:00+08:00' },
      status: 'active',
    });

    await expect(svc.runScheduledTaskNow(TENANT, task.id)).rejects.toThrow('引擎故障');

    const updated = scheduledTaskDao.getScheduledTaskById(TENANT, task.id);
    expect(updated?.last_status).toBe('failed');
    const runs = scheduledTaskDao.listRunsForTask(TENANT, task.id);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error).toContain('引擎故障');
  });
});

describe('定时任务调度表达式（croner 真调度）', () => {
  it('daily 调度解析出未来时间戳', () => {
    const task = scheduledTaskDao.createScheduledTask({
      tenant_id: TENANT,
      agent_id: 'agent-test-3',
      title: '每天九点',
      prompt: 'hi',
      schedule_type: 'daily',
      schedule: { time: '09:00' },
      status: 'active',
    });
    const next = svc.computeNextRunAt(task);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('weekly 调度（周一三五）解析出未来时间戳', () => {
    const task = scheduledTaskDao.createScheduledTask({
      tenant_id: TENANT,
      agent_id: 'agent-test-4',
      title: '每周',
      prompt: 'hi',
      schedule_type: 'weekly',
      schedule: { time: '10:30', weekdays: [0, 2, 4] },
      status: 'active',
    });
    const next = svc.computeNextRunAt(task);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('registerTask / unregisterTask 对 active 任务不抛错（调度器注册链路）', () => {
    const task = scheduledTaskDao.createScheduledTask({
      tenant_id: TENANT,
      agent_id: 'agent-test-5',
      title: '调度任务',
      prompt: 'hi',
      schedule_type: 'daily',
      schedule: { time: '08:00' },
      status: 'active',
    });
    expect(() => svc.registerTask(task)).not.toThrow();
    expect(() => svc.unregisterTask(task.id)).not.toThrow();
  });
});
