/**
 * 技能信号追踪系统
 *
 * 参考 OpenClaw 的 research/autocapture.ts：
 * - 自动捕获和记录技能信号
 * - 技能使用模式分析
 * - 性能追踪和优化建议
 */

import { getChildLogger } from "../../logging/logger.js";
import { getSessionSnapshotManager } from "../runtime/session-snapshot.js";

const logger = getChildLogger("skill-research");

// ============================================================================
// 类型定义
// ============================================================================

/** 信号类型 */
export type SignalType =
  | "skill-call"
  | "skill-load"
  | "skill-update"
  | "skill-install"
  | "skill-uninstall"
  | "skill-error"
  | "skill-warning"
  | "agent-assign"
  | "agent-unassign"
  | "gate-check"
  | "gate-pass"
  | "gate-fail"
  | "permission-check"
  | "performance";

/** 技能信号 */
export interface SkillSignal {
  /** 信号 ID */
  id: string;
  /** 信号类型 */
  type: SignalType;
  /** 技能名称 */
  skillName: string;
  /** Agent 名称 */
  agentName?: string;
  /** 时间戳 */
  timestamp: number;
  /** 持续时间（毫秒） */
  durationMs?: number;
  /** 成功状态 */
  success?: boolean;
  /** 错误信息 */
  error?: string;
  /** 附加数据 */
  data?: Record<string, unknown>;
}

/** 信号统计 */
export interface SignalStats {
  /** 信号类型 */
  type: SignalType;
  /** 总数量 */
  total: number;
  /** 成功数量 */
  success: number;
  /** 失败数量 */
  failure: number;
  /** 平均持续时间（毫秒） */
  avgDurationMs: number;
  /** 最小持续时间（毫秒） */
  minDurationMs: number;
  /** 最大持续时间（毫秒） */
  maxDurationMs: number;
}

/** 技能使用模式 */
export interface SkillUsagePattern {
  /** 技能名称 */
  skillName: string;
  /** 总调用次数 */
  totalCalls: number;
  /** 成功率 */
  successRate: number;
  /** 平均响应时间（毫秒） */
  avgResponseTimeMs: number;
  /** 活跃时间段（小时） */
  activeHours: number[];
  /** 关联 Agent */
  associatedAgents: string[];
}

/** 性能建议 */
export interface PerformanceSuggestion {
  /** 建议 ID */
  id: string;
  /** 技能名称 */
  skillName: string;
  /** 建议类型 */
  type: "optimization" | "warning" | "critical";
  /** 建议消息 */
  message: string;
  /** 详细说明 */
  detail?: string;
  /** 优先级 */
  priority: "low" | "medium" | "high" | "critical";
}

// ============================================================================
// 信号追踪器
// ============================================================================

/** 信号追踪器 */
export class SkillSignalTracker {
  private signals: SkillSignal[] = [];
  private maxSignals: number = 10000;

  constructor(maxSignals?: number) {
    if (maxSignals) {
      this.maxSignals = maxSignals;
    }
  }

  /** 记录信号 */
  record(signal: Omit<SkillSignal, "id" | "timestamp">): SkillSignal {
    const newSignal: SkillSignal = {
      ...signal,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
    };

    this.signals.push(newSignal);

    // 限制信号数量
    if (this.signals.length > this.maxSignals) {
      this.signals = this.signals.slice(-this.maxSignals);
    }

    return newSignal;
  }

  /** 记录技能调用 */
  recordSkillCall(
    skillName: string,
    success: boolean,
    durationMs?: number,
    agentName?: string
  ): SkillSignal {
    return this.record({
      type: "skill-call",
      skillName,
      agentName,
      success,
      durationMs,
    });
  }

  /** 记录技能加载 */
  recordSkillLoad(skillName: string, success: boolean, durationMs?: number): SkillSignal {
    return this.record({
      type: "skill-load",
      skillName,
      success,
      durationMs,
    });
  }

  /** 记录技能错误 */
  recordSkillError(skillName: string, error: string, agentName?: string): SkillSignal {
    return this.record({
      type: "skill-error",
      skillName,
      agentName,
      success: false,
      error,
    });
  }

