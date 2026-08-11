/**
 * Auto Model Feedback —— 语义意图人工纠错闭环（A3）
 *
 * 功能：
 *  - 记录前端 thumbs up/down：对 CDF Auto Model 某次选型的人工评价（赞/踩）
 *    （后端可用 SSE / HTTP 调用 recordFeedback，前端后续补按钮）。
 *  - 命中负反馈（thumbs down、语义规则被标错）的消息文本，直接降级成关键词规则，
 *    不再使用 embedding 主导评分，避免重复踩坑。
 *  - 以 text hash（SHA-256 前 12 hex）做去重键，指纹命中即触发降级，不依赖 exact string。
 *
 * 存储：内存 + JSON 文件落盘到 appPaths.appStorageDir/auto-model-feedback.json。
 * 即使反馈数据损坏/不存在，也会静默降级为内存-only，不阻断主流程。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

// ===================== 类型 =====================

/** 模型选型来源（用于审计标签） */
export type AutoModelSelection = {
  modelId: string;
  modelName: string;
  reason: string;
  reasonType: string;
  /** 语义分类方法，用于区分踩的是语义还是规则 */
  intentMethod?: 'rule' | 'semantic-blend' | 'rule-fallback';
  /** 语义意图评分（如果有） */
  semanticScore?: number;
  /** 规则意图评分（如果有） */
  ruleScore?: number;
};

export type FeedbackValue = 'up' | 'down';

export interface FeedbackRecord {
  /** SHA-256(text).slice(0, 12) — 匹配键 */
  hash: string;
  /** 原始消息（可选，仅调试；隐私敏感时可以为空） */
  text?: string;
  /** 评价 */
  value: FeedbackValue;
  /** 被评价的选型结果快照 */
  selection: AutoModelSelection;
  /** 可选用户备注 */
  comment?: string;
  /** 用户 ID / 租户 ID */
  tenantId?: string;
  /** 时间戳 */
  createdAt: number;
}

/** 用于 classifyIntentSemantic 快速查询的运行时索引 */
interface RuntimeIndex {
  /** 被 thumbs down + 标为「语义判错」的消息 hash 集合（命中即降级到 rule） */
  semanticDowngradeHashes: Set<string>;
}

// ===================== 存储 =====================

const FEEDBACK_FILE = 'auto-model-feedback.json';
const HASH_PREFIX_LEN = 12;

function feedbackFilePath(): string {
  return path.join(AppPaths.userDataDir, FEEDBACK_FILE);
}

const records: FeedbackRecord[] = [];
const index: RuntimeIndex = {
  semanticDowngradeHashes: new Set(),
};

let loaded = false;
let pendingSave: ReturnType<typeof setTimeout> | null = null;

function messageHash(text: string): string {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, HASH_PREFIX_LEN);
}

function loadIfNeeded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const p = feedbackFilePath();
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf-8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as FeedbackRecord[];
    if (!Array.isArray(parsed)) return;
    records.length = 0;
    records.push(...parsed);
    rebuildIndex();
    logger.info(`[AutoModelFeedback] 已载入 ${records.length} 条反馈`);
  } catch (e) {
    logger.warn(
      '[AutoModelFeedback] 载入失败（跳过，不影响主流程）：' + (e instanceof Error ? e.message : String(e)),
    );
  }
}

function rebuildIndex(): void {
  index.semanticDowngradeHashes.clear();
  for (const r of records) {
    // 仅 thumbs down + 语义曾参与决策（semantic-blend/semantic）时加入降级集合
    // intentMethod 字段缺省时默认都加入（保守策略：用户 thumbs down 一律触发降级，避免重复）
    if (r.value !== 'down') continue;
    const method = r.selection?.intentMethod;
    if (!method || method === 'semantic-blend') {
      index.semanticDowngradeHashes.add(r.hash);
    }
  }
}

function scheduleSave(): void {
  if (pendingSave) return;
  pendingSave = setTimeout(() => {
    pendingSave = null;
    try {
      const p = feedbackFilePath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(records, null, 2), 'utf-8');
    } catch (e) {
      logger.warn('[AutoModelFeedback] 落盘失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, 500);
}

// ===================== 外部 API =====================

/** 记录一条反馈；返回生成的 hash（可用于后续查询） */
export function recordAutoModelFeedback(params: {
  text: string;
  value: FeedbackValue;
  selection: AutoModelSelection;
  comment?: string;
  tenantId?: string;
}): { hash: string } {
  loadIfNeeded();
  const hash = messageHash(params.text);
  const rec: FeedbackRecord = {
    hash,
    text: params.text, // 如需脱敏/隐私，可由调用方传空字符串；默认保留便于人工回查
    value: params.value,
    selection: params.selection,
    comment: params.comment,
    tenantId: params.tenantId,
    createdAt: Date.now(),
  };
  records.push(rec);
  rebuildIndex();
  scheduleSave();

  if (params.value === 'down') {
    logger.warn(
      `[AutoModelFeedback] 收到人工纠错（thumbs down）：hash=${hash} reasonType=${params.selection.reasonType ?? ''} intentMethod=${params.selection.intentMethod ?? ''}`,
      { hash, tenantId: params.tenantId, selection: params.selection, comment: params.comment ?? null },
    );
  } else {
    logger.info(`[AutoModelFeedback] thumbs up：hash=${hash}`, { hash, tenantId: params.tenantId });
  }
  return { hash };
}

/**
 * 查询某条消息是否命中「语义降级」。
 * 命中时 classifyIntentSemantic 直接返回 method='rule-fallback'，不再走 embedding。
 */
export function shouldDowngradeSemanticForMessage(text: string): {
  downgrade: boolean;
  hash: string;
} {
  loadIfNeeded();
  const hash = messageHash(text);
  return { downgrade: index.semanticDowngradeHashes.has(hash), hash };
}

/** 列出全部反馈（只读），供调试面板查看 */
export function listAllFeedback(max?: number): FeedbackRecord[] {
  loadIfNeeded();
  const copy = records.slice();
  copy.sort((a, b) => b.createdAt - a.createdAt);
  return typeof max === 'number' ? copy.slice(0, max) : copy;
}

/** 清空（仅用于测试/重置） */
export function __resetFeedbackForTest(): void {
  records.length = 0;
  rebuildIndex();
  try {
    const p = feedbackFilePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}
