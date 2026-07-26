/**
 * StaffDeck Feedback Routes — /api/staffdeck/feedback
 *
 * 端点：
 *   GET  /summary               反馈汇总统计
 *   GET  /sessions              有反馈的会话列表
 *   GET  /sessions/:session_id  单会话反馈详情
 *   POST /:feedback_id/reanalyze 重新分析反馈（stub）
 *
 * 响应格式统一为 { code, data, message }
 */
import { Router, type Request, type Response } from 'express';
import {
  listMessageFeedback,
  getMessageFeedbackById,
  resetFeedbackAnalysis,
  updateMessageFeedbackAnalysis,
  computeFeedbackSummary,
  feedbackAnalysisRead,
  FEEDBACK_BUCKET_LABELS,
} from '../../dao/staff/staffFeedbackDao.js';
import {
  listSessions,
  getSessionById,
  toSessionRead,
  listMessagesBySession,
  toMessageRead,
  getMessageById,
} from '../../dao/staff/staffSessionDao.js';
import { getUserById } from '../../dao/staff/staffAuthDao.js';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';

const router = Router();

// ===================== GET /api/staffdeck/feedback/summary =====================

router.get('/summary', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, limitRaw)) : 1000;

  // 先取该用户拥有的全部 session_id
  const sessions = listSessions({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    agentId,
  });
  if (sessions.length === 0) {
    res.json({
      code: 0,
      data: computeFeedbackSummary([]),
      message: 'ok',
    });
    return;
  }
  const sessionIdSet = new Set(sessions.map((s) => s.id));

  // 取该用户全部反馈，按 session 过滤
  const allFeedback = listMessageFeedback({
    tenantId: ctx.tenantId,
    limit,
  });
  const ownedFeedback = allFeedback.filter((f) => sessionIdSet.has(f.session_id));

  res.json({ code: 0, data: computeFeedbackSummary(ownedFeedback), message: 'ok' });
});

// ===================== GET /api/staffdeck/feedback/sessions =====================

router.get('/sessions', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const rating = typeof req.query.rating === 'string' ? req.query.rating : 'down';
  const agentId = typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
  const limitRaw = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, limitRaw)) : 200;

  const sessions = listSessions({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    agentId,
  });
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  if (sessions.length === 0) {
    res.json({ code: 0, data: [], message: 'ok' });
    return;
  }

  const feedbackRows = listMessageFeedback({
    tenantId: ctx.tenantId,
    rating,
    limit,
  });

  // 按 session_id 分组，仅保留属于当前用户的
  const grouped = new Map<string, typeof feedbackRows>();
  for (const row of feedbackRows) {
    if (!sessionMap.has(row.session_id)) continue;
    const arr = grouped.get(row.session_id) ?? [];
    arr.push(row);
    grouped.set(row.session_id, arr);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const [sessionId, rows] of grouped) {
    const session = sessionMap.get(sessionId);
    if (!session) continue;
    const latest = rows.reduce((a, b) => (b.updated_at > a.updated_at ? b : a), rows[0]);
    const latestAnalysis = feedbackAnalysisRead(latest);
    const latestMessage = getMessageById(ctx.tenantId, latest.message_id);
    const user = session.user_id ? getUserById(ctx.tenantId, session.user_id) : undefined;
    const downRows = rows.filter((r) => r.rating === 'down');
    const bucketCountsMap = new Map<string, number>();
    for (const r of downRows) {
      const bucket = r.analysis_bucket ?? 'unknown';
      bucketCountsMap.set(bucket, (bucketCountsMap.get(bucket) ?? 0) + 1);
    }
    let primaryBucket: string | null = null;
    if (bucketCountsMap.size > 0) {
      let maxCount = 0;
      for (const [bucket, count] of bucketCountsMap) {
        if (count > maxCount) {
          maxCount = count;
          primaryBucket = bucket;
        }
      }
    }
    results.push({
      session_id: session.id,
      tenant_id: session.tenant_id,
      agent_id: session.agent_id,
      user_id: session.user_id,
      username: user ? user.username : null,
      display_name: user ? user.display_name : null,
      title: session.title,
      summary: session.summary,
      status: session.status,
      feedback_count: rows.length,
      latest_feedback_at: latest.updated_at,
      latest_message_id: latest.message_id,
      latest_message: latestMessage ? latestMessage.content : '',
      analysis_status: latestAnalysis.status,
      analysis_bucket: latestAnalysis.bucket,
      analysis_bucket_label: latestAnalysis.bucket_label,
      analysis_summary: latestAnalysis.summary,
      primary_bucket: primaryBucket,
      primary_bucket_label: primaryBucket
        ? FEEDBACK_BUCKET_LABELS[primaryBucket] ?? primaryBucket
        : null,
      bucket_counts: Object.fromEntries(bucketCountsMap),
      updated_at: session.updated_at,
    });
  }

  // 按 latest_feedback_at 降序
  results.sort(
    (a, b) =>
      (b.latest_feedback_at as number) - (a.latest_feedback_at as number),
  );
  res.json({ code: 0, data: results, message: 'ok' });
});

