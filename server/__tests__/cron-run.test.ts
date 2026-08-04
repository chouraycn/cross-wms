/**
 * P1-③: /api/cron/:id/run 端点单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock cron store
const mockJobs = new Map<string, unknown>();

vi.mock('../engine/cron/store.js', () => ({
  getDefaultCronStore: () => ({
    load: async () => ({
      store: {
        version: 1 as const,
        jobs: Array.from(mockJobs.values()) as any[],
      },
      quarantineJobs: [],
      invalidConfigRows: [],
    }),
    save: async (store: any) => {
      mockJobs.clear();
      for (const job of store.jobs) {
        mockJobs.set(job.id, job);
      }
    },
    getStorePath: () => '/mock/path',
    getQuarantinePath: () => '/mock/quarantine',
    loadQuarantine: async () => ({ version: 1, jobs: [] }),
    saveQuarantine: async () => {},
  }),
  JsonCronJobStore: class {},
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('POST /api/cron/:id/run', () => {
  let app: express.Application;

  beforeEach(async () => {
    mockJobs.clear();

    // Create a test job
    mockJobs.set('test-job-1', {
      id: 'test-job-1',
      name: 'Test Job',
      enabled: true,
      agentId: undefined,
      sessionKey: undefined,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: { kind: 'cron', expr: '0 * * * *' },
      sessionTarget: 'main',
      wakeMode: 'next-heartbeat',
      payload: { kind: 'systemEvent', text: 'test event' },
      state: {
        nextRunAtMs: Date.now() + 3600000,
        consecutiveErrors: 0,
      },
    });

    // Import after mocks are set up
    const router = (await import('../routes/cron.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/cron', router);
  });

  it('should return 404 for non-existent job', async () => {
    const res = await request(app)
      .post('/api/cron/non-existent/run');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for disabled job', async () => {
    // Replace with disabled job
    mockJobs.set('test-job-1', {
      ...mockJobs.get('test-job-1') as any,
      enabled: false,
    });

    const res = await request(app)
      .post('/api/cron/test-job-1/run');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('disabled');
  });

  it('should execute systemEvent payload and return success', async () => {
    const res = await request(app)
      .post('/api/cron/test-job-1/run');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.jobId).toBe('test-job-1');
    expect(res.body.data.result.ok).toBe(true);
    expect(res.body.data.result.message).toContain('systemEvent');
  });

  it('should execute agentTurn payload', async () => {
    mockJobs.set('test-agent-job', {
      id: 'test-agent-job',
      name: 'Agent Turn Job',
      enabled: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: { kind: 'cron', expr: '0 2 * * *' },
      sessionTarget: 'main',
      wakeMode: 'now',
      payload: { kind: 'agentTurn', message: 'hello world' },
      state: {},
    });

    const res = await request(app)
      .post('/api/cron/test-agent-job/run');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.result.ok).toBe(true);
    expect(res.body.data.result.message).toContain('agentTurn');
  });
});
