export type { HeartbeatStatus, HeartbeatStateData } from './heartbeat-state.js';
export { HeartbeatState } from './heartbeat-state.js';

export type { HeartbeatScheduleOptions } from './heartbeat-schedule.js';
export { HeartbeatSchedule, calculateNextBeatTime, isBeatDue } from './heartbeat-schedule.js';

export type { HeartbeatRunnerOptions } from './heartbeat-runner.js';
export { HeartbeatRunner, createHeartbeatRunner } from './heartbeat-runner.js';

// 心跳唤醒原因规范化
export { normalizeHeartbeatWakeReason } from './heartbeat-reason.js';

// 心跳唤醒请求跟踪（pending 合并、retry 冷却、handler 生命周期）
export type {
  HeartbeatRunResult,
  HeartbeatWakeIntent,
  HeartbeatWakeSource,
  HeartbeatWakeRequest,
  HeartbeatWakeHandler,
  HeartbeatWakeOverride,
  RetryableHeartbeatBusySkipReason,
} from './heartbeat-wake.js';
export {
  HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT,
  HEARTBEAT_SKIP_CRON_IN_PROGRESS,
  HEARTBEAT_SKIP_LANES_BUSY,
  isRetryableHeartbeatBusySkipReason,
  setHeartbeatWakeHandler,
  requestHeartbeat,
  hasHeartbeatWakeHandler,
  hasPendingHeartbeatWake,
  resetHeartbeatWakeStateForTests,
  setHeartbeatsEnabled,
  areHeartbeatsEnabled,
} from './heartbeat-wake.js';

// 心跳 active-hours 窗口评估
export type { HeartbeatActiveHoursConfig } from './heartbeat-active-hours.js';
export {
  resolveActiveHoursTimezone,
  isWithinActiveHours,
} from './heartbeat-active-hours.js';

// 心跳事件存储与广播
export type {
  HeartbeatEventPayload,
  HeartbeatIndicatorType,
} from './heartbeat-events.js';
export {
  resolveIndicatorType,
  emitHeartbeatEvent,
  onHeartbeatEvent,
  getLastHeartbeatEvent,
  resetHeartbeatEventsForTest,
} from './heartbeat-events.js';

// 心跳事件文本过滤
export {
  isRelayableExecCompletionEvent,
  buildCronEventPrompt,
  buildExecEventPrompt,
  isExecCompletionEvent,
  isCronSystemEvent,
} from './heartbeat-events-filter.js';

// 心跳运行时 facade（延迟加载 auto-reply）
export type { GetReplyFromConfigFn } from './heartbeat-runner.runtime.js';
export { getReplyFromConfig } from './heartbeat-runner.runtime.js';

// 心跳 runner 测试辅助（降级 stub）
export {
  installHeartbeatRunnerTestRuntime,
} from './heartbeat-runner.test-harness.js';
export type {
  HeartbeatReplySpy,
} from './heartbeat-runner.test-utils.js';
export {
  createHeartbeatReplySpy,
  seedSessionStore,
  seedMainSessionStore,
  withTempHeartbeatSandbox,
  withTempTelegramHeartbeatSandbox,
  setupTelegramHeartbeatPluginRuntimeForTests,
} from './heartbeat-runner.test-utils.js';

// 心跳配置汇总
export type {
  HeartbeatSummary,
  HeartbeatSummaryConfig,
} from './heartbeat-summary.js';
export {
  isHeartbeatEnabledForAgent,
  resolveHeartbeatIntervalMs,
  resolveHeartbeatSummaryForAgent,
} from './heartbeat-summary.js';

// 心跳 typing 指示器
export type {
  TypingCallbacks,
  ChannelHeartbeatDeps,
  ChannelPlugin,
} from './heartbeat-typing.js';
export {
  createHeartbeatTypingCallbacks,
} from './heartbeat-typing.js';

// 心跳可见性开关
export type {
  ChannelHeartbeatVisibilityConfig,
  GatewayMessageChannel,
  ResolvedHeartbeatVisibility,
} from './heartbeat-visibility.js';
export {
  resolveHeartbeatVisibility,
} from './heartbeat-visibility.js';
