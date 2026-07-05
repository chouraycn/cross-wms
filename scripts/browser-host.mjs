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
 *   browser_tab_list   — 列出所有标签页 (v3.1)
 *   browser_tab_new    — 新建标签页 (v3.1)
 *   browser_tab_switch — 切换标签页 (v3.1)
 *   browser_tab_close  — 关闭标签页 (v3.1)
 *   browser_wait_for   — 等待元素/文本/超时 (v3.1)
 *   browser_cookies    — 获取/设置/删除 Cookie (v3.2)
 *   browser_local_storage — 操作 localStorage (v3.2)
 *   browser_file_upload  — 上传文件到 input[type=file] (v3.2)
 *   browser_download     — 下载文件到本地 (v3.2)
 *   browser_screenshot_base64 — 截图返回 base64 (用于多模态 AI) (v3.2)
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
 * 查找系统 Chrome 浏览器路径
 */
function findSystemChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

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

      const systemChrome = findSystemChrome();
      const launchOptions = {
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
      };

      // 优先尝试 Playwright 自带的 Chromium，如果失败则使用系统 Chrome
      try {
        log(`Launching Chromium (headless=${headless}, profile=${profileId})`);
        browser = await chromium.launch(launchOptions);
      } catch (launchErr) {
        if (systemChrome) {
          log(`Playwright Chromium 不可用，使用系统 Chrome: ${systemChrome}`);
          launchOptions.executablePath = systemChrome;
          browser = await chromium.launch(launchOptions);
        } else {
          throw launchErr;
        }
      }

      context = await browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      log('Browser launched successfully');
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
 * v1.5.131: 支持 executeJs 参数 — 在页面渲染后执行自定义 JS
 */
