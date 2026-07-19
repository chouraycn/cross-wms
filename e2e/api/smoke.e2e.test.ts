/**
 * 服务启动烟雾测试
 *
 * 通过真实启动 npm run server 子进程，验证：
 *   1. 服务能正常启动（不崩溃）
 *   2. host-env-security-policy.json 路径解析正确（曾出现的 ENOENT 错误）
 *   3. 健康检查接口可访问
 *   4. agents 接口能正常响应（验证 plugin-sdk 链路）
 *
 * 注意：本测试会启动真实服务进程，耗时较长，已设置 60s 超时。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';

const SERVER_PORT = process.env.E2E_SMOKE_PORT || '13099';
const BASE_URL = `http://localhost:${SERVER_PORT}`;

async function waitForServer(timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err as Error;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`服务在 ${timeoutMs}ms 内未启动: ${lastError?.message}`);
}

describe('服务启动烟雾测试', () => {
  let serverProcess: ChildProcess | null = null;

  beforeAll(async () => {
    serverProcess = spawn('npm', ['run', 'server', '--', `--port=${SERVER_PORT}`], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: SERVER_PORT, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', () => {});
    serverProcess.stderr?.on('data', () => {});

    await waitForServer(30000);
  }, 60000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  });

  it('GET /api/health 应返回 ok（验证 host-env-security-policy 路径修复）', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/v1/agents 应正常响应（验证 plugin-sdk 链路）', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/agents`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });
});
