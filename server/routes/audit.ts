/**
 * Audit Log REST API — 审计日志端点
 *
 * 提供消息会话审计日志的查询、导出和统计功能。
 */

import { Router } from 'express';
import { messageAuditLog } from '../messaging/audit-log.js';

const router = Router();

// GET /api/audit — 查询审计日志
router.get('/', (req, res) => {
  try {
    const query = {
      sessionKey: req.query.sessionKey as string | undefined,
      messageId: req.query.messageId as string | undefined,
      action: req.query.action as any,
      severity: req.query.severity as any,
      actor: req.query.actor as string | undefined,
      actorType: req.query.actorType as any,
      startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
      endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const result = messageAuditLog.query(query);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `查询审计日志失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/audit/summary — 审计日志统计
router.get('/summary', (_req, res) => {
  try {
    const summary = messageAuditLog.getSummary();
    res.json({ data: summary });
  } catch (e) {
    res.status(500).json({ error: `获取审计统计失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/audit/timeline/:sessionKey — 会话时间线
router.get('/timeline/:sessionKey', (req, res) => {
  try {
    const entries = messageAuditLog.getSessionTimeline(req.params.sessionKey);
    res.json({ data: entries });
  } catch (e) {
    res.status(500).json({ error: `获取会话时间线失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/audit/history/:messageId — 消息历史
router.get('/history/:messageId', (req, res) => {
  try {
    const entries = messageAuditLog.getMessageHistory(req.params.messageId);
    res.json({ data: entries });
  } catch (e) {
    res.status(500).json({ error: `获取消息历史失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/audit/export/json — 导出 JSON
router.get('/export/json', (req, res) => {
  try {
    const json = messageAuditLog.exportToJson(req.query);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.json"`);
    res.send(json);
  } catch (e) {
    res.status(500).json({ error: `导出审计日志失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/audit/export/csv — 导出 CSV
router.get('/export/csv', (req, res) => {
  try {
    const csv = messageAuditLog.exportToCsv(req.query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: `导出审计日志失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
