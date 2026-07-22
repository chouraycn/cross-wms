import { logger } from '../../logger.js';

/**
 * Agent 执行跟踪与审计日志
 *
 * 记录 Agent 在运行期间的关键事件（生命周期变更、工具调用、权限决策、
 * LLM 调用、子 Agent 创建等），支持：
 * - 时间线回放（timeline）
 * - 按 agent / 事件类型 / 时间范围过滤
 * - 持久化到外部存储（通过 AuditSink 接口）
 * - 限长自动淘汰（避免内存无限增长）
 */

/** 审计事件类别 */
export type AuditEventCategory =
  | 'lifecycle'
  | 'tool'
  | 'permission'
  | 'llm'
  | 'subagent'
  | 'channel'
  | 'skill'
  | 'system';

/** 审计事件级别 */
export type AuditEventLevel = 'info' | 'warn' | 'error' | 'debug';

/** 审计事件 */
export interface AuditEvent {
  /** 唯一事件 ID */
  id: string;
  /** 关联的 Agent ID */
  agentId: string;
  /** 事件类别 */
  category: AuditEventCategory;
  /** 事件级别 */
  level: AuditEventLevel;
  /** 事件类型（细粒度，例如 "tool.call.start"、"lifecycle.transition"） */
  type: string;
  /** 事件发生时间（ms 时间戳） */
  timestamp: number;
  /** 简要描述 */
  message: string;
  /** 详细数据（任意 JSON 可序列化内容） */
  payload?: Record<string, unknown>;
  /** 关联的会话 ID（可选） */
  sessionId?: string;
  /** 关联的父 Agent ID（子 Agent 场景，可选） */
  parentAgentId?: string;
  /** 关联的工具名 / 模型名 / 技能名（按场景填充） */
  target?: string;
  /** 执行耗时（ms，针对有起止的事件） */
  durationMs?: number;
}

/** 事件过滤器 */
export interface AuditFilter {
  agentId?: string;
  category?: AuditEventCategory;
  level?: AuditEventLevel;
  type?: string;
  sessionId?: string;
  parentAgentId?: string;
  /** 起始时间戳（含） */
  fromTimestamp?: number;
  /** 结束时间戳（含） */
  toTimestamp?: number;
  /** 关键词（模糊匹配 message，大小写不敏感） */
  keyword?: string;
}

/** 查询选项 */
export interface AuditQueryOptions extends AuditFilter {
  /** 限制返回数量（默认 100） */
  limit?: number;
  /** 偏移量（用于分页） */
  offset?: number;
  /** 倒序（最新在前，默认 true） */
  descending?: boolean;
}

/** 审计结果 */
export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  offset: number;
  limit: number;
}

/** 持久化 sink（可选） */
export interface AuditSink {
  write(event: AuditEvent): void | Promise<void>;
  flush?(): void | Promise<void>;
}

/** 配置 */
export interface AuditTrailOptions {
  /** 内存中最多保留事件数（默认 5000） */
  maxEvents?: number;
  /** 是否启用 logger 输出（默认 true） */
  enableLogger?: boolean;
  /** 外部持久化 sink 列表 */
  sinks?: AuditSink[];
}

let nextEventId = 1;

export class AgentAuditTrail {
  private events: AuditEvent[] = [];
  private maxEvents: number;
  private enableLogger: boolean;
  private sinks: AuditSink[];

  constructor(options?: AuditTrailOptions) {
    this.maxEvents = options?.maxEvents ?? 5000;
    this.enableLogger = options?.enableLogger ?? true;
    this.sinks = options?.sinks ?? [];
  }

  /** 记录一个审计事件 */
  record(event: Omit<AuditEvent, 'id' | 'timestamp'> & Partial<Pick<AuditEvent, 'timestamp'>>): AuditEvent {
    const fullEvent: AuditEvent = {
      id: `evt-${nextEventId++}`,
      timestamp: event.timestamp ?? Date.now(),
      ...event,
    };

