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

const PORT = 3001;
const server = app.listen(PORT, async () => {
  console.log(`CDF Know Clow Chat Server running on port ${PORT}`);
  const db = initDb();

  // 初始化 Tool Registry
  await initDefaultTools();
  console.log('[Tool Registry] 工具注册完成:', listTools().join(', '));

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
  // 绑定优雅关闭 — 在进程退出时停止引擎
  const gracefulShutdown = () => {
    console.log('[Server] 正在关闭自动化引擎...');
    stop();
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
