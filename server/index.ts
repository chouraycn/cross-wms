import { initSentry } from './sentry.js';
initSentry();

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { API_PREFIX } from './apiVersion.js';
import { apiVersionMiddleware } from './middleware/apiVersionMiddleware.js';
import { initDb } from './db.js';
import skillWatcher from './services/skillWatcher.js';
import { initDefaultTools, listTools } from './engine/toolRegistry.js';
import { agentRegistry } from './engine/agentRegistry.js';
import { initDefaultSoulFiles } from './engine/soulLoader.js';
import { EventEmitter } from 'events';

// v1.5.88: 全局异常兜底 — Node.js v15+ 未处理 rejection 默认崩溃进程
process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  logger.error('[Process] ⚠️ unhandledRejection:', msg);
  // 不调用 process.exit()，桌面应用保持运行比崩溃更合理
});

process.on('uncaughtException', (err: Error) => {
  logger.error('[Process] ❌ uncaughtException:', err.stack || err.message);
  // uncaughtException 通常更严重，但仍保持运行 (Node 文档建议此时进程状态不确定，尽快优雅退出)
  // 对于桌面应用，记录错误并继续运行，避免静默崩溃
  logger.error('[Process] 进程状态可能异常，建议重启应用。继续运行中...');
});

// v1.9.2: 工具权限请求全局 EventEmitter (reserved for future cross-route events)
const _permissionEmitter = new EventEmitter(); void _permissionEmitter;

// Business data routes
import warehousesRouter from './routes/warehouses.js';
import inventoryRouter from './routes/inventory.js';
import transitRouter from './routes/transit.js';
import inboundRouter from './routes/inbound.js';
import outboundRouter from './routes/outbound.js';
import partnersRouter from './routes/partners.js';
import transferOrderRouter from './routes/transfer.js';
import skillsRouter from './routes/skills.js';
import settingsRouter from './routes/settings.js';
import migrateRouter from './routes/migrate.js';
import chainRoutes from './routes/chainRoutes.js';
import automationRoutes from './routes/automation.js';

// Projects & Tasks routes
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';

import { ensureWmsTables } from './dao/wmsSkillDao.js';

// WMS skill routes
import wmsQualityRoutes from './routes/wms-quality.js';
import wmsInventoryRoutes from './routes/wms-inventory.js';
import wmsOutboundRoutes from './routes/wms-outbound.js';
import wmsAlertRoutes from './routes/wms-alert.js';
import wmsReportRoutes from './routes/wms-report.js';
import wmsReplenishmentRoutes from './routes/wms-replenishment.js';

// Semantic matching routes
import matchingRoutes from './routes/matching.js';

// Model management routes
import modelsRoutes from './routes/models.js';

// Inventory NL-Query route (v1.5.0)
import inventoryNlQueryRouter from './routes/inventory-nl-query.js';

// Extracted routes
import chatRouter from './routes/chat.js';
import sessionsRouter from './routes/sessions.js';
import foldersRouter from './routes/folders.js';
import memoryRouter from './routes/memory.js';
import eventsRouter from './routes/events.js';
import uploadRouter, { UPLOADS_DIR, ensureUploadsDir } from './routes/upload.js';
import healthRouter from './routes/health.js';
import healthEnhancedRouter from './routes/healthEnhanced.js';
import inventoryTransactionsRouter from './routes/inventory-transactions.js';

// Agent routes
import agentsRouter from './routes/agents.js';
import agentChatRouter from './routes/agentChat.js';

// Services
import './services/chainExecutor.js'; // side-effect: registers chain event handlers
import { batchAuditSkills } from './services/securityAuditor.js';
import { initMatchingEngine } from './services/matchingService.js';
import { syncModelsFromApi, loadModelsConfig } from './modelsStore.js';
import { channelHealthMonitor } from './services/channelHealthMonitor.js';
import { configHotReload } from './services/configHotReload.js';

// Automation Engine v2.0
import { startEngine } from './engine/engine.js';

// v3.0: Plugin & API Domain Whitelist routes
import pluginsRouter from './routes/plugins.js';
import apiDomainWhitelistRouter from './routes/apiDomainWhitelist.js';

// v3.0: Browser routes
import browserRouter from './routes/browser.js';
import browserProfilesRouter from './routes/browserProfiles.js';

// v3.0: API Templates routes
import apiTemplatesRouter from './routes/apiTemplates.js';

// v3.0: API Credentials routes
import apiCredentialsRouter from './routes/apiCredentials.js';

// v3.0: API Request History routes
import apiHistoryRouter from './routes/apiHistory.js';

// v3.0: Plugin Registry
import { pluginRegistry } from './engine/pluginRegistry.js';
import { listPluginTools } from './engine/toolRegistry.js';