    this.events.push(fullEvent);
    this.evictIfNeeded();
    this.emitToLogger(fullEvent);
    this.emitToSinks(fullEvent);

    return fullEvent;
  }

  /** 便捷方法：记录生命周期事件 */
  recordLifecycle(
    agentId: string,
    type: string,
    message: string,
    payload?: Record<string, unknown>,
    options?: { level?: AuditEventLevel; sessionId?: string },
  ): AuditEvent {
    return this.record({
      agentId,
      category: 'lifecycle',
      level: options?.level ?? 'info',
      type,
      message,
      payload,
      sessionId: options?.sessionId,
    });
  }

  /** 便捷方法：记录工具调用事件 */
  recordToolCall(
    agentId: string,
    toolName: string,
    phase: 'start' | 'end' | 'error',
    payload?: Record<string, unknown>,
    options?: { durationMs?: number; sessionId?: string; level?: AuditEventLevel; message?: string },
  ): AuditEvent {
    return this.record({
      agentId,
      category: 'tool',
      level: options?.level ?? (phase === 'error' ? 'error' : 'info'),
      type: `tool.call.${phase}`,
      message: options?.message ?? `Tool "${toolName}" ${phase}`,
      payload,
      target: toolName,
      durationMs: options?.durationMs,
      sessionId: options?.sessionId,
    });
  }

