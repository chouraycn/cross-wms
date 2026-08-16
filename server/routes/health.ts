import { Router } from 'express';
import { t } from '../i18n/translate.js';
import { getAuditViolationCount } from '../engine/auditInvariant.js';

const router = Router();

/**
 * 服务器就绪标记：数据库和核心初始化全部完成后才设为 true。
 * 防止 Swift 原生端健康检查过早通过，导致 WebView 加载页面后
 * 请求 /api/sessions 等接口时因表未创建而报 "no such table: sessions"。
 */
let _serverCoreReady = false;
export function markServerCoreReady(): void {
  _serverCoreReady = true;
}
export function isServerCoreReady(): boolean {
  return _serverCoreReady;
}

router.get('/', (_req, res) => {
  if (!_serverCoreReady) {
    res.status(503).json({
      status: 'initializing',
      time: new Date().toISOString(),
      message: t('server.initializing') || 'Server is initializing...',
    });
    return;
  }
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    message: t('server.ready'),
    auditViolations: getAuditViolationCount(),
  });
});

export default router;
