/**
 * 承诺抽取
 *
 * 从对话上下文中抽取承诺，包括跟进、提醒、紧急、关怀等类型。
 * 支持规则提取和模型提取。
 */

import { logger } from '../../logger.js';
import {
  CONFIDENCE_THRESHOLD,
  CARE_CONFIDENCE_THRESHOLD,
  priorityToNumber,
  numberToPriority,
} from './config.js';
import type {
  CommitmentCandidate,
  CommitmentExtractionItem,
  CommitmentExtractionBatchResult,
  CommitmentKind,
  CommitmentSensitivity,
  CommitmentPriority,
} from './types.js';

export type ExtractionPromptContext = {
  item: CommitmentExtractionItem;
  existingPending: Array<{
    kind: CommitmentKind;
    reason: string;
    dedupeKey: string;
    earliestMs: number;
    latestMs: number;
    priority?: CommitmentPriority;
  }>;
};

export type CommitmentExtractionRule = {
  kind: CommitmentKind;
  pattern: RegExp;
  reason?: string;
  confidence: number;
  sensitivity?: CommitmentSensitivity;
  priority?: CommitmentPriority;
  tags?: string[];
};

export type ExtractionResult = {
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  priority: CommitmentPriority;
  reason: string;
  confidence: number;
  matchedPattern: string;
  tags: string[];
  timeExpression?: string;
  entities?: Record<string, string>;
};

const BUILTIN_EXTRACTION_RULES: CommitmentExtractionRule[] = [
  {
    kind: 'follow_up' as CommitmentKind,
    pattern: /(?:跟进|跟踪|follow up|后续).*(?:问题|事项|事情|工作)/i,
    reason: '跟进事项',
    confidence: 0.8,
    sensitivity: 'routine',
    priority: 'medium',
    tags: ['follow-up'],
  },
  {
    kind: 'follow_up' as CommitmentKind,
    pattern: /(?:我会|我将|回头|待会儿|等一下).*(?:再说|再聊|再联系|回复|跟进)/i,
    reason: '后续跟进',
    confidence: 0.75,
    sensitivity: 'routine',
    priority: 'medium',
    tags: ['follow-up'],
  },
  {
    kind: 'reminder' as CommitmentKind,
    pattern: /(?:提醒|记得|别忘了|不要忘).*(?:我|一下|开会|做事|处理)/i,
    reason: '提醒事项',
    confidence: 0.8,
    sensitivity: 'routine',
    priority: 'medium',
    tags: ['reminder'],
  },
  {
    kind: 'reminder' as CommitmentKind,
    pattern: /(?:明天|今天|下午|上午|早上|晚上|点|分).*(?:开会|见面|约会|面试)/i,
    reason: '日程提醒',
    confidence: 0.78,
    sensitivity: 'routine',
    priority: 'medium',
    tags: ['reminder', 'schedule'],
  },
  {
    kind: 'urgent' as CommitmentKind,
    pattern: /(?:紧急|urgent|asap|马上|立刻|立即|现在).*(?:完成|做|处理|回复)/i,
    reason: '紧急事项',
    confidence: 0.9,
    sensitivity: 'routine',
    priority: 'high',
    tags: ['urgent'],
  },
  {
    kind: 'care' as CommitmentKind,
    pattern: /(?:注意身体|保重|照顾好|好好休息|早点睡|别太累)/i,
    reason: '关怀提醒',
    confidence: 0.8,
    sensitivity: 'care',
    priority: 'medium',
    tags: ['care'],
  },
  {
    kind: 'care' as CommitmentKind,
    pattern: /(?:吃药|看病|医院|身体不舒服|感冒|发烧)/i,
    reason: '健康关怀',
    confidence: 0.85,
    sensitivity: 'care',
    priority: 'high',
    tags: ['care', 'health'],
  },
  {
    kind: 'follow_up' as CommitmentKind,
    pattern: /(?:截止|期限|deadline|due).*(?:是|为|在|之前)/i,
    reason: '截止提醒',
    confidence: 0.78,
    sensitivity: 'routine',
    priority: 'high',
    tags: ['deadline', 'follow-up'],
  },
];

let userExtractionRules: CommitmentExtractionRule[] = [];

