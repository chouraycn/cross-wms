/**
 * StaffFeedbackDao — sd_message_feedback + sd_skill_feedback 表 CRUD
 *
 * 设计：
 * - JSON 字段 analysis_json 以 TEXT 存储，DAO 负责 serialize/deserialize
 * - 时间字段使用 INTEGER（Unix 秒）
 * - 提供 summary 聚合统计用于 /feedback/summary 端点
 * - reanalyze 重置分析状态为 pending（实际 LLM 分析为 stub）
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type {
  MessageFeedbackRow,
  SkillFeedbackRow,
} from '../../types/staff.js';

const now = (): number => Math.floor(Date.now() / 1000);

// ===================== 反馈分析桶标签 =====================

export const FEEDBACK_BUCKET_LABELS: Record<string, string> = {
  model_issue: '模型问题',
  skill_issue: '技能问题',
  tool_or_system_issue: '工具/系统问题',
  user_random_or_unclear: '用户随意或上下文不足',
  positive_or_resolved: '正向反馈',
  needs_model_analysis: '待模型分析',
  unknown: '未知',
};

// ===================== MessageFeedback =====================

export interface MessageFeedbackListFilter {
  tenantId?: string;
  sessionId?: string;
  userId?: string;
  rating?: string;
  analysisStatus?: string;
  analysisBucket?: string;
  limit?: number;
}

/** 列出 MessageFeedback（按 updated_at 降序） */
export function listMessageFeedback(
  filter: MessageFeedbackListFilter = {},
): MessageFeedbackRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
  if (filter.sessionId) {
    conditions.push('session_id = ?');
    params.push(filter.sessionId);
  }
  if (filter.userId) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  if (filter.rating) {
    conditions.push('rating = ?');
    params.push(filter.rating);
  }
  if (filter.analysisStatus) {
    conditions.push('analysis_status = ?');
    params.push(filter.analysisStatus);
  }
  if (filter.analysisBucket) {
    conditions.push('analysis_bucket = ?');
    params.push(filter.analysisBucket);
  }
  const whereClause = conditions.join(' AND ');
  const limit = filter.limit ?? 1000;
  return db
    .prepare(
      `SELECT * FROM sd_message_feedback WHERE ${whereClause} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...params, limit) as MessageFeedbackRow[];
}

/** 按 id 获取单条反馈 */
export function getMessageFeedbackById(
  tenantId: string,
  feedbackId: string,
): MessageFeedbackRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_message_feedback WHERE tenant_id = ? AND id = ?')
    .get(tenantId, feedbackId) as MessageFeedbackRow | undefined;
}

/** 按 message_id + user_id 获取已有反馈（用于 upsert） */
export function getMessageFeedbackByMessage(
  tenantId: string,
  messageId: string,
  userId: string,
): MessageFeedbackRow | undefined {
  const db = initDb();
  return db
    .prepare(
      'SELECT * FROM sd_message_feedback WHERE tenant_id = ? AND message_id = ? AND user_id = ?',
    )
    .get(tenantId, messageId, userId) as MessageFeedbackRow | undefined;
}

/**
 * 消息反馈 upsert：同一 (tenant, message, user) 唯一约束下，
 * 已存在则更新 rating，不存在则创建。供聊天 👍/👎 端点使用。
 */
export function upsertMessageFeedback(
  input: MessageFeedbackCreateInput,
): MessageFeedbackRow {
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const existing = getMessageFeedbackByMessage(tenantId, input.message_id, input.user_id);
  if (existing) {
    const db = initDb();
    const ts = now();
    db.prepare('UPDATE sd_message_feedback SET rating = ?, updated_at = ? WHERE id = ?').run(
      input.rating,
      ts,
      existing.id,
    );
    return db.prepare('SELECT * FROM sd_message_feedback WHERE id = ?').get(existing.id) as MessageFeedbackRow;
  }
  return createMessageFeedback(input);
}

/** 删除消息反馈（取消点踩/点赞） */
export function deleteMessageFeedback(
  tenantId: string,
  messageId: string,
  userId: string,
): boolean {
  const db = initDb();
  const r = db
    .prepare(
      'DELETE FROM sd_message_feedback WHERE tenant_id = ? AND message_id = ? AND user_id = ?',
    )
    .run(tenantId, messageId, userId);
  return r.changes > 0;
}

export interface MessageFeedbackCreateInput {
  tenant_id?: string;
  session_id: string;
  message_id: string;
  user_id: string;
  rating: string;
}

/** 创建消息反馈（同 tenant+message+user 唯一） */
export function createMessageFeedback(
  input: MessageFeedbackCreateInput,
): MessageFeedbackRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.feedback);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_message_feedback
       (id, tenant_id, session_id, message_id, user_id, rating,
        analysis_status, analysis_bucket, analysis_reason, analysis_summary,
        analysis_confidence, analysis_json, analyzed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, NULL, '{}', NULL, ?, ?)`,
  ).run(id, tenantId, input.session_id, input.message_id, input.user_id, input.rating, ts, ts);
  return db
    .prepare('SELECT * FROM sd_message_feedback WHERE id = ?')
    .get(id) as MessageFeedbackRow;
}