  /** 便捷方法：记录权限决策 */
  recordPermission(
    agentId: string,
    decision: 'allow' | 'deny' | 'approval',
    target: string,
    reason: string,
    payload?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      agentId,
      category: 'permission',
      level: decision === 'deny' ? 'warn' : 'info',
      type: `permission.${decision}`,
      message: `Permission ${decision} for ${target}: ${reason}`,
      target,
      payload: { decision, reason, ...payload },
    });
  }

  /** 便捷方法：记录 LLM 调用 */
  recordLlmCall(
    agentId: string,
    model: string,
    phase: 'start' | 'end' | 'error',
    payload?: Record<string, unknown>,
    options?: { durationMs?: number; sessionId?: string; level?: AuditEventLevel; message?: string },
  ): AuditEvent {
    return this.record({
      agentId,
      category: 'llm',
      level: options?.level ?? (phase === 'error' ? 'error' : 'info'),
      type: `llm.call.${phase}`,
      message: options?.message ?? `LLM ${model} ${phase}`,
      payload,
      target: model,
      durationMs: options?.durationMs,
      sessionId: options?.sessionId,
    });
  }

  /** 便捷方法：记录子 Agent 创建 */
  recordSubagent(
    parentAgentId: string,
    childAgentId: string,
    message: string,
    payload?: Record<string, unknown>,
  ): AuditEvent {
    return this.record({
      agentId: childAgentId,
      parentAgentId,
      category: 'subagent',
      level: 'info',
      type: 'subagent.created',
      message,
      payload,
    });
  }

  /** 查询事件 */
  query(options?: AuditQueryOptions): AuditQueryResult {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const descending = options?.descending ?? true;

    let filtered = this.events;

    if (options) {
      filtered = filtered.filter((e) => matchesFilter(e, options));
    }

    if (descending) {
      filtered = [...filtered].reverse();
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return {
      events: paged,
      total,
      offset,
      limit,
    };
  }

  /** 获取指定 Agent 的时间线（按时间升序） */
  getTimeline(agentId: string, options?: { fromTimestamp?: number; toTimestamp?: number }): AuditEvent[] {
    return this.events
      .filter(
        (e) =>
          e.agentId === agentId &&
          (options?.fromTimestamp === undefined || e.timestamp >= options.fromTimestamp) &&
          (options?.toTimestamp === undefined || e.timestamp <= options.toTimestamp),
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /** 获取最近 N 条事件 */
  getRecent(limit: number, filter?: AuditFilter): AuditEvent[] {
    let events = this.events;
    if (filter) {
      events = events.filter((e) => matchesFilter(e, filter));
    }
    return [...events].reverse().slice(0, limit);
  }

  /** 统计信息 */
  getStats(): {
    total: number;
    byCategory: Record<AuditEventCategory, number>;
    byLevel: Record<AuditEventLevel, number>;
    byAgent: Record<string, number>;
    oldestTimestamp?: number;
    newestTimestamp?: number;
  } {
    const byCategory: Record<AuditEventCategory, number> = {
      lifecycle: 0,
      tool: 0,
      permission: 0,
      llm: 0,
      subagent: 0,
      channel: 0,
      skill: 0,
      system: 0,
    };
    const byLevel: Record<AuditEventLevel, number> = {
      info: 0,
      warn: 0,
      error: 0,
      debug: 0,
    };
    const byAgent: Record<string, number> = {};

    for (const e of this.events) {
      byCategory[e.category]++;
      byLevel[e.level]++;
      byAgent[e.agentId] = (byAgent[e.agentId] ?? 0) + 1;
    }

    return {
      total: this.events.length,
      byCategory,
      byLevel,
      byAgent,
      oldestTimestamp: this.events[0]?.timestamp,
      newestTimestamp: this.events[this.events.length - 1]?.timestamp,
    };
  }

  /** 清空所有事件 */
  clear(): void {
    this.events = [];
  }

  /** 添加持久化 sink */
  addSink(sink: AuditSink): void {
    this.sinks.push(sink);
  }

  /** 移除持久化 sink */
  removeSink(sink: AuditSink): void {
    this.sinks = this.sinks.filter((s) => s !== sink);
  }

  /** 刷新所有 sink */
  async flush(): Promise<void> {
    await Promise.all(this.sinks.map((s) => s.flush?.()));
  }

  private evictIfNeeded(): void {
    if (this.events.length > this.maxEvents) {
      const drop = this.events.length - this.maxEvents;
      this.events.splice(0, drop);
      logger.debug(`[AgentAuditTrail] Dropped ${drop} old events`);
    }
  }

  private emitToLogger(event: AuditEvent): void {
    if (!this.enableLogger) return;
    const meta = `[${event.category}:${event.type}] agent=${event.agentId}`;
    const msg = `${meta} ${event.message}`;
    switch (event.level) {
      case 'error':
        logger.error(`[Audit] ${msg}`);
        break;
      case 'warn':
        logger.warn(`[Audit] ${msg}`);
        break;
      case 'debug':
        logger.debug(`[Audit] ${msg}`);
        break;
      case 'info':
      default:
        logger.info(`[Audit] ${msg}`);
        break;
    }
  }

  private emitToSinks(event: AuditEvent): void {
    for (const sink of this.sinks) {
      try {
        const r = sink.write(event);
        if (r instanceof Promise) {
          r.catch((err) => logger.error('[AgentAuditTrail] sink write error:', err));
        }
      } catch (err) {
        logger.error('[AgentAuditTrail] sink write error:', err);
      }
    }
  }
}

/** 判断事件是否匹配过滤器 */
function matchesFilter(e: AuditEvent, f: AuditFilter): boolean {
  if (f.agentId !== undefined && e.agentId !== f.agentId) return false;
  if (f.category !== undefined && e.category !== f.category) return false;
  if (f.level !== undefined && e.level !== f.level) return false;
  if (f.type !== undefined && e.type !== f.type) return false;
  if (f.sessionId !== undefined && e.sessionId !== f.sessionId) return false;
  if (f.parentAgentId !== undefined && e.parentAgentId !== f.parentAgentId) return false;
  if (f.fromTimestamp !== undefined && e.timestamp < f.fromTimestamp) return false;
  if (f.toTimestamp !== undefined && e.timestamp > f.toTimestamp) return false;
  if (f.keyword !== undefined) {
    const kw = f.keyword.toLowerCase();
    if (!e.message.toLowerCase().includes(kw) && !e.type.toLowerCase().includes(kw)) {
      return false;
    }
  }
  return true;
}

/** 全局默认实例 */
export const agentAuditTrail = new AgentAuditTrail();
