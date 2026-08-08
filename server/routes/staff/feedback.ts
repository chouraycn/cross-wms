/**
 * StaffDeck Feedback Routes — /api/staffdeck/feedback
 *
 * 端点：
 *   GET  /summary               反馈汇总统计
 *   GET  /sessions              有反馈的会话列表
 *   GET  /sessions/:session_id  单会话反馈详情
 *   POST /:feedback_id/reanalyze 重新分析反馈（接真实 LLM 归因）
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
import { getDefaultModelConfig } from '../../dao/staff/staffModelConfigDao.js';
import { complete } from '../../engine/llm/index.js';
import { getStaffContext, staffAuth } from '../../middleware/staffAuth.js';

const router = Router();

/** 从 LLM 输出中容错抽取第一个 JSON 对象 */
function parseJsonObject(raw: string): Record<string, any> | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, any>;
  } catch {
    return null;
  }
}

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

  const results: Array<Record<string, any>> = [];
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

router.post('/:feedback_id/reanalyze', staffAuth, async (req: Request, res: Response) => {
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

  const ts = Math.floor(Date.now() / 1000);
  const jobId = `job_${feedbackId}_${ts}`;

  // 真实分析：用默认模型对会话记录 + 评分做根因归因
  try {
    const cfg = getDefaultModelConfig(ctx.tenantId);
    if (!cfg || !cfg.model) {
      throw new Error('未配置可用模型，无法执行真实分析');
    }
    const transcript = listMessagesBySession(ctx.tenantId, feedback.session_id)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n')
      .slice(0, 6000);
    const userPrompt =
      `你是智能客服质检分析助手。下面是一次客服对话记录与用户对该回复的评分（${feedback.rating}）。` +
      `请分析该评分的根因，并严格按 JSON 输出：\n` +
      `{"bucket":"<user_random_or_unclear|agent_error|tool_error|knowledge_gap|other>","reason":"<根因说明>","summary":"<一句话总结>","confidence":<0到1的小数>}\n\n` +
      `对话记录：\n${transcript}`;
    const raw = await complete({
      model: cfg.model,
      messages: [
        { role: 'system', content: '你只输出 JSON，不要输出多余文字。' },
        { role: 'user', content: userPrompt },
      ],
    });
    const parsed = parseJsonObject(raw);
    const bucket = parsed?.bucket ?? 'other';
    const reason = parsed?.reason ?? '（模型未给出明确原因）';
    const summary = parsed?.summary ?? raw.slice(0, 200);
    const confidence = typeof parsed?.confidence === 'number' ? parsed.confidence : 0.5;
    const analyzed = updateMessageFeedbackAnalysis(ctx.tenantId, feedbackId, {
      analysis_status: 'analyzed',
      analysis_bucket: String(bucket),
      analysis_reason: String(reason),
      analysis_summary: String(summary),
      analysis_confidence: Number(confidence),
      analysis_json: { job_id: jobId, analyzed_at: ts, model: cfg.model, raw: raw.slice(0, 1000) },
      analyzed_at: ts,
    });
    res.json({
      code: 0,
      data: {
        feedback_id: feedbackId,
        analysis_status: analyzed ? analyzed.analysis_status : 'analyzed',
        job_id: jobId,
        implemented: true,
        updated_at: analyzed ? analyzed.updated_at : ts,
      },
      message: 'ok',
    });
  } catch (e) {
    // 无模型 / 无 Key / 调用失败：保持 pending，诚实返回未接入真实分析
    const msg = (e as Error).message;
    res.json({
      code: 0,
      data: {
        feedback_id: feedbackId,
        analysis_status: 'pending',
        job_id: jobId,
        implemented: false,
        error: msg,
      },
      message: `真实分析不可用：${msg}`,
    });
  }
});

export default router;
