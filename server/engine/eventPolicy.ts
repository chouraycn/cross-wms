/**
 * Event Policy
 * 事件策略 - 事件过滤、保留策略和安全过滤
 */

export type EventRetentionPolicy = "all" | "summary" | "minimal" | "none";

export interface EventPolicyOptions {
  retentionPolicy?: EventRetentionPolicy;
  maxEventsPerSession?: number;
  maxAgeDays?: number;
  includeSensitiveData?: boolean;
  redactPatterns?: RegExp[];
  allowedEventTypes?: string[];
  deniedEventTypes?: string[];
}

export interface EventPolicyResult {
  allowed: boolean;
  reason?: string;
  redacted?: boolean;
  redactedFields?: string[];
}

const DEFAULT_MAX_EVENTS_PER_SESSION = 10000;
const DEFAULT_MAX_AGE_DAYS = 30;

const SENSITIVE_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

const DEFAULT_REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+/gi,
  /password["':]\s*[:=]\s*["']?[^"'\s]+/gi,
];

class EventPolicyManager {
  private options: Required<Omit<EventPolicyOptions, "redactPatterns" | "allowedEventTypes" | "deniedEventTypes">> & {
    redactPatterns: RegExp[];
    allowedEventTypes: string[] | null;
    deniedEventTypes: string[];
  };

  constructor(options: EventPolicyOptions = {}) {
    this.options = {
      retentionPolicy: options.retentionPolicy ?? "all",
      maxEventsPerSession: options.maxEventsPerSession ?? DEFAULT_MAX_EVENTS_PER_SESSION,
      maxAgeDays: options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
      includeSensitiveData: options.includeSensitiveData ?? false,
      redactPatterns: options.redactPatterns ?? DEFAULT_REDACT_PATTERNS,
      allowedEventTypes: options.allowedEventTypes ?? null,
      deniedEventTypes: options.deniedEventTypes ?? [],
    };
  }

  /**
   * 检查事件是否允许被记录
   */
  checkEvent(eventType: string, payload: Record<string, unknown>): EventPolicyResult {
    // 检查类型白名单
    if (this.options.allowedEventTypes && !this.options.allowedEventTypes.includes(eventType)) {
      return { allowed: false, reason: "Event type not in allowlist" };
    }

    // 检查类型黑名单
    if (this.options.deniedEventTypes.includes(eventType)) {
      return { allowed: false, reason: "Event type in denylist" };
    }

    // 检查保留策略
    if (this.options.retentionPolicy === "none") {
      return { allowed: false, reason: "Retention policy is 'none'" };
    }

    if (this.options.retentionPolicy === "minimal") {
      const minimalTypes = ["session.started", "session.ended", "turn.completed", "turn.failed"];
      if (!minimalTypes.includes(eventType)) {
        return { allowed: false, reason: "Minimal retention policy" };
      }
    }

    if (this.options.retentionPolicy === "summary") {
      const summaryTypes = [
        "session.started",
        "session.ended",
        "turn.started",
        "turn.completed",
        "turn.failed",
        "message.created",
      ];
      if (!summaryTypes.includes(eventType)) {
        return { allowed: false, reason: "Summary retention policy" };
      }
    }

    // 检查是否需要脱敏
    const redactedFields: string[] = [];
    if (!this.options.includeSensitiveData) {
      const fields = this.findSensitiveFields(payload);
      if (fields.length > 0) {
        redactedFields.push(...fields);
      }
    }

    return {
      allowed: true,
      redacted: redactedFields.length > 0,
      redactedFields,
    };
  }

  /**
   * 对事件 payload 进行脱敏处理
   */
  redactPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (this.options.includeSensitiveData) {
      return payload;
    }

    return this.redactObject(payload);
  }

  /**
   * 检查会话是否超出事件数量限制
   */
  checkSessionLimit(currentCount: number): boolean {
    return currentCount < this.options.maxEventsPerSession;
  }

  /**
   * 检查事件是否过期
   */
  isEventExpired(timestamp: number): boolean {
    const ageMs = Date.now() - timestamp;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    return ageDays > this.options.maxAgeDays;
  }

  /**
   * 计算应保留的事件数量
   */
  calculateRetention(count: number): {
    keepCount: number;
    removeCount: number;
  } {
    const policy = this.options.retentionPolicy;
    let ratio = 1.0;

    switch (policy) {
      case "all":
        ratio = 1.0;
        break;
      case "summary":
        ratio = 0.5;
        break;
      case "minimal":
        ratio = 0.2;
        break;
      case "none":
        ratio = 0;
        break;
    }

    const keepCount = Math.min(Math.floor(count * ratio), this.options.maxEventsPerSession);
    return {
      keepCount,
      removeCount: Math.max(0, count - keepCount),
    };
  }

  /**
   * 更新策略配置
   */
  updateOptions(options: Partial<EventPolicyOptions>): void {
    this.options = {
      ...this.options,
      ...options,
      redactPatterns: options.redactPatterns ?? this.options.redactPatterns,
      allowedEventTypes: options.allowedEventTypes ?? this.options.allowedEventTypes,
      deniedEventTypes: options.deniedEventTypes ?? this.options.deniedEventTypes,
    };
  }

  /**
   * 获取当前策略
   */
  getOptions(): EventPolicyOptions {
    return {
      retentionPolicy: this.options.retentionPolicy,
      maxEventsPerSession: this.options.maxEventsPerSession,
      maxAgeDays: this.options.maxAgeDays,
      includeSensitiveData: this.options.includeSensitiveData,
      redactPatterns: [...this.options.redactPatterns],
      allowedEventTypes: this.options.allowedEventTypes ?? undefined,
      deniedEventTypes: [...this.options.deniedEventTypes],
    };
  }

  private findSensitiveFields(obj: Record<string, unknown>, prefix = ""): string[] {
    const sensitive: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      // 检查字段名是否敏感
      if (SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key))) {
        sensitive.push(fullKey);
      }

      // 递归检查嵌套对象
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sensitive.push(
          ...this.findSensitiveFields(value as Record<string, unknown>, fullKey),
        );
      }
    }

    return sensitive;
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // 检查字段名是否敏感
      if (SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key))) {
        result[key] = "[REDACTED]";
        continue;
      }

      // 检查字符串值是否包含敏感模式
      if (typeof value === "string") {
        let redacted = value;
        for (const pattern of this.options.redactPatterns) {
          redacted = redacted.replace(pattern, "[REDACTED]");
        }
        result[key] = redacted;
        continue;
      }

      // 递归处理嵌套对象
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>);
        continue;
      }

      // 递归处理数组
      if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (item && typeof item === "object") {
            return this.redactObject(item as Record<string, unknown>);
          }
          if (typeof item === "string") {
            let redacted = item;
            for (const pattern of this.options.redactPatterns) {
              redacted = redacted.replace(pattern, "[REDACTED]");
            }
            return redacted;
          }
          return item;
        });
        continue;
      }

      result[key] = value;
    }

    return result;
  }
}

// 全局单例
let EVENT_POLICY_INSTANCE: EventPolicyManager | null = null;

export function getEventPolicy(): EventPolicyManager {
  if (!EVENT_POLICY_INSTANCE) {
    EVENT_POLICY_INSTANCE = new EventPolicyManager();
  }
  return EVENT_POLICY_INSTANCE;
}

export function setEventPolicyOptions(options: EventPolicyOptions): void {
  const policy = getEventPolicy();
  policy.updateOptions(options);
}

export function resetEventPolicyForTests(): void {
  EVENT_POLICY_INSTANCE = null;
}

export type { EventPolicyManager };
