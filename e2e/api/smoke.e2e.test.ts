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
import net from 'node:net';

let SERVER_PORT = '';
let BASE_URL = '';

/** 探测一个当前未被占用的高端口，避免与并行/陈旧 server 进程在固定端口冲突（CI 假红根因） */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('failed to resolve free port'))));
    });
  });
}

async function waitForServer(timeoutMs = 60000): Promise<void> {
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
    // 每次运行选用空闲端口，彻底消除固定端口(13099)与并行/陈旧进程冲突导致的 CI 假红
    SERVER_PORT = String(await getFreePort());
    BASE_URL = `http://localhost:${SERVER_PORT}`;
    serverProcess = spawn('npm', ['run', 'server', '--', `--port=${SERVER_PORT}`], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: SERVER_PORT, NODE_ENV: 'test' },
      stdio: 'pipe',
    });

    serverProcess.stdout?.on('data', () => {});
    serverProcess.stderr?.on('data', () => {});

    // 环境冷启动较重（DB 完整性校验 + SkillWatcher + 配置引导），满载下可能 >30s，
    // 放宽到 60s 避免被 vitest 全量套件并发拖慢导致的假红。
    await waitForServer(60000);
  }, 90000);

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
