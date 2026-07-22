/**
 * Channel Message Router — 通道消息路由
 *
 * 将消息路由到对应的通道适配器或处理函数。
 * 与 ./channel-adapter-runtime.ts 配合：
 * - channel-adapter-runtime.ts 管理通道连接
 * - 本文件负责消息分发与路由规则
 *
 * 路由策略：
 * 1. 按 channelId 精确匹配
 * 2. 按 providerId 直接路由
 * 3. 按标签/正则匹配（高级）
 */

import { logger } from '../../logger.js';
import { CHANNEL_ROUTE_TIMEOUT_MS } from './plugin-constants.js';
import { getChannelAdapterRuntime } from './channel-adapter-runtime.js';
import type { ChannelCapabilityMessage } from './channel-capability.js';
import { PluginChannelError } from './plugin-errors.js';

/** 消息处理器签名 */
export type ChannelMessageHandler = (message: ChannelCapabilityMessage) => Promise<void> | void;

/** 路由规则 */
export interface ChannelRouteRule {
  /** 规则 ID */
  id: string;
  /** 匹配的通道 ID（精确匹配） */
  channelId?: string;
  /** 匹配的提供者 ID */
  providerId?: string;
  /** 匹配的发送者 */
  from?: string;
  /** 匹配的接收者 */
  to?: string;
  /** 匹配的线程 ID */
  threadId?: string;
  /** 标签过滤 */
  tags?: string[];
  /** 目标处理器 */
  handler: ChannelMessageHandler;
  /** 优先级（越高越先匹配） */
  priority?: number;
  /** 是否启用 */
  enabled?: boolean;
}

/** 路由结果 */
export interface ChannelRouteResult {
  /** 是否成功路由 */
  ok: boolean;
  /** 匹配的规则数 */
  matchedRules: number;
  /** 已调用的处理器数 */
  invokedHandlers: number;
  /** 错误信息 */
  errors?: string[];
  /** 耗时（毫秒） */
  durationMs?: number;
}

/** 路由统计 */
export interface ChannelRouteStats {
  /** 总消息数 */
  totalMessages: number;
  /** 成功路由数 */
  routedMessages: number;
  /** 失败路由数 */
  failedMessages: number;
  /** 每个规则被匹配的次数 */
  ruleMatchCount: Record<string, number>;
}

// ===================== 消息路由器 =====================

class ChannelMessageRouterImpl {
  private rules = new Map<string, ChannelRouteRule>();
  private stats: ChannelRouteStats = {
    totalMessages: 0,
    routedMessages: 0,
    failedMessages: 0,
    ruleMatchCount: {},
  };
  private defaultHandler?: ChannelMessageHandler;

  /** 设置默认处理器（无规则匹配时调用） */
  setDefaultHandler(handler: ChannelMessageHandler | undefined): void {
    this.defaultHandler = handler;
  }

  /** 注册路由规则 */
  addRule(rule: ChannelRouteRule): void {
    this.rules.set(rule.id, rule);
    logger.debug(`[ChannelMessageRouter] 注册路由规则: ${rule.id}`);
  }

  /** 移除路由规则 */
  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.debug(`[ChannelMessageRouter] 移除路由规则: ${ruleId}`);
    }
    return removed;
  }

  /** 获取路由规则 */
  getRule(ruleId: string): ChannelRouteRule | undefined {
    return this.rules.get(ruleId);
  }

  /** 列出所有路由规则 */
  listRules(): ChannelRouteRule[] {
    return Array.from(this.rules.values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** 匹配消息到路由规则 */
  matchRules(message: ChannelCapabilityMessage): ChannelRouteRule[] {
    const matched: ChannelRouteRule[] = [];
    for (const rule of this.rules.values()) {
      if (rule.enabled === false) continue;
      if (this.matchRule(rule, message)) {
        matched.push(rule);
        this.stats.ruleMatchCount[rule.id] = (this.stats.ruleMatchCount[rule.id] ?? 0) + 1;
      }
    }
    // 按优先级排序
    matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return matched;
  }

  /** 路由消息 */
  async route(message: ChannelCapabilityMessage): Promise<ChannelRouteResult> {
    const startTime = Date.now();
    this.stats.totalMessages++;

    const matched = this.matchRules(message);
    const errors: string[] = [];
    let invoked = 0;

    if (matched.length === 0 && this.defaultHandler) {
      try {
        await withRouteTimeout(this.defaultHandler(message), CHANNEL_ROUTE_TIMEOUT_MS);
        invoked++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    for (const rule of matched) {
      try {
        await withRouteTimeout(rule.handler(message), CHANNEL_ROUTE_TIMEOUT_MS);
        invoked++;
      } catch (err) {
        errors.push(`规则 ${rule.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const ok = invoked > 0 && errors.length === 0;
    if (ok) {
      this.stats.routedMessages++;
    } else if (invoked === 0) {
      this.stats.failedMessages++;
    }

    return {
      ok,
      matchedRules: matched.length,
      invokedHandlers: invoked,
      ...(errors.length > 0 ? { errors } : {}),
      durationMs: Date.now() - startTime,
    };
  }

  /** 路由消息到指定通道 */
  async routeToChannel(providerId: string, message: ChannelCapabilityMessage): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const runtime = getChannelAdapterRuntime();
    return runtime.sendMessage(providerId, message);
  }

  /** 广播消息到所有已连接通道 */
  async broadcast(message: ChannelCapabilityMessage): Promise<Array<{ providerId: string; ok: boolean; error?: string }>> {
    const runtime = getChannelAdapterRuntime();
    const connected = runtime.listConnected();
    const results: Array<{ providerId: string; ok: boolean; error?: string }> = [];

    for (const entry of connected) {
      try {
        const result = await runtime.sendMessage(entry.providerId, { ...message });
        results.push({ providerId: entry.providerId, ok: result.ok, ...(result.error !== undefined ? { error: result.error } : {}) });
      } catch (err) {
        results.push({
          providerId: entry.providerId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  /** 获取路由统计 */
  getStats(): ChannelRouteStats {
    return { ...this.stats, ruleMatchCount: { ...this.stats.ruleMatchCount } };
  }

  /** 重置统计 */
  resetStats(): void {
    this.stats = {
      totalMessages: 0,
      routedMessages: 0,
      failedMessages: 0,
      ruleMatchCount: {},
    };
  }

  /** 清空所有规则 */
  clear(): void {
    this.rules.clear();
    this.defaultHandler = undefined;
  }

  /** 匹配单条规则 */
  private matchRule(rule: ChannelRouteRule, message: ChannelCapabilityMessage): boolean {
    if (rule.channelId !== undefined && rule.channelId !== message.channelId) return false;
    if (rule.providerId !== undefined && rule.providerId !== message.channelId) return false;
    if (rule.from !== undefined && rule.from !== message.from) return false;
    if (rule.to !== undefined && rule.to !== message.to) return false;
    if (rule.threadId !== undefined && rule.threadId !== message.threadId) return false;
    return true;
  }
}

/** 全局消息路由器 */
const channelMessageRouter = new ChannelMessageRouterImpl();

/** 获取通道消息路由器 */
export function getChannelMessageRouter(): ChannelMessageRouterImpl {
  return channelMessageRouter;
}

// ===================== 工具函数 =====================

/** 带超时的路由处理 */
function withRouteTimeout<T>(promise: Promise<T> | T, timeoutMs: number): Promise<T> {
  const p = Promise.resolve(promise);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PluginChannelError(`消息路由处理超时 (${timeoutMs}ms)`, 'router'));
    }, timeoutMs);
    p.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