// v3.0: BrowserHost Client
import { startBrowserHost, stopBrowserHost, getBrowserHostHealth } from './services/browserHostClient.js';

// v4.0: MCP Client Manager
import mcpRouter from './routes/mcp.js';
import { mcpClientManager } from './engine/mcpClientManager.js';

// v6.0: Session Lifecycle Manager
import { sessionLifecycleManager } from './services/sessionLifecycle.js';

// v7.0: Message Queue (队列与并发控制)
import { messageQueue } from './engine/messageQueue.js';
import { logger } from './logger.js';

const app = express();
// CORS: 开发环境允许所有本地来源
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.startsWith('file://')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }
  next();
});
// API version middleware — adds X-API-Version header and deprecation warnings
app.use(apiVersionMiddleware);

// 静态文件服务：提供已上传文件的访问（必须在 express.json() 之前）
ensureUploadsDir();
app.use('/api/uploads', express.static(UPLOADS_DIR));

// v1.9.3: 上传路由必须在 express.json() 之前，否则 multipart body 会被消耗
app.use('/api/upload', uploadRouter);

app.use(express.json({ limit: '3mb' }));

// 初始化 Skill Watcher
skillWatcher.init();

// 启动渠道健康监控
channelHealthMonitor.start();

// 启动配置热重载
configHotReload.start([
  path.join(os.homedir(), '.cdf-know-clow', 'models.json'),
]);

// ========== Extracted API Routes ==========

