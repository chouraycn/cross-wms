#!/usr/bin/env node
/**
 * BrowserHost — 独立进程，管理 Playwright 浏览器实例
 *
 * v3.0: 通过 Unix Socket / Named Pipe IPC 与 Node 主进程通信。
 * 协议: JSON over newline-delimited stream
 *   Request:  { id, type, args }
 *   Response: { id, ok, output } | { id, ok: false, error }
 *   Notification: { type, ...data }
 *
 * 三层进程模型:
 *   [Node 主进程] → Unix Socket IPC → [BrowserHost] → [Playwright/Chromium]
 *
 * 通信命令类型:
 *   browser_navigate  — 导航到 URL
 *   browser_snapshot   — 获取页面可访问性快照 (ref + role + name)
 *   browser_click      — 点击元素 (by ref or coordinates)
 *   browser_type       — 输入文本 (by ref)
 *   browser_screenshot — 截图 (base64)
 *   browser_render_content — JS 渲染页面并返回 HTML
 *   browser_health     — 健康检查
 *   browser_close      — 关闭浏览器
 */

import { chromium } from 'playwright';
import { createServer } from 'net';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================== 配置 =====================

const SOCKET_PATH = os.platform() === 'win32'
  ? '\\\\.\\pipe\\browser-host'
  : path.join(os.tmpdir(), 'cdf-know-clow-browser-host.sock');

const CDF_DIR = path.join(os.homedir(), '.cdf-know-clow');
const PROFILES_DIR = path.join(CDF_DIR, 'browser-profiles');

/** 最大快照元素数量（防止过大） */
const SNAPSHOT_MAX_ELEMENTS = 100;

/** 默认视口大小 */
const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

// ===================== 状态 =====================

let browser = null;       // Playwright Browser 实例
let context = null;        // BrowserContext (per profile)
let page = null;           // 当前活跃 Page
let snapshotCache = null;  // 最近一次 snapshot 的 ref → element 映射
let isShuttingDown = false;

// ===================== 工具函数 =====================

function log(msg) {
  console.log(`[BrowserHost] ${new Date().toISOString()} ${msg}`);
}

function error(msg) {
  console.error(`[BrowserHost] ${new Date().toISOString()} ${msg}`);
}

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 生成唯一请求 ID */
function genId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===================== 浏览器生命周期 =====================

/**
 * 启动 Playwright 浏览器实例
 * 优先使用 CDP 连接已有 Chrome，否则 spawn 新的 Chromium
 */
async function launchBrowser(options = {}) {
  const {
    headless = true,
    profileId = 'default',
    cdpUrl = null,
  } = options;

  try {
    if (cdpUrl) {
      // CDP 模式: 连接已有 Chrome 实例
      log(`Connecting to existing Chrome via CDP: ${cdpUrl}`);
      browser = await chromium.connectOverCDP(cdpUrl);
      context = browser.contexts()[0] || await browser.newContext();
      log('CDP connection established');
    } else {
      // Spawn 模式: 新建 Chromium 实例
      const profileDir = path.join(PROFILES_DIR, profileId);
      ensureDir(profileDir);

      log(`Launching Chromium (headless=${headless}, profile=${profileId})`);
      browser = await chromium.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1280,900',
          '--window-position=200,200',
          '--app',
        ],
      });

      context = await browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      log('Chromium launched successfully');
    }

    // 创建默认页面
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    // 页面事件监听
    page.on('error', (err) => {
      error(`Page error: ${err.message}`);
    });
    page.on('pageerror', (err) => {
      error(`Page uncaught exception: ${err.message}`);
    });

    return { ok: true, url: page.url() };
  } catch (err) {
    error(`Failed to launch browser: ${err.message}`);
    browser = null;
    context = null;
    page = null;
    return { ok: false, error: err.message };
  }
}

/**
 * 关闭浏览器
 */
async function closeBrowser() {
  try {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  } catch (err) {
    error(`Error closing browser: ${err.message}`);
  } finally {
    browser = null;
    context = null;
    page = null;
    snapshotCache = null;
  }
}