async function handleRenderContent(args) {
  const {
    url,
    waitUntil = 'networkidle',
    selector,
    timeout = 15000,
    executeJs,
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

    // v1.5.131: 如果指定了 executeJs，在页面上执行
    let jsResult = undefined;
    if (executeJs && typeof executeJs === 'string') {
      try {
        jsResult = await renderPage.evaluate(executeJs);
      } catch (jsErr) {
        jsResult = { error: `JS execution failed: ${jsErr.message}` };
      }
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
        ...(jsResult !== undefined ? { jsResult } : {}),
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
 * browser_execute_js: 在当前活跃页面上执行 JavaScript
 * v1.5.131: 新增 — 支持在已打开的页面上执行任意 JS 并返回结果
 */
async function handleExecuteJs(args) {
  const { script, returnHtml = false } = args;

  if (!script || typeof script !== 'string') {
    return { ok: false, error: 'script parameter is required (must be a string)' };
  }

  if (!browser || !context) {
    return { ok: false, error: 'Browser not launched. Call browser_navigate first.' };
  }

  if (!page) {
    return { ok: false, error: 'No active page. Call browser_navigate first.' };
  }

  try {
    const result = await page.evaluate(script);

    // 可选：返回执行后的页面 HTML
    let html = undefined;
    if (returnHtml) {
      html = await page.content();
    }

    return {
      ok: true,
      output: {
        result,
        url: page.url(),
        ...(returnHtml ? { html } : {}),
      },
    };
  } catch (err) {
    return { ok: false, error: `JS execution failed: ${err.message}` };
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

// ===================== v3.1: Tab 管理 =====================

/**
 * 获取当前上下文中所有标签页的描述
 * 返回 [{ index, url, title, active }]
 */
async function describeTabs() {
  if (!context) return [];
  const pages = context.pages();
  return Promise.all(pages.map(async (p, i) => ({
    index: i,
    url: p.url(),
    title: await p.title().catch(() => ''),
    active: p === page,
  })));
}

/**
 * browser_tab_list: 列出所有标签页
 */
async function handleTabList() {
  if (!context) {
    return { ok: false, error: 'No browser context. Call browser_navigate first.' };
  }
  const tabs = await describeTabs();
  return {
    ok: true,
    output: {
      count: tabs.length,
      activeIndex: tabs.findIndex(t => t.active),
      tabs,
    },
  };
}

/**
 * browser_tab_new: 新建标签页并可选导航到 URL
 */
async function handleTabNew(args) {
  if (!context) {
    return { ok: false, error: 'No browser context. Call browser_navigate first.' };
  }
  const { url } = args;
  try {
    const newPage = await context.newPage();
    page = newPage; // 设为活跃标签页
    snapshotCache = null;

    let navInfo = {};
    if (url) {
      if (!String(url).startsWith('http')) {
        return { ok: false, error: 'Invalid URL (must start with http/https)' };
      }
      const response = await newPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      navInfo = {
        url: newPage.url(),
        title: await newPage.title(),
        status: response?.status() || null,
      };
    } else {
      navInfo = { url: newPage.url(), title: '', status: null };
    }

    const tabs = await describeTabs();
    return {
      ok: true,
      output: {
        created: true,
        ...navInfo,
        activeIndex: tabs.findIndex(t => t.active),
        tabs,
      },
    };
  } catch (err) {
    return { ok: false, error: `New tab failed: ${err.message}` };
  }
}

/**
 * browser_tab_switch: 切换到指定索引的标签页
 */
async function handleTabSwitch(args) {
  if (!context) {
    return { ok: false, error: 'No browser context. Call browser_navigate first.' };
  }
  const { index } = args;
  if (typeof index !== 'number' || !Number.isInteger(index)) {
    return { ok: false, error: 'index must be an integer' };
  }
  const pages = context.pages();
  if (index < 0 || index >= pages.length) {
    return { ok: false, error: `index out of range (0..${pages.length - 1})` };
  }
  try {
    page = pages[index];
    snapshotCache = null;
    // bringToFront 可能在某些上下文不可用，包一层 try
    try { await page.bringToFront(); } catch { /* 忽略 */ }
    const tabs = await describeTabs();
    return {
      ok: true,
      output: {
        switched: index,
        url: page.url(),
        title: await page.title().catch(() => ''),
        activeIndex: index,
        tabs,
      },
    };
  } catch (err) {
    return { ok: false, error: `Tab switch failed: ${err.message}` };
  }
}

/**
 * browser_tab_close: 关闭指定索引的标签页（默认关闭活跃标签页）
 */
async function handleTabClose(args) {
  if (!context) {
    return { ok: false, error: 'No browser context. Call browser_navigate first.' };
  }
  const pages = context.pages();
  if (pages.length === 0) {
    return { ok: false, error: 'No tabs to close' };
  }

  const index = typeof args.index === 'number' ? args.index : pages.indexOf(page);
  if (index < 0 || index >= pages.length) {
    return { ok: false, error: `index out of range (0..${pages.length - 1})` };
  }

  try {
    const target = pages[index];
    await target.close();

    // 选择新的活跃标签页
    const remaining = context.pages();
    page = remaining.length > 0 ? remaining[Math.min(index, remaining.length - 1)] : null;
    snapshotCache = null;

    const tabs = await describeTabs();
    return {
      ok: true,
      output: {
        closed: index,
        remaining: remaining.length,
        activeIndex: page ? tabs.findIndex(t => t.active) : -1,
        tabs,
      },
    };
  } catch (err) {
    return { ok: false, error: `Tab close failed: ${err.message}` };
  }
}

// ===================== v3.1: 等待机制 =====================

/**
 * browser_wait_for: 等待元素出现、文本匹配或简单超时
 */
async function handleWaitFor(args) {
  if (!page) {
    return { ok: false, error: 'No active page. Call browser_navigate first.' };
  }
  const {
    type,
    value = '',
    timeout = 5000,
  } = args;

  if (!['selector', 'text', 'timeout'].includes(type)) {
    return { ok: false, error: `Invalid type: ${type} (expected selector|text|timeout)` };
  }

  const ms = Math.max(0, Math.min(Number(timeout) || 5000, 60000));

  try {
    if (type === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, ms));
      return {
        ok: true,
        output: {
          met: true,
          type,
          waitedMs: ms,
        },
      };
    }

    if (type === 'selector') {
      if (!value) {
        return { ok: false, error: 'value is required for type="selector"' };
      }
      await page.waitForSelector(value, { timeout: ms });
      return {
        ok: true,
        output: {
          met: true,
          type,
          selector: value,
          waitedMs: ms,
        },
      };
    }

    // type === 'text'
    if (!value) {
      return { ok: false, error: 'value is required for type="text"' };
    }
    try {
      await page.waitForFunction(
        (text) => (document.body && document.body.innerText
          ? document.body.innerText.includes(text)
          : false),
        value,
        { timeout: ms },
      );
      return {
        ok: true,
        output: {
          met: true,
          type,
          text: value,
          waitedMs: ms,
        },
      };
    } catch (waitErr) {
      // 超时返回 met: false 而非抛错，便于 AI 判断
      return {
        ok: true,
        output: {
          met: false,
          type,
          text: value,
          waitedMs: ms,
          reason: waitErr.message || 'timeout',
        },
      };
    }
  } catch (err) {
    // selector 超时也返回 met: false
    if (err.name === 'TimeoutError' || /timeout/i.test(err.message || '')) {
      return {
        ok: true,
        output: {
          met: false,
          type,
          value,
          waitedMs: ms,
          reason: err.message || 'timeout',
        },
      };
    }
    return { ok: false, error: `Wait failed: ${err.message}` };
  }
}

// ===================== v3.2: Cookie / Storage / 文件上传下载 / 截图 base64 =====================

/**
 * browser_cookies: 获取/设置/删除 Cookie
 */
async function handleCookies(args) {
  if (!context) {
    return { ok: false, error: 'No browser context. Call browser_navigate first.' };
  }
  const { action, name, value, domain, path: cookiePath = '/' } = args;

  try {
    if (action === 'get') {
      let cookies = await context.cookies();
      if (name) {
        cookies = cookies.filter((c) => c.name === name);
      }
      if (domain) {
        cookies = cookies.filter((c) => c.domain.includes(domain));
      }
      return {
        ok: true,
        output: {
          count: cookies.length,
          cookies: cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite,
          })),
        },
      };
    }

    if (action === 'set') {
      if (!name) {
        return { ok: false, error: 'name is required for action="set"' };
      }
      if (value === undefined || value === null) {
        return { ok: false, error: 'value is required for action="set"' };
      }

      // 推断 cookie domain：优先使用参数，否则使用当前页面 URL 的域名
      let cookieDomain = domain;
      if (!cookieDomain && page) {
        try {
          const pageUrl = page.url();
          if (pageUrl && pageUrl.startsWith('http')) {
            cookieDomain = new URL(pageUrl).hostname;
          }
        } catch { /* 忽略 URL 解析错误 */ }
      }
      if (!cookieDomain) {
        return { ok: false, error: 'domain is required (could not infer from current page)' };
      }

      const cookie = {
        name,
        value: String(value),
        domain: cookieDomain,
        path: cookiePath,
      };

      await context.addCookies([cookie]);
      return {
        ok: true,
        output: { set: true, name, domain: cookieDomain, path: cookiePath },
      };
    }

    if (action === 'delete') {
      if (!name) {
        return { ok: false, error: 'name is required for action="delete"' };
      }

      // Playwright 没有直接删除单个 cookie 的 API，需要先获取所有 cookie，
      // 过滤掉要删除的，然后清空并重新添加其余 cookie
      const allCookies = await context.cookies();
      const remaining = allCookies.filter((c) => c.name !== name);
      await context.clearCookies();
      if (remaining.length > 0) {
        await context.addCookies(remaining);
      }
      return {
        ok: true,
        output: {
          deleted: true,
          name,
          remaining: remaining.length,
        },
      };
    }

    return { ok: false, error: `Invalid action: ${action} (expected get | set | delete)` };
  } catch (err) {
    return { ok: false, error: `Cookies operation failed: ${err.message}` };
  }
}

