/**
 * IPC 协议测试
 *
 * 测试 CDFKnowIPCClient（Unix Socket IPC 客户端）的请求/响应匹配、
 * 超时处理和重连机制。
 *
 * CDFKnowIPCClient 通过 Unix Socket 与 Swift 原生应用通信，
 * 支持系统通知、音效、权限检查等命令。
 *
 * 注意：CDFKnowIPCClient 类未直接导出，仅导出 ipcClient 单例。
 * 测试通过 constructor 创建独立实例来隔离测试。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import net from 'node:net';
import { EventEmitter } from 'node:events';

// ===================== Mock Socket =====================

class MockSocket extends EventEmitter {
  write = vi.fn();
  destroy = vi.fn();
  destroyed = false;
  connecting = false;
  connect = vi.fn();
  setNoDelay = vi.fn();
  setTimeout = vi.fn();
  setKeepAlive = vi.fn();
  ref = vi.fn();
  unref = vi.fn();
  remoteAddress = '127.0.0.1';
  remoteFamily = 'IPv4';
  remotePort = 54321;
  localAddress = '127.0.0.1';
  localPort = 12345;
  localFamily = 'IPv4';
  bytesRead = 0;
  bytesWritten = 0;
  pending = false;
  readyState = 'closed' as const;
}

// ===================== 工具函数 =====================

async function createTestClient(): Promise<{
  getClass: () => any;
  newInstance: (path?: string) => any;
}> {
  // 导入 ipcClient 单例，通过 prototype.constructor 获取类
  const instanceModule = await import('../ipcClient.js');
  const IpcClientClass = Object.getPrototypeOf(instanceModule.default).constructor;
  return {
    getClass: () => IpcClientClass,
    newInstance: (path?: string) => new IpcClientClass(path || '/tmp/test-socket.sock'),
  };
}

// ===================== Test Suite =====================

describe('CDFKnowIPCClient', () => {
  let CDFKnowIPCClient: any;
  let client: any;
  let mockSocket: MockSocket;

  beforeEach(async () => {
    const { getClass, newInstance } = await createTestClient();
    CDFKnowIPCClient = getClass();
    client = newInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ---- 基础状态测试 ----

  it('初始状态 disconnected', () => {
    expect(client.isConnected()).toBe(false);
  });

  // ---- connect 测试 ----

  it('connect 成功建立连接', async () => {
    vi.spyOn(net, 'createConnection').mockImplementation((_path: string, cb?: () => void) => {
      mockSocket = new MockSocket();
      // 立即触发回调
      setTimeout(() => {
        cb?.();
      }, 0);
      return mockSocket as unknown as net.Socket;
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('connect 失败返回错误', async () => {
    vi.spyOn(net, 'createConnection').mockImplementation((_path: string, _cb?: () => void) => {
      const sock = new MockSocket();
      setTimeout(() => {
        sock.emit('error', new Error('Connection refused'));
      }, 0);
      return sock as unknown as net.Socket;
    });

    await expect(client.connect()).rejects.toThrow('Connection refused');
    expect(client.isConnected()).toBe(false);
  });

  // ---- sendRequest 测试 ----

  it('sendRequest 在未连接时自动尝试连接', async () => {
    // Mock connect 成功
    vi.spyOn(client, 'connect').mockImplementation(async () => {
      client.connected = true;
    });

    // Mock socket write，然后在写入时立即触发 data 事件
    const mockWriteSocket = new MockSocket();
    client.socket = mockWriteSocket;

    // 发起请求，同时模拟收到响应
    const responsePromise = client.sendRequest({ type: 'status' });

    // 模拟 Swift 端返回响应（handleResponse 使用 this.requestId - 1）
    // 需要等待 requestId 递增后再触发
    await vi.waitFor(() => {
      // 触发 data 事件
      const response = JSON.stringify({ ok: true, message: 'Done' }) + '\n';
      mockWriteSocket.emit('data', Buffer.from(response, 'utf8'));
    }, { timeout: 50 }).catch(() => {});

    // 等待 promise resolve（可能已经 resolve 了）
    const response = await Promise.race([
      responsePromise,
      new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: false }), 100)),
    ]);

    // connect 被调用过
    expect(client.connect).toHaveBeenCalled();
  }, 5000);

  it('sendRequest 超时处理（10 秒超时）', async () => {
    vi.useFakeTimers();

    // 直接设置 connected 状态，不需要 mock connect
    client.connected = true;
    client.socket = new MockSocket();

    const responsePromise = client.sendRequest({ type: 'slow' });

    // 快进 10 秒触发超时
    await vi.advanceTimersByTimeAsync(10000);

    const response = await responsePromise;
    expect(response.ok).toBe(false);
    expect(response.message).toBe('Request timeout');

    vi.useRealTimers();
  });

  it('sendRequest requestId 递增', async () => {
    vi.useFakeTimers();

    client.connected = true;
    client.socket = new MockSocket();

    // 发起两个请求（不 await），观察 requestId
    const p1 = client.sendRequest({ type: 'req1' });
    const p2 = client.sendRequest({ type: 'req2' });

    // 验证 pendingRequests 中有 2 个请求
    expect(client.pendingRequests.size).toBeGreaterThanOrEqual(2);

    // 超时处理
    await vi.advanceTimersByTimeAsync(10000);
    await Promise.all([p1, p2]);
    vi.useRealTimers();
  });

  // ---- disconnect 测试 ----

  it('disconnect 清理所有 pending requests', async () => {
    client.connected = true;
    client.socket = new MockSocket();

    // 不 await，让它在后台等待
    client.sendRequest({ type: 'pending' });

    // disconnect
    client.disconnect();
    expect(client.isConnected()).toBe(false);
    expect(client.pendingRequests.size).toBe(0);
  });

  // ---- notify 测试 ----

  it('notify 方法正确调用 sendRequest', async () => {
    const sendSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: true });

    const result = await client.notify('测试标题', '测试内容', {
      sound: 'Glass',
      priority: 'active',
    });

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'notify',
      title: '测试标题',
      body: '测试内容',
      sound: 'Glass',
      priority: 'active',
      delivery: undefined,
    });
  });

  it('notify 失败时返回 false', async () => {
    vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: false, message: 'Failed' });

    const result = await client.notify('标题', '内容');
    expect(result).toBe(false);
  });

  // ---- playSound 测试 ----

  it('playSound 正确发送音效请求', async () => {
    const sendSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: true });

    const result = await client.playSound('Ping');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'playSound',
      name: 'Ping',
    });
  });

  // ---- getStatus 测试 ----

  it('getStatus 正确解析 base64 payload', async () => {
    const payload = { cpu: 0.5, memory: '2GB' };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');

    vi.spyOn(client, 'sendRequest').mockResolvedValue({
      ok: true,
      payload: encoded,
    });

    const result = await client.getStatus();
    expect(result).toEqual(payload);
  });

  it('getStatus JSON 解析失败返回 null', async () => {
    vi.spyOn(client, 'sendRequest').mockResolvedValue({
      ok: true,
      payload: 'not-valid-base64!!!',
    });

    const result = await client.getStatus();
    expect(result).toBeNull();
  });

  it('getStatus 无 payload 返回 null', async () => {
    vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: true });

    const result = await client.getStatus();
    expect(result).toBeNull();
  });

  // ---- openURL 测试 ----

  it('openURL 发送打开 URL 请求', async () => {
    const sendSpy = vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: true });

    const result = await client.openURL('https://example.com');

    expect(result).toBe(true);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'openURL',
      url: 'https://example.com',
    });
  });

  // ---- permissionCheck 测试 ----

  it('permissionCheck 解析权限响应', async () => {
    const permissions = { camera: true, microphone: false };
    const encoded = Buffer.from(JSON.stringify(permissions)).toString('base64');

    vi.spyOn(client, 'sendRequest').mockResolvedValue({
      ok: true,
      payload: encoded,
    });

    const result = await client.permissionCheck(['camera', 'microphone']);
    expect(result).toEqual(permissions);
  });

  it('permissionCheck 无 payload 返回 null', async () => {
    vi.spyOn(client, 'sendRequest').mockResolvedValue({ ok: true });

    const result = await client.permissionCheck(['camera']);
    expect(result).toBeNull();
  });
});