// ===================== GET /api/staffdeck/feedback/sessions/:session_id =====================

router.get('/sessions/:session_id', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const sessionId = req.params.session_id;

  const session = getSessionById(ctx.tenantId, sessionId);
  if (!session || session.user_id !== ctx.userId) {
    res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    return;
  }

  const messages = listMessagesBySession(ctx.tenantId, sessionId);
  const feedbackRows = listMessageFeedback({
    tenantId: ctx.tenantId,
    sessionId,
    limit: 1000,
  });
  const feedbackByMessage = new Map(feedbackRows.map((f) => [f.message_id, f]));
  const user = session.user_id ? getUserById(ctx.tenantId, session.user_id) : undefined;

  const messagesWithFeedback = messages.map((m) => {
    const feedback = feedbackByMessage.get(m.id);
    const read = toMessageRead(m);
    if (feedback) {
      return {
        ...read,
        feedback_id: feedback.id,
        feedback_updated_at: feedback.updated_at,
        feedback_analysis: feedbackAnalysisRead(feedback),
        feedback_rating: feedback.rating,
      };
    }
    return read;
  });

  const feedbackRead = feedbackRows.map((row) => ({
    id: row.id,
    message_id: row.message_id,
    user_id: row.user_id,
    rating: row.rating,
    analysis: feedbackAnalysisRead(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  res.json({
    code: 0,
    data: {
      session: {
        ...toSessionRead(session),
        username: user ? user.username : null,
        display_name: user ? user.display_name : null,
      },
      messages: messagesWithFeedback,
      feedback: feedbackRead,
    },
    message: 'ok',
  });
});

// ===================== POST /api/staffdeck/feedback/:feedback_id/reanalyze =====================

router.post('/:feedback_id/reanalyze', staffAuth, (req: Request, res: Response) => {
  const ctx = getStaffContext(res);
  const feedbackId = req.params.feedback_id;

  const feedback = getMessageFeedbackById(ctx.tenantId, feedbackId);
  if (!feedback) {
    res.status(404).json({ code: 404, data: null, message: 'Feedback not found' });
    return;
  }

  // 校验 session 归属
  const session = getSessionById(ctx.tenantId, feedback.session_id);
  if (!session || session.user_id !== ctx.userId) {
    res.status(404).json({ code: 404, data: null, message: 'Session not found' });
    return;
  }

  // 重置分析状态为 pending
  const reset = resetFeedbackAnalysis(ctx.tenantId, feedbackId);
  if (!reset) {
    res.status(500).json({ code: 500, data: null, message: '重置分析状态失败' });
    return;
  }

  // stub：立即写入一个占位分析结果（开发期不调用 LLM）
  // 生产期此处应触发 LLM 异步分析任务
  const stubJobId = `job_${feedbackId}_${Math.floor(Date.now() / 1000)}`;
  const ts = Math.floor(Date.now() / 1000);
  const analyzed = updateMessageFeedbackAnalysis(ctx.tenantId, feedbackId, {
    analysis_status: 'analyzed',
    analysis_bucket: 'user_random_or_unclear',
    analysis_reason: 'Stub 分析：上下文不足以判断根因。',
    analysis_summary: '已通过 stub 完成重新分析，生产环境应接入 LLM 进行真实归因。',
    analysis_confidence: 0.3,
    analysis_json: {
      stub: true,
      job_id: stubJobId,
      retry_requested_at: ts,
      analyzed_at: ts,
    },
    analyzed_at: ts,
  });

  res.json({
    code: 0,
    data: {
      feedback_id: feedbackId,
      analysis_status: analyzed ? analyzed.analysis_status : 'pending',
      job_id: stubJobId,
      updated_at: analyzed ? analyzed.updated_at : ts,
    },
    message: 'ok',
  });
});

export default router;
