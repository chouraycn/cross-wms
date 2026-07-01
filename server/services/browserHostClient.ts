/**
 * BrowserHostClient — Node 主进程端的 BrowserHost IPC 客户端
 *
 * v3.0: 通过 Unix Socket / Named Pipe 与 BrowserHost 独立进程通信。
 * 提供与 browserTools.ts 和 routes/browser.ts 共享的接口。
 *
 * 协议: JSON over newline-delimited stream
 *   Request:  { id, type, args }
 *   Response: { id, ok, output } | { id, ok: false, error }
 */

import { createConnection } from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ChildProcess, spawn, execSync } from 'child_process';
import { logger } from '../logger.js';

// ===================== 配置 =====================

const SOCKET_PATH = os.platform() === 'win32'
  ? '\\\\.\\pipe\\browser-host'
  : path.join(os.tmpdir(), 'cdf-know-clow-browser-host.sock');

/** IPC 请求超时（毫秒） */
const IPC_TIMEOUT = 30_000;

/** BrowserHost 进程重启参数 */
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BASE_DELAY = 1000; // 1s, 2s, 4s

// ===================== 类型定义 =====================

export interface BrowserHostResponse {
  id: string;
  ok: boolean;
  output?: any;
  error?: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  elements: Array<{
    ref: string;
    role: string;
    name: string;
    value?: string;
    disabled?: boolean;
    checked?: boolean;
    href?: string;
  }>;
  truncated: boolean;
  timestamp: number;
}

export interface BrowserHostHealth {
  status: 'running' | 'stopped' | 'unavailable';
  hasPage: boolean;
  url: string | null;
  pid: number | null;
}

// ===================== 状态 =====================

/** BrowserHost 子进程引用 */
let hostProcess: ChildProcess | null = null;

/** IPC Socket 连接 */
let ipcSocket: ReturnType<typeof createConnection> | null = null;

/** 待处理的请求 (id → { resolve, reject, timer }) */
const pendingRequests = new Map<string, {
  resolve: (response: BrowserHostResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

/** IPC 数据缓冲区 */
let ipcBuffer = '';

/** 重启计数 */
let restartAttempts = 0;

/** 是否正在关闭 */
let isShuttingDown = false;

/** 启动 Promise（防止并发启动） */
let startPromise: Promise<{ ok: boolean; error?: string }> | null = null;

// ===================== 日志 =====================

function log(msg: string) {
  logger.info(`[BrowserHostClient] ${msg}`);
}

function error(msg: string) {
  logger.error(`[BrowserHostClient] ${msg}`);
}

// ===================== 残留进程清理 =====================

/** BrowserHost 脚本文件名（用于 pgrep 匹配） */
const HOST_SCRIPT_NAME = 'browser-host.mjs';

/**
 * 杀残留的 BrowserHost 进程
 * 在启动新进程前调用，防止多个 BrowserHost 实例同时运行占用内存
 */
async function killStaleBrowserHost(): Promise<void> {
  try {
    const output = execSync(
      `pgrep -f "${HOST_SCRIPT_NAME}" | grep -v ${process.pid}`,
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (output) {
      const pids = output.split('\n').filter(Boolean);
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGTERM');
          log(`杀残留进程: PID=${pid}`);
        } catch { /* 进程可能已退出 */ }
      }
      // 等待进程退出
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch {
    // pgrep 无匹配时返回非零退出码，忽略
  }
}

// ===================== 进程退出清理 =====================

/**
 * 同步强制杀掉 BrowserHost 子进程（用于 process.on('exit')）
 * process.on('exit') 回调中不能执行异步操作，因此使用同步方式
 */
function forceKillBrowserHost(): void {
  if (hostProcess && !hostProcess.killed) {
    try { hostProcess.kill('SIGKILL'); } catch { /* 忽略 */ }
  }
  // 清理 socket 文件
  if (os.platform() !== 'win32') {
    try { fs.unlinkSync(SOCKET_PATH); } catch { /* 忽略 */ }
  }
}

// 注册退出清理 — 确保子进程不会成为孤儿进程
process.on('exit', forceKillBrowserHost);

// ===================== IPC 通信 =====================

/**
 * 连接到 BrowserHost 的 IPC Socket
 */
function connectIpc(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ipcSocket && !ipcSocket.destroyed) {
      resolve();
      return;
    }

    const socket = createConnection(SOCKET_PATH, () => {
      log('IPC connected');
      ipcSocket = socket;
      ipcBuffer = '';
      resolve();
    });

    socket.on('data', (data) => {
      ipcBuffer += data.toString();
      const lines = ipcBuffer.split('\n');
      ipcBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response: BrowserHostResponse = JSON.parse(line);
          const pending = pendingRequests.get(response.id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        } catch (err) {
          error(`Failed to parse IPC response: ${line}`);
        }
      }
    });

    socket.on('error', (err) => {
      error(`IPC socket error: ${err.message}`);
      ipcSocket = null;
      reject(err);
    });

    socket.on('end', () => {
      log('IPC socket disconnected');
      ipcSocket = null;
    });
  });
}