  /** 记录门控检查 */
  recordGateCheck(skillName: string, passed: boolean): SkillSignal {
    return this.record({
      type: passed ? "gate-pass" : "gate-fail",
      skillName,
      success: passed,
    });
  }

  /** 获取所有信号 */
  getSignals(filter?: {
    type?: SignalType;
    skillName?: string;
    startTime?: number;
    endTime?: number;
  }): SkillSignal[] {
    let signals = [...this.signals];

    if (filter?.type) {
      signals = signals.filter((s) => s.type === filter.type);
    }

    if (filter?.skillName) {
      signals = signals.filter((s) => s.skillName === filter.skillName);
    }

    if (filter?.startTime) {
      signals = signals.filter((s) => s.timestamp >= filter.startTime);
    }

    if (filter?.endTime) {
      signals = signals.filter((s) => s.timestamp <= filter.endTime);
    }

    return signals;
  }

  /** 获取信号统计 */
  getStats(type?: SignalType): SignalStats[] {
    const filtered = type ? this.signals.filter((s) => s.type === type) : this.signals;
    const typeGroups = new Map<SignalType, SkillSignal[]>();

    for (const signal of filtered) {
      const group = typeGroups.get(signal.type) || [];
      group.push(signal);
      typeGroups.set(signal.type, group);
    }

    const stats: SignalStats[] = [];

    for (const [sigType, group] of typeGroups) {
      const total = group.length;
      const success = group.filter((s) => s.success).length;
      const failure = total - success;
      const durations = group.filter((s) => s.durationMs !== undefined).map((s) => s.durationMs!);

      stats.push({
        type: sigType,
        total,
        success,
        failure,
        avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
        maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
      });
    }

    return stats;
  }

