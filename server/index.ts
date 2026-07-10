import { initSentry } from './sentry.js';
initSentry();

// 端到端性能采集：记录后端启动总耗时起点
import { recordBackendPhase } from './performance/performanceStore.js';
const serverStartupStartedAt = performance.now();

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { AppPaths } from './config/appPaths.js';
import { setServerPort } from './config/serverConfig.js';
import { API_PREFIX } from './apiVersion.js';
import { apiVersionMiddleware } from './middleware/apiVersionMiddleware.js';
import { initDb, getDb } from './db.js';
import { ensureWmsTables } from './dao/wmsSkillDao.js';
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

import { startMemoryMonitor } from './logging/diagnostic-memory.js';

// Core routes (sync — high-frequency)
import chatRouter from './routes/chat.js';
import sessionsRouter from './routes/sessions.js';
import foldersRouter from './routes/folders.js';
import eventsRouter from './routes/events.js';
import uploadRouter, { UPLOADS_DIR, ensureUploadsDir } from './routes/upload.js';
import healthRouter from './routes/health.js';
import healthEnhancedRouter from './routes/healthEnhanced.js';
import performanceRouter from './routes/performance.js';
import agentsRouter from './routes/agents.js';
import agentChatRouter from './routes/agentChat.js';

// Business data routes (lazy — on-demand loading)
// import warehousesRouter from './routes/warehouses.js'; → lazyRouter
// import inventoryRouter from './routes/inventory.js'; → lazyRouter
// import transitRouter from './routes/transit.js'; → lazyRouter
// import inboundRouter from './routes/inbound.js'; → lazyRouter
// import outboundRouter from './routes/outbound.js'; → lazyRouter
// import partnersRouter from './routes/partners.js'; → lazyRouter
// import transferOrderRouter from './routes/transfer.js'; → lazyRouter
// import skillsRouter from './routes/skills.js'; → lazyRouter
// import settingsRouter from './routes/settings.js'; → lazyRouter
// import migrateRouter from './routes/migrate.js'; → lazyRouter
// import chainRoutes from './routes/chainRoutes.js'; → lazyRouter
// import automationRoutes from './routes/automation.js'; → lazyRouter
// import triggerRoutes from './routes/trigger.js'; → lazyRouter

// Projects & Tasks routes (lazy)
// import projectsRouter from './routes/projects.js'; → lazyRouter
// import tasksRouter from './routes/tasks.js'; → lazyRouter

// WMS skill routes (lazy)
// import wmsQualityRoutes from './routes/wms-quality.js'; → lazyRouter
// import wmsInventoryRoutes from './routes/wms-inventory.js'; → lazyRouter
// import wmsOutboundRoutes from './routes/wms-outbound.js'; → lazyRouter
// import wmsAlertRoutes from './routes/wms-alert.js'; → lazyRouter
// import wmsReportRoutes from './routes/wms-report.js'; → lazyRouter
// import wmsReplenishmentRoutes from './routes/wms-replenishment.js'; → lazyRouter

// Semantic matching routes (lazy)
// import matchingRoutes from './routes/matching.js'; → lazyRouter

// Model management routes (lazy)
// import modelsRoutes from './routes/models.js'; → lazyRouter

// Inventory NL-Query route (lazy)
// import inventoryNlQueryRouter from './routes/inventory-nl-query.js'; → lazyRouter

// Memory routes (lazy)
// import memoryRouter from './routes/memory.js'; → lazyRouter

// Inventory transactions routes (lazy)
// import inventoryTransactionsRouter from './routes/inventory-transactions.js'; → lazyRouter

// Services
import './services/chainExecutor.js'; // side-effect: registers chain event handlers
import { batchAuditSkills } from './services/securityAuditor.js';
import { initMatchingEngine } from './services/matchingService.js';
import { syncModelsFromApi, loadModelsConfig } from './modelsStore.js';
import { channelHealthMonitor } from './services/channelHealthMonitor.js';
import { configHotReload } from './services/configHotReload.js';

// Automation Engine v2.0
import { startEngine } from './engine/engine.js';

// Trigger Engine v2.0 (触发器系统)
import { startTriggerEngine, stopTriggerEngine } from './engine/triggerEngine.js';
import { initTriggerManager } from './engine/triggerManager.js';
import { startEventListener, stopEventListener } from './engine/eventListener.js';

