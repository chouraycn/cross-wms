/**
 * Context Engine (上下文引擎) 类型定义
 *
 * 从 src/services/api.ts 提取的上下文引擎相关类型，集中管理以便复用。
 * services/api.ts 通过 re-export 保持向后兼容。
 */

/** 上下文引擎健康状态 */
export interface ContextEngineHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'quarantined' | 'unknown';
  failureCount?: number;
  consecutiveSuccesses?: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  quarantineReason?: string;
}

/** 上下文引擎配置 */
export interface ContextEngineConfig {
  name?: string;
  description?: string;
  maxMemoryBudget?: number;
  enableEnhancedSearch?: boolean;
  enableMemorySyncer?: boolean;
  enablePromptCache?: boolean;
}

/** 上下文引擎信息 */
export interface ContextEngineInfo {
  id: string;
  config: ContextEngineConfig;
  isDefault: boolean;
  owner: string;
  health: ContextEngineHealth;
  runtimeSettings?: Record<string, unknown>;
}

/** 上下文引擎统计 */
export interface ContextEngineStats {
  totalEngines: number;
  activeEngines: number;
  quarantinedEngines: number;
  totalOperations: number;
  avgLatencyMs: number;
}