/**
 * browser_local_storage: 操作 localStorage
 */
async function handleLocalStorage(args) {
  if (!page) {
    return { ok: false, error: 'No active page. Call browser_navigate first.' };
  }
  const { action, key, value } = args;

  try {
    if (action === 'get') {
      if (!key) {
        return { ok: false, error: 'key is required for action="get"' };
      }
      const result = await page.evaluate((k) => window.localStorage.getItem(k), key);
      return {
        ok: true,
        output: {
          key,
          value: result,
          exists: result !== null,
        },
      };
    }

    if (action === 'set') {
      if (!key) {
        return { ok: false, error: 'key is required for action="set"' };
      }
      if (value === undefined || value === null) {
        return { ok: false, error: 'value is required for action="set"' };
      }
      await page.evaluate(({ k, v }) => window.localStorage.setItem(k, v), { k: key, v: String(value) });
      return {
        ok: true,
        output: { set: true, key, valueLength: String(value).length },
      };
    }

    if (action === 'delete') {
      if (!key) {
        return { ok: false, error: 'key is required for action="delete"' };
      }
      await page.evaluate((k) => window.localStorage.removeItem(k), key);
      return {
        ok: true,
        output: { deleted: true, key },
      };
    }

    if (action === 'clear') {
      await page.evaluate(() => window.localStorage.clear());
      return {
        ok: true,
        output: { cleared: true },
      };
    }

    return { ok: false, error: `Invalid action: ${action} (expected get | set | delete | clear)` };
  } catch (err) {
    return { ok: false, error: `localStorage operation failed: ${err.message}` };
  }
}