/**
 * 发送 IPC 命令并等待响应
 */
export async function sendCommand(type: string, args: Record<string, unknown> = {}): Promise<BrowserHostResponse> {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 尝试连接 IPC
  try {
    await connectIpc();
  } catch (err) {
    // IPC 连接失败，尝试通过 ensureBrowserHost 启动 BrowserHost 进程
    const startResult = await ensureBrowserHost();
    if (!startResult.ok) {
      return {
        id,
        ok: false,
        error: `BrowserHost unavailable: ${startResult.error}`,
      };
    }
    // 重试连接
    try {
      await connectIpc();
    } catch (retryErr) {
      return {
        id,
        ok: false,
        error: `IPC connection failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
      };
    }
  }

  if (!ipcSocket || ipcSocket.destroyed) {
    return { id, ok: false, error: 'IPC socket not available' };
  }

  const sock = ipcSocket; // local reference for type narrowing inside Promise
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`IPC request timeout: ${type}`));
    }, IPC_TIMEOUT);

    pendingRequests.set(id, { resolve, reject, timer });

    const msg = JSON.stringify({ id, type, args }) + '\n';
    sock.write(msg, (err) => {
      if (err) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(new Error(`IPC write failed: ${err.message}`));
      }
    });
  });
}

// ===================== BrowserHost 进程管理 =====================

/**
 * 启动 BrowserHost 子进程
 */
export async function startBrowserHost(): Promise<{ ok: boolean; error?: string }> {
  if (hostProcess && !hostProcess.killed) {
    log('BrowserHost already running');
    return { ok: true };
  }

  // 启动前先杀残留进程，防止多个 BrowserHost 实例同时运行
  await killStaleBrowserHost();

  // 打包环境无 import.meta.url，用 process.cwd() 兜底查找 scripts 目录
  const scriptPath = path.resolve(process.cwd(), 'scripts/browser-host.mjs');

  if (!fs.existsSync(scriptPath)) {
    error(`BrowserHost script not found: ${scriptPath}`);
    return { ok: false, error: `Script not found: ${scriptPath}` };
  }

  log(`Starting BrowserHost process: ${scriptPath}`);

  try {
    hostProcess = spawn(process.execPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_OPTIONS: '',
      },
      detached: false,
    });

    hostProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        log(`[Host] ${line}`);
      }
    });

    hostProcess.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        error(`[Host] ${line}`);
      }
    });

    hostProcess.on('exit', (code, signal) => {
      log(`BrowserHost process exited (code=${code}, signal=${signal})`);
      hostProcess = null;
      ipcSocket = null;

      // 自动重启（非用户主动关闭时）
      if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
        const delay = RESTART_BASE_DELAY * Math.pow(2, restartAttempts);
        restartAttempts++;
        log(`Restarting BrowserHost in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
        setTimeout(() => {
          startBrowserHost().catch(err => {
            error(`Restart failed: ${err.message}`);
          });
        }, delay);
      }
    });

    // 等待进程就绪（简单等待 IPC socket 文件出现）
    const ready = await waitForIpcSocket(10_000);
    if (!ready) {
      return { ok: false, error: 'BrowserHost IPC socket did not appear within 10s' };
    }

    restartAttempts = 0; // 重置重启计数
    return { ok: true };
  } catch (err) {
    error(`Failed to start BrowserHost: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 确保 BrowserHost 进程在运行（延迟启动）
 * 首次需要时才启动，避免服务启动时占用资源
 * 使用 startPromise 防止并发启动
 */
export async function ensureBrowserHost(): Promise<{ ok: boolean; error?: string }> {
  if (hostProcess && !hostProcess.killed) {
    return { ok: true };
  }
  if (!startPromise) {
    startPromise = startBrowserHost();
  }
  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

/**
 * 等待 IPC Socket 文件出现
 */
function waitForIpcSocket(timeoutMs: number): Promise<boolean> {
  if (os.platform() === 'win32') {
    // Windows named pipe 不需要等文件，短暂延迟即可
    return new Promise(resolve => setTimeout(() => resolve(true), 500));
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(SOCKET_PATH)) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

/**
 * 停止 BrowserHost 子进程
 */
export async function stopBrowserHost(): Promise<void> {
  isShuttingDown = true;
  log('Stopping BrowserHost...');

  if (ipcSocket && !ipcSocket.destroyed) {
    ipcSocket.destroy();
    ipcSocket = null;
  }

  if (hostProcess && !hostProcess.killed) {
    // 先尝试优雅关闭（IPC shutdown 消息）
    try {
      hostProcess.send({ type: 'shutdown' });
    } catch {
      // IPC 不可用，直接 SIGTERM
      try { hostProcess.kill('SIGTERM'); } catch { /* 忽略 */ }
    }

    // 等待进程退出，最多 3 秒后 SIGKILL
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (hostProcess && !hostProcess.killed) {
          hostProcess.kill('SIGKILL');
          log('BrowserHost 未在 3s 内退出，已 SIGKILL');
        }
        resolve();
      }, 3000);

      hostProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  hostProcess = null;

  // 清理 socket 文件
  if (os.platform() !== 'win32' && fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {
      // 忽略
    }
  }
}

/**
 * 获取 BrowserHost 健康状态
 */
export async function getBrowserHostHealth(): Promise<BrowserHostHealth> {
  try {
    const response = await sendCommand('browser_health');
    if (response.ok && response.output) {
      return response.output as BrowserHostHealth;
    }
    return {
      status: 'stopped',
      hasPage: false,
      url: null,
      pid: null,
    };
  } catch {
    return {
      status: 'unavailable',
      hasPage: false,
      url: null,
      pid: null,
    };
  }
}

// ===================== JS 渲染（供 webTools 使用） =====================

/** renderContent 返回类型 */
export interface RenderContentResult {
  ok: boolean;
  html?: string;
  title?: string;
  url?: string;
  status?: number | null;
  error?: string;
}

/**
 * 使用 Playwright 渲染页面并返回渲染后的 HTML
 * — 供 web_fetch / web_search / web_api_call 的 renderJs 模式使用
 * — 使用独立临时页面，不影响当前活跃页面
 * v1.5.131: 支持 executeJs 参数
 */
export async function renderContent(options: {
  url: string;
  waitUntil?: 'domcontentloaded' | 'networkidle' | 'load';
  selector?: string;
  timeout?: number;
  executeJs?: string;
}): Promise<RenderContentResult> {
  const response = await sendCommand('browser_render_content', {
    url: options.url,
    waitUntil: options.waitUntil || 'networkidle',
    selector: options.selector,
    timeout: options.timeout || 15000,
    ...(options.executeJs ? { executeJs: options.executeJs } : {}),
  });

  if (response.ok && response.output) {
    const out = response.output;
    return {
      ok: true,
      html: out.html,
      title: out.title,
      url: out.url,
      status: out.status,
    };
  }
  return { ok: false, error: response.error || 'Render failed' };
}

/**
 * 在当前活跃浏览器页面上执行 JavaScript
 * v1.5.131: 新增
 */
export async function executeJs(options: {
  script: string;
  returnHtml?: boolean;
}): Promise<{ ok: boolean; result?: unknown; html?: string; url?: string; error?: string }> {
  const response = await sendCommand('browser_execute_js', {
    script: options.script,
    returnHtml: options.returnHtml || false,
  });

  if (response.ok && response.output) {
    return {
      ok: true,
      result: response.output.result,
      url: response.output.url,
      ...(response.output.html ? { html: response.output.html } : {}),
    };
  }
  return { ok: false, error: response.error || 'JS execution failed' };
}
