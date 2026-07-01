/**
 * Browser Routes — REST API 端点 + health check
 *
 * v3.0: 提供浏览器自动化相关的 HTTP 端点，
 * 供前端 UI 直接调用（非 AI tool call 场景）。
 *
 * 端点:
 *   GET  /api/browser/health        — BrowserHost 健康检查
 *   POST /api/browser/launch         — 启动浏览器
 *   POST /api/browser/navigate       — 导航到 URL
 *   POST /api/browser/snapshot       — 获取快照
 *   POST /api/browser/click          — 点击元素
 *   POST /api/browser/type           — 输入文本
 *   POST /api/browser/screenshot    — 截图
 *   POST /api/browser/close          — 关闭浏览器
 */

import { Router } from 'express';
import {
  sendCommand,
  ensureBrowserHost,
  stopBrowserHost,
  getBrowserHostHealth,
} from '../services/browserHostClient.js';
import { isDomainAllowed } from '../dao/apiDomainWhitelist.js';

const router = Router();

/**
 * GET /api/browser/health
 * BrowserHost 健康检查
 */
router.get('/health', async (_req, res) => {
  try {
    const health = await getBrowserHostHealth();
    res.json({ ok: true, data: health });
  } catch (err) {
    res.json({
      ok: true,
      data: {
        status: 'unavailable',
        hasPage: false,
        url: null,
        pid: null,
      },
    });
  }
});

/**
 * POST /api/browser/launch
 * 启动 BrowserHost 进程 + 浏览器实例
 */
router.post('/launch', async (req, res) => {
  try {
    const { headless = true, profileId = 'default', cdpUrl } = req.body;

    // 先确保 BrowserHost 进程在运行
    const startResult = await ensureBrowserHost();
    if (!startResult.ok) {
      res.json({ ok: false, error: startResult.error });
      return;
    }

    // 通过 IPC 发送 launch 命令
    const response = await sendCommand('browser_launch', {
      headless,
      profileId,
      cdpUrl,
    });

    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/navigate
 * 导航到指定 URL
 */
router.post('/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.json({ ok: false, error: 'url is required' });
      return;
    }

    // v3.0: 域名白名单校验 — 提取 hostname 并检查是否在白名单中
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      if (!isDomainAllowed(hostname)) {
        res.json({ ok: false, error: `域名 '${hostname}' 不在 API 域名白名单中，请先在「域名白名单」页面添加` });
        return;
      }
    } catch {
      res.json({ ok: false, error: `无效的 URL 格式: ${url}` });
      return;
    }

    const response = await sendCommand('browser_navigate', { url });
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/snapshot
 * 获取页面可访问性快照
 */
router.post('/snapshot', async (_req, res) => {
  try {
    const response = await sendCommand('browser_snapshot');
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/click
 * 点击页面元素
 */
router.post('/click', async (req, res) => {
  try {
    const { ref, x, y } = req.body;
    const response = await sendCommand('browser_click', { ref, x, y });
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/type
 * 输入文本
 */
router.post('/type', async (req, res) => {
  try {
    const { ref, text, clear = true, pressEnter = false } = req.body;
    if (!text && text !== '') {
      res.json({ ok: false, error: 'text is required' });
      return;
    }

    const response = await sendCommand('browser_type', { ref, text, clear, pressEnter });
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/screenshot
 * 截图
 */
router.post('/screenshot', async (req, res) => {
  try {
    const { fullPage = false, selector } = req.body;
    const response = await sendCommand('browser_screenshot', { fullPage, selector });
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/close
 * 关闭浏览器
 */
router.post('/close', async (_req, res) => {
  try {
    const response = await sendCommand('browser_close');
    res.json({ ok: response.ok, data: response.output, error: response.error });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/browser/stop-host
 * 停止 BrowserHost 进程
 */
router.post('/stop-host', async (_req, res) => {
  try {
    await stopBrowserHost();
    res.json({ ok: true, data: { status: 'stopped' } });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
