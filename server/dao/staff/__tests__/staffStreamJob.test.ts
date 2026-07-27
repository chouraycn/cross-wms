/**
 * 流式任务持久化单测（IS_PASS）。
 * 内存 SQLite + mock db.js，验证任务元数据落库、状态翻转持久化、以及启动 hydrate 重建内存态。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

const mockDb = new Database(':memory:');

vi.mock('../../../db.js', () => ({
  initDb: vi.fn(() => mockDb),
}));

import { initStaffTables } from '../../../db-staff.js';
import * as sjDao from '../staffStreamJobDao.js';
import * as streamJobs from '../../../staff/streamJobs.js';

beforeEach(() => {
  mockDb.exec('DROP TABLE IF EXISTS sd_stream_jobs');
  initStaffTables(mockDb);
});

describe('staffStreamJobDao 持久化', () => {
  it('createJob 写入 queued 元数据并可读', () => {
    const id = streamJobs.createJob('distill', { prompt: 'hi' });
    const row = sjDao.getStreamJobRow(id);
    expect(row).toBeDefined();
    expect(row!.kind).toBe('distill');
    expect(row!.status).toBe('queued');
    expect(row!.tenant_id).toBe('default');
  });

  it('append 翻转 queued→running 并持久化', () => {
    const id = streamJobs.createJob('distill');
    streamJobs.append(id, 'delta', { text: 'a' });
    const row = sjDao.getStreamJobRow(id)!;
    expect(row.status).toBe('running');
  });

  it('complete 落库终态 + finished_at', () => {
    const id = streamJobs.createJob('distill');
    streamJobs.append(id, 'delta', { text: 'a' });
    streamJobs.complete(id);
    const row = sjDao.getStreamJobRow(id)!;
    expect(row.status).toBe('completed');
    expect(row.finished_at).not.toBeNull();
  });

  it('fail 落库 failed + error', () => {
    const id = streamJobs.createJob('distill');
    streamJobs.fail(id, 'boom');
    const row = sjDao.getStreamJobRow(id)!;
    expect(row.status).toBe('failed');
    expect(row.error).toBe('boom');
  });

  it('cancel 落库 cancelled', () => {
    const id = streamJobs.createJob('distill');
    const ok = streamJobs.cancel(id);
    expect(ok).toBe(true);
    expect(sjDao.getStreamJobRow(id)!.status).toBe('cancelled');
  });

  it('listStreamJobRows 按时间倒序返回', () => {
    const a = streamJobs.createJob('distill');
    const b = streamJobs.createJob('rewrite');
    streamJobs.complete(a);
    streamJobs.complete(b);
    const list = sjDao.listStreamJobRows('default', 10);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].created_at).toBeGreaterThanOrEqual(list[list.length - 1].created_at);
  });
});

describe('hydrateStreamJobs 启动重建', () => {
  it('从 DB 重建内存态，并把 in-flight 任务标记为 interrupted', () => {
    // 直接落库两条：一条已终态、一条 in-flight
    sjDao.upsertStreamJob({
      job_id: 'done-1',
      kind: 'distill',
      status: 'completed',
      created_at: 1000,
      finished_at: 1100,
      updated_at: 1100,
    });
    sjDao.upsertStreamJob({
      job_id: 'inflight-1',
      kind: 'rewrite',
      status: 'running',
      created_at: 2000,
      updated_at: 2000,
    });

    streamJobs.hydrateStreamJobs();

    const done = streamJobs.getJob('done-1');
    expect(done).not.toBeNull();
    expect(done!.status).toBe('completed');

    const inflight = streamJobs.getJob('inflight-1');
    expect(inflight).not.toBeNull();
    expect(inflight!.status).toBe('failed'); // 标记为 interrupted
    expect(inflight!.error).toBe('interrupted by server restart');

    // DB 行也已被更新
    expect(sjDao.getStreamJobRow('inflight-1')!.status).toBe('failed');
  });
});
