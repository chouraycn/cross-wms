/**
 * 执行通道系统 — 参考 OpenClaw lanes.ts
 *
 * 命名队列通道，用于控制不同类型任务的并发执行：
 * - Main: 主聊天流程
 * - Cron: 定时任务（并发限制 5）
 * - CronNested: 定时任务嵌套（并发限制 1）
 * - Subagent: 子代理任务（并发限制 3）
 * - Nested: 嵌套任务（并发限制 2）
 *
 * @module server/engine/lanes
 */

/**
 * 命令通道枚举
 *
 * 使用 const enum 确保编译后内联，避免运行时开销
 */
export const enum CommandLane {
  /** 主聊天流程 */
  Main = 'main',
  /** 定时任务 */
  Cron = 'cron',
  /** 定时任务嵌套 */
  CronNested = 'cron-nested',
  /** 子代理任务 */
  Subagent = 'subagent',
  /** 嵌套任务 */
  Nested = 'nested',
}

/**
 * 通道并发限制配置
 *
 * 根据任务类型设置不同的并发上限：
 * - cron: 5（定时任务可以并行执行多个）
 * - cron-nested: 1（定时任务内的嵌套操作必须串行）
 * - subagent: 3（子代理可以同时运行多个）
 * - nested: 2（嵌套任务有限并行）
 * - main: 1（主流程串行保证用户体验）
 */
export const LANE_CONCURRENCY_LIMITS: Record<string, number> = {
  [CommandLane.Main]: 1,
  [CommandLane.Cron]: 5,
  [CommandLane.CronNested]: 1,
  [CommandLane.Subagent]: 3,
  [CommandLane.Nested]: 2,
};

/**
 * 获取通道的并发限制
 *
 * @param lane - 通道名称
 * @returns 并发限制数，默认为 1
 */
export function getLaneConcurrencyLimit(lane: string): number {
  return LANE_CONCURRENCY_LIMITS[lane] ?? 1;
}

/**
 * 规范化通道名称
 *
 * @param lane - 原始通道名称
 * @returns 规范化后的通道名称
 */
export function normalizeLane(lane: string): CommandLane {
  const trimmed = lane.trim();
  if (!trimmed) {
    return CommandLane.Main;
  }
  // 支持带前缀的通道名（如 "nested:session-123"）
  const baseLane = trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
  switch (baseLane) {
    case 'main':
      return CommandLane.Main;
    case 'cron':
      return CommandLane.Cron;
    case 'cron-nested':
      return CommandLane.CronNested;
    case 'subagent':
      return CommandLane.Subagent;
    case 'nested':
      return CommandLane.Nested;
    default:
      return CommandLane.Main;
  }
}

/**
 * 判断是否为嵌套任务通道
 *
 * @param lane - 通道名称
 * @returns 是否为嵌套任务通道
 */
export function isNestedLane(lane: string | undefined): boolean {
  if (!lane) {
    return false;
  }
  return lane === CommandLane.Nested || lane.startsWith('nested:');
}

/**
 * 判断是否为子代理通道
 *
 * @param lane - 通道名称
 * @returns 是否为子代理通道
 */
export function isSubagentLane(lane: string | undefined): boolean {
  if (!lane) {
    return false;
  }
  return lane === CommandLane.Subagent || lane.startsWith('subagent:');
}

/**
 * 判断是否为定时任务通道
 *
 * @param lane - 通道名称
 * @returns 是否为定时任务通道
 */
export function isCronLane(lane: string | undefined): boolean {
  if (!lane) {
    return false;
  }
  return lane === CommandLane.Cron || lane.startsWith('cron:');
}

/**
 * 解析定时任务嵌套通道
 *
 * 定时任务内的嵌套操作需要独立的通道，避免死锁
 *
 * @param lane - 原始通道名称
 * @returns 规范化后的通道名称
 */
export function resolveCronNestedLane(lane?: string): string {
  const trimmed = lane?.trim();
  if (!trimmed || trimmed === CommandLane.Cron) {
    return CommandLane.CronNested;
  }
  return trimmed;
}

/**
 * 解析会话级嵌套通道
 *
 * 每个会话有独立的嵌套通道，确保会话内串行
 *
 * @param sessionKey - 会话标识
 * @returns 会话级嵌套通道名称
 */
export function resolveSessionNestedLane(sessionKey: string | undefined): string {
  const trimmed = sessionKey?.trim();
  if (!trimmed) {
    return CommandLane.Nested;
  }
  return `nested:${trimmed}`;
}

/**
 * 解析子代理通道
 *
 * 子代理任务使用独立通道，与主流程隔离
 *
 * @param sessionKey - 会话标识（可选）
 * @returns 子代理通道名称
 */
export function resolveSubagentLane(sessionKey?: string): string {
  if (!sessionKey?.trim()) {
    return CommandLane.Subagent;
  }
  return `subagent:${sessionKey}`;
}

/**
 * 通道类型别名（用于类型安全）
 */
export type LaneName = CommandLane | string;

/**
 * 通道状态快照
 */
export interface LaneSnapshot {
  /** 通道名称 */
  lane: string;
  /** 队列中等待的任务数 */
  queuedCount: number;
  /** 正在执行的任务数 */
  activeCount: number;
  /** 最大并发数 */
  maxConcurrent: number;
  /** 是否正在排空 */
  draining: boolean;
  /** 代际标识（用于检测过时任务） */
  generation: number;
}