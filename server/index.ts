/* eslint-disable no-console */
import express from 'express';
import { initDb } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import skillWatcher from './services/skillWatcher.js';
import { initDefaultTools, listTools } from './engine/toolRegistry.js';
import { EventEmitter } from 'events';

// v1.5.88: 全局异常兜底 — Node.js v15+ 未处理 rejection 默认崩溃进程
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error('[Process] ⚠️ unhandledRejection:', msg);
  // 不调用 process.exit()，桌面应用保持运行比崩溃更合理
});

process.on('uncaughtException', (err: Error) => {
  console.error('[Process] ❌ uncaughtException:', err.stack || err.message);
  // uncaughtException 通常更严重，但仍保持运行 (Node 文档建议此时进程状态不确定，尽快优雅退出)
  // 对于桌面应用，记录错误并继续运行，避免静默崩溃
  console.error('[Process] 进程状态可能异常，建议重启应用。继续运行中...');
});

// v1.9.2: 工具权限请求全局 EventEmitter
const permissionEmitter = new EventEmitter();

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

import { findByQuery, countByQuery } from './dao/inventoryTransactionDao.js';
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
import inventoryTransactionsRouter from './routes/inventory-transactions.js';

// Services
import { addClient, removeClient } from './services/chainExecutor.js';
import { batchAuditSkills } from './services/securityAuditor.js';
import { initMatchingEngine } from './services/matchingService.js';
import { loadModelsConfig, syncModelsFromApi } from './modelsStore.js';

// Automation Engine v2.0
import { startEngine, stopEngine } from './engine/engine.js';

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
// 静态文件服务：提供已上传文件的访问（必须在 express.json() 之前）
ensureUploadsDir();
app.use('/api/uploads', express.static(UPLOADS_DIR));

// v1.9.3: 上传路由必须在 express.json() 之前，否则 multipart body 会被消耗
app.use('/api/upload', uploadRouter);

app.use(express.json({ limit: '3mb' }));

// 初始化 Skill Watcher
skillWatcher.init();

// ========== Extracted API Routes ==========

app.use('/api', chatRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/memory', memoryRouter);
app.use('/api', eventsRouter);
app.use('/api/health', healthRouter);
app.use('/api/inventory-transactions', inventoryTransactionsRouter);

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

const PORT = 3001;
const server = app.listen(PORT, async () => {
  console.log(`CDF Know Clow Chat Server running on port ${PORT}`);
  const db = initDb();

  // 初始化 Tool Registry
  await initDefaultTools();
  console.log('[Tool Registry] 工具注册完成:', listTools().join(', '));

  // v3.0: 自动加载已启用的插件
  await pluginRegistry.loadEnabledPlugins();
  const pluginToolNames = listPluginTools();
  if (pluginToolNames.length > 0) {
    console.log('[Plugin Registry] 插件工具已加载:', pluginToolNames.join(', '));
  }

  // v4.0: 启动时连接所有已启用的 MCP Server（异步，不阻塞主流程）
  setTimeout(async () => {
    try {
      await mcpClientManager.connectAllEnabled();
    } catch (err) {
      console.error('[McpClientManager] 启动连接失败:', err instanceof Error ? err.message : String(err));
    }
  }, 5000);

  // v3.0: 启动 BrowserHost 进程（异步，不阻塞主流程）
  setTimeout(async () => {
    try {
      const result = await startBrowserHost();
      if (result.ok) {
        const health = await getBrowserHostHealth();
        console.log(`[BrowserHost] 进程已启动, status=${health.status}`);
      } else {
        console.warn(`[BrowserHost] 启动失败: ${result.error} (Browser tools will be unavailable)`);
      }
    } catch (err) {
      console.warn('[BrowserHost] 启动异常:', err instanceof Error ? err.message : String(err));
    }
  }, 3000);

  // 自动发现新模型（异步，不阻塞启动）
  setTimeout(() => {
    syncModelsFromApi().catch(e => {
      console.error('[ModelDiscovery] 启动同步失败:', e);
    });
  }, 5000);

  // 初始化 WMS 行业技能表
  ensureWmsTables(db);

  // 初始化语义匹配引擎（异步，不阻塞启动）
  setTimeout(() => {
    try {
      const stats = initMatchingEngine();
      console.log(`[Matching] 嵌入初始化完成: total=${stats.embeddingStats.total}, new=${stats.embeddingStats.newCount}, updated=${stats.embeddingStats.updatedCount}, skipped=${stats.embeddingStats.skippedCount}`);
    } catch (e) {
      console.error('[Matching] 嵌入初始化失败:', e);
    }
  }, 3000);

  // 启动自动化引擎 v2.0（30s 轮询）
  const { stop } = startEngine(30_000);

  // v6.0: 启动会话生命周期管理器（空闲归档 + 每日重置）
  sessionLifecycleManager.start();

  // v7.0: 启动消息队列（空闲会话清理 + 全局并发度控制）
  messageQueue.start();

  // 绑定优雅关闭 — 在进程退出时停止引擎
  const gracefulShutdown = () => {
    console.log('[Server] 正在关闭自动化引擎...');
    stop();
    // v6.0: 停止会话生命周期守护
    sessionLifecycleManager.stop();
    // v7.0: 停止消息队列
    messageQueue.stop();
    // v3.0: 关闭 BrowserHost 进程
    stopBrowserHost().catch(err => {
      console.warn('[Server] BrowserHost 关闭异常:', err);
    });
    // v4.0: 关闭 MCP Client Manager
    mcpClientManager.shutdown().catch(err => {
      console.warn('[Server] MCP Client Manager 关闭异常:', err);
    });
    // v1.5.68: 在退出前做 WAL checkpoint — 避免进程被 kill 时 WAL 未刷盘，
    // 下次启动时虽然 initDb 会尝试恢复，但提前 checkpoint 可以减少数据丢失风险。
    // pywebview 端在 stop_server() 中通过 os.killpg(SIGTERM) 触发本流程。
    // v4.0: checkpoint 后安全关闭数据库连接，确保所有数据刷入磁盘
    try {
      const dbInstance = initDb();
      const ckpt = dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      console.log('[Server] ✅ WAL checkpoint 完成:', JSON.stringify(ckpt));
      dbInstance.close();
      console.log('[Server] ✅ 数据库连接已安全关闭');
    } catch (err) {
      console.warn('[Server] WAL checkpoint 失败:', err instanceof Error ? err.message : String(err));
    }
    process.exit(0);
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
});

// 异步批量审查预置技能（不阻塞启动，延迟 5 秒执行）
setTimeout(() => {
  batchAuditSkills().catch((e: Error) => console.error('[Startup] 批量审查失败:', e));
}, 5000);

// 端口冲突时优雅退出（让 pywebview 的进程监控 3 秒后重启，彼时端口已释放）
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] ❌ 端口 ${PORT} 已被占用，2 秒后退出并等待重启...`);
    setTimeout(() => process.exit(1), 2000);
  } else {
    console.error('[Server] ❌ 启动失败:', err.message);
    process.exit(1);
  }
});