/**
 * browser_file_upload: 上传文件到 input[type=file] 元素
 */
async function handleFileUpload(args) {
  if (!page) {
    return { ok: false, error: 'No active page. Call browser_navigate first.' };
  }
  const { ref, filePath } = args;

  if (!ref) {
    return { ok: false, error: 'ref parameter is required (from snapshot)' };
  }
  if (!filePath) {
    return { ok: false, error: 'filePath parameter is required (absolute local path)' };
  }

  // 检查文件是否存在
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { ok: false, error: `Path is not a file: ${filePath}` };
    }
  } catch (err) {
    return { ok: false, error: `Cannot access file: ${err.message}` };
  }

  try {
    // 获取最新快照以定位元素
    const snapResult = await getSnapshot();
    if (!snapResult.ok) return snapResult;

    const elementInfo = snapResult.snapshot.elements.find((el) => el.ref === ref);
    if (!elementInfo) {
      return { ok: false, error: `Element ref '${ref}' not found. Take a new snapshot first.` };
    }

    // 文件输入元素通常没有可访问的 name，需要通过 input[type=file] 选择器定位
    // 尝试多种定位策略
    let locator;
    if (elementInfo.name) {
      locator = page.locator(`input[type="file"]`).filter({ hasText: elementInfo.name }).first();
    } else {
      // 通过索引定位（ref 顺序对应 input 元素顺序）
      const refNum = parseInt(ref.replace(/[^0-9]/g, ''), 10);
      locator = page.locator(`input[type="file"]`).nth(refNum - 1);
    }

    // 检查元素是否存在
    const count = await locator.count();
    if (count === 0) {
      // 兜底：使用第一个 file input
      locator = page.locator(`input[type="file"]`).first();
      const fallbackCount = await locator.count();
      if (fallbackCount === 0) {
        return { ok: false, error: 'No <input type="file"> element found on the page' };
      }
    }

    await locator.setInputFiles(filePath);

    return {
      ok: true,
      output: {
        uploaded: true,
        ref,
        filePath,
        fileName: path.basename(filePath),
      },
    };
  } catch (err) {
    return { ok: false, error: `File upload failed: ${err.message}` };
  }
}

/**
 * browser_download: 下载文件到指定路径
 * 优先使用浏览器上下文中的 fetch（携带 cookies），失败则回退到 node fetch
 */