// ===================== Snapshot 引擎 =====================

/**
 * 获取页面的可访问性快照 (ARIA tree with refs)
 * 返回结构化的元素列表，每个元素带 ref id
 */
async function getSnapshot() {
  if (!page) {
    return { ok: false, error: 'No active page' };
  }

  try {
    const accessibility = await page.accessibility.snapshot();
    const url = page.url();
    const title = await page.title();

    // 将 ARIA tree 扁平化为 ref 列表
    const elements = [];
    let refCounter = 0;

    function flattenNode(node, depth = 0) {
      if (!node || elements.length >= SNAPSHOT_MAX_ELEMENTS) return;

      // 跳过纯文本节点和不可见节点
      if (node.role === 'text' && !node.name) return;
      if (node.role === 'generic' && !node.name && depth > 3) return;

      const ref = `e${++refCounter}`;

      const elementInfo = {
        ref,
        role: node.role || 'unknown',
        name: node.name || '',
      };

      // 添加额外属性
      if (node.value) elementInfo.value = node.value;
      if (node.disabled) elementInfo.disabled = true;
      if (node.checked !== undefined) elementInfo.checked = node.checked;
      if (node.expanded !== undefined) elementInfo.expanded = node.expanded;
      if (node.level) elementInfo.level = node.level;
      if (node.required) elementInfo.required = true;
      if (node.url) elementInfo.href = node.url;

      elements.push(elementInfo);

      // 递归处理子节点
      if (node.children) {
        for (const child of node.children) {
          flattenNode(child, depth + 1);
        }
      }
    }

    if (accessibility) {
      flattenNode(accessibility);
    }

    const truncated = elements.length >= SNAPSHOT_MAX_ELEMENTS;

    // 构建 ref 缓存（供后续 click/type 使用）
    snapshotCache = new Map();
    for (const el of elements) {
      snapshotCache.set(el.ref, el);
    }

    return {
      ok: true,
      snapshot: {
        url,
        title,
        elements,
        truncated,
        timestamp: Date.now(),
      },
    };
  } catch (err) {
    return { ok: false, error: `Snapshot failed: ${err.message}` };
  }
}

// ===================== 工具处理器 =====================

/**
 * browser_navigate: 导航到指定 URL
 */
async function handleNavigate(args) {
  if (!page) return { ok: false, error: 'No active page' };

  const { url } = args;
  if (!url || !url.startsWith('http')) {
    return { ok: false, error: 'Invalid URL (must start with http/https)' };
  }

  try {
    // 清除快照缓存
    snapshotCache = null;

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    return {
      ok: true,
      output: {
        url: page.url(),
        title: await page.title(),
        status: response?.status() || null,
      },
    };
  } catch (err) {
    return { ok: false, error: `Navigation failed: ${err.message}` };
  }
}

/**
 * browser_snapshot: 获取页面可访问性快照
 */
async function handleSnapshot(args) {
  const result = await getSnapshot();
  if (!result.ok) return result;
  return { ok: true, output: result.snapshot };
}

/**
 * browser_click: 点击元素
 */
