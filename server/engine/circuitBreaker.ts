/**
 * CircuitBreaker — 工具熔断器
 *
 * 按工具名维护熔断状态：closed → half_open → open
 * - 2 次连续失败 → half_open（注入备选工具建议）
 * - 3 次连续失败 → open（跳过该工具 + SSE 告警）
 * - 工具成功 → 重置为 closed
 * - 本次会话内不恢复 open 状态（下次会话重置）
 *
 * v6.0: P0-2 工具熔断器
 */

// ===================== 类型定义 =====================

/** 熔断器状态 */
export type CircuitState = 'closed' | 'half_open' | 'open';

/** 单个工具的熔断记录 */
interface ToolCircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureReason: string;
  alternativeTool?: string;
}

/** 熔断器触发事件 */
export interface CircuitBreakerEvent {
  type: 'circuit_breaker_triggered';
  toolName: string;
  failureCount: number;
  state: CircuitState;
  alternativeTool?: string;
}

// ===================== 工具备选映射 =====================

/** 已知工具的备选映射（失败时建议替代） */
const TOOL_ALTERNATIVES: Record<string, string> = {
  'web_api_call': 'web_fetch',
  'web_fetch': 'web_search',
  'web_search': 'web_fetch',
  'web_fetch_legacy': 'web_fetch',
  'web_search_legacy': 'web_search',
  'browser_navigate': 'web_fetch',
  'file_readFile': 'shell_exec',
  'db_query': 'web_api_call',
  'desktop_screenshot': 'desktop_see',
};

// ===================== 常量 =====================

/** 降级阈值：连续失败次数达到此值时降级为 half_open */
const HALF_OPEN_THRESHOLD = 2;

/** 熔断阈值：连续失败次数达到此值时熔断为 open */
const OPEN_THRESHOLD = 3;

// ===================== CircuitBreaker 类 =====================

export class CircuitBreaker {
  private records: Map<string, ToolCircuitRecord> = new Map();

  /** 记录工具执行成功，重置熔断状态 */
  recordSuccess(toolName: string): void {
    this.records.delete(toolName);
  }

  /** 记录工具执行失败，更新熔断状态 */
  recordFailure(toolName: string, reason: string): CircuitState {
    const record = this.records.get(toolName) ?? {
      state: 'closed' as CircuitState,
      consecutiveFailures: 0,
      lastFailureReason: '',
    };

    record.consecutiveFailures++;
    record.lastFailureReason = reason;
    record.alternativeTool = TOOL_ALTERNATIVES[toolName];

    if (record.consecutiveFailures >= OPEN_THRESHOLD) {
      record.state = 'open';
    } else if (record.consecutiveFailures >= HALF_OPEN_THRESHOLD) {
      record.state = 'half_open';
    }

    this.records.set(toolName, record);
    return record.state;
  }

  /** 获取工具的当前熔断状态 */
  getState(toolName: string): CircuitState {
    return this.records.get(toolName)?.state ?? 'closed';
  }

  /** 获取工具的熔断记录 */
  getRecord(toolName: string): ToolCircuitRecord | undefined {
    return this.records.get(toolName);
  }

  /** 判断工具是否已被熔断（open 状态） */
  isOpen(toolName: string): boolean {
    return this.getState(toolName) === 'open';
  }

  /** 判断工具是否处于降级状态（half_open） */
  isHalfOpen(toolName: string): boolean {
    return this.getState(toolName) === 'half_open';
  }

  /** 获取备选工具建议（用于 half_open 时注入 system message） */
  getAlternativeSuggestion(toolName: string): string | null {
    const record = this.records.get(toolName);
    if (!record || record.state === 'closed') return null;
    if (record.alternativeTool) {
      return `工具 ${toolName} 连续失败 ${record.consecutiveFailures} 次，建议改用 ${record.alternativeTool}`;
    }
    return `工具 ${toolName} 连续失败 ${record.consecutiveFailures} 次，建议换用其他工具或调整参数`;
  }

  /** 重置所有熔断状态 */
  reset(): void {
    this.records.clear();
  }

  // ===================== MCP Per-Server 熔断方法 =====================

  /**
   * 记录 MCP Server 级别失败。
   * 同一 mcp__{serverName}__ 前缀的工具失败计入同一熔断器。
   *
   * @param serverPrefix - sanitized server 前缀（如 "filesystem"）
   * @param reason - 失败原因
   * @returns 熔断状态
   */
  recordMcpServerFailure(serverPrefix: string, reason: string): CircuitState {
    const key = `mcp__${serverPrefix}__*`;
    return this.recordFailure(key, reason);
  }

  /**
   * 记录 MCP Server 级别成功。
   *
   * @param serverPrefix - sanitized server 前缀
   */
  recordMcpServerSuccess(serverPrefix: string): void {
    const key = `mcp__${serverPrefix}__*`;
    this.recordSuccess(key);
  }

  /**
   * 检查 MCP Server 级别是否已熔断。
   *
   * @param serverPrefix - sanitized server 前缀
   * @returns 是否已熔断（open 状态）
   */
  isMcpServerOpen(serverPrefix: string): boolean {
    const key = `mcp__${serverPrefix}__*`;
    return this.isOpen(key);
  }
}