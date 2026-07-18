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