export function generateDedupeKey(
  kind: CommitmentKind,
  reason: string,
  earliestMs?: number,
  latestMs?: number,
): string {
  const normalized = reason
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const timePart = earliestMs && latestMs ? `:${earliestMs}-${latestMs}` : '';
  return `${kind}:${normalized}${timePart}`;
}

export function extractCommitmentsFromText(
  text: string,
): ExtractionResult[] {
  const results: ExtractionResult[] = [];

  if (!text || text.trim().length === 0) {
    return results;
  }

  const seenDedupeKeys = new Set<string>();

  for (const rule of BUILTIN_EXTRACTION_RULES) {
    try {
      const pattern = rule.pattern;
      const matches = text.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        const matchedText = match[0] ?? '';
        const startIdx = Math.max(0, (match.index ?? 0) - 20);
        const endIdx = Math.min(text.length, (match.index ?? 0) + matchedText.length + 30);
        const context = text.slice(startIdx, endIdx).trim();

        const reason = rule.reason || context;
        const dedupeKey = generateDedupeKey(rule.kind, reason);
        if (seenDedupeKeys.has(dedupeKey)) {
          continue;
        }
        seenDedupeKeys.add(dedupeKey);

        const timeExpression = extractTimeExpression(context);
        const entities = extractEntities(context);

        const priority = rule.priority || 'medium';
        const sensitivity = rule.sensitivity || 'routine';

        results.push({
          kind: rule.kind,
          sensitivity,
          priority,
          reason,
          confidence: rule.confidence,
          matchedPattern: pattern.source,
          tags: rule.tags || [],
          timeExpression,
          entities,
        });
      }
    } catch (err) {
      logger.debug(`[Commitments Extraction] Failed to apply pattern, error: ${String(err)}`);
    }
  }

  return results.sort((a, b) => 
    b.confidence - a.confidence || 
    priorityToNumber(b.priority) - priorityToNumber(a.priority)
  );
}