// v3.0: Plugin & API Domain Whitelist routes (延迟加载)
// import pluginsRouter from './routes/plugins.js';        → lazyRouter
// import apiDomainWhitelistRouter from './routes/apiDomainWhitelist.js'; → lazyRouter

// v3.0: Browser routes (延迟加载)
// import browserRouter from './routes/browser.js';       → lazyRouter
// import browserProfilesRouter from './routes/browserProfiles.js'; → lazyRouter

// v3.0: PDF, LSP, File, Webhook routes (延迟加载)
// import pdfRouter from './routes/pdf.js';               → lazyRouter
// import lspRouter from './routes/lsp.js';               → lazyRouter
// import fileRouter from './routes/file.js';             → lazyRouter
// import webhookRouter from './routes/webhook.js';       → lazyRouter

// v3.0: API Templates/Credentials/History routes (延迟加载)
// import apiTemplatesRouter from './routes/apiTemplates.js';   → lazyRouter
// import apiCredentialsRouter from './routes/apiCredentials.js'; → lazyRouter
// import apiHistoryRouter from './routes/apiHistory.js';       → lazyRouter

// v3.0: Plugin Registry
import { pluginRegistry } from './engine/pluginRegistry.js';
import { listPluginTools } from './engine/toolRegistry.js';

// v4.1: Channel Registry（飞书、企业微信等内置通道）
import { registerBuiltinChannels } from './channels/index.js';

// v3.0: BrowserHost Client（延迟启动，首次使用时自动启动）
import { stopBrowserHost } from './services/browserHostClient.js';

// v4.0: MCP Client Manager (mcpClientManager 保留同步导入，路由延迟加载)
import { mcpClientManager } from './engine/mcpClientManager.js';
// mcpRouter → lazyRouter

// v4.0: Image Generation (延迟加载)
// imageGenerationRouter → lazyRouter

// v9.0: Event Ledger (事件溯源查询，延迟加载)
// eventLedgerRouter → lazyRouter

// Goals & Wiki & Secrets & WebSearch routes (延迟加载)
// goalsRouter, wikiRouter, secretsRouter, webSearchRouter → lazyRouter

// System Permissions (延迟加载)
// permissionsRouter → lazyRouter

// Soul Rules (人格规则管理，路由延迟加载)
import soulWatcher from './engine/soul/watcher.js';
// soulRouter → lazyRouter

// Git integration routes (延迟加载)
// gitRouter → lazyRouter

// v11.0: Workflow & Skill Workshop routes (延迟加载)
// workflowRouter, skillWorkshopRouter, codeIndexRouter, templatesRouter, executionHistoryRouter → lazyRouter
// contextEngineRouter → lazyRouter

// v10.0: Gateway (API 兼容网关)
import gatewayRouter from './gateway/gateway.js';
import { configureGatewayAuth, addApiKey, generateDevApiKey } from './gateway/gatewayAuth.js';
import { registerGatewayRoutes } from './gateway/gatewayRoutes.js';

// v6.0: Session Lifecycle Manager (改为异步导入，仅在启动完成后使用)
// import { sessionLifecycleManager } from './services/sessionLifecycle.js';

// v7.0: Message Queue (队列与并发控制)
import { messageQueue } from './engine/messageQueue.js';
// v10.0: AttemptRunner (统一 attempt 调度器)
import { getAttemptRunner } from './engine/attemptRunner.js';
// v11.0: 跨进程文件锁
import { startWatchdog, stopWatchdog, releaseAllHeldLocks } from './storage/sessionWriteLock.js';
import { logger } from './logger.js';
import { extensionLoader } from '../extensions/index.js';

// 轻量入口：延迟加载工具（参照 openclaw gateway/server.ts 设计）
import { lazyRouter } from './utils/lazyRouter.js';

// TimerManager (定时器统一管理)
import { TimerManager } from './core/timerManager.js';

// v9.0: Event Ledger (事件溯源)
import { initEventLedger, getEventLedger } from './engine/eventLedger.js';

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

// v1.9.4: 非关键服务延迟初始化（OpenClaw 风格轻量启动）
// 这些服务在启动时不需要立即就绪，延迟初始化可减少启动时间
setTimeout(() => {
  skillWatcher.init();
  logger.info('[SkillWatcher] 已延迟初始化');
}, 100);

setTimeout(() => {
  soulWatcher.init();
  logger.info('[SoulWatcher] 已延迟初始化');
}, 200);