app.use('/api', chatRouter);
app.use('/api', agentChatRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/memory', memoryRouter);
app.use('/api', eventsRouter);
app.use('/api/health', healthRouter);
app.use('/api/health', healthEnhancedRouter);
app.use('/api/inventory-transactions', inventoryTransactionsRouter);

// Agent routes
app.use('/api/agents', agentsRouter);

// ========== Business Data API Routes ==========

app.use('/api/warehouses', warehousesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/transit-orders', transitRouter);
app.use('/api/inbound-records', inboundRouter);
app.use('/api/outbound-records', outboundRouter);
app.use('/api/transfer-orders', transferOrderRouter);
app.use('/api/partners', partnersRouter);
app.use('/api', skillsRouter); // handles /api/user-skills and /api/builtin-status-patches
app.use('/api/app-settings', settingsRouter);
app.use('/api/migrate', migrateRouter);

// Projects & Tasks routes
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);

// Automation webhook routes
app.use('/api/automation', automationRoutes);

// Skill chain routes
app.use('/api/skill-chains', chainRoutes);
app.use('/api/chain-executions', chainRoutes);

// WMS skill routes
app.use('/api/wms/quality', wmsQualityRoutes);
app.use('/api/wms/inventory-count', wmsInventoryRoutes);
app.use('/api/wms/outbound-review', wmsOutboundRoutes);
app.use('/api/wms/alerts', wmsAlertRoutes);
app.use('/api/wms/reports', wmsReportRoutes);
app.use('/api/wms/replenishment', wmsReplenishmentRoutes);

// Semantic matching engine routes
app.use('/api/matching', matchingRoutes);

// Model management routes
app.use('/api/models', modelsRoutes);

// Inventory NL-Query route (v1.5.0)
app.use('/api/inventory', inventoryNlQueryRouter);

// ========== v3.0: Plugin & API Domain Whitelist Routes ==========
app.use('/api/plugins', pluginsRouter);
app.use('/api/api-domain-whitelist', apiDomainWhitelistRouter);

// ========== v3.0: Browser Routes ==========
app.use('/api/browser', browserRouter);
app.use('/api/browser/profiles', browserProfilesRouter);

// ========== v3.0: API Templates Routes ==========
app.use('/api/api-templates', apiTemplatesRouter);

// ========== v3.0: API Credentials Routes ==========
app.use('/api/api-credentials', apiCredentialsRouter);

// ========== v3.0: API Request History Routes ==========
app.use('/api/api-history', apiHistoryRouter);

// ========== v4.0: MCP Routes ==========
app.use('/api/mcp', mcpRouter);

// ========== Versioned API Routes (v1) ==========
// All routes are also mounted under /api/v1 for versioned access
app.use(`${API_PREFIX}`, chatRouter);
app.use(`${API_PREFIX}/sessions`, sessionsRouter);
app.use(`${API_PREFIX}/folders`, foldersRouter);
app.use(`${API_PREFIX}/memory`, memoryRouter);
app.use(`${API_PREFIX}`, eventsRouter);
app.use(`${API_PREFIX}/health`, healthRouter);
app.use(`${API_PREFIX}/health`, healthEnhancedRouter);
app.use(`${API_PREFIX}/inventory-transactions`, inventoryTransactionsRouter);
app.use(`${API_PREFIX}/agents`, agentsRouter);
app.use(`${API_PREFIX}/warehouses`, warehousesRouter);
app.use(`${API_PREFIX}/inventory`, inventoryRouter);
app.use(`${API_PREFIX}/transit-orders`, transitRouter);
app.use(`${API_PREFIX}/inbound-records`, inboundRouter);
app.use(`${API_PREFIX}/outbound-records`, outboundRouter);
app.use(`${API_PREFIX}/transfer-orders`, transferOrderRouter);
app.use(`${API_PREFIX}/partners`, partnersRouter);
app.use(`${API_PREFIX}`, skillsRouter);
app.use(`${API_PREFIX}/app-settings`, settingsRouter);
app.use(`${API_PREFIX}/migrate`, migrateRouter);
app.use(`${API_PREFIX}/projects`, projectsRouter);
app.use(`${API_PREFIX}/tasks`, tasksRouter);
app.use(`${API_PREFIX}/automation`, automationRoutes);
app.use(`${API_PREFIX}/skill-chains`, chainRoutes);
app.use(`${API_PREFIX}/chain-executions`, chainRoutes);
app.use(`${API_PREFIX}/wms/quality`, wmsQualityRoutes);
app.use(`${API_PREFIX}/wms/inventory-count`, wmsInventoryRoutes);
app.use(`${API_PREFIX}/wms/outbound-review`, wmsOutboundRoutes);
app.use(`${API_PREFIX}/wms/alerts`, wmsAlertRoutes);
app.use(`${API_PREFIX}/wms/reports`, wmsReportRoutes);
app.use(`${API_PREFIX}/wms/replenishment`, wmsReplenishmentRoutes);
app.use(`${API_PREFIX}/matching`, matchingRoutes);
app.use(`${API_PREFIX}/models`, modelsRoutes);
app.use(`${API_PREFIX}/inventory`, inventoryNlQueryRouter);
app.use(`${API_PREFIX}/plugins`, pluginsRouter);
app.use(`${API_PREFIX}/api-domain-whitelist`, apiDomainWhitelistRouter);
app.use(`${API_PREFIX}/browser`, browserRouter);
app.use(`${API_PREFIX}/browser/profiles`, browserProfilesRouter);
app.use(`${API_PREFIX}/api-templates`, apiTemplatesRouter);
app.use(`${API_PREFIX}/api-credentials`, apiCredentialsRouter);
app.use(`${API_PREFIX}/api-history`, apiHistoryRouter);
app.use(`${API_PREFIX}/mcp`, mcpRouter);

// ========== v1.5.220: 前端静态文件服务（供 Swift 原生 App 使用） ==========
// 优先从 dist/ 加载前端构建产物（开发环境），其次从 process.env.FRONTEND_DIR 加载
const FRONTEND_DIST_DIR = process.env.FRONTEND_DIR
  ? path.resolve(process.env.FRONTEND_DIR)
  : path.join(process.cwd(), 'dist');

if (fs.existsSync(FRONTEND_DIST_DIR) && fs.existsSync(path.join(FRONTEND_DIST_DIR, 'index.html'))) {
  logger.info(`[Server] 前端静态目录: ${FRONTEND_DIST_DIR}`);
  app.use(express.static(FRONTEND_DIST_DIR, { index: false }));

  // SPA fallback — 所有非 API 的 GET 请求都返回 index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST_DIR, 'index.html'));
  });
} else {
  logger.warn(`[Server] 前端静态目录不存在: ${FRONTEND_DIST_DIR}（仅 API 模式）`);
}

const PORT = 3001;