function extractTimeExpression(text: string): string | undefined {
  const timePatterns = [
    /(?:明天|后天|大后天|今天|昨晚|昨天|前天)[早上|上午|中午|下午|晚上|凌晨|深夜]?/i,
    /(?:下周|本周|这周|上周)[一二三四五六日天]?/i,
    /\d{1,2}[点时][\d]{0,2}(?:分)?/i,
    /(?:早上|上午|中午|下午|晚上|凌晨|深夜)\d{0,2}[点时]?/i,
    /(?:tomorrow|today|yesterday|next week|this week|last week)\s*(?:morning|afternoon|evening|night)?/i,
    /\d+\s*(?:days?|weeks?|hours?|minutes?)/i,
    /(?:in|within)\s+\d+\s+(?:days?|weeks?|hours?|minutes?)/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return undefined;
}

function extractEntities(text: string): Record<string, string> {
  const entities: Record<string, string> = {};

  const personMatch = text.match(/(?:我|你|他|她|我们|你们|他们|她们|老师|老板|同事|朋友|家人|爸妈|父母|妈妈|爸爸)/i);
  if (personMatch) {
    entities.person = personMatch[0];
  }

  const placeMatch = text.match(/(?:公司|家|学校|医院|办公室|会议室|咖啡厅|餐厅|饭店)/i);
  if (placeMatch) {
    entities.place = placeMatch[0];
  }

  const actionMatch = text.match(/(?:完成|做|处理|回复|参加|出席|帮忙|帮|说|聊|联系|找)/i);
  if (actionMatch) {
    entities.action = actionMatch[0];
  }

  return entities;
}

function inferPriority(text: string, defaultPriority: CommitmentPriority): CommitmentPriority {
  const urgentPatterns = [
    /紧急|urgent|asap|马上|立刻|立即|现在|今天必须|务必|一定要/i,
  ];

  const highPatterns = [
    /重要|important|必须|需要|得|要|不能忘|记得/i,
  ];

  const lowPatterns = [
    /有空|方便的时候|随便|不急|慢慢来|有空再说/i,
  ];

  for (const pattern of urgentPatterns) {
    if (pattern.test(text)) {
      return 'urgent';
    }
  }

  for (const pattern of highPatterns) {
    if (pattern.test(text)) {
      return 'high';
    }
  }

  for (const pattern of lowPatterns) {
    if (pattern.test(text)) {
      return 'low';
    }
  }

  return defaultPriority;
}

export function buildCommitmentCandidates(
  results: ExtractionResult[],
  itemId: string,
): CommitmentCandidate[] {
  if (!results || results.length === 0) {
    return [];
  }

  const candidates: CommitmentCandidate[] = [];
  const seenDedupeKeys = new Set<string>();
  const nowMs = Date.now();

  for (const extraction of results) {
    const dedupeKey = generateDedupeKey(extraction.kind, extraction.reason);

    if (seenDedupeKeys.has(dedupeKey)) {
      continue;
    }

    const { earliestMs, latestMs } = calculateDueWindow(extraction, nowMs);

    const candidate: CommitmentCandidate = {
      itemId,
      kind: extraction.kind,
      sensitivity: extraction.sensitivity,
      source: 'inferred_user_context',
      priority: extraction.priority,
      reason: extraction.reason,
      suggestedText: buildSuggestedText(extraction.kind, extraction.reason, extraction.priority),
      dedupeKey,
      confidence: extraction.confidence,
      dueWindow: {
        earliest: new Date(earliestMs).toISOString(),
        latest: new Date(latestMs).toISOString(),
        timezone: 'Asia/Shanghai',
      },
      tags: extraction.tags,
      metadata: extraction.timeExpression 
        ? { timeExpression: extraction.timeExpression, ...extraction.entities } 
        : extraction.entities,
    };

    candidates.push(candidate);
    seenDedupeKeys.add(dedupeKey);
  }

  return candidates;
}

function calculateDueWindow(
  extraction: ExtractionResult,
  nowMs: number,
): { earliestMs: number; latestMs: number } {
  const priorityMultiplier: Record<string, number> = {
    urgent: 0.25,
    high: 0.5,
    medium: 1,
    low: 2,
  };

  const baseEarliestHours = 1;
  const baseLatestHours = 24;

  const multiplier = priorityMultiplier[extraction.priority] || 1;
  const earliestMs = nowMs + baseEarliestHours * 60 * 60 * 1000 * multiplier;
  const latestMs = nowMs + baseLatestHours * 60 * 60 * 1000 * multiplier;

  return { earliestMs, latestMs };
}

function buildSuggestedText(
  kind: CommitmentKind,
  reason: string,
  priority: CommitmentPriority,
): string {
  const prefix = priority === 'urgent' ? '【紧急】' : priority === 'high' ? '【重要】' : '';

  switch (kind) {
    case 'follow_up' as CommitmentKind:
      return `${prefix}关于"${reason}"，后续有什么进展吗？`;
    case 'reminder' as CommitmentKind:
      return `${prefix}提醒一下：${reason}`;
    case 'urgent' as CommitmentKind:
      return `${prefix}紧急提醒：${reason}`;
    case 'care' as CommitmentKind:
      return `${prefix}最近还好吗？${reason}`;
    default:
      return `${prefix}${reason}`;
  }
}

export async function ruleBasedExtractBatch(
  items: CommitmentExtractionItem[],
): Promise<CommitmentExtractionBatchResult> {
  const allCandidates: CommitmentCandidate[] = [];
  const warnings: string[] = [];
  const startTime = Date.now();

  for (const item of items) {
    try {
      const text = `${item.userText} ${item.assistantText ?? ''}`;
      const extractions = extractCommitmentsFromText(text);
      const candidates = buildCommitmentCandidates(extractions, item.itemId);
      allCandidates.push(...candidates);
    } catch (err) {
      const errorMsg = `Failed to extract from item ${item.itemId}: ${String(err)}`;
      logger.error(`[Commitments Extraction] ${errorMsg}`);
      warnings.push(errorMsg);
    }
  }

  const extractionMs = Date.now() - startTime;
  logger.debug(`[Commitments Extraction] Extracted ${allCandidates.length} candidates from ${items.length} items in ${extractionMs}ms`);

  return {
    candidates: allCandidates,
    warnings: warnings.length > 0 ? warnings : undefined,
    extractionMs,
  };
}

export function addExtractionRule(rule: CommitmentExtractionRule): void {
  userExtractionRules.push(rule);
}

export function clearExtractionRules(): void {
  userExtractionRules = [];
}

export function getExtractionRules(): ReadonlyArray<CommitmentExtractionRule> {
  return [...userExtractionRules];
}

export function removeExtractionRule(index: number): boolean {
  if (index >= 0 && index < userExtractionRules.length) {
    userExtractionRules.splice(index, 1);
    return true;
  }
  return false;
}

export function parseCommitmentExtractionOutput(
  output: string,
): CommitmentExtractionBatchResult {
  const warnings: string[] = [];

  try {
    const jsonMatch = output.match(/\{[\s\S]*"candidates"[\s\S]*\}/);
    if (!jsonMatch) {
      return { candidates: [], warnings: ['No valid JSON found in output'] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || !Array.isArray(parsed.candidates)) {
      return { candidates: [], warnings: ['Invalid candidates format'] };
    }

    const validCandidates: CommitmentCandidate[] = [];
    for (const candidate of parsed.candidates) {
      if (
        candidate &&
        typeof candidate.itemId === 'string' &&
        typeof candidate.kind === 'string' &&
        typeof candidate.sensitivity === 'string' &&
        typeof candidate.source === 'string' &&
        typeof candidate.reason === 'string' &&
        typeof candidate.suggestedText === 'string' &&
        typeof candidate.dedupeKey === 'string' &&
        typeof candidate.confidence === 'number' &&
        candidate.dueWindow &&
        typeof candidate.dueWindow.earliest === 'string'
      ) {
        validCandidates.push(candidate as CommitmentCandidate);
      } else {
        warnings.push(`Invalid candidate skipped: ${JSON.stringify(candidate).slice(0, 100)}`);
      }
    }

    return {
      candidates: validCandidates,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (err) {
    return {
      candidates: [],
      warnings: [`Parse error: ${String(err)}`],
    };
  }
}

export function validateCommitmentCandidates(params: {
  items: CommitmentExtractionItem[];
  result: CommitmentExtractionBatchResult;
  confidenceThreshold?: number;
  careConfidenceThreshold?: number;
  nowMs?: number;
}): Array<{
  candidate: CommitmentCandidate;
  item: CommitmentExtractionItem;
  earliestMs: number;
  latestMs: number;
  timezone: string;
}> {
  const {
    items,
    result,
    confidenceThreshold = CONFIDENCE_THRESHOLD,
    careConfidenceThreshold = CARE_CONFIDENCE_THRESHOLD,
    nowMs = Date.now(),
  } = params;

  const valid: Array<{
    candidate: CommitmentCandidate;
    item: CommitmentExtractionItem;
    earliestMs: number;
    latestMs: number;
    timezone: string;
  }> = [];

  const itemMap = new Map(items.map((item) => [item.itemId, item]));

  for (const candidate of result.candidates) {
    const item = itemMap.get(candidate.itemId);
    if (!item) {
      continue;
    }

    const threshold = candidate.sensitivity === 'care'
      ? careConfidenceThreshold
      : confidenceThreshold;

    if (candidate.confidence < threshold) {
      continue;
    }

    let earliestMs: number;
    let latestMs: number;
    try {
      earliestMs = Date.parse(candidate.dueWindow.earliest);
      latestMs = candidate.dueWindow.latest
        ? Date.parse(candidate.dueWindow.latest)
        : earliestMs + 12 * 60 * 60 * 1000;
    } catch {
      continue;
    }

    if (Number.isNaN(earliestMs) || Number.isNaN(latestMs) || latestMs < earliestMs) {
      continue;
    }

    if (latestMs < nowMs) {
      continue;
    }

    const timezone = candidate.dueWindow.timezone || item.timezone;

    valid.push({
      candidate,
      item,
      earliestMs,
      latestMs,
      timezone,
    });
  }

  return valid;
}

export function buildCommitmentExtractionPrompt(params: {
  items: CommitmentExtractionItem[];
}): string {
  const { items } = params;

  const safeItems = items.map((item) => ({
    itemId: item.itemId,
    now: new Date(item.nowMs).toISOString(),
    timezone: item.timezone,
    userText: item.userText,
    assistantText: item.assistantText,
    existingPending: item.existingPending
      .filter((p) => {
        try {
          return Number.isFinite(p.earliestMs) && Number.isFinite(p.latestMs) && p.earliestMs < 8_640_000_000_000_000;
        } catch {
          return false;
        }
      })
      .map((p) => ({
        kind: p.kind,
        reason: p.reason,
        dedupeKey: p.dedupeKey,
        earliest: new Date(p.earliestMs).toISOString(),
        latest: new Date(p.latestMs).toISOString(),
      })),
  }));

  return `You are a commitment extraction assistant. Your job is to identify commitments, promises, and follow-up items from conversations.

Types of commitments:
- follow_up: Follow up on unresolved topics or promises
- reminder: Remind about upcoming tasks or events
- urgent: Urgent items that need immediate attention
- care: Check in on someone's well-being

For each commitment you find, provide:
- itemId: The item ID from the input
- kind: One of the types above
- sensitivity: routine, personal, or care
- source: inferred_user_context or agent_promise
- priority: low, medium, high, or urgent
- reason: Brief description of the commitment
- suggestedText: A natural follow-up message
- dedupeKey: Unique key for deduplication (format: type:description)
- confidence: 0-1 confidence score
- dueWindow: When to follow up
  - earliest: ISO 8601 timestamp for earliest follow-up
  - latest: ISO 8601 timestamp for latest follow-up
  - timezone: Timezone string
- tags: Array of relevant tags

Conversation items to analyze:
${JSON.stringify(safeItems, null, 2)}

Respond with ONLY a JSON object in this format:
{"candidates": [...]}

Do not include any other text, explanations, or markdown formatting.`;
}

export type TimeParseResult = {
  earliestMs: number;
  latestMs?: number;
  timezone?: string;
  expression: string;
};

export type EntityMatch = {
  type: 'person' | 'time' | 'location' | 'organization';
  value: string;
  start: number;
  end: number;
};

export function validateCandidate(params: {
  candidate?: Partial<CommitmentCandidate>;
  kind?: CommitmentKind;
  reason?: string;
  confidence?: number;
  sensitivity?: CommitmentSensitivity;
  dueWindow?: { earliest?: string; latest?: string; timezone?: string };
  confidenceThreshold?: number;
  careConfidenceThreshold?: number;
  nowMs?: number;
}): { valid: boolean; reason?: string } {
  const {
    candidate,
    kind,
    reason,
    confidence,
    sensitivity,
    dueWindow,
    confidenceThreshold = CONFIDENCE_THRESHOLD,
    careConfidenceThreshold = CARE_CONFIDENCE_THRESHOLD,
    nowMs = Date.now(),
  } = params;

  const actualKind = candidate?.kind || kind;
  const actualReason = candidate?.reason || reason || '';
  const actualConfidence = candidate?.confidence ?? confidence ?? 0;
  const actualSensitivity = candidate?.sensitivity || sensitivity || 'routine';
  const actualDueWindow = candidate?.dueWindow || dueWindow;

  if (!actualKind) {
    return { valid: false, reason: 'missing kind' };
  }

  const validKinds = ['follow_up', 'reminder', 'urgent', 'care', 'event_check_in', 'deadline_check', 'care_check_in', 'open_loop'];
  if (!validKinds.includes(actualKind as string)) {
    return { valid: false, reason: 'invalid kind' };
  }

  if (!actualReason || actualReason.trim().length === 0) {
    return { valid: false, reason: 'missing reason' };
  }

  const threshold = actualSensitivity === 'care' ? careConfidenceThreshold : confidenceThreshold;
  if (actualConfidence < threshold) {
    return { valid: false, reason: 'confidence too low' };
  }

  if (actualDueWindow?.earliest) {
    try {
      const earliestMs = Date.parse(actualDueWindow.earliest);
      if (Number.isNaN(earliestMs)) {
        return { valid: false, reason: 'invalid earliest time' };
      }
      if (actualDueWindow.latest) {
        const latestMs = Date.parse(actualDueWindow.latest);
        if (Number.isNaN(latestMs) || latestMs < earliestMs) {
          return { valid: false, reason: 'invalid latest time' };
        }
      }
    } catch {
      return { valid: false, reason: 'invalid due window' };
    }
  }

  return { valid: true };
}

export function parseTimeExpression(
  expression: string,
  nowMs: number = Date.now(),
): TimeParseResult | null {
  if (!expression || typeof expression !== 'string') {
    return null;
  }

  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }

  const now = new Date(nowMs);
  const lower = trimmed.toLowerCase();

  if (lower.includes('明天')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const earliestMs = tomorrow.getTime();
    const latestMs = earliestMs + 12 * 60 * 60 * 1000;
    return {
      earliestMs,
      latestMs,
      expression: trimmed,
      timezone: 'Asia/Shanghai',
    };
  }

  if (lower.includes('今天下午') || lower.includes('下午')) {
    const afternoon = new Date(now);
    afternoon.setHours(15, 0, 0, 0);
    if (afternoon.getTime() < nowMs) {
      afternoon.setDate(afternoon.getDate() + 1);
    }
    const earliestMs = afternoon.getTime();
    const latestMs = earliestMs + 6 * 60 * 60 * 1000;
    return {
      earliestMs,
      latestMs,
      expression: trimmed,
      timezone: 'Asia/Shanghai',
    };
  }

  if (lower.includes('今天上午') || lower.includes('上午')) {
    const morning = new Date(now);
    morning.setHours(10, 0, 0, 0);
    if (morning.getTime() < nowMs) {
      morning.setDate(morning.getDate() + 1);
    }
    const earliestMs = morning.getTime();
    const latestMs = earliestMs + 4 * 60 * 60 * 1000;
    return {
      earliestMs,
      latestMs,
      expression: trimmed,
      timezone: 'Asia/Shanghai',
    };
  }

  if (lower.includes('今天') || lower.includes('today')) {
    const today = new Date(now);
    today.setHours(10, 0, 0, 0);
    if (today.getTime() < nowMs) {
      today.setHours(18, 0, 0, 0);
    }
    const earliestMs = today.getTime();
    const latestMs = earliestMs + 8 * 60 * 60 * 1000;
    return {
      earliestMs,
      latestMs,
      expression: trimmed,
      timezone: 'Asia/Shanghai',
    };
  }

  if (lower.includes('下周') || lower.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(10, 0, 0, 0);
    const earliestMs = nextWeek.getTime();
    const latestMs = earliestMs + 24 * 60 * 60 * 1000;
    return {
      earliestMs,
      latestMs,
      expression: trimmed,
      timezone: 'Asia/Shanghai',
    };
  }

  const timeMatch = trimmed.match(/(\d{1,2})[:点](\d{2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const timeDate = new Date(now);
      timeDate.setHours(hours, minutes, 0, 0);
      if (timeDate.getTime() < nowMs) {
        timeDate.setDate(timeDate.getDate() + 1);
      }
      const earliestMs = timeDate.getTime();
      const latestMs = earliestMs + 2 * 60 * 60 * 1000;
      return {
        earliestMs,
        latestMs,
        expression: trimmed,
        timezone: 'Asia/Shanghai',
      };
    }
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return {
      earliestMs: parsed,
      latestMs: parsed + 24 * 60 * 60 * 1000,
      expression: trimmed,
      timezone: 'UTC',
    };
  }

  return null;
}

export function detectEntities(text: string): EntityMatch[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const entities: EntityMatch[] = [];

  const personPatterns = [
    /(?:我|你|他|她|它|我们|你们|他们|她们|它们|大家|各位|老师|同学|同事|老板|经理|客户|用户)/g,
    /(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  ];

  for (const pattern of personPatterns) {
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      if (seen.has(value)) continue;
      seen.add(value);
      entities.push({
        type: 'person',
        value,
        start: match.index,
        end: match.index + value.length,
      });
    }
  }

  const timePatterns = [
    /(?:明天|后天|今天|昨天|下周|上周|这周|本周|下个周|上个周)/g,
    /(?:早上|上午|中午|下午|晚上|凌晨|深夜)/g,
    /\d{1,2}[:点]\d{2}(?:分)?/g,
    /(?:周[一二三四五六日天]|星期[一二三四五六日天])/g,
  ];

  for (const pattern of timePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = match[0];
      entities.push({
        type: 'time',
        value,
        start: match.index,
        end: match.index + value.length,
      });
    }
  }

  return entities;
}

export function buildExtractionPrompt(params: {
  items: CommitmentExtractionItem[];
}): string {
  return buildCommitmentExtractionPrompt(params);
}