setTimeout(() => {
  channelHealthMonitor.start();
  logger.info('[ChannelHealth] 已延迟启动');
}, 300);

setTimeout(() => {
  configHotReload.start([AppPaths.modelsFile]);
  logger.info('[ConfigHotReload] 已延迟启动');
}, 400);

// ========== Core API Routes (sync) ==========

app.use('/api', chatRouter);
app.use('/api', agentChatRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/folders', foldersRouter);
app.use('/api', eventsRouter);
app.use('/api/health', healthRouter);
app.use('/api/health', healthEnhancedRouter);
app.use('/api/agents', agentsRouter);

// ========== Business Data API Routes (lazy — on-demand loading) ==========

app.use('/api/warehouses', lazyRouter(() => import('./routes/warehouses.js'), undefined, 'warehouses'));
app.use('/api/inventory', lazyRouter(() => import('./routes/inventory.js'), undefined, 'inventory'));
app.use('/api/transit-orders', lazyRouter(() => import('./routes/transit.js'), undefined, 'transit'));
app.use('/api/inbound-records', lazyRouter(() => import('./routes/inbound.js'), undefined, 'inbound'));
app.use('/api/outbound-records', lazyRouter(() => import('./routes/outbound.js'), undefined, 'outbound'));
app.use('/api/transfer-orders', lazyRouter(() => import('./routes/transfer.js'), undefined, 'transfer'));
app.use('/api/partners', lazyRouter(() => import('./routes/partners.js'), undefined, 'partners'));
app.use('/api', lazyRouter(() => import('./routes/skills.js'), undefined, 'skills'));
app.use('/api/app-settings', lazyRouter(() => import('./routes/settings.js'), undefined, 'settings'));
app.use('/api/migrate', lazyRouter(() => import('./routes/migrate.js'), undefined, 'migrate'));

// Projects & Tasks routes (lazy)
app.use('/api/projects', lazyRouter(() => import('./routes/projects.js'), undefined, 'projects'));
app.use('/api/tasks', lazyRouter(() => import('./routes/tasks.js'), undefined, 'tasks'));

// Automation webhook routes (lazy)
app.use('/api/automation', lazyRouter(() => import('./routes/automation.js'), undefined, 'automation'));

// Trigger routes (lazy)
app.use('/api/triggers', lazyRouter(() => import('./routes/trigger.js'), undefined, 'triggers'));

// Skill chain routes (lazy)
app.use('/api/skill-chains', lazyRouter(() => import('./routes/chainRoutes.js'), undefined, 'skill-chains'));
app.use('/api/chain-executions', lazyRouter(() => import('./routes/chainRoutes.js'), undefined, 'chain-executions'));

// WMS skill routes (lazy)
app.use('/api/wms/quality', lazyRouter(() => import('./routes/wms-quality.js'), undefined, 'wms-quality'));
app.use('/api/wms/inventory-count', lazyRouter(() => import('./routes/wms-inventory.js'), undefined, 'wms-inventory'));
app.use('/api/wms/outbound-review', lazyRouter(() => import('./routes/wms-outbound.js'), undefined, 'wms-outbound'));
app.use('/api/wms/alerts', lazyRouter(() => import('./routes/wms-alert.js'), undefined, 'wms-alert'));
app.use('/api/wms/reports', lazyRouter(() => import('./routes/wms-report.js'), undefined, 'wms-report'));
app.use('/api/wms/replenishment', lazyRouter(() => import('./routes/wms-replenishment.js'), undefined, 'wms-replenishment'));

// Semantic matching engine routes (lazy)
app.use('/api/matching', lazyRouter(() => import('./routes/matching.js'), undefined, 'matching'));

// Model management routes (lazy)
app.use('/api/models', lazyRouter(() => import('./routes/models.js'), undefined, 'models'));

// Inventory NL-Query route (lazy)
app.use('/api/inventory', lazyRouter(() => import('./routes/inventory-nl-query.js'), undefined, 'inventory-nl-query'));

// Memory routes (lazy)
app.use('/api/memory', lazyRouter(() => import('./routes/memory.js'), undefined, 'memory'));

// Inventory transactions routes (lazy)
app.use('/api/inventory-transactions', lazyRouter(() => import('./routes/inventory-transactions.js'), undefined, 'inventory-transactions'));

// ========== v3.0+: 低频路由延迟加载（参照 openclaw 轻量入口设计） ==========
// 这些路由在首次请求时才动态 import，减少启动时间和内存占用
app.use('/api/plugins', lazyRouter(() => import('./routes/plugins.js'), undefined, 'plugins'));
app.use('/api/extensions', lazyRouter(() => import('./routes/extensions.js'), undefined, 'extensions'));
app.use('/api/message-lifecycle', lazyRouter(() => import('./routes/message-lifecycle.js'), undefined, 'message-lifecycle'));
app.use('/api/metrics', lazyRouter(() => import('./routes/metrics.js'), undefined, 'metrics'));
app.use('/api/performance', performanceRouter);
app.use('/api/audit', lazyRouter(() => import('./routes/audit.js'), undefined, 'audit'));
app.use('/api/apikeys', lazyRouter(() => import('./routes/apikeys.js'), undefined, 'apikeys'));
app.use('/api/api-domain-whitelist', lazyRouter(() => import('./routes/apiDomainWhitelist.js'), undefined, 'api-domain-whitelist'));
app.use('/api/browser', lazyRouter(() => import('./routes/browser.js'), undefined, 'browser'));
app.use('/api/browser/profiles', lazyRouter(() => import('./routes/browserProfiles.js'), undefined, 'browser-profiles'));
app.use('/api/pdf', lazyRouter(() => import('./routes/pdf.js'), undefined, 'pdf'));
app.use('/api/lsp', lazyRouter(() => import('./routes/lsp.js'), undefined, 'lsp'));
app.use('/api/file', lazyRouter(() => import('./routes/file.js'), undefined, 'file'));
app.use('/api/webhook', lazyRouter(() => import('./routes/webhook.js'), undefined, 'webhook'));
app.use('/api/webhook/channels', lazyRouter(() => import('./routes/channel-webhook.js'), undefined, 'channel-webhook'));
app.use('/api/api-templates', lazyRouter(() => import('./routes/apiTemplates.js'), undefined, 'api-templates'));
app.use('/api/api-credentials', lazyRouter(() => import('./routes/apiCredentials.js'), undefined, 'api-credentials'));
app.use('/api/api-history', lazyRouter(() => import('./routes/apiHistory.js'), undefined, 'api-history'));
app.use('/api/mcp', lazyRouter(() => import('./routes/mcp.js'), undefined, 'mcp'));
app.use('/api/image-generation', lazyRouter(() => import('./routes/image-generation.js'), undefined, 'image-generation'));
app.use('/api/event-ledger', lazyRouter(() => import('./routes/eventLedger.js'), undefined, 'event-ledger'));
app.use('/api/goals', lazyRouter(() => import('./routes/goalsService.js'), undefined, 'goals'));
app.use('/api/wiki', lazyRouter(() => import('./routes/wikiService.js'), undefined, 'wiki'));
app.use('/api/secrets', lazyRouter(() => import('./routes/secretsService.js'), undefined, 'secrets'));
app.use('/api/web-search', lazyRouter(() => import('./routes/webSearchService.js'), undefined, 'web-search'));
app.use('/api/soul', lazyRouter(() => import('./routes/soul.js'), undefined, 'soul'));
app.use('/api/git', lazyRouter(() => import('./routes/git.js'), undefined, 'git'));
app.use('/api/workflow', lazyRouter(() => import('./routes/workflow.js'), undefined, 'workflow'));
app.use('/api/skill-workshop', lazyRouter(() => import('./routes/skillWorkshop.js'), undefined, 'skill-workshop'));
app.use('/api/code-index', lazyRouter(() => import('./routes/codeIndex.js'), undefined, 'code-index'));
app.use('/api/templates', lazyRouter(() => import('./routes/templates.js'), undefined, 'templates'));
app.use('/api/execution-history', lazyRouter(() => import('./routes/executionHistory.js'), undefined, 'execution-history'));
app.use('/api/context-engine', lazyRouter(() => import('./routes/contextEngine.js'), m => m.contextEngineRouter, 'context-engine'));
// P2-8: 语音对话配置与通道管理
app.use('/api/talk', lazyRouter(() => import('./routes/talk.js'), undefined, 'talk'));
app.use('/api/channels', lazyRouter(() => import('./routes/channels.js'), undefined, 'channels'));
app.use('/api/cache', lazyRouter(() => import('./routes/cache.js'), undefined, 'cache'));
app.use('/api/keyword-trigger', lazyRouter(() => import('./routes/keywordTrigger.js'), undefined, 'keyword-trigger'));

// ========== v10.0: Gateway Routes (OpenAI/MCP 兼容) ==========
// 从环境变量或配置文件读取 API Keys
const gatewayApiKeys = (process.env.GATEWAY_API_KEYS || '').split(',').filter(Boolean);
if (gatewayApiKeys.length > 0) {
  configureGatewayAuth({ apiKeys: gatewayApiKeys });
  logger.info(`[Gateway] 已加载 ${gatewayApiKeys.length} 个 API Keys`);
} else {
  // 开发模式：生成一个临时的 API Key
  const devKey = generateDevApiKey();
  addApiKey(devKey);
  logger.info(`[Gateway] 开发模式 API Key: ${devKey}`);
}

app.use('/v1', gatewayRouter);           // OpenAI 兼容 API: /v1/chat/completions, /v1/models
app.use('/gateway', gatewayRouter);       // Gateway 专属端点: /gateway/health

// v10.1: Gateway Server Routes (方法注册中心 + REST API)
registerGatewayRoutes(app);

// ========== Versioned API Routes (v1) ==========
// All routes are also mounted under /api/v1 for versioned access
app.use(`${API_PREFIX}`, chatRouter);
app.use(`${API_PREFIX}/sessions`, sessionsRouter);
app.use(`${API_PREFIX}/folders`, foldersRouter);
app.use(`${API_PREFIX}`, eventsRouter);
app.use(`${API_PREFIX}/health`, healthRouter);
app.use(`${API_PREFIX}/health`, healthEnhancedRouter);
app.use(`${API_PREFIX}/agents`, agentsRouter);
app.use(`${API_PREFIX}/memory`, lazyRouter(() => import('./routes/memory.js'), undefined, 'memory'));
app.use(`${API_PREFIX}/inventory-transactions`, lazyRouter(() => import('./routes/inventory-transactions.js'), undefined, 'inventory-transactions'));
app.use(`${API_PREFIX}/warehouses`, lazyRouter(() => import('./routes/warehouses.js'), undefined, 'warehouses'));
app.use(`${API_PREFIX}/inventory`, lazyRouter(() => import('./routes/inventory.js'), undefined, 'inventory'));
app.use(`${API_PREFIX}/transit-orders`, lazyRouter(() => import('./routes/transit.js'), undefined, 'transit'));
app.use(`${API_PREFIX}/inbound-records`, lazyRouter(() => import('./routes/inbound.js'), undefined, 'inbound'));
app.use(`${API_PREFIX}/outbound-records`, lazyRouter(() => import('./routes/outbound.js'), undefined, 'outbound'));
app.use(`${API_PREFIX}/transfer-orders`, lazyRouter(() => import('./routes/transfer.js'), undefined, 'transfer'));
app.use(`${API_PREFIX}/partners`, lazyRouter(() => import('./routes/partners.js'), undefined, 'partners'));
app.use(`${API_PREFIX}`, lazyRouter(() => import('./routes/skills.js'), undefined, 'skills'));
app.use(`${API_PREFIX}/app-settings`, lazyRouter(() => import('./routes/settings.js'), undefined, 'settings'));
app.use(`${API_PREFIX}/migrate`, lazyRouter(() => import('./routes/migrate.js'), undefined, 'migrate'));
app.use(`${API_PREFIX}/projects`, lazyRouter(() => import('./routes/projects.js'), undefined, 'projects'));
app.use(`${API_PREFIX}/tasks`, lazyRouter(() => import('./routes/tasks.js'), undefined, 'tasks'));
app.use(`${API_PREFIX}/automation`, lazyRouter(() => import('./routes/automation.js'), undefined, 'automation'));
app.use(`${API_PREFIX}/skill-chains`, lazyRouter(() => import('./routes/chainRoutes.js'), undefined, 'skill-chains'));
app.use(`${API_PREFIX}/chain-executions`, lazyRouter(() => import('./routes/chainRoutes.js'), undefined, 'chain-executions'));
app.use(`${API_PREFIX}/wms/quality`, lazyRouter(() => import('./routes/wms-quality.js'), undefined, 'wms-quality'));
app.use(`${API_PREFIX}/wms/inventory-count`, lazyRouter(() => import('./routes/wms-inventory.js'), undefined, 'wms-inventory'));
app.use(`${API_PREFIX}/wms/outbound-review`, lazyRouter(() => import('./routes/wms-outbound.js'), undefined, 'wms-outbound'));
app.use(`${API_PREFIX}/wms/alerts`, lazyRouter(() => import('./routes/wms-alert.js'), undefined, 'wms-alert'));
app.use(`${API_PREFIX}/wms/reports`, lazyRouter(() => import('./routes/wms-report.js'), undefined, 'wms-report'));
app.use(`${API_PREFIX}/wms/replenishment`, lazyRouter(() => import('./routes/wms-replenishment.js'), undefined, 'wms-replenishment'));
app.use(`${API_PREFIX}/matching`, lazyRouter(() => import('./routes/matching.js'), undefined, 'matching'));
app.use(`${API_PREFIX}/models`, lazyRouter(() => import('./routes/models.js'), undefined, 'models'));
app.use(`${API_PREFIX}/inventory`, lazyRouter(() => import('./routes/inventory-nl-query.js'), undefined, 'inventory-nl-query'));
app.use(`${API_PREFIX}/performance`, performanceRouter);
app.use(`${API_PREFIX}/plugins`, lazyRouter(() => import('./routes/plugins.js'), undefined, 'plugins'));
app.use(`${API_PREFIX}/api-domain-whitelist`, lazyRouter(() => import('./routes/apiDomainWhitelist.js'), undefined, 'api-domain-whitelist'));
app.use(`${API_PREFIX}/browser`, lazyRouter(() => import('./routes/browser.js'), undefined, 'browser'));
app.use(`${API_PREFIX}/browser/profiles`, lazyRouter(() => import('./routes/browserProfiles.js'), undefined, 'browser-profiles'));
app.use(`${API_PREFIX}/api-templates`, lazyRouter(() => import('./routes/apiTemplates.js'), undefined, 'api-templates'));
app.use(`${API_PREFIX}/api-credentials`, lazyRouter(() => import('./routes/apiCredentials.js'), undefined, 'api-credentials'));
app.use(`${API_PREFIX}/api-history`, lazyRouter(() => import('./routes/apiHistory.js'), undefined, 'api-history'));
app.use(`${API_PREFIX}/mcp`, lazyRouter(() => import('./routes/mcp.js'), undefined, 'mcp'));
app.use(`${API_PREFIX}/image-generation`, lazyRouter(() => import('./routes/image-generation.js'), undefined, 'image-generation'));
app.use(`${API_PREFIX}/permissions`, lazyRouter(() => import('./routes/permissions.js'), undefined, 'permissions'));
app.use(`${API_PREFIX}/soul`, lazyRouter(() => import('./routes/soul.js'), undefined, 'soul'));
app.use(`${API_PREFIX}/git`, lazyRouter(() => import('./routes/git.js'), undefined, 'git'));

// v11.0: Workflow & Skill Workshop Routes (versioned, 延迟加载)
app.use(`${API_PREFIX}/workflow`, lazyRouter(() => import('./routes/workflow.js'), undefined, 'workflow'));
app.use(`${API_PREFIX}/skill-workshop`, lazyRouter(() => import('./routes/skillWorkshop.js'), undefined, 'skill-workshop'));
app.use(`${API_PREFIX}/code-index`, lazyRouter(() => import('./routes/codeIndex.js'), undefined, 'code-index'));
app.use(`${API_PREFIX}/templates`, lazyRouter(() => import('./routes/templates.js'), undefined, 'templates'));
app.use(`${API_PREFIX}/execution-history`, lazyRouter(() => import('./routes/executionHistory.js'), undefined, 'execution-history'));

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

const PORT = parseInt(process.env.PORT || '3001', 10);

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
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
  setServerPort(actualPort);
  recordBackendPhase('server:http-listen', performance.now() - serverStartupStartedAt);
  logger.info(`CDF Know Clow Chat Server running on port ${actualPort}`);

  const dbInitStart = performance.now();
  const db = initDb();
  recordBackendPhase('server:db-init', performance.now() - dbInitStart);

  // v1.5.203: 预热模型配置缓存（含 Keychain 注入），避免首次 GET /api/models 阻塞
  // 不 await，不阻塞启动流程；失败仅 warn
  loadModelsConfig().catch(e => logger.warn('[Server] 模型缓存预热失败:', e instanceof Error ? e.message : String(e)));

  // 并行初始化 Tool Registry、插件加载和扩展加载器，减少启动阻塞
  const coreInitStart = performance.now();
  await Promise.all([
    initDefaultTools().then(() => {
      logger.info('[Tool Registry] 工具注册完成:', listTools().join(', '));
    }),
    pluginRegistry.loadEnabledPlugins().then(() => {
      const pluginToolNames = listPluginTools();
      if (pluginToolNames.length > 0) {
        logger.info('[Plugin Registry] 插件工具已加载:', pluginToolNames.join(', '));
      }
    }),
    extensionLoader.loadAll().then((count) => {
      logger.info(`[Extension Loader] 扩展加载完成: ${count} 个扩展已加载`);
    }).catch((err) => {
      logger.warn('[Extension Loader] 扩展加载失败（非阻塞）:', err instanceof Error ? err.message : String(err));
    }),
  ]);
  recordBackendPhase('server:core-init', performance.now() - coreInitStart);

  // v4.1: 注册内置通道插件（web、feishu、wecom）
  registerBuiltinChannels();
  logger.info('[Channel Registry] 内置通道已注册');

  // v12.0: 初始化 Doctor 诊断框架的通道注册表
  import('./engine/acp/doctor.js').then(({ initDoctorChannelRegistry }) => {
    import('./channels/index.js').then(({ getGlobalChannelRegistry }) => {
      initDoctorChannelRegistry(getGlobalChannelRegistry);
      logger.info('[Doctor] 通道注册表已初始化');
    });
  }).catch(err => {
    logger.warn('[Server] Doctor 通道注册表初始化失败（非阻塞）:', err instanceof Error ? err.message : String(err));
  });

  // v1.9.4: Agent Registry 和 Soul 文件改为后台初始化，不阻塞启动流程
  setTimeout(() => {
    agentRegistry.initialize();
    logger.info('[AgentRegistry] 已后台初始化');
  }, 0);

  setTimeout(() => {
    initDefaultSoulFiles();
  }, 100);

  // v4.0: 启动时连接所有已启用的 MCP Server（异步，不阻塞主流程）
  setTimeout(async () => {
    try {
      await mcpClientManager.connectAllEnabled();
    } catch (err) {
      logger.error('[McpClientManager] 启动连接失败:', err instanceof Error ? err.message : String(err));
    }
  }, 5000);

  // v3.0: BrowserHost 已改为延迟启动，首次调用 browser tool 时自动启动（节省 ~114MB 内存）

  // 启动消息归档定时任务
  import('./engine/messageArchive.js').then(({ startArchiveScheduler }) => {
    startArchiveScheduler(getDb);
  }).catch(err => {
    logger.warn('[Server] 消息归档调度器启动失败:', err instanceof Error ? err.message : String(err));
  });

  // 自动发现新模型（异步，不阻塞启动）
  setTimeout(() => {
    syncModelsFromApi().catch(e => {
      logger.error('[ModelDiscovery] 启动同步失败:', e);
    });
  }, 5000);

  // 启动内存压力监控（60s 采样间隔）
  startMemoryMonitor(60_000);

  // v1.9.4: WMS 表初始化改为后台执行，不阻塞启动
  setTimeout(() => {
    ensureWmsTables();
    logger.info('[WMS] 行业技能表已后台初始化');
  }, 500);

  // 端到端性能采集：后端启动完成
  recordBackendPhase('server:startup-complete', performance.now() - serverStartupStartedAt);

  // v9.0: 初始化 Event Ledger (事件溯源) — 后台执行，不阻塞启动
  // 事件账本是辅助系统，延迟初始化不影响核心功能
  initEventLedger()
    .then(async () => {
      const ledgerStats = await getEventLedger().getStats();
      logger.info(
        `[EventLedger] 初始化完成: ${ledgerStats.totalSessions} 个会话, ` +
        `${ledgerStats.totalEvents} 个事件, ` +
        `${(ledgerStats.dbSizeBytes / 1024 / 1024).toFixed(2)} MB`
      );

      // 检查并恢复不完整的会话（崩溃恢复）
      const incompleteSessions = await getEventLedger().findIncompleteSessions();
      if (incompleteSessions.length > 0) {
        logger.warn(
          `[EventLedger] 发现 ${incompleteSessions.length} 个不完整会话，正在标记恢复...`
        );
        for (const session of incompleteSessions) {
          try {
            await getEventLedger().markSessionIncomplete(
              session.sessionId,
              `恢复自上次中断，最后事件: ${session.lastEventType}`
            );
          } catch (e) {
            logger.warn(`[EventLedger] 标记会话失败: ${session.sessionId}`, e);
          }
        }
        logger.info(`[EventLedger] 崩溃恢复完成`);
      }
    })
    .catch(err => {
      logger.warn('[EventLedger] 初始化失败，继续运行中:', err instanceof Error ? err.message : String(err));
    });

  // 初始化语义匹配引擎（延迟 15s，ONNX 预热已异步开始，缩短等待时间）
  setTimeout(async () => {
    try {
      const stats = await initMatchingEngine();
      logger.info(`[Matching] 嵌入初始化完成: total=${stats.embeddingStats.total}, new=${stats.embeddingStats.newCount}, updated=${stats.embeddingStats.updatedCount}, skipped=${stats.embeddingStats.skippedCount}`);
    } catch (e) {
      logger.error('[Matching] 嵌入初始化失败:', e);
    }
  }, 15_000).unref();

  // 启动自动化引擎 v2.0（30s 轮询）
  const { stop } = startEngine(30_000);

  // 启动触发器引擎 v2.0（触发器系统）
  startTriggerEngine();
  initTriggerManager();
  startEventListener();

  // v6.0: 启动会话生命周期管理器（空闲归档 + 每日重置）— 异步导入，不阻塞启动
  import('./services/sessionLifecycle.js').then(({ sessionLifecycleManager }) => {
    sessionLifecycleManager.start();
    logger.info('[SessionLifecycle] 已启动');
  }).catch(err => {
    logger.warn('[SessionLifecycle] 启动失败:', err instanceof Error ? err.message : String(err));
  });

  // v7.0: 启动消息队列（空闲会话清理 + 全局并发度控制）
  messageQueue.start();

  // v10.0: 启动 AttemptRunner（统一 attempt 调度器，已完成 attempt 自动清理）
  getAttemptRunner().start();

  // v11.0: 启动文件锁 watchdog（定期清理过期锁）
  startWatchdog();

  // v12.0: 注册 ACP ChatService runtime backend（统一聊天框架接入 ACP 引擎）
  import('./engine/acp/chatServiceRuntime.js').then(({ registerChatServiceRuntime }) => {
    registerChatServiceRuntime();
  }).catch(err => {
    logger.warn('[Server] ACP ChatService runtime 注册失败（非阻塞）:', err instanceof Error ? err.message : String(err));
  });

  // P0: 启动时异步预热 ONNX 模型 + 语义路由意图锚点，避免首次 chat 请求阻塞
  // 串联执行：先就绪 ONNX 会话，再预热意图锚点（Auto Model v2.0 意图维度的 embedding 分类用）。
  // 两者均非阻塞、失败仅 warn，不影响核心启动流程。
  import('./engine/onnxEmbedding.js').then(({ initOnnxEmbedding }) => initOnnxEmbedding())
    .then(() => import('./routes/modelSelector.js').then(({ warmupIntentAnchors }) => warmupIntentAnchors()))
    .catch(err => {
      logger.warn('[Server] ONNX / 语义路由意图锚点预热失败（非阻塞）:', err instanceof Error ? err.message : String(err));
    });

  // 绑定优雅关闭 — 在进程退出时停止引擎
  const gracefulShutdown = () => {
    logger.info('[Server] 正在关闭自动化引擎...');
    stop();
    // v2.0: 停止触发器引擎和事件监听器
    stopTriggerEngine();
    stopEventListener();
    // v6.0: 停止会话生命周期守护 — 异步导入
    import('./services/sessionLifecycle.js').then(({ sessionLifecycleManager }) => {
      sessionLifecycleManager.stop();
    }).catch(() => {});
    // v7.0: 停止消息队列
    messageQueue.stop();
    // v10.0: 停止 AttemptRunner
    getAttemptRunner().stop();
    // v11.0: 停止 watchdog 并释放所有持有的文件锁
    stopWatchdog();
    releaseAllHeldLocks();
    // 清理所有 TimerManager 管理的定时器
    const timerCount = TimerManager.clearAll();
    logger.info(`[Server] 已清理 ${timerCount} 个定时器`);
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