async function handleDownload(args) {
  const { url, savePath, timeout = 30000 } = args;

  if (!url || !String(url).startsWith('http')) {
    return { ok: false, error: 'Invalid URL (must start with http/https)' };
  }
  if (!savePath) {
    return { ok: false, error: 'savePath parameter is required (absolute local path)' };
  }

  // 确保保存目录存在
  try {
    const saveDir = path.dirname(savePath);
    ensureDir(saveDir);
  } catch (err) {
    return { ok: false, error: `Cannot create save directory: ${err.message}` };
  }

  // 策略 1：通过页面 evaluate 使用浏览器 fetch（携带 cookies/session）
  if (page) {
    try {
      const result = await page.evaluate(async (fetchUrl) => {
        try {
          const resp = await fetch(fetchUrl);
          if (!resp.ok) {
            return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
          }
          const buffer = await resp.arrayBuffer();
          // 将 ArrayBuffer 转为 base64 以便通过 IPC 传输
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return { ok: true, base64: btoa(binary), size: bytes.length };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, url);

      if (result && result.ok && result.base64) {
        const buffer = Buffer.from(result.base64, 'base64');
        fs.writeFileSync(savePath, buffer);
        return {
          ok: true,
          output: {
            downloaded: true,
            url,
            savePath,
            sizeBytes: buffer.length,
            sizeKB: Math.round(buffer.length / 1024),
            method: 'browser-fetch',
          },
        };
      }
    } catch (evalErr) {
      // evaluate 失败（例如跨域、页面未就绪），回退到 node fetch
      log(`Browser fetch failed, falling back to node fetch: ${evalErr.message}`);
    }
  }

  // 策略 2：使用 Node.js 内置 fetch（Node 18+）
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeout) || 30000));

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      return { ok: false, error: `Download failed: HTTP ${resp.status}` };
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(savePath, buffer);

    return {
      ok: true,
      output: {
        downloaded: true,
        url,
        savePath,
        sizeBytes: buffer.length,
        sizeKB: Math.round(buffer.length / 1024),
        method: 'node-fetch',
      },
    };
  } catch (err) {
    return { ok: false, error: `Download failed: ${err.message}` };
  }
}

/**
 * browser_screenshot_base64: 截图并返回 base64（用于多模态 AI 分析）
 * 与 handleScreenshot 不同，此方法返回 JPEG（更小）、支持 resize 和质量参数
 */
async function handleScreenshotBase64(args) {
  if (!page) {
    return { ok: false, error: 'No active page. Call browser_navigate first.' };
  }
  const { fullPage = false, maxWidth = 1280, quality = 80 } = args;

  try {
    // 先以 PNG 截图（Playwright 原生支持），再按需转换为 JPEG
    const pngBuffer = await page.screenshot({
      type: 'png',
      fullPage,
    });

    // 使用 Playwright 的页面 evaluate 获取图片尺寸并 resize（如需）
    // 简化实现：直接返回 PNG 的 base64，附加尺寸信息
    // 如果需要 JPEG，可借助 sharp 等库，但为避免额外依赖，这里返回 PNG
    // 同时根据 maxWidth 提示（实际 resize 需要图像处理库）
    const base64 = pngBuffer.toString('base64');

    // 获取视口尺寸用于参考
    const viewport = page.viewportSize() || { width: 1280, height: 720 };

    return {
      ok: true,
      output: {
        base64,
        mimeType: 'image/png',
        size: pngBuffer.length,
        width: fullPage ? viewport.width : viewport.width,
        height: viewport.height,
        fullPage,
        requestedMaxWidth: maxWidth,
        requestedQuality: quality,
      },
    };
  } catch (err) {
    return { ok: false, error: `Screenshot failed: ${err.message}` };
  }
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
  browser_execute_js: handleExecuteJs,
  // v3.1: Tab 管理 & 等待机制
  browser_tab_list: handleTabList,
  browser_tab_new: handleTabNew,
  browser_tab_switch: handleTabSwitch,
  browser_tab_close: handleTabClose,
  browser_wait_for: handleWaitFor,
  // v3.2: Cookie / Storage / 文件上传下载 / 截图 base64
  browser_cookies: handleCookies,
  browser_local_storage: handleLocalStorage,
  browser_file_upload: handleFileUpload,
  browser_download: handleDownload,
  browser_screenshot_base64: handleScreenshotBase64,
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