// v8.7: error 监听器必须在 listen() 之前注册，防止边缘情况下 error 事件丢失
const server = http.createServer(app);
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`[Server] ❌ 端口 ${PORT} 已被占用，2 秒后退出并等待重启...`);
    setTimeout(() => process.exit(1), 2000);
  } else {
    logger.error('[Server] ❌ 启动失败:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, async () => {
  logger.info(`CDF Know Clow Chat Server running on port ${PORT}`);
  const db = initDb();

  // v1.5.203: 预热模型配置缓存（含 Keychain 注入），避免首次 GET /api/models 阻塞
  // 不 await，不阻塞启动流程；失败仅 warn
  loadModelsConfig().catch(e => logger.warn('[Server] 模型缓存预热失败:', e instanceof Error ? e.message : String(e)));

  // 初始化 Tool Registry
  await initDefaultTools();
  logger.info('[Tool Registry] 工具注册完成:', listTools().join(', '));

  // v8.0: 初始化 Agent Registry（加载内置 Agent 模板）
  agentRegistry.initialize();

  // v8.5: 初始化人格层文件（首次启动时复制 SOUL.md / USER.md 到 ~/.cdf-know-clow/）
  initDefaultSoulFiles();

  // v3.0: 自动加载已启用的插件
  await pluginRegistry.loadEnabledPlugins();
  const pluginToolNames = listPluginTools();
  if (pluginToolNames.length > 0) {
    logger.info('[Plugin Registry] 插件工具已加载:', pluginToolNames.join(', '));
  }

  // v4.0: 启动时连接所有已启用的 MCP Server（异步，不阻塞主流程）
  setTimeout(async () => {
    try {
      await mcpClientManager.connectAllEnabled();
    } catch (err) {
      logger.error('[McpClientManager] 启动连接失败:', err instanceof Error ? err.message : String(err));
    }
  }, 5000);

  // v3.0: 启动 BrowserHost 进程（异步，不阻塞主流程）
  setTimeout(async () => {
    try {
      const result = await startBrowserHost();
      if (result.ok) {
        const health = await getBrowserHostHealth();
        logger.info(`[BrowserHost] 进程已启动, status=${health.status}`);
      } else {
        logger.warn(`[BrowserHost] 启动失败: ${result.error} (Browser tools will be unavailable)`);
      }
    } catch (err) {
      logger.warn('[BrowserHost] 启动异常:', err instanceof Error ? err.message : String(err));
    }
  }, 3000);

  // 自动发现新模型（异步，不阻塞启动）
  setTimeout(() => {
    syncModelsFromApi().catch(e => {
      logger.error('[ModelDiscovery] 启动同步失败:', e);
    });
  }, 5000);

  // 初始化 WMS 行业技能表
  ensureWmsTables(db);

  // 初始化语义匹配引擎（异步，不阻塞启动）
  setTimeout(async () => {
    try {
      const stats = await initMatchingEngine();
      logger.info(`[Matching] 嵌入初始化完成: total=${stats.embeddingStats.total}, new=${stats.embeddingStats.newCount}, updated=${stats.embeddingStats.updatedCount}, skipped=${stats.embeddingStats.skippedCount}`);
    } catch (e) {
      logger.error('[Matching] 嵌入初始化失败:', e);
    }
  }, 3000);

  // 启动自动化引擎 v2.0（30s 轮询）
  const { stop } = startEngine(30_000);

  // v6.0: 启动会话生命周期管理器（空闲归档 + 每日重置）
  sessionLifecycleManager.start();

  // v7.0: 启动消息队列（空闲会话清理 + 全局并发度控制）
  messageQueue.start();

  // P0: 启动时异步预热 ONNX 模型，避免首次 chat 请求阻塞
  import('./engine/onnxEmbedding.js').then(({ initOnnxEmbedding }) => {
    initOnnxEmbedding().catch(err => {
      logger.warn('[Server] ONNX 模型预热失败（非阻塞）:', err instanceof Error ? err.message : String(err));
    });
  }).catch(err => {
    logger.warn('[Server] ONNX 模块加载失败（非阻塞）:', err instanceof Error ? err.message : String(err));
  });

  // 绑定优雅关闭 — 在进程退出时停止引擎
  const gracefulShutdown = () => {
    logger.info('[Server] 正在关闭自动化引擎...');
    stop();
    // v6.0: 停止会话生命周期守护
    sessionLifecycleManager.stop();
    // v7.0: 停止消息队列
    messageQueue.stop();
    // v3.0: 关闭 BrowserHost 进程
    stopBrowserHost().catch(err => {
      logger.warn('[Server] BrowserHost 关闭异常:', err);
    });
    // v4.0: 关闭 MCP Client Manager
    mcpClientManager.shutdown().catch(err => {
      logger.warn('[Server] MCP Client Manager 关闭异常:', err);
    });
    // v1.5.68: 在退出前做 WAL checkpoint — 避免进程被 kill 时 WAL 未刷盘，
    // 下次启动时虽然 initDb 会尝试恢复，但提前 checkpoint 可以减少数据丢失风险。
    // pywebview 端在 stop_server() 中通过 os.killpg(SIGTERM) 触发本流程。
    // v4.0: checkpoint 后安全关闭数据库连接，确保所有数据刷入磁盘
    try {
      const dbInstance = initDb();
      const ckpt = dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      logger.info('[Server] ✅ WAL checkpoint 完成:', JSON.stringify(ckpt));
      dbInstance.close();
      logger.info('[Server] ✅ 数据库连接已安全关闭');
    } catch (err) {
      logger.warn('[Server] WAL checkpoint 失败:', err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
});

// 异步批量审查预置技能（不阻塞启动，延迟 5 秒执行）
setTimeout(() => {
  batchAuditSkills().catch((e: Error) => logger.error('[Startup] 批量审查失败:', e));
}, 5000);

// v8.7: error 监听器已移至 server.listen() 之前（第 220 行），此处删除重复监听器