export interface FeedbackAnalysisPatch {
  analysis_status?: string;
  analysis_bucket?: string | null;
  analysis_reason?: string | null;
  analysis_summary?: string | null;
  analysis_confidence?: number | null;
  analysis_json?: Record<string, any>;
  analyzed_at?: number | null;
}

/** 更新反馈分析结果 */
export function updateMessageFeedbackAnalysis(
  tenantId: string,
  feedbackId: string,
  patch: FeedbackAnalysisPatch,
): MessageFeedbackRow | null {
  const db = initDb();
  const existing = getMessageFeedbackById(tenantId, feedbackId);
  if (!existing) return null;
  const ts = now();
  const next: MessageFeedbackRow = {
    ...existing,
    analysis_status: patch.analysis_status ?? existing.analysis_status,
    analysis_bucket: patch.analysis_bucket !== undefined ? patch.analysis_bucket : existing.analysis_bucket,
    analysis_reason: patch.analysis_reason !== undefined ? patch.analysis_reason : existing.analysis_reason,
    analysis_summary: patch.analysis_summary !== undefined ? patch.analysis_summary : existing.analysis_summary,
    analysis_confidence:
      patch.analysis_confidence !== undefined ? patch.analysis_confidence : existing.analysis_confidence,
    analysis_json:
      patch.analysis_json !== undefined ? JSON.stringify(patch.analysis_json) : existing.analysis_json,
    analyzed_at: patch.analyzed_at !== undefined ? patch.analyzed_at : existing.analyzed_at,
    updated_at: ts,
  };
  db.prepare(
    `UPDATE sd_message_feedback
     SET analysis_status = ?, analysis_bucket = ?, analysis_reason = ?, analysis_summary = ?,
         analysis_confidence = ?, analysis_json = ?, analyzed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    next.analysis_status,
    next.analysis_bucket,
    next.analysis_reason,
    next.analysis_summary,
    next.analysis_confidence,
    next.analysis_json,
    next.analyzed_at,
    next.updated_at,
    feedbackId,
  );
  return next;
}

/** 重置反馈分析状态为 pending（用于 reanalyze） */
export function resetFeedbackAnalysis(
  tenantId: string,
  feedbackId: string,
): MessageFeedbackRow | null {
  const ts = now();
  return updateMessageFeedbackAnalysis(tenantId, feedbackId, {
    analysis_status: 'pending',
    analysis_bucket: null,
    analysis_reason: null,
    analysis_summary: null,
    analysis_confidence: null,
    analysis_json: { retry_requested_at: ts },
    analyzed_at: null,
  });
}

// ===================== SkillFeedback =====================

export interface SkillFeedbackListFilter {
  tenantId?: string;
  skillId?: string;
  sessionId?: string;
  userId?: string;
  rating?: string;
  limit?: number;
}

/** 列出 SkillFeedback（按 updated_at 降序） */
export function listSkillFeedback(
  filter: SkillFeedbackListFilter = {},
): SkillFeedbackRow[] {
  const db = initDb();
  const tenantId = filter.tenantId ?? DEFAULT_TENANT_ID;
  const conditions: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];
  if (filter.skillId) {
    conditions.push('skill_id = ?');
    params.push(filter.skillId);
  }
  if (filter.sessionId) {
    conditions.push('session_id = ?');
    params.push(filter.sessionId);
  }
  if (filter.userId) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }
  if (filter.rating) {
    conditions.push('rating = ?');
    params.push(filter.rating);
  }
  const whereClause = conditions.join(' AND ');
  const limit = filter.limit ?? 1000;
  return db
    .prepare(
      `SELECT * FROM sd_skill_feedback WHERE ${whereClause} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...params, limit) as SkillFeedbackRow[];
}

export interface SkillFeedbackCreateInput {
  tenant_id?: string;
  skill_id: string;
  session_id: string;
  message_id: string;
  user_id: string;
  skill_version?: string | null;
  step_id?: string | null;
  rating: string;
}