async function handleClick(args) {
  if (!page) return { ok: false, error: 'No active page' };

  const { ref, x, y } = args;

  try {
    snapshotCache = null; // 点击后失效快照

    if (ref) {
      // 获取最新快照，直接使用返回值中的 elementInfo
      const snapResult = await getSnapshot();
      if (!snapResult.ok) return snapResult;

      const elementInfo = snapResult.snapshot.elements.find(el => el.ref === ref);
      if (!elementInfo) {
        return { ok: false, error: `Element ref '${ref}' not found. Take a new snapshot first.` };
      }

      // 根据角色选择定位策略
      let locator;
      if (elementInfo.role === 'button' || elementInfo.role === 'link') {
        locator = page.getByRole(elementInfo.role, { name: elementInfo.name, exact: false });
      } else if (elementInfo.role === 'textbox' || elementInfo.role === 'searchbox') {
        locator = page.getByRole(elementInfo.role, { name: elementInfo.name, exact: false });
      } else if (elementInfo.name) {
        locator = page.getByText(elementInfo.name, { exact: false });
      } else {
        return { ok: false, error: `Cannot locate element '${ref}' (role=${elementInfo.role}, no name)` };
      }

      await locator.first().click({ timeout: 5000 });
      return { ok: true, output: { clicked: ref, role: elementInfo.role, name: elementInfo.name } };
    } else if (x !== undefined && y !== undefined) {
      // 坐标点击
      await page.mouse.click(x, y);
      return { ok: true, output: { clicked: 'coordinates', x, y } };
    } else {
      return { ok: false, error: 'Must provide either ref or x,y coordinates' };
    }
  } catch (err) {
    return { ok: false, error: `Click failed: ${err.message}` };
  }
}

/**
 * browser_type: 在元素中输入文本
 */
async function handleType(args) {
  if (!page) return { ok: false, error: 'No active page' };

  const { ref, text, clear = true, pressEnter = false } = args;

  if (!text && text !== '') {
    return { ok: false, error: 'text parameter is required' };
  }

  try {
    snapshotCache = null;

    if (ref) {
      // 获取最新快照，直接使用返回值中的 elementInfo
      const snapResult = await getSnapshot();
      if (!snapResult.ok) return snapResult;

      const info = snapResult.snapshot.elements.find(el => el.ref === ref);
      if (!info) {
        return { ok: false, error: `Element ref '${ref}' not found. Take a new snapshot first.` };
      }

      // 定位可输入元素
      const locator = page.getByRole(info.role === 'searchbox' ? 'searchbox' : 'textbox', {
        name: info.name,
        exact: false,
      });

      if (clear) {
        await locator.first().fill('');
      }
      await locator.first().fill(text);

      if (pressEnter) {
        await locator.first().press('Enter');
      }

      return { ok: true, output: { typed: ref, text: text.substring(0, 50) } };
    } else {
      // 直接键盘输入（聚焦到页面）
      await page.keyboard.type(text);
      if (pressEnter) {
        await page.keyboard.press('Enter');
      }
      return { ok: true, output: { typed: 'keyboard', text: text.substring(0, 50) } };
    }
  } catch (err) {
    return { ok: false, error: `Type failed: ${err.message}` };
  }
}

/**
 * browser_screenshot: 截图并返回 base64
 */
async function handleScreenshot(args) {
  if (!page) return { ok: false, error: 'No active page' };

  const { fullPage = false, selector } = args;

  try {
    let buffer;
    if (selector) {
      const element = await page.locator(selector).first();
      buffer = await element.screenshot({ type: 'png' });
    } else {
      buffer = await page.screenshot({ type: 'png', fullPage });
    }

    return {
      ok: true,
      output: {
        base64: buffer.toString('base64'),
        mimeType: 'image/png',
        size: buffer.length,
      },
    };
  } catch (err) {
    return { ok: false, error: `Screenshot failed: ${err.message}` };
  }
}

/**
 * browser_render_content: 导航到 URL，等待 JS 渲染完成，返回渲染后的 HTML
 * 使用独立页面（不影响当前活跃页面），渲染完毕后自动关闭
 */
async function handleRenderContent(args) {
  const {
    url,
    waitUntil = 'networkidle',
    selector,
    timeout = 15000,
  } = args;

  if (!url || !url.startsWith('http')) {
    return { ok: false, error: 'Invalid URL (must start with http/https)' };
  }

  // 如果浏览器未启动，自动启动 headless 实例
  if (!browser || !context) {
    const launchResult = await launchBrowser({ headless: true });
    if (!launchResult.ok) {
      return { ok: false, error: `Browser not available: ${launchResult.error}` };
    }
  }

  let renderPage = null;
  try {
    renderPage = await context.newPage();

    const response = await renderPage.goto(url, {
      waitUntil,
      timeout,
    });

    // 如果指定了 CSS selector，等待该元素出现
    if (selector) {
      await renderPage.waitForSelector(selector, { timeout });
    }

    // 获取渲染后的完整 HTML
    const html = await renderPage.content();
    const title = await renderPage.title();

    return {
      ok: true,
      output: {
        url: renderPage.url(),
        title,
        status: response?.status() || null,
        html,
      },
    };
  } catch (err) {
    return { ok: false, error: `Render failed: ${err.message}` };
  } finally {
    // 确保关闭临时页面
    if (renderPage) {
      try { await renderPage.close(); } catch { /* 忽略 */ }
    }
  }
}