  /** 获取技能使用模式 */
  getSkillUsagePatterns(): SkillUsagePattern[] {
    const skillGroups = new Map<string, SkillSignal[]>();

    for (const signal of this.signals) {
      const group = skillGroups.get(signal.skillName) || [];
      group.push(signal);
      skillGroups.set(signal.skillName, group);
    }

    const patterns: SkillUsagePattern[] = [];

    for (const [skillName, group] of skillGroups) {
      const callSignals = group.filter((s) => s.type === "skill-call");
      const totalCalls = callSignals.length;
      const successCalls = callSignals.filter((s) => s.success).length;
      const successRate = totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0;
      const durations = callSignals.filter((s) => s.durationMs !== undefined).map((s) => s.durationMs!);
      const avgResponseTimeMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      // 计算活跃时间段
      const activeHours = new Set<number>();
      for (const signal of callSignals) {
        const hour = new Date(signal.timestamp).getHours();
        activeHours.add(hour);
      }

      // 获取关联 Agent
      const associatedAgents = new Set<string>();
      for (const signal of group) {
        if (signal.agentName) {
          associatedAgents.add(signal.agentName);
        }
      }

      patterns.push({
        skillName,
        totalCalls,
        successRate: Math.round(successRate * 100) / 100,
        avgResponseTimeMs: Math.round(avgResponseTimeMs),
        activeHours: Array.from(activeHours).sort(),
        associatedAgents: Array.from(associatedAgents),
      });
    }

    return patterns.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  /** 生成性能建议 */
  generateSuggestions(): PerformanceSuggestion[] {
    const suggestions: PerformanceSuggestion[] = [];
    const patterns = this.getSkillUsagePatterns();
    const stats = this.getStats();

    for (const pattern of patterns) {
      // 低成功率警告
      if (pattern.successRate < 70) {
        suggestions.push({
          id: `low-success-${pattern.skillName}`,
          skillName: pattern.skillName,
          type: "warning",
          message: `Skill has low success rate: ${pattern.successRate.toFixed(1)}%`,
          detail: `Consider checking skill implementation and dependencies`,
          priority: "high",
        });
      }

      // 高响应时间警告
      if (pattern.avgResponseTimeMs > 5000) {
        suggestions.push({
          id: `slow-response-${pattern.skillName}`,
          skillName: pattern.skillName,
          type: "optimization",
          message: `Skill has high average response time: ${pattern.avgResponseTimeMs}ms`,
          detail: `Consider optimizing the skill implementation or adding caching`,
          priority: "medium",
        });
      }

      // 频繁错误警告
      const errorStats = stats.find((s) => s.type === "skill-error");
      if (errorStats && errorStats.total > 10) {
        suggestions.push({
          id: `frequent-errors-${pattern.skillName}`,
          skillName: pattern.skillName,
          type: "critical",
          message: `Skill has ${errorStats.total} errors recorded`,
          detail: `Investigate the errors immediately`,
          priority: "critical",
        });
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /** 清除信号 */
  clearSignals(): void {
    this.signals = [];
    logger.info("[Research] Cleared all signals");
  }

  /** 获取信号数量 */
  getSignalCount(): number {
    return this.signals.length;
  }
}

// ============================================================================
// 性能监控器
// ============================================================================

/** 性能监控器 */
export class SkillPerformanceMonitor {
  private signalTracker: SkillSignalTracker;
  private monitoringEnabled: boolean = false;

  constructor(signalTracker?: SkillSignalTracker) {
    this.signalTracker = signalTracker || new SkillSignalTracker();
  }

  /** 开始监控 */
  startMonitoring(): void {
    this.monitoringEnabled = true;
    logger.info("[Research] Performance monitoring started");
  }

  /** 停止监控 */
  stopMonitoring(): void {
    this.monitoringEnabled = false;
    logger.info("[Research] Performance monitoring stopped");
  }

  /** 是否正在监控 */
  isMonitoring(): boolean {
    return this.monitoringEnabled;
  }

  /** 监控技能调用 */
  monitorSkillCall(
    skillName: string,
    fn: () => Promise<unknown>
  ): Promise<{ result: unknown; durationMs: number }> {
    const startTime = Date.now();

    return fn()
      .then((result) => {
        const durationMs = Date.now() - startTime;
        if (this.monitoringEnabled) {
          this.signalTracker.recordSkillCall(skillName, true, durationMs);
        }
        return { result, durationMs };
      })
      .catch((error) => {
        const durationMs = Date.now() - startTime;
        if (this.monitoringEnabled) {
          this.signalTracker.recordSkillCall(skillName, false, durationMs);
          this.signalTracker.recordSkillError(skillName, String(error));
        }
        throw error;
      });
  }

  /** 获取追踪器 */
  getSignalTracker(): SkillSignalTracker {
    return this.signalTracker;
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalSignalTracker: SkillSignalTracker | null = null;
let globalPerformanceMonitor: SkillPerformanceMonitor | null = null;

/** 获取全局信号追踪器 */
export function getSkillSignalTracker(): SkillSignalTracker {
  if (!globalSignalTracker) {
    globalSignalTracker = new SkillSignalTracker();
  }
  return globalSignalTracker;
}

/** 获取全局性能监控器 */
export function getSkillPerformanceMonitor(): SkillPerformanceMonitor {
  if (!globalPerformanceMonitor) {
    globalPerformanceMonitor = new SkillPerformanceMonitor();
  }
  return globalPerformanceMonitor;
}

/** 重置全局实例 */
export function resetSkillResearch(): void {
  globalSignalTracker = null;
  globalPerformanceMonitor = null;
  capturedConversations = [];
}

// ============================================================================
// 会话捕获系统
// ============================================================================

export interface CapturedMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tools?: string[];
}

export interface CapturedConversation {
  id: string;
  messages: CapturedMessage[];
  summary: string;
  detectedIntent: string[];
  timestamp: number;
}

export interface PotentialSkillNeed {
  intent: string;
  tools: string[];
  frequency: number;
  suggestedSkillName: string;
}

export interface ConversationSummary {
  total: number;
  conversations: Array<{ id: string; summary: string }>;
  commonTopics: string[];
  commonIntents: string[];
}

let capturedConversations: CapturedConversation[] = [];

function generateSummary(messages: CapturedMessage[]): string {
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length === 0) return "No user messages";
  return userMessages.map((m) => m.content).join(" | ");
}

function detectIntents(messages: CapturedMessage[]): string[] {
  const intents: string[] = [];
  for (const msg of messages) {
    const content = msg.content.toLowerCase();
    if (content.includes("how to") || content.includes("how do i")) {
      intents.push("how-to");
    }
    if (content.includes("create") || content.includes("make")) {
      intents.push("creation");
    }
    if (content.includes("debug") || content.includes("error") || content.includes("fix")) {
      intents.push("debugging");
    }
    if (content.includes("help") || content.includes("assist")) {
      intents.push("help");
    }
  }
  return [...new Set(intents)];
}

export function captureConversation(
  messages: CapturedMessage[],
  sessionId?: string
): CapturedConversation {
  const id = sessionId || `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const conversation: CapturedConversation = {
    id,
    messages,
    summary: generateSummary(messages),
    detectedIntent: detectIntents(messages),
    timestamp: Date.now(),
  };

  capturedConversations.unshift(conversation);

  if (capturedConversations.length > 1000) {
    capturedConversations = capturedConversations.slice(0, 1000);
  }

  return conversation;
}

export function getCapturedConversations(limit: number = 50): CapturedConversation[] {
  return capturedConversations.slice(0, limit);
}

export function clearCapturedConversations(): void {
  capturedConversations = [];
}

export function summarizeCapturedConversations(limit: number = 50): ConversationSummary {
  const conversations = capturedConversations.slice(0, limit);
  const allIntents = conversations.flatMap((c) => c.detectedIntent);
  const intentCounts = new Map<string, number>();
  for (const intent of allIntents) {
    intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
  }
  const sortedIntents = Array.from(intentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([intent]) => intent);

  const topicCounts = new Map<string, number>();
  for (const conv of conversations) {
    const summary = conv.summary.toLowerCase();
    if (summary.includes("debug") || summary.includes("error") || summary.includes("fix")) {
      topicCounts.set("debugging", (topicCounts.get("debugging") || 0) + 1);
    }
    if (summary.includes("create") || summary.includes("make") || summary.includes("build")) {
      topicCounts.set("creation", (topicCounts.get("creation") || 0) + 1);
    }
    if (summary.includes("how to") || summary.includes("guide")) {
      topicCounts.set("how-to", (topicCounts.get("how-to") || 0) + 1);
    }
    if (summary.includes("process") || summary.includes("data")) {
      topicCounts.set("data-processing", (topicCounts.get("data-processing") || 0) + 1);
    }
  }
  const sortedTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  return {
    total: capturedConversations.length,
    conversations: conversations.map((c) => ({ id: c.id, summary: c.summary })),
    commonTopics: sortedTopics.slice(0, 5),
    commonIntents: sortedIntents.slice(0, 5),
  };
}

export function detectPotentialSkillNeeds(): PotentialSkillNeed[] {
  const toolUsage = new Map<string, number>();
  const intentToolMap = new Map<string, Set<string>>();

  for (const conv of capturedConversations) {
    for (const msg of conv.messages) {
      if (msg.tools) {
        for (const tool of msg.tools) {
          toolUsage.set(tool, (toolUsage.get(tool) || 0) + 1);
          for (const intent of conv.detectedIntent) {
            const tools = intentToolMap.get(intent) || new Set<string>();
            tools.add(tool);
            intentToolMap.set(intent, tools);
          }
        }
      }
    }
  }

  const needs: PotentialSkillNeed[] = [];
  for (const [tool, count] of toolUsage) {
    if (count >= 2) {
      let suggestedName = tool;
      for (const [intent, tools] of intentToolMap) {
        if (tools.has(tool)) {
          suggestedName = `${intent}-${tool}`;
          break;
        }
      }
      needs.push({
        intent: "unknown",
        tools: [tool],
        frequency: count,
        suggestedSkillName: suggestedName.replace(/[^a-zA-Z0-9-]/g, "-"),
      });
    }
  }

  return needs.sort((a, b) => b.frequency - a.frequency);
}