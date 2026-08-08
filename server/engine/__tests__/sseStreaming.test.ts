/**
 * SSE 流式测试
 *
 * 覆盖 SSE 事件格式化、发送机制、错误事件路由、流关闭和 TimerManager 行为。
 *
 * 关键安全要求：错误事件必须通过 sendSSE（而非 sendDebugSSE）发送，
 * 否则前端卡在"思考中"状态无法恢复。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===================== Mock 模块 =====================

// Express Response mock
function createMockResponse(): any {
  const mock = {
    writableEnded: false,
    write: vi.fn(),
    end: vi.fn(),
    getHeader: vi.fn().mockReturnValue('text/event-stream'),
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    on: vi.fn(),
  };
  return mock;
}

// ===================== Test 1: sendSSE / sendDebugSSE 路由 =====================

describe('SSE 事件发送 (sendSSE / sendDebugSSE)', () => {
  let mockRes: ReturnType<typeof createMockResponse>;

  beforeEach(() => {
    mockRes = createMockResponse();
  });

  it('sendSSE 正确格式化并发送事件', async () => {
    const { sendSSE } = await import('../../sse/sseTypes.js');

    sendSSE(mockRes, { type: 'text', content: '你好' });

    expect(mockRes.write).toHaveBeenCalledTimes(1);
    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('data: ');
    expect(written).toContain('"type":"text"');
    expect(written).toContain('"content":"你好"');
    expect(written).toMatch(/data: .*\n\n$/);
  });

  it('sendSSE 在 response 已结束时静默跳过 (writableEnded=true)', async () => {
    const { sendSSE } = await import('../../sse/sseTypes.js');

    mockRes.writableEnded = true;
    sendSSE(mockRes, { type: 'text', content: '测试' });

    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('sendSSE 在 write 抛出异常时静默忽略', async () => {
    const { sendSSE } = await import('../../sse/sseTypes.js');

    mockRes.write.mockImplementation(() => {
      throw new Error('Connection lost');
    });

    // 不应抛出异常
    expect(() => sendSSE(mockRes, { type: 'text', content: '测试' })).not.toThrow();
  });

  it('sendDebugSSE 仅在 LOG_DEBUG=1 时发送事件', async () => {
    const { sendDebugSSE } = await import('../../sse/sseTypes.js');

    // LOG_DEBUG 未设置时静默跳过
    sendDebugSSE(mockRes, { type: 'react_phase', phase: 'thinking' });
    expect(mockRes.write).not.toHaveBeenCalled();

    // 设置 LOG_DEBUG=1 后再试
    process.env.LOG_DEBUG = '1';
    const { sendDebugSSE: sendDebugSSE2 } = await import('../../sse/sseTypes.js');
    sendDebugSSE2(mockRes, { type: 'react_phase', phase: 'thinking' });
    expect(mockRes.write).toHaveBeenCalledTimes(1);

    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('_channel":"debug"');
  });
});

// ===================== Test 2: 错误必须通过 sendSSE 发送 =====================

describe('错误事件路由 (error → sendSSE, 非 sendDebugSSE)', () => {
  let mockRes: ReturnType<typeof createMockResponse>;

  beforeEach(() => {
    mockRes = createMockResponse();
  });

  it('ERROR 类型事件通过 sendSSE 发送（核心安全要求）', async () => {
    const { sendSSE } = await import('../../sse/sseTypes.js');

    // 错误事件必须通过 sendSSE 发送
    sendSSE(mockRes, {
      type: 'error',
      code: 'SERVER_ERROR',
      message: 'Internal server error',
    });

    expect(mockRes.write).toHaveBeenCalledTimes(1);
    const written = mockRes.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.replace(/^data: /, '').replace(/\n\n$/, ''));
    expect(parsed.type).toBe('error');
    expect(parsed.code).toBe('SERVER_ERROR');
    expect(parsed.message).toBe('Internal server error');
  });

  it('错误事件不通过 sendDebugSSE 发送（sendDebugSSE 可能被 LOG_DEBUG 过滤）', async () => {
    // 确保 LOG_DEBUG 未设置
    delete process.env.LOG_DEBUG;

    const { sendDebugSSE } = await import('../../sse/sseTypes.js');

    // 即使 LOG_DEBUG 未设置，sendDebugSSE 也应能处理（但当前静默跳过）
    sendDebugSSE(mockRes, {
      type: 'error',
      code: 'AUTH_FAILED',
      message: 'Authentication failed',
    });

    // 这证明了为什么错误不能通过 sendDebugSSE — LOG_DEBUG 未开启时前端收不到
    expect(mockRes.write).not.toHaveBeenCalled();
  });

  it('init 事件通过 sendSSE 正确发送', async () => {
    const { sendSSE } = await import('../../sse/sseTypes.js');

    sendSSE(mockRes, {
      type: 'init',
      sessionId: 'session-123',
      assistantMessageId: 'msg-456',
      model: 'gpt-4',
      modelName: 'GPT-4',
    });

    expect(mockRes.write).toHaveBeenCalledTimes(1);
    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('"type":"init"');
    expect(written).toContain('"sessionId":"session-123"');
  });
});

// ===================== Test 3: sendDoneAndEnd 关闭流 =====================

describe('sendDoneAndEnd 流关闭', () => {
  let mockRes: ReturnType<typeof createMockResponse>;

  beforeEach(() => {
    mockRes = createMockResponse();
  });

  it('sendDoneAndEnd 发送 done 事件后关闭流', async () => {
    const { sendDoneAndEnd } = await import('../../sse/sseTypes.js');

    await sendDoneAndEnd(mockRes, {
      errorCode: null,
      errorMessage: null,
      thinkingDuration: 1500,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    // 验证 done 事件已写入
    expect(mockRes.write).toHaveBeenCalled();
    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('"type":"done"');

    // 验证 res.end() 被调用
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('sendDoneAndEnd 携带错误信息正确编码', async () => {
    const { sendDoneAndEnd } = await import('../../sse/sseTypes.js');

    await sendDoneAndEnd(mockRes, {
      errorCode: 'RATE_LIMITED',
      errorMessage: 'Too many requests',
    });

    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('"errorCode":"RATE_LIMITED"');
    expect(written).toContain('"errorMessage":"Too many requests"');

    expect(mockRes.end).toHaveBeenCalled();
  });

  it('sendDoneAndEnd 在 res.end() 抛出异常时不传播', async () => {
    const { sendDoneAndEnd } = await import('../../sse/sseTypes.js');

    mockRes.end.mockImplementation(() => {
      throw new Error('Stream already closed');
    });

    // 不应抛出异常
    await expect(sendDoneAndEnd(mockRes)).resolves.not.toThrow();
  });
});

// ===================== Test 4: TimerManager 行为 =====================

describe('TimerManager 定时器管理器', () => {
  // TimerManager 是单例，使用 fake timers 隔离测试
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('register 注册定时器后 count 增加', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    // 使用新的 unique name 确保不与之前的测试冲突
    const timerName = `test-timer-${Date.now()}`;
    const handle = TimerManager.register({
      name: timerName,
      intervalMs: 10000,
      callback: () => {},
    });

    expect(handle).not.toBeNull();
    expect(TimerManager.count).toBeGreaterThanOrEqual(1);

    // 清理
    clearInterval(handle!);
    TimerManager.unregister(timerName);
  });

  it('重复注册同名定时器返回已有 handle', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const timerName = `unique-timer-${Date.now()}`;
    const first = TimerManager.register({
      name: timerName,
      intervalMs: 10000,
      callback: () => {},
    });

    const second = TimerManager.register({
      name: timerName,
      intervalMs: 5000,
      callback: () => {},
    });

    expect(second).toBe(first);

    // 清理
    clearInterval(first!);
    TimerManager.unregister(timerName);
  });

  it('unregister 取消定时器后 count 减少', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const timerName = `temp-timer-${Date.now()}`;
    const handle = TimerManager.register({
      name: timerName,
      intervalMs: 10000,
      callback: () => {},
    });
    expect(handle).not.toBeNull();

    const result = TimerManager.unregister(timerName);
    expect(result).toBe(true);
  });

  it('unregister 不存在的定时器返回 false', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const result = TimerManager.unregister('nonexistent-timer-xyz');
    expect(result).toBe(false);
  });

  it('enabled=false 时不注册定时器', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const handle = TimerManager.register({
      name: `disabled-timer-${Date.now()}`,
      intervalMs: 10000,
      callback: () => {},
      enabled: false,
    });

    expect(handle).toBeNull();
  });

  it('getStatus 返回定时器状态', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const timerName = `status-timer-${Date.now()}`;
    const handle = TimerManager.register({
      name: timerName,
      intervalMs: 10000,
      callback: () => {},
    });

    expect(handle).not.toBeNull();
    const status = TimerManager.getStatus();
    const found = status.find((s) => s.name === timerName);
    expect(found).toBeDefined();
    expect(found!.intervalMs).toBe(10000);
    expect(found!.lastFiredAt).toBeNull();

    // 清理
    clearInterval(handle!);
    TimerManager.unregister(timerName);
  });

  // 注意：以下 clearAll 测试必须放在最后，
  // 因为 clearAll 会将 TimerManager 单例设置为 isShuttingDown=true，
  // 导致后续的 register() 调用被拒绝。
  it('clearAll 清除所有定时器', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const t1 = `t1-${Date.now()}`;
    const t2 = `t2-${Date.now()}`;

    TimerManager.register({ name: t1, intervalMs: 10000, callback: () => {} });
    TimerManager.register({ name: t2, intervalMs: 20000, callback: () => {} });

    const beforeCount = TimerManager.count;
    expect(beforeCount).toBeGreaterThanOrEqual(2);

    const cleared = TimerManager.clearAll();
    expect(cleared).toBeGreaterThanOrEqual(2);
    expect(TimerManager.count).toBe(0);
  });

  it('clearAll 后 register 拒绝新注册（shuttingDown）', async () => {
    const { TimerManager } = await import('../../core/timerManager.js');

    const t1 = `sd-test-${Date.now()}`;
    TimerManager.register({ name: t1, intervalMs: 10000, callback: () => {} });
    TimerManager.clearAll();

    // clearAll 后 isShuttingDown=true，新注册应被拒绝
    const handle = TimerManager.register({
      name: `after-shutdown-${Date.now()}`,
      intervalMs: 5000,
      callback: () => {},
    });

    expect(handle).toBeNull();
  });
});