/** 创建技能反馈 */
export function createSkillFeedback(input: SkillFeedbackCreateInput): SkillFeedbackRow {
  const db = initDb();
  const tenantId = input.tenant_id ?? DEFAULT_TENANT_ID;
  const id = newStaffId(StaffIdPrefix.skillFeedback);
  const ts = now();
  db.prepare(
    `INSERT INTO sd_skill_feedback
       (id, tenant_id, skill_id, session_id, message_id, user_id,
        skill_version, step_id, rating, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    input.skill_id,
    input.session_id,
    input.message_id,
    input.user_id,
    input.skill_version ?? null,
    input.step_id ?? null,
    input.rating,
    ts,
    ts,
  );
  return db.prepare('SELECT * FROM sd_skill_feedback WHERE id = ?').get(id) as SkillFeedbackRow;
}

// ===================== 反馈汇总统计 =====================

export interface FeedbackSummaryResult {
  total_feedback: number;
  down_count: number;
  up_count: number;
  bucket_counts: Array<{ bucket: string; label: string; count: number }>;
  status_counts: Record<string, number>;
  summary: string;
  top_summaries: Array<{
    message_id: string;
    bucket: string;
    bucket_label: string;
    summary: string | null;
    reason: string | null;
    confidence: number | null;
  }>;
}

/** 计算反馈汇总统计 */
export function computeFeedbackSummary(rows: MessageFeedbackRow[]): FeedbackSummaryResult {
  const total = rows.length;
  const downRows = rows.filter((r) => r.rating === 'down');
  const upRows = rows.filter((r) => r.rating === 'up');

  const bucketCountsMap = new Map<string, number>();
  for (const r of downRows) {
    const bucket = r.analysis_bucket ?? 'unknown';
    bucketCountsMap.set(bucket, (bucketCountsMap.get(bucket) ?? 0) + 1);
  }

  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    const status = _effectiveAnalysisStatus(r);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  }

  const topSummaries = downRows
    .filter((r) => r.analysis_summary || r.analysis_reason)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5)
    .map((r) => {
      const bucket = r.analysis_bucket ?? 'unknown';
      return {
        message_id: r.message_id,
        bucket,
        bucket_label: FEEDBACK_BUCKET_LABELS[bucket] ?? bucket,
        summary: r.analysis_summary,
        reason: r.analysis_reason,
        confidence: r.analysis_confidence,
      };
    });

  const bucketCounts = Array.from(bucketCountsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([bucket, count]) => ({
      bucket,
      label: FEEDBACK_BUCKET_LABELS[bucket] ?? bucket,
      count,
    }));

  return {
    total_feedback: total,
    down_count: downRows.length,
    up_count: upRows.length,
    bucket_counts: bucketCounts,
    status_counts: statusCounts,
    summary: _compactOverallSummary(bucketCounts, topSummaries),
    top_summaries: topSummaries,
  };
}

function _effectiveAnalysisStatus(row: MessageFeedbackRow): string {
  if (row.analysis_status !== 'analyzed') return row.analysis_status;
  let metadata: Record<string, any> = {};
  try {
    metadata = row.analysis_json ? JSON.parse(row.analysis_json) : {};
  } catch {
    metadata = {};
  }
  if (metadata.error_type || metadata.retryable) return 'failed';
  return row.analysis_status;
}

function _compactOverallSummary(
  bucketCounts: Array<{ bucket: string; count: number }>,
  topSummaries: Array<{ bucket: string; summary: string | null; reason: string | null }>,
): string {
  if (bucketCounts.length === 0) return '暂无点踩归因数据。';
  const leader = bucketCounts[0];
  const label = FEEDBACK_BUCKET_LABELS[leader.bucket] ?? leader.bucket;
  const detail =
    topSummaries.find((item) => item.bucket === leader.bucket)?.summary ??
    topSummaries.find((item) => item.bucket === leader.bucket)?.reason ??
    '';
  if (detail) {
    return `当前点踩主要集中在「${label}」（${leader.count} 次）：${detail}`;
  }
  return `当前点踩主要集中在「${label}」（${leader.count} 次）。`;
}

// ===================== 反馈读取辅助 =====================

export interface FeedbackAnalysisRead {
  status: string;
  bucket: string;
  bucket_label: string;
  reason: string | null;
  summary: string | null;
  confidence: number | null;
  metadata: Record<string, any>;
  analyzed_at: number | null;
}

/** 反馈分析结果 -> read */
export function feedbackAnalysisRead(row: MessageFeedbackRow): FeedbackAnalysisRead {
  const bucket = row.analysis_bucket ?? 'unknown';
  const status = _effectiveAnalysisStatus(row);
  const confidence = status === 'failed' ? null : row.analysis_confidence;
  let metadata: Record<string, any> = {};
  try {
    metadata = row.analysis_json ? JSON.parse(row.analysis_json) : {};
  } catch {
    metadata = {};
  }
  return {
    status,
    bucket,
    bucket_label: FEEDBACK_BUCKET_LABELS[bucket] ?? bucket,
    reason: row.analysis_reason,
    summary: row.analysis_summary,
    confidence,
    metadata,
    analyzed_at: row.analyzed_at,
  };
}