/**
 * browser_health: 健康检查
 */
async function handleHealth() {
  return {
    ok: true,
    output: {
      status: browser ? 'running' : 'stopped',
      hasPage: !!page,
      url: page?.url || null,
      pid: process.pid,
    },
  };
}

/**
 * browser_close: 关闭浏览器
 */
async function handleClose() {
  await closeBrowser();
  return { ok: true, output: { status: 'closed' } };
}

// ===================== 命令路由 =====================

const COMMAND_HANDLERS = {
  browser_navigate: handleNavigate,
  browser_snapshot: handleSnapshot,
  browser_click: handleClick,
  browser_type: handleType,
  browser_screenshot: handleScreenshot,
  browser_health: handleHealth,
  browser_close: handleClose,
  browser_launch: launchBrowser,
  browser_render_content: handleRenderContent,
};

/**
 * 处理单个 IPC 命令
 */
async function handleCommand(msg) {
  const { id, type, args = {} } = msg;

  const handler = COMMAND_HANDLERS[type];
  if (!handler) {
    return { id, ok: false, error: `Unknown command: ${type}` };
  }

  try {
    const result = await handler(args);
    return { id, ...result };
  } catch (err) {
    return { id, ok: false, error: err.message || String(err) };
  }
}

// ===================== IPC Socket 服务 =====================

/**
 * 启动 IPC Socket 服务器
 */
function startIpcServer() {
  // 清理旧的 socket 文件
  if (os.platform() !== 'win32' && fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }

  const server = createServer((socket) => {
    log('Client connected');
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留未完成的行

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const response = await handleCommand(msg);
          socket.write(JSON.stringify(response) + '\n');
        } catch (err) {
          error(`Failed to parse/handle message: ${err.message}`);
          socket.write(JSON.stringify({ id: null, ok: false, error: err.message }) + '\n');
        }
      }
    });

    socket.on('end', () => {
      log('Client disconnected');
    });

    socket.on('error', (err) => {
      error(`Socket error: ${err.message}`);
    });
  });

  server.listen(SOCKET_PATH, () => {
    log(`IPC server listening on ${SOCKET_PATH}`);
    // 通知父进程已就绪
    if (process.send) {
      process.send({ type: 'ready', socketPath: SOCKET_PATH });
    }
  });

  server.on('error', (err) => {
    error(`IPC server error: ${err.message}`);
  });

  return server;
}

// ===================== 主入口 =====================

async function main() {
  log('BrowserHost starting...');

  // 确保 profiles 目录存在
  ensureDir(PROFILES_DIR);

  // 默认启动浏览器 (headless)
  const launchResult = await launchBrowser({ headless: true });
  if (!launchResult.ok) {
    error(`Initial browser launch failed: ${launchResult.error}`);
    // 不退出，允许后续通过 IPC 重新启动
  }

  // 启动 IPC 服务
  const ipcServer = startIpcServer();

  // 优雅关闭
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log('Shutting down...');
    await closeBrowser();
    ipcServer.close();
    // 清理 socket 文件
    if (os.platform() !== 'win32' && fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // 进程间通信 (parent process)
  process.on('message', (msg) => {
    if (msg?.type === 'shutdown') {
      shutdown();
    }
  });

  log('BrowserHost ready');
}

main().catch((err) => {
  error(`Fatal: ${err.message}`);
  process.exit(1);
});
